// api/_lib/website-delivery.js
//
// The decision layer for website delivery: which status transitions are legal,
// what a Vercel deployment state means for the project, and what counts as a
// usable custom domain.
//
// This is deliberately separate from the handlers in api/website.js and from
// the HTTP client in _lib/vercel.js. Every rule here is a pure function over
// plain values, so it is covered by `deno test api/_lib/` — the state machine
// is the part that decides whether a paying client gets emailed a link, and
// that is not something to leave untested because it happens to live inside a
// request handler.

/**
 * A deploy may be triggered from any state where a repo exists and the site is
 * not mid-build.
 *
 * `done` is the state the scaffold leaves behind today — that is the normal
 * entry point. The later states are all re-deploys: a `failed` build is retried,
 * and `preview_ready` / `changes_requested` / `approved` / `live` are re-deployed
 * whenever content changes. `deploying` is excluded on purpose: two builds racing
 * to become production is how a client ends up reviewing the wrong content.
 */
const DEPLOYABLE = new Set(['done', 'failed', 'preview_ready', 'changes_requested', 'approved', 'live'])

/** Statuses a client may sign off from. */
const APPROVABLE = new Set(['preview_ready', 'changes_requested'])

/**
 * Statuses a client may ask for changes from.
 *
 * `approved` is included: an approval is not a contract, and someone who spots
 * a typo an hour after clicking Approve should be able to say so rather than
 * email about it. `live` is included for the same reason — a request for changes
 * on a live site is the maintenance plan working as sold.
 */
const CHANGEABLE = new Set(['preview_ready', 'changes_requested', 'approved', 'live'])

/** A domain can only be attached to a site the client has signed off on. */
const DOMAIN_ATTACHABLE = new Set(['approved', 'live'])

export function canDeployFrom(status) { return DEPLOYABLE.has(status) }
export function canApproveFrom(status) { return APPROVABLE.has(status) }
export function canRequestChangesFrom(status) { return CHANGEABLE.has(status) }
export function canAttachDomainFrom(status) { return DOMAIN_ATTACHABLE.has(status) }

/**
 * Does a change request move the project out of its current status?
 *
 * For a `live` site: no. Once a custom domain is attached, a redeploy updates
 * the site the client's customers are looking at — Vercel also rebuilds
 * production on any push to the repo, so this is true whether or not it goes
 * through our deploy action. There is deliberately no per-client staging
 * environment (see the delivery spec), so flipping a live site to
 * `changes_requested` would advertise a preview-and-approve cycle that does not
 * run for it. The request is still recorded and the operator still told; the
 * status keeps telling the truth, which is that the site is live.
 */
export function requestChangesKeepsStatus(status) { return status === 'live' }

/**
 * How long a deployment may sit in READY with no production alias before the
 * project is handed to an operator instead of a client.
 *
 * Vercel assigns the production alias moments after a build goes READY, so a
 * short grace window absorbs the gap. Past it, something is wrong with the
 * project's domains and no amount of further polling fixes it. Waiting forever
 * would leave the project stuck in `deploying` with nobody told, which is the
 * failure mode this whole feature exists to remove.
 */
export const ALIAS_GRACE_MS = 5 * 60 * 1000

/**
 * Decide what a poll of the Vercel deployment means for the project row.
 *
 *   outcome          'ready' | 'failed' | 'pending' (from deploymentOutcome)
 *   previewConfirmed the preview URL came from the API, not from guessing a
 *                    `<name>.vercel.app` subdomain that may not be ours
 *   deployingForMs   how long the project has been in `deploying`
 *
 * Returns { status, reason }. `status: null` means "no change — keep polling".
 */
export function nextFromDeployment({ outcome, previewConfirmed, deployingForMs = 0 }) {
  if (outcome === 'failed') {
    return { status: 'failed', reason: 'The Vercel build failed.' }
  }
  if (outcome === 'ready') {
    if (previewConfirmed) return { status: 'preview_ready', reason: null }
    if (deployingForMs > ALIAS_GRACE_MS) {
      // A guessed `<name>.vercel.app` is a global subdomain that may belong to
      // someone else entirely. Showing it to a client risks sending them to a
      // 404 or to a stranger's site, so the project goes to the operator.
      return {
        status: 'failed',
        reason: 'The build succeeded but Vercel reported no production alias for this project. Check the project\'s domains in Vercel before sending anything to the client.',
      }
    }
    return { status: null, reason: 'Build finished — waiting for Vercel to assign the production URL.' }
  }
  return { status: null, reason: null }
}

/**
 * Normalise an operator-entered custom domain into the bare hostname Vercel
 * wants, or explain why it cannot be used.
 *
 * Returns { domain } or { error } — never both. The error text is written for
 * the operator, because this is an admin-only field.
 *
 * Pasting a full URL out of a browser bar is the normal case, so scheme, path,
 * query and fragment are stripped rather than rejected. Everything else is
 * refused: a malformed domain accepted here becomes a confusing Vercel API
 * error several steps later, with nothing pointing back at the typo.
 */
export function normalizeDomain(raw) {
  let s = String(raw ?? '').trim().toLowerCase()
  if (!s) return { error: 'Enter a domain.' }

  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')  // scheme
  s = s.replace(/^[^@/]*@/, '')                 // userinfo — never valid in a domain
  s = s.split(/[/?#]/)[0]                       // path, query, fragment
  s = s.replace(/\.$/, '')                      // fully-qualified trailing dot
  if (!s) return { error: 'Enter a domain.' }

  if (s.includes(':')) return { error: 'Remove the port — enter the domain only.' }
  if (s.startsWith('*')) return { error: 'Wildcard domains are not supported here. Enter the exact domain.' }
  if (/[^a-z0-9.-]/.test(s)) {
    // Non-ASCII is the common cause. Vercel takes the punycode (xn--) form, and
    // guessing the conversion here would be worse than asking for it.
    return { error: 'Use only letters, numbers, dots and hyphens. For an international domain, enter its punycode (xn--…) form.' }
  }

  const labels = s.split('.')
  if (labels.length < 2) return { error: 'Enter a full domain, including the extension (for example acme.com).' }
  for (const label of labels) {
    if (!label) return { error: 'That domain has an empty part — check for a doubled dot.' }
    if (label.length > 63) return { error: 'One part of that domain is longer than 63 characters.' }
    if (label.startsWith('-') || label.endsWith('-')) {
      return { error: 'No part of a domain may start or end with a hyphen.' }
    }
  }
  if (s.length > 253) return { error: 'That domain is too long.' }
  if (!/^[a-z]{2,}$/.test(labels[labels.length - 1])) {
    return { error: 'That does not end in a valid domain extension.' }
  }
  if (/\.vercel\.app$/.test(s)) {
    // This field is for the client's own domain. A *.vercel.app address is the
    // preview URL we already hold; attaching one would silently do nothing
    // useful while reading as success.
    return { error: 'That is a Vercel preview address, not a custom domain. Enter the client\'s own domain.' }
  }
  return { domain: s }
}

/**
 * Trim and bound a client's change-request note.
 *
 * The note is written by a client, stored, and rendered into an admin email, so
 * it needs a length bound at the entry point rather than wherever it is later
 * displayed. Escaping is the email layer's job (`escapeHtml`); this is only
 * about accepting something sane.
 */
export const MAX_NOTE_LENGTH = 4000

export function normalizeNote(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return { error: 'Tell us what you would like changed.' }
  if (s.length > MAX_NOTE_LENGTH) {
    return { error: `Please keep it under ${MAX_NOTE_LENGTH} characters — send the rest in a follow-up.` }
  }
  return { note: s }
}

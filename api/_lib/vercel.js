// api/_lib/vercel.js
//
// Deploys a generated client site to the Haze Tech Vercel team.
//
// The funnel creates a GitHub repo and commits content.json, and that was the
// end of it — a client who paid up to $7,500 was told "your dev team has your
// files" and never saw a URL. This module is what turns the repo into
// something they can look at.
//
// Credentials are DB-first (admin_settings), like every other rotatable key in
// this repo, so the token can be changed from /admin/settings without a
// redeploy. With no token configured every call returns a `configured: false`
// result rather than throwing — the project then stays at `done`, exactly as it
// behaves today, so a missing token degrades to the status quo instead of
// breaking the funnel.

import { getSetting } from './settings.js'

const API = 'https://api.vercel.com'
const GH_ORG = 'hazetechnologies'

/** Vercel scopes most endpoints to a team via a query param. Exported for test. */
export function withTeam(path, teamId) {
  if (!teamId) return `${API}${path}`
  const sep = path.includes('?') ? '&' : '?'
  return `${API}${path}${sep}teamId=${encodeURIComponent(teamId)}`
}

export async function vercelConfig({ fresh = false } = {}) {
  const [token, teamId] = await Promise.all([
    getSetting('vercel_api_token', 'VERCEL_API_TOKEN', { fresh }),
    getSetting('vercel_team_id', 'VERCEL_TEAM_ID', { fresh }),
  ])
  return { token: token || null, teamId: teamId || null, configured: Boolean(token) }
}

async function call(path, { token, teamId }, init = {}) {
  const res = await fetch(withTeam(path, teamId), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { /* non-JSON error body */ }
  if (!res.ok) {
    const msg = json?.error?.message || json?.message || text.slice(0, 300) || `HTTP ${res.status}`
    const err = new Error(`vercel ${init.method || 'GET'} ${path} ${res.status}: ${msg}`)
    err.status = res.status
    err.code = json?.error?.code || null
    throw err
  }
  return json
}

/**
 * Create the project for a generated repo, or return the existing one.
 *
 * Idempotent on the project: re-running deploy for a site that already has a
 * Vercel project must not create a second one, because two projects racing to
 * build the same repo is how a client ends up reviewing the wrong URL.
 */
export async function ensureProject(repoName, cfg) {
  const get = () => call(`/v9/projects/${encodeURIComponent(repoName)}`, cfg)

  try {
    const existing = await get()
    if (existing?.id) return describeProject(existing, false)
  } catch (err) {
    if (err.status !== 404) throw err
  }

  try {
    const created = await call('/v11/projects', cfg, {
      method: 'POST',
      body: JSON.stringify({
        name: repoName,
        gitRepository: { type: 'github', repo: `${GH_ORG}/${repoName}` },
      }),
    })
    if (!created?.id) throw new Error('vercel create project returned no id')
    return describeProject(created, true)
  } catch (err) {
    // Check-then-create is a race: two deploy clicks both 404 on the GET and
    // both POST, and the loser gets a conflict. Re-read rather than failing —
    // the project it wanted now exists, which is the outcome it asked for.
    if (err.status === 409 || /already (exists|in use)/i.test(err.message)) {
      const existing = await get()
      if (existing?.id) return describeProject(existing, false)
    }
    throw err
  }
}

/**
 * Pull the production alias out of a project payload.
 *
 * `<name>.vercel.app` is NOT guaranteed: that subdomain is global, and project
 * names here come from slugify(client.name), so `acme-website` is very likely
 * already taken by someone else's project. Vercel then assigns a different
 * alias. Constructing the URL instead of reading it would email a client a link
 * that 404s — or one that loads a stranger's site. Always prefer what the API
 * reports; the constructed form is a labelled last resort, never authoritative.
 */
export function describeProject(project, created) {
  const aliases = []
  const prodAlias = project?.targets?.production?.alias
  if (Array.isArray(prodAlias)) aliases.push(...prodAlias)
  if (Array.isArray(project?.alias)) {
    aliases.push(...project.alias.map((a) => (typeof a === 'string' ? a : a?.domain)).filter(Boolean))
  }
  const preferred = aliases.find((a) => typeof a === 'string' && a.endsWith('.vercel.app')) || aliases[0] || null
  return {
    id: project.id,
    name: project.name,
    created,
    productionUrl: preferred ? `https://${preferred}` : null,
    aliasFromApi: Boolean(preferred),
  }
}

/**
 * Re-read a project by id or name.
 *
 * Needed because a project created from a git repository has no production
 * alias yet at create time — the alias only exists once the first build has
 * gone live. The alias is what a client gets emailed, so it has to be read
 * again later rather than remembered from the create response.
 */
export async function fetchProject(idOrName, cfg) {
  const project = await call(`/v9/projects/${encodeURIComponent(idOrName)}`, cfg)
  return project?.id ? describeProject(project, false) : null
}

/**
 * Trigger a production build of the repo's default branch.
 *
 * Creating a Vercel project with `gitRepository` links the repo but does NOT
 * build it — an existing repo with no new push sits there with zero
 * deployments, which from the outside is indistinguishable from a broken
 * deploy. So the build is asked for explicitly.
 *
 * Not idempotent, by design: calling this again is how a redeploy happens after
 * the operator edits content.json. Two *concurrent* calls would queue two
 * builds, which is why `deploy` refuses to run while a project is already in
 * the `deploying` state.
 */
export async function triggerDeployment(projectId, repoName, cfg, { ref = 'main' } = {}) {
  const d = await call('/v13/deployments', cfg, {
    method: 'POST',
    body: JSON.stringify({
      name: repoName,
      project: projectId,
      target: 'production',
      gitSource: { type: 'github', org: GH_ORG, repo: repoName, ref },
    }),
  })
  return {
    id: d?.id || d?.uid || null,
    state: d?.status || d?.readyState || d?.state || null,
    inspectorUrl: d?.inspectorUrl || null,
  }
}

/** Most recent deployment for a project, or null before the first build. */
export async function latestDeployment(projectId, cfg) {
  const json = await call(
    `/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=1`,
    cfg,
  )
  const d = json?.deployments?.[0]
  if (!d) return null
  return {
    id: d.uid || d.id,
    state: d.state || d.readyState || null, // QUEUED | BUILDING | READY | ERROR | CANCELED
    url: d.url ? `https://${d.url}` : null,
    inspectorUrl: d.inspectorUrl || null,
    createdAt: d.created || d.createdAt || null,
  }
}

/**
 * Last-resort guess at the production URL, used ONLY when the API reported no
 * alias at all. `<name>.vercel.app` is a global namespace, so this can point at
 * a project that is not ours. Callers must treat a guessed URL as unconfirmed
 * and must not put it in front of a client as a finished preview — see
 * resolvePreviewUrl.
 */
export function guessProductionUrl(projectName) {
  return `https://${projectName}.vercel.app`
}

/**
 * The URL a client reviews. Per-deployment URLs are immutable and change every
 * build, so the stable production alias is what belongs in the portal and in an
 * email — a link that rots between the send and the click is worse than none.
 *
 * Returns { url, confirmed }. `confirmed: false` means the alias came from a
 * guess, and the caller should keep the project out of preview_ready rather
 * than send it.
 */
export function resolvePreviewUrl(project) {
  if (project?.productionUrl && project.aliasFromApi) {
    return { url: project.productionUrl, confirmed: true }
  }
  return { url: guessProductionUrl(project?.name || ''), confirmed: false }
}

/**
 * Add a domain to a project.
 *
 * Re-runnable: a domain already on THIS project is success, not an error. The
 * operator will click this more than once, because attaching a domain and the
 * domain actually resolving are two different events (see projectDomain) and
 * the second one needs DNS they have to go and add.
 *
 * A domain attached to a *different* project still throws — that is a real
 * conflict an operator has to resolve, and swallowing it would leave them
 * waiting for DNS that can never verify.
 */
export async function attachDomain(projectId, domain, cfg) {
  try {
    return await call(`/v10/projects/${encodeURIComponent(projectId)}/domains`, cfg, {
      method: 'POST',
      body: JSON.stringify({ name: domain }),
    })
  } catch (err) {
    if (err.status === 409) {
      const existing = await projectDomain(projectId, domain, cfg).catch(() => null)
      if (existing) return existing  // already ours
    }
    throw err
  }
}

/**
 * Read one domain's state on a project.
 *
 * `verified` is the only thing that decides whether a client is told their site
 * is live. A domain can be attached for days while its DNS still points
 * somewhere else; presenting that as the live URL would send a client to
 * whatever their old host is still serving.
 */
export async function projectDomain(projectId, domain, cfg) {
  const d = await call(
    `/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domain)}`,
    cfg,
  )
  if (!d?.name) return null
  return {
    name: d.name,
    verified: d.verified === true,
    // The DNS records the operator has to add at the client's registrar. Shown
    // verbatim in the admin UI — paraphrasing DNS instructions breaks them.
    verification: Array.isArray(d.verification) ? d.verification : [],
  }
}

/** Normalise a deployment state into what the funnel does next. */
export function deploymentOutcome(state) {
  switch (state) {
    case 'READY':     return 'ready'
    case 'ERROR':     return 'failed'
    case 'CANCELED':  return 'failed'
    case 'QUEUED':
    case 'INITIALIZING':
    case 'BUILDING':  return 'pending'
    default:          return 'pending'
  }
}

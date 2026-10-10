// api/_lib/website-delivery.test.js
// Run with a BARE `deno test api/_lib/` — no permission flags. Everything here
// is a pure function over plain values, so nothing needs disk or network.
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  canDeployFrom, canApproveFrom, canRequestChangesFrom, canAttachDomainFrom,
  requestChangesKeepsStatus, nextFromDeployment, normalizeDomain, normalizeNote,
  ALIAS_GRACE_MS, MAX_NOTE_LENGTH,
} from './website-delivery.js'

Deno.test('deploy is allowed from done and from every post-deploy state', () => {
  for (const s of ['done', 'failed', 'preview_ready', 'changes_requested', 'approved', 'live']) {
    assert(canDeployFrom(s), `expected ${s} to be deployable`)
  }
})

Deno.test('deploy is refused while a build is already running', () => {
  // Two builds racing to become production is how a client reviews the wrong content.
  assertEquals(canDeployFrom('deploying'), false)
})

Deno.test('deploy is refused before a repo exists', () => {
  for (const s of ['intake_pending', 'intake_submitted', 'generating']) {
    assertEquals(canDeployFrom(s), false, `expected ${s} to be rejected`)
  }
})

Deno.test('approval requires a preview the client has actually seen', () => {
  assert(canApproveFrom('preview_ready'))
  assert(canApproveFrom('changes_requested'))
  for (const s of ['done', 'deploying', 'generating', 'failed', 'approved', 'live']) {
    assertEquals(canApproveFrom(s), false, `expected ${s} not to be approvable`)
  }
})

Deno.test('changes can still be requested after approval and after going live', () => {
  // An approval is not a contract, and a live site under a maintenance plan is
  // exactly where change requests belong.
  assert(canRequestChangesFrom('approved'))
  assert(canRequestChangesFrom('live'))
  assert(canRequestChangesFrom('preview_ready'))
  assertEquals(canRequestChangesFrom('generating'), false)
  assertEquals(canRequestChangesFrom('done'), false)
})

Deno.test('a domain attaches only to a site the client signed off on', () => {
  assert(canAttachDomainFrom('approved'))
  assert(canAttachDomainFrom('live'))
  assertEquals(canAttachDomainFrom('preview_ready'), false)
  assertEquals(canAttachDomainFrom('done'), false)
})

Deno.test('a failed build fails the project', () => {
  assertEquals(nextFromDeployment({ outcome: 'failed', previewConfirmed: false }).status, 'failed')
})

Deno.test('a pending build changes nothing', () => {
  assertEquals(nextFromDeployment({ outcome: 'pending', previewConfirmed: false }).status, null)
})

Deno.test('READY with a confirmed alias reaches preview_ready', () => {
  const r = nextFromDeployment({ outcome: 'ready', previewConfirmed: true, deployingForMs: 1000 })
  assertEquals(r.status, 'preview_ready')
})

Deno.test('READY with an unconfirmed alias waits, then goes to the operator', () => {
  // A guessed <name>.vercel.app is a global subdomain that may not be ours, so
  // it is never promoted to a client-facing preview.
  const waiting = nextFromDeployment({ outcome: 'ready', previewConfirmed: false, deployingForMs: 1000 })
  assertEquals(waiting.status, null)
  assert(waiting.reason)

  const stalled = nextFromDeployment({ outcome: 'ready', previewConfirmed: false, deployingForMs: ALIAS_GRACE_MS + 1 })
  assertEquals(stalled.status, 'failed')
  assert(/alias/i.test(stalled.reason))
})

Deno.test('a confirmed alias is never held back by the grace window', () => {
  const r = nextFromDeployment({ outcome: 'ready', previewConfirmed: true, deployingForMs: ALIAS_GRACE_MS * 10 })
  assertEquals(r.status, 'preview_ready')
})

Deno.test('a pasted URL normalises to a bare hostname', () => {
  assertEquals(normalizeDomain('https://www.Acme.com/about?x=1#top').domain, 'www.acme.com')
  assertEquals(normalizeDomain('  acme.co.uk.  ').domain, 'acme.co.uk')
  assertEquals(normalizeDomain('http://acme.com').domain, 'acme.com')
})

Deno.test('a preview address is not accepted as a custom domain', () => {
  // Attaching our own preview host would read as success and do nothing useful.
  assert(normalizeDomain('acme-website.vercel.app').error)
})

Deno.test('malformed domains are refused with an operator-readable reason', () => {
  const cases = ['', '   ', 'acme', 'acme..com', 'acme.com:3000', '*.acme.com', '-acme.com', 'acme-.com', 'acme.c0m', 'acmé.com']
  for (const c of cases) {
    const r = normalizeDomain(c)
    assert(r.error, `expected ${JSON.stringify(c)} to be refused`)
    assertEquals(r.domain, undefined)
  }
})

Deno.test('non-string domain input does not throw', () => {
  for (const v of [null, undefined, 0, {}, []]) {
    assert(normalizeDomain(v).error)
  }
})

Deno.test('userinfo is stripped rather than smuggled through', () => {
  // https://evil.com@acme.com reads as acme.com to a human and evil.com to some
  // parsers. Strip to the host the browser would actually use.
  assertEquals(normalizeDomain('https://evil@acme.com').domain, 'acme.com')
})

Deno.test('a change note is trimmed, required, and bounded', () => {
  assertEquals(normalizeNote('  make the hero blue  ').note, 'make the hero blue')
  assert(normalizeNote('   ').error)
  assert(normalizeNote(null).error)
  assert(normalizeNote('x'.repeat(MAX_NOTE_LENGTH + 1)).error)
  assertEquals(normalizeNote('x'.repeat(MAX_NOTE_LENGTH)).note.length, MAX_NOTE_LENGTH)
})

Deno.test('a live site stays live when changes are requested', () => {
  // There is no per-client staging, and Vercel rebuilds production on any push,
  // so a redeploy updates the site the client's customers see. Flipping to
  // changes_requested would advertise a preview-and-approve cycle that does not
  // run for a live site.
  assertEquals(requestChangesKeepsStatus('live'), true)
})

Deno.test('every pre-launch status does move to changes_requested', () => {
  for (const s of ['preview_ready', 'changes_requested', 'approved']) {
    assertEquals(requestChangesKeepsStatus(s), false, `expected ${s} to transition`)
  }
})

Deno.test('a redeploy of a live site goes back to live, not into preview', () => {
  // There is no staging copy for a live site to be a preview OF, and telling a
  // client with a running website it is "ready to review" is nonsense.
  const r = nextFromDeployment({ outcome: 'ready', previewConfirmed: true, deployingForMs: 1000, hasLiveDomain: true })
  assertEquals(r.status, 'live')
})

Deno.test('a live redeploy is not held back by an unconfirmed alias', () => {
  // The custom domain is attached and serving whatever the vercel.app alias
  // reports, so the alias gate does not apply post-launch.
  const r = nextFromDeployment({ outcome: 'ready', previewConfirmed: false, deployingForMs: 1000, hasLiveDomain: true })
  assertEquals(r.status, 'live')
})

// (A failed live redeploy is covered below — it keeps the site `live`, because
// Vercel goes on serving the previous build. An earlier version of this test
// asserted 'failed', which is the behaviour review caught as wrong.)

Deno.test('a live redeploy still reports nothing while pending', () => {
  assertEquals(nextFromDeployment({ outcome: 'pending', hasLiveDomain: true }).status, null)
})

Deno.test('without a live domain the pre-launch path is unchanged', () => {
  assertEquals(nextFromDeployment({ outcome: 'ready', previewConfirmed: true, hasLiveDomain: false }).status, 'preview_ready')
  assertEquals(nextFromDeployment({ outcome: 'ready', previewConfirmed: true }).status, 'preview_ready')
})

Deno.test('a failed redeploy leaves a live site live', () => {
  // Vercel keeps serving the previous production build when a redeploy fails.
  // Marking the project `failed` would hide the live link in the client's
  // portal and block further change requests over a site that is still up.
  const r = nextFromDeployment({ outcome: 'failed', hasLiveDomain: true })
  assertEquals(r.status, 'live')
  assertEquals(r.failed, true)
  assert(/still serving/i.test(r.reason))
})

Deno.test('a failed first deploy still fails the project', () => {
  const r = nextFromDeployment({ outcome: 'failed', hasLiveDomain: false })
  assertEquals(r.status, 'failed')
  assertEquals(r.failed, true)
})

Deno.test('a successful live redeploy is not marked failed', () => {
  // `failed` is what stops a change request being reported as shipped, so it
  // must never be set on a build that worked.
  const r = nextFromDeployment({ outcome: 'ready', previewConfirmed: true, hasLiveDomain: true })
  assertEquals(r.status, 'live')
  assertEquals(r.failed, undefined)
})

Deno.test('a stalled-alias timeout is a real failure', () => {
  const r = nextFromDeployment({ outcome: 'ready', previewConfirmed: false, deployingForMs: ALIAS_GRACE_MS + 1 })
  assertEquals(r.status, 'failed')
})

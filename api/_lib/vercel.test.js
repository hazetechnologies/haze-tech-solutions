import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { withTeam, guessProductionUrl, resolvePreviewUrl, deploymentOutcome } from './vercel.js'

Deno.test('withTeam appends teamId with the right separator', () => {
  assertEquals(withTeam('/v11/projects', 'team_abc'), 'https://api.vercel.com/v11/projects?teamId=team_abc')
  // A path that already carries a query must get & not a second ?
  assertEquals(
    withTeam('/v6/deployments?projectId=p1&limit=1', 'team_abc'),
    'https://api.vercel.com/v6/deployments?projectId=p1&limit=1&teamId=team_abc',
  )
})

Deno.test('withTeam omits teamId entirely on a personal token', () => {
  assertEquals(withTeam('/v11/projects', null), 'https://api.vercel.com/v11/projects')
  assertEquals(withTeam('/v11/projects', ''), 'https://api.vercel.com/v11/projects')
})

Deno.test('withTeam encodes a team id that needs it', () => {
  assertEquals(withTeam('/x', 'a b/c'), 'https://api.vercel.com/x?teamId=a%20b%2Fc')
})

Deno.test('a guessed url is never reported as confirmed', () => {
  // <name>.vercel.app is a GLOBAL namespace and project names come from
  // slugify(client.name), so 'acme-website' may well belong to someone else.
  // Emailing a client a guessed link can send them to a stranger's site.
  assertEquals(guessProductionUrl('acme-website'), 'https://acme-website.vercel.app')

  const guessed = resolvePreviewUrl({ name: 'acme-website', productionUrl: null, aliasFromApi: false })
  assertEquals(guessed.confirmed, false)
  assertEquals(guessed.url, 'https://acme-website.vercel.app')
})

Deno.test('an alias reported by the API is confirmed and wins', () => {
  const real = resolvePreviewUrl({
    name: 'acme-website',
    productionUrl: 'https://acme-website-hazetech.vercel.app',
    aliasFromApi: true,
  })
  assertEquals(real.confirmed, true)
  assertEquals(real.url, 'https://acme-website-hazetech.vercel.app')
})

Deno.test('a url present but not from the API is still unconfirmed', () => {
  // Guards against a caller hand-setting productionUrl and bypassing the gate.
  const spoofed = resolvePreviewUrl({
    name: 'acme-website',
    productionUrl: 'https://whatever.vercel.app',
    aliasFromApi: false,
  })
  assertEquals(spoofed.confirmed, false)
})

// The one that actually protects a client: anything short of READY must not be
// treated as ready, or the portal links them to a half-built or broken site.
Deno.test('only READY counts as ready', () => {
  assertEquals(deploymentOutcome('READY'), 'ready')
  for (const s of ['QUEUED', 'INITIALIZING', 'BUILDING']) {
    assertEquals(deploymentOutcome(s), 'pending', `${s} must be pending`)
  }
  for (const s of ['ERROR', 'CANCELED']) {
    assertEquals(deploymentOutcome(s), 'failed', `${s} must be failed`)
  }
})

Deno.test('an unknown or missing state is pending, never ready', () => {
  for (const s of ['SOMETHING_NEW', '', null, undefined, 'ready', 'Ready']) {
    assertEquals(deploymentOutcome(s), 'pending', `${String(s)} must not be treated as ready`)
  }
})

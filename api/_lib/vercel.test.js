import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { withTeam, productionUrl, deploymentOutcome } from './vercel.js'

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

Deno.test('productionUrl is the stable alias, not a per-build url', () => {
  assertEquals(productionUrl('acme-website'), 'https://acme-website.vercel.app')
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

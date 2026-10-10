import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { withTeam, guessProductionUrl, resolvePreviewUrl, deploymentOutcome, describeProject, gitSourceFor } from './vercel.js'

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

// describeProject decides the URL a paying client gets emailed, so the alias
// preference is pinned rather than left to whatever the API happens to return
// first. See resolvePreviewUrl for why a constructed URL is never trusted.
Deno.test('describeProject prefers the production alias over a bare alias list', () => {
  const d = describeProject({
    id: 'prj_1',
    name: 'acme-website',
    targets: { production: { alias: ['acme-website-git-main-hazetech.vercel.app'] } },
    alias: [{ domain: 'acme.com' }],
  }, false)
  assertEquals(d.productionUrl, 'https://acme-website-git-main-hazetech.vercel.app')
  assertEquals(d.aliasFromApi, true)
})

Deno.test('describeProject falls back to a custom domain when there is no vercel.app alias', () => {
  const d = describeProject({ id: 'prj_2', name: 'acme-website', alias: ['acme.com'] }, false)
  assertEquals(d.productionUrl, 'https://acme.com')
  assertEquals(d.aliasFromApi, true)
})

Deno.test('describeProject reports no url rather than inventing one', () => {
  // A freshly created project has no alias until its first build goes live.
  const d = describeProject({ id: 'prj_3', name: 'acme-website' }, true)
  assertEquals(d.productionUrl, null)
  assertEquals(d.aliasFromApi, false)
  assertEquals(resolvePreviewUrl(d).confirmed, false)
})

Deno.test('describeProject ignores malformed alias entries', () => {
  const d = describeProject({ id: 'prj_4', name: 'acme-website', alias: [null, {}, 'acme.com'] }, false)
  assertEquals(d.productionUrl, 'https://acme.com')
})

// gitSource is how the deployment API is told WHICH repo to build. Getting it
// wrong means every publish reaches `deploying` and then fails.
Deno.test('a resolved repoId identifies the repo numerically', () => {
  const g = gitSourceFor({ repoId: 918273, org: 'hazetechnologies', repo: 'acme-website' })
  assertEquals(g.type, 'github')
  assertEquals(g.repoId, 918273)
  assertEquals(g.ref, 'main')
  // org/repo must not be mixed in alongside repoId.
  assertEquals(g.org, undefined)
  assertEquals(g.repo, undefined)
})

Deno.test('without a repoId it falls back to org and repo', () => {
  const g = gitSourceFor({ repoId: null, org: 'hazetechnologies', repo: 'acme-website', ref: 'master' })
  assertEquals(g.repoId, undefined)
  assertEquals(g.org, 'hazetechnologies')
  assertEquals(g.repo, 'acme-website')
  assertEquals(g.ref, 'master')
})

Deno.test('a non-numeric repoId is not trusted as one', () => {
  // A string id from an unexpected payload shape would be sent as the wrong
  // type; fall back rather than construct a request that cannot work.
  for (const bad of ['918273', undefined, null, {}, 0, -1, 1.5, NaN]) {
    const g = gitSourceFor({ repoId: bad, org: 'o', repo: 'r' })
    assertEquals(g.repo, 'r', `expected fallback for ${JSON.stringify(bad)}`)
  }
})

Deno.test('describeProject reads repoId off the git link', () => {
  const d = describeProject({ id: 'p', name: 'acme-website', link: { type: 'github', repoId: 42, org: 'o', repo: 'r' } }, false)
  assertEquals(d.repoId, 42)
  assertEquals(describeProject({ id: 'p', name: 'n' }, false).repoId, null)
  assertEquals(describeProject({ id: 'p', name: 'n', link: { repoId: '42' } }, false).repoId, null)
})

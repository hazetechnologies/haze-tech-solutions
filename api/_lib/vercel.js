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
  try {
    const existing = await call(`/v9/projects/${encodeURIComponent(repoName)}`, cfg)
    if (existing?.id) return { id: existing.id, created: false, name: existing.name }
  } catch (err) {
    if (err.status !== 404) throw err
  }

  const created = await call('/v11/projects', cfg, {
    method: 'POST',
    body: JSON.stringify({
      name: repoName,
      gitRepository: { type: 'github', repo: `${GH_ORG}/${repoName}` },
    }),
  })
  if (!created?.id) throw new Error('vercel create project returned no id')
  return { id: created.id, created: true, name: created.name }
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
 * The URL a client reviews. Vercel's per-deployment URLs are immutable and
 * change on every build, so the stable production alias is what belongs in the
 * portal and in an email — a link that rots between the send and the click is
 * worse than no link.
 */
export function productionUrl(projectName) {
  return `https://${projectName}.vercel.app`
}

export async function attachDomain(projectId, domain, cfg) {
  return call(`/v10/projects/${encodeURIComponent(projectId)}/domains`, cfg, {
    method: 'POST',
    body: JSON.stringify({ name: domain }),
  })
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

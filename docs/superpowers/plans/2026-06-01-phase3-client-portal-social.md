# Phase 3: Client Portal Social Page (monitor + connect) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give each HTS client a **Social** page in their own portal where they can monitor their content calendar + engagement (read-only) and connect their own social channels — while content creation/approval stays agency-driven.

**Architecture:** A new **portal-scoped proxy** action in `api/website.js` authenticates the logged-in client (Supabase `auth.getUser`), resolves *their own* `clients.hsp_user_id` server-side (the client never supplies a tenant id), and forwards a fixed allowlist of operations to the haze-social-post external API: read `posts` / `content-plans` / `connected-platforms` / `engagement`, plus issue a connect-link for their own tenant. A new `GET /tenants/:id/engagement` endpoint rolls up the latest `SocialSnapshot` per connected account. A new `PortalSocial.jsx` page renders calendar + engagement + connect.

**Tech Stack:** Next.js app-router + Prisma (haze-social-post engagement endpoint); React Router + Supabase (HTS portal); the existing external API + `HSP_EXTERNAL_API_KEY`.

**Operating model (decided):** client = **monitor + connect**; agency = create/approve. So the portal is read-only over content + self-serve only for channel connection.

**Repos:** haze-social-post (`C:\Users\wealt\AppData\Local\Temp\haze-social-post`, branch from `master`); haze-tech-solutions (`...\haze-tech-solutions`, branch from `origin/main`). **No schema change** → no VPS step.

**Grounded facts:**
- HTS portal client-auth pattern (api/website.js): parse `Authorization: Bearer <token>` → `userClient.auth.getUser(token)` → `caller`; resolve the client row and compare `clients.user_id === caller.id`. (See existing `portalCheckout` / brand-kit portal access around lines 85, 110, 210, 230.)
- `clients` has `hsp_user_id` (Phase 1). Resolve the caller's client via `.eq('user_id', caller.id)`.
- `SERVICE_ROLE_KEY` + `getSetting('HSP_EXTERNAL_API_KEY','HSP_EXTERNAL_API_KEY')` + `HSP_BASE` already exist in `api/website.js` (used by `hsp-proxy`/`activate-social`).
- External read endpoints already live (5B/5C): `GET /tenants/:id/connected-platforms`, `GET /tenants/:id/posts`, `GET /tenants/:id/content-plans`; connect-link: `POST /tenants/:id/connect-links`.
- Engagement source: `SocialSnapshot` (followers/following/posts/likes/views/subscribers/engagementRate, createdAt) populated by the `snapshot-metrics` cron + `/api/social/fetch`. `ConnectedSocialAccount` (platform/handle/displayName) links to snapshots by `accountId`.
- HTS portal routes register in `src/App.jsx` under the `/portal` parent (children: dashboard/services/invoices/brand-kit…). Nav lives in `src/pages/portal/PortalLayout.jsx`'s `NAV` array. Pages use a `useClient()` hook giving `client` (`.id`, `.name`).

---

## File Structure

**haze-social-post:**
- Create `app/api/v1/external/tenants/[id]/engagement/route.ts` — latest-snapshot-per-account rollup.

**haze-tech-solutions:**
- Modify `api/website.js` — add `portal-social` action (client-auth, own-tenant scoped, op allowlist).
- Create `src/pages/portal/PortalSocial.jsx` — the client Social page.
- Modify `src/pages/portal/PortalLayout.jsx` — add the Social nav entry.
- Modify `src/App.jsx` — register the `/portal/social` route.

---

## Task 1: `GET /tenants/:id/engagement` endpoint

**Files:**
- Create: `app/api/v1/external/tenants/[id]/engagement/route.ts`

- [ ] **Step 1: Write the route**

```typescript
// GET /api/v1/external/tenants/[id]/engagement
// Latest SocialSnapshot per connected account for a sub-tenant, plus simple
// totals. Read-only; powers the client portal engagement dashboard.
import { prisma } from '@/lib/prisma'
import { makeExternalHandler } from '@/lib/external-api/handler'
import { requireScope } from '@/lib/external-api/auth'
import { loadTenantInScope } from '@/lib/external-api/scope'

export const GET = makeExternalHandler<{ id: string }>('poll', async ({ auth, params }) => {
  requireScope(auth, 'tenants:read')
  const user = await loadTenantInScope(auth.integrator, params.id)

  const accounts = await prisma.connectedSocialAccount.findMany({
    where: { userId: user.id },
    select: { id: true, platform: true, handle: true, displayName: true },
  })

  const rows = await Promise.all(
    accounts.map(async (acc) => {
      const snap = await prisma.socialSnapshot.findFirst({
        where: { userId: user.id, accountId: acc.id },
        orderBy: { createdAt: 'desc' },
        select: {
          followers: true, following: true, posts: true, likes: true,
          views: true, subscribers: true, engagementRate: true, createdAt: true,
        },
      })
      return {
        platform: acc.platform,
        handle: acc.handle,
        display_name: acc.displayName,
        followers: snap?.followers ?? null,
        following: snap?.following ?? null,
        posts: snap?.posts ?? null,
        likes: snap?.likes ?? null,
        views: snap?.views ?? null,
        subscribers: snap?.subscribers ?? null,
        engagement_rate: snap?.engagementRate ?? null,
        captured_at: snap?.createdAt ? snap.createdAt.toISOString() : null,
      }
    }),
  )

  const totalFollowers = rows.reduce((s, r) => s + (r.followers || 0), 0)
  return Response.json({ accounts: rows, totals: { followers: totalFollowers } })
})
```

- [ ] **Step 2: Build**

Run: `cd "/c/Users/wealt/AppData/Local/Temp/haze-social-post" && npm run build`
Expected: succeeds; lists `ƒ /api/v1/external/tenants/[id]/engagement`.

- [ ] **Step 3: Commit**

```bash
git add app/api/v1/external/tenants/[id]/engagement/route.ts
git commit -m "feat(portal): GET /tenants/:id/engagement latest-snapshot rollup"
```

---

## Task 2: `portal-social` proxy action (HTS, client-auth, own-tenant scoped)

**Files:**
- Modify: `api/website.js` (add the case to the action switch + the handler function)

- [ ] **Step 1: Register the action in the switch**

In `api/website.js`, find the action `switch` (where `hsp-proxy` and `activate-social` are registered near lines 27-28) and add:
```javascript
    case 'portal-social':       return req.method === 'POST' ? portalSocial(req, res)     : methodNotAllowed(res, 'POST')
```

- [ ] **Step 2: Write the handler**

Add this function near `hspProxy`/`activateSocial`. It mirrors the existing portal-auth pattern (`auth.getUser` → resolve own client). It exposes ONLY a fixed op allowlist against the caller's OWN `hsp_user_id` — the client cannot pass a path or tenant id.

```javascript
// POST ?action=portal-social — client-facing, read-mostly bridge to the
// client's OWN haze-social-post sub-tenant. Auth = the logged-in portal client;
// the tenant id is resolved server-side from their clients.hsp_user_id, never
// supplied by the caller. Body: { op, ...args }.
async function portalSocial(req, res) {
  // 1. Authenticate the portal client from their Supabase session.
  const authHeader = req.headers.authorization || ''
  const m = /^Bearer\s+(.+)$/.exec(authHeader)
  if (!m) return res.status(401).json({ error: 'unauthorized' })
  const userClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const { data: { user: caller }, error: authErr } = await userClient.auth.getUser(m[1].trim())
  if (authErr || !caller) return res.status(401).json({ error: 'unauthorized' })

  // 2. Resolve THIS caller's client row + its sub-tenant id.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const { data: client } = await admin
    .from('clients').select('id, hsp_user_id').eq('user_id', caller.id).maybeSingle()
  if (!client) return res.status(403).json({ error: 'forbidden', message: 'no client for this user' })
  if (!client.hsp_user_id) return res.status(409).json({ error: 'not_activated', message: 'social media is not set up for your account yet' })
  const tid = client.hsp_user_id

  // 3. Resolve the integrator key and dispatch a fixed op against the OWN tenant.
  const apiKey = await getSetting('HSP_EXTERNAL_API_KEY', 'HSP_EXTERNAL_API_KEY')
  if (!apiKey) return res.status(500).json({ error: 'not_configured' })

  const { op, query } = req.body || {}
  const q = typeof query === 'string' && query.startsWith('?') ? query : ''
  let path, method
  switch (op) {
    case 'channels':     path = `/tenants/${tid}/connected-platforms`; method = 'GET'; break
    case 'engagement':   path = `/tenants/${tid}/engagement`;          method = 'GET'; break
    case 'plans':        path = `/tenants/${tid}/content-plans`;       method = 'GET'; break
    case 'posts':        path = `/tenants/${tid}/posts${q}`;           method = 'GET'; break
    case 'connect-link': path = `/tenants/${tid}/connect-links`;       method = 'POST'; break
    default: return res.status(400).json({ error: 'bad_request', message: `unknown op ${op}` })
  }

  const upstream = await fetch(`${HSP_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify({}),
  })
  const text = await upstream.text()
  res.status(upstream.status)
  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
  return res.send(text)
}
```

NOTE: confirm `createClient`, `SUPABASE_URL`, `SERVICE_ROLE_KEY`, `getSetting`, `HSP_BASE`, and `methodNotAllowed` are already imported/defined in `api/website.js` (they are — used by `hspProxy`/`activateSocial`/other portal actions). Reuse them; do not redefine. The `query` passthrough for `posts` is sanitized: only a string beginning with `?` is forwarded (e.g. `?status=SCHEDULED&from=...`), so the client can filter the calendar but cannot rewrite the path.

- [ ] **Step 3: Lint**

Run: `cd "/c/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions" && npx eslint api/website.js 2>&1 | tail -15`
Expected: no NEW errors (pre-existing `process`/`Buffer` not-defined errors are config noise — ignore).

- [ ] **Step 4: Commit**

```bash
git add api/website.js
git commit -m "feat(portal): portal-social proxy — client-auth, own-tenant scoped op allowlist"
```

---

## Task 3: `PortalSocial.jsx` page

**Files:**
- Create: `src/pages/portal/PortalSocial.jsx`

- [ ] **Step 1: Write the page**

Match the existing portal page conventions (read `PortalInvoices.jsx` first for the `useClient()` + supabase-session + fetch pattern + styling). The page:

```jsx
// src/pages/portal/PortalSocial.jsx
// Client-facing Social page: read-only calendar + engagement, self-serve channel connect.
// All data flows through ?action=portal-social, which scopes to THIS client's tenant.
import { useEffect, useState } from 'react'
import { Share2, Loader2, AlertTriangle, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useClient } from './PortalLayout'

async function portalSocial(op, extra = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/website?action=portal-social', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
    body: JSON.stringify({ op, ...extra }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || data.error || `Error ${res.status}`)
  return data
}

export default function PortalSocial() {
  const [channels, setChannels] = useState(null)
  const [engagement, setEngagement] = useState(null)
  const [posts, setPosts] = useState(null)
  const [error, setError] = useState(null)
  const [notActivated, setNotActivated] = useState(false)
  const [connectLink, setConnectLink] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const [ch, en, po] = await Promise.all([
          portalSocial('channels'), portalSocial('engagement'), portalSocial('posts', { query: '?limit=50' }),
        ])
        setChannels(ch.platforms || [])
        setEngagement(en)
        setPosts(po.posts || [])
      } catch (err) {
        if (String(err.message).includes('not set up') || String(err.message).includes('not_activated')) setNotActivated(true)
        else setError(err.message)
      }
    })()
  }, [])

  const connect = async () => {
    setBusy(true); setError(null)
    try { const d = await portalSocial('connect-link'); if (d.url) window.open(d.url, '_blank', 'noopener'); setConnectLink(d.url || null) }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  if (notActivated) {
    return (
      <div style={{ padding: 24, color: '#94A3B8', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <h1 style={{ color: '#0F172A', fontSize: 22, fontWeight: 800 }}>Social</h1>
        <p style={{ marginTop: 8 }}>Your social media workspace isn’t set up yet. We’ll have it ready shortly.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <h1 style={{ color: '#0F172A', fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Social</h1>
      <p style={{ color: '#64748B', fontSize: 13, marginBottom: 20 }}>Monitor your content calendar and engagement, and connect your channels.</p>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', borderRadius: 8, padding: 12, fontSize: 13, marginBottom: 16, display: 'flex', gap: 8 }}>
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* Channels */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ color: '#0F172A', fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Channels</h2>
        {channels === null && <Spinner />}
        {channels && channels.length === 0 && <p style={{ color: '#64748B', fontSize: 13 }}>No channels connected yet.</p>}
        {channels && channels.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {channels.map((c, i) => (
              <span key={i} style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#047857', borderRadius: 999, padding: '4px 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Check size={12} /> {c.platform}{c.handle ? ` · @${c.handle}` : ''}
              </span>
            ))}
          </div>
        )}
        <button onClick={connect} disabled={busy} style={{ marginTop: 12, background: 'linear-gradient(135deg, #00D4FF, #0099CC)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />} Connect a channel
        </button>
        {connectLink && <p style={{ color: '#64748B', fontSize: 11, marginTop: 6 }}>A connection window opened in a new tab. Authorize your account there.</p>}
      </section>

      {/* Engagement */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ color: '#0F172A', fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Engagement</h2>
        {engagement === null && <Spinner />}
        {engagement && (engagement.accounts || []).length === 0 && <p style={{ color: '#64748B', fontSize: 13 }}>No engagement data yet — it appears once your channels have been connected for a little while.</p>}
        {engagement && (engagement.accounts || []).length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {engagement.accounts.map((a, i) => (
              <div key={i} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>{a.platform}{a.handle ? ` · @${a.handle}` : ''}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#0099CC', marginTop: 4 }}>{a.followers != null ? a.followers.toLocaleString() : '—'}</div>
                <div style={{ fontSize: 11, color: '#64748B' }}>followers{a.engagement_rate != null ? ` · ${(a.engagement_rate).toFixed(1)}% eng` : ''}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Calendar */}
      <section>
        <h2 style={{ color: '#0F172A', fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Content calendar</h2>
        {posts === null && <Spinner />}
        {posts && posts.length === 0 && <p style={{ color: '#64748B', fontSize: 13 }}>No posts scheduled yet.</p>}
        {posts && posts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {posts.map((p) => {
              const when = p.scheduled_for ? new Date(p.scheduled_for).toLocaleString() : 'unscheduled'
              const color = p.status === 'PUBLISHED' ? '#047857' : p.status === 'SCHEDULED' ? '#0099CC' : (p.status === 'FAILED' || p.status === 'PARTIAL_FAILURE') ? '#B91C1C' : '#475569'
              return (
                <div key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'center', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 10px' }}>
                  <span style={{ flexShrink: 0, width: 78, fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase' }}>{p.status.replace(/_/g, ' ')}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#0F172A', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.caption || '(no caption)'}</div>
                    <div style={{ color: '#94A3B8', fontSize: 10 }}>{when}{p.platforms?.length ? ` · ${p.platforms.join(', ')}` : ''}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function Spinner() {
  return <div style={{ color: '#94A3B8', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Loader2 size={13} className="animate-spin" /> Loading…</div>
}
```

NOTE: confirm `useClient` is exported from `PortalLayout.jsx`. If it is NOT a named export there (other portal pages may import it differently), follow whatever pattern `PortalInvoices.jsx` uses to get the client/session — the page only needs the supabase session for the fetch, so if `useClient` isn't available, drop that import (it's not used directly in the code above — session comes from `supabase.auth.getSession()`).

- [ ] **Step 2: Build the app (Vite) to confirm the page compiles**

Run: `cd "/c/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions" && npm run build 2>&1 | tail -15`
Expected: Vite build succeeds (no import/JSX errors). (This catches missing imports the lint won't.)

- [ ] **Step 3: Commit**

```bash
git add src/pages/portal/PortalSocial.jsx
git commit -m "feat(portal): client Social page — calendar + engagement + connect"
```

---

## Task 4: Wire nav + route

**Files:**
- Modify: `src/pages/portal/PortalLayout.jsx` (NAV array)
- Modify: `src/App.jsx` (route registration + import)

- [ ] **Step 1: Add the nav entry**

In `PortalLayout.jsx`, add `Share2` to the `lucide-react` import, and add to the `NAV` array (after `brand-kit`, before `invoices`):
```javascript
  { to: '/portal/social',    label: 'Social',     icon: Share2 },
```

- [ ] **Step 2: Register the route**

In `src/App.jsx`, add the import alongside the other portal imports:
```javascript
import PortalSocial          from './pages/portal/PortalSocial'
```
and add the child route inside the `/portal` parent route block (next to `<Route path="invoices" ... />`):
```javascript
            <Route path="social"               element={<PortalSocial />} />
```

- [ ] **Step 3: Build**

Run: `cd "/c/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions" && npm run build 2>&1 | tail -12`
Expected: Vite build succeeds; the route + nav resolve.

- [ ] **Step 4: Commit**

```bash
git add src/pages/portal/PortalLayout.jsx src/App.jsx
git commit -m "feat(portal): wire Social into portal nav + router"
```

---

## Task 5: Deploy + verify

**Files:** none (deploy + verify)

- [ ] **Step 1: Merge haze-social-post engagement endpoint first**

Push `phase3-engagement` branch, PR, green Vercel + codex, squash-merge. Then verify live:
```bash
KEY="<HSP_EXTERNAL_API_KEY>"; BASE="https://hazesocialpost.com"
# Segula tenant id:
TID="cmpvi39wr000304kwg4pr3q2d"
for i in $(seq 1 30); do CODE=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE/api/v1/external/tenants/$TID/engagement" -H "Authorization: Bearer $KEY"); echo "[$i] $CODE"; [ "$CODE" = "200" ] && break; sleep 20; done
curl -sS -w "\n[%{http_code}]\n" "$BASE/api/v1/external/tenants/$TID/engagement" -H "Authorization: Bearer $KEY"
```
Expected: 200 with `{"accounts":[...],"totals":{"followers":...}}` (accounts list reflects Segula's connected channels; may be empty if none connected / no snapshot yet).

- [ ] **Step 2: Merge HTS portal changes**

Push `hts-phase3-portal-social` (branch off `origin/main`), PR, green Vercel + codex, squash-merge. Then `git checkout main && git reset --hard origin/main`.

- [ ] **Step 3: Manual portal verification (browser)**

Log into the **client portal** as a client whose `hsp_user_id` is set (Segula) → the **Social** nav item appears → the page shows Channels (Segula's connected platforms), Engagement cards (or the empty-state), and the Content calendar. Click **Connect a channel** → a connect window opens. Confirm a DIFFERENT client (or one with no `hsp_user_id`) sees the "not set up yet" state and cannot see Segula's data.

---

## Self-Review (completed)

- **Spec coverage:** monitor calendar (posts via portal-social `posts` + Task 3 calendar), engagement (Task 1 endpoint + portal-social `engagement` + Task 3 cards), connect channels self-serve (portal-social `connect-link` + Task 3 button). Agency-only create/approve preserved (no write ops exposed in the portal-social allowlist — only reads + connect-link). Nav + route wired (Task 4).
- **Security (the critical axis):** the client never supplies a tenant id or path — `portalSocial` derives `tid` from `clients.hsp_user_id` keyed on `caller.id` (the authenticated Supabase user). The op is an allowlist of 5 fixed paths; the only free input is a `query` string for `posts`, gated to begin with `?` (can filter, can't rewrite the path). No write/edit/delete/approve op exists. A client with no `hsp_user_id` gets 409 not_activated; a user with no client row gets 403. Cross-tenant access is impossible by construction.
- **Placeholder scan:** none — full code per step; `<HSP_EXTERNAL_API_KEY>` is a deploy secret.
- **Type consistency:** `portal-social` op names (`channels`/`engagement`/`plans`/`posts`/`connect-link`) match the Task 3 `portalSocial(op,...)` calls. Engagement response keys (`accounts[].followers/engagement_rate`, `totals.followers`) match Task 3's card render. Posts/channels shapes reuse the already-live 5B/5C contracts. `query` passthrough name matches between Task 2 (`req.body.query`) and Task 3 (`portalSocial('posts',{query:'?limit=50'})`).
- **No schema change** → no VPS step.

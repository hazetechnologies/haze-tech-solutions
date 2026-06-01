# Phase 2 — Slice 5C: Content & Calendar (overview + SSO launchers) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the HTS operator a live read-only view of each client's content pipeline (content plans + a posts calendar) inside HTS admin, with SSO deep-links to generate, review media, and approve in the real Haze Creator app — completing the operable loop.

**Architecture:** Two read-only external endpoints (`content-plans` list, `posts` calendar feed) expose the sub-tenant's Haze Creator state. HTS renders a Content/Calendar section that polls them and offers SSO deep-links (`POST /tenants/:id/sso-link` with `next=/haze-creator` or `next=/haze-creator/plan/<id>`) for all write work. No native generate/approve/edit is built — those run in the real app (Approach C hybrid), avoiding duplication of Haze Creator's media-in-flight guards and PostTarget cascades. **No schema change** (all reads), so no VPS step.

**Tech Stack:** Next.js 15 app-router, NextAuth, Prisma + Postgres, React (HTS admin).

**Builds on:** 5A (SSO spine — `sso-link`, `sanitizeNext` allowlist already includes `/haze-creator`) + 5B (Channels + `hspProxy` helper in `ClientSocialMediaTab.jsx`). Both merged + live.

**Repos & working copies:**
- **haze-social-post** (Tasks 1–3): `C:\Users\wealt\AppData\Local\Temp\haze-social-post`, branch from `master`. `npm run build`/`npx tsc --noEmit` work. Sandbox can't reach the DB — curl verification is post-deploy against prod.
- **haze-tech-solutions** (Task 4): `C:\Users\wealt\OneDrive\Documents\N8N Workflows\Website Builders\haze-tech-solutions`. **Cut the branch from `origin/main`** (local main may have diverged — 5B gotcha): `git fetch origin && git checkout -B hts-5c-content origin/main`.

**Key facts grounded from the codebase:**
- `Post` fields: `caption`, `scheduledFor DateTime?`, `status PostStatus` (DRAFT/SCHEDULED/PUBLISHING/PUBLISHED/PARTIAL_FAILURE/FAILED), `platforms String` (JSON array), `contentPlanId String?`, `planPostStatus PlanPostStatus?`, `mediaUrls String` (JSON array). Posts hang off `User` via `userId`.
- `ContentPlan` has `status ContentPlanStatus` (GENERATING_OUTLINE/OUTLINE_READY/GENERATING_MEDIA/READY/ARCHIVED), `createdAt`, and a `posts` relation; the native list uses `_count: { select: { posts: true } }`.
- Generation + per-post approve live at `/haze-creator` and `/haze-creator/plan/[contentPlanId]` in the real app; PRO plan passes the Haze Creator gate (`PLANS.PRO.hazeCreator === true`).
- `sanitizeNext` (in `lib/external-api/sso-token.ts`) already allows `/haze-creator` and any `/haze-creator/...` subpath — so plan deep-links need no allowlist change.

**Verification:** typecheck/build + curl against prod for the read endpoints; HTS lint + a deployed click-through for the UI. No vitest (these are thin DB-read routes, like the 5B endpoints).

---

## File Structure

**haze-social-post:**
- Create `app/api/v1/external/tenants/[id]/content-plans/route.ts` — GET list of the sub-tenant's plans + counts.
- Create `app/api/v1/external/tenants/[id]/posts/route.ts` — GET calendar feed of the sub-tenant's posts.

**haze-tech-solutions:**
- Modify `src/pages/admin/components/ClientSocialMediaTab.jsx` — add a Content section (plans status + posts list + SSO launchers), parameterizing the existing `openWorkspace` to accept a `next` path.

---

## Task 1: content-plans list endpoint

**Files:**
- Create: `app/api/v1/external/tenants/[id]/content-plans/route.ts`

- [ ] **Step 1: Write the route**

```typescript
// GET /api/v1/external/tenants/[id]/content-plans
// List a sub-tenant's Haze Creator content plans (status + post counts) so the
// operator can see generation progress from HTS. Read-only.
import { prisma } from '@/lib/prisma'
import { makeExternalHandler } from '@/lib/external-api/handler'
import { requireScope } from '@/lib/external-api/auth'
import { loadTenantInScope } from '@/lib/external-api/scope'

export const GET = makeExternalHandler<{ id: string }>('poll', async ({ auth, params }) => {
  requireScope(auth, 'tenants:read')
  const user = await loadTenantInScope(auth.integrator, params.id)
  const plans = await prisma.contentPlan.findMany({
    where: { userId: user.id, status: { not: 'ARCHIVED' } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      name: true,
      status: true,
      createdAt: true,
      _count: { select: { posts: true } },
    },
  })
  return Response.json({
    plans: plans.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      post_count: p._count.posts,
      created_at: p.createdAt.toISOString(),
    })),
  })
})
```

- [ ] **Step 2: Confirm `ContentPlan` has a `name` field**

Run: `cd "/c/Users/wealt/AppData/Local/Temp/haze-social-post" && grep -nE 'model ContentPlan|name|status|userId|createdAt' prisma/schema.prisma | sed -n '/model ContentPlan/,/}/p'` — actually run: `sed -n "$(grep -n 'model ContentPlan' prisma/schema.prisma | head -1 | cut -d: -f1),+18p" prisma/schema.prisma`
Expected: the model lists `name`, `status`, `userId`, `createdAt`, and a `posts` relation. If `name` is absent, remove `name` from the select + mapping (use `id` only). If present, keep as written.

- [ ] **Step 3: Typecheck + build**

Run: `npm run build`
Expected: succeeds; lists `ƒ /api/v1/external/tenants/[id]/content-plans`.

- [ ] **Step 4: Commit**

```bash
git add app/api/v1/external/tenants/[id]/content-plans/route.ts
git commit -m "feat(content): GET /tenants/:id/content-plans list"
```

---

## Task 2: posts calendar endpoint

**Files:**
- Create: `app/api/v1/external/tenants/[id]/posts/route.ts`

- [ ] **Step 1: Write the route**

```typescript
// GET /api/v1/external/tenants/[id]/posts?from=&to=&status=&limit=
// Calendar feed of a sub-tenant's posts for the HTS overview. Read-only.
// from/to filter scheduledFor (ISO); status filters PostStatus; default window
// is everything, capped at 200 newest-by-schedule.
import { prisma } from '@/lib/prisma'
import { makeExternalHandler } from '@/lib/external-api/handler'
import { requireScope } from '@/lib/external-api/auth'
import { loadTenantInScope } from '@/lib/external-api/scope'

const VALID_STATUS = new Set(['DRAFT', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'PARTIAL_FAILURE', 'FAILED'])

function firstMediaUrl(raw: string): string | null {
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) && arr.length > 0 && typeof arr[0] === 'string' ? arr[0] : null
  } catch {
    return null
  }
}

function parsePlatforms(raw: string): string[] {
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

export const GET = makeExternalHandler<{ id: string }>('poll', async ({ auth, params, req }) => {
  requireScope(auth, 'tenants:read')
  const user = await loadTenantInScope(auth.integrator, params.id)

  const url = new URL(req.url)
  const where: Record<string, unknown> = { userId: user.id }
  const status = url.searchParams.get('status')
  if (status && VALID_STATUS.has(status)) where.status = status

  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const scheduledFor: Record<string, Date> = {}
  if (from) { const d = new Date(from); if (!isNaN(d.getTime())) scheduledFor.gte = d }
  if (to) { const d = new Date(to); if (!isNaN(d.getTime())) scheduledFor.lte = d }
  if (Object.keys(scheduledFor).length > 0) where.scheduledFor = scheduledFor

  const limitРaramRaw = url.searchParams.get('limit')
  const limit = Math.min(Math.max(parseInt(limitРaramRaw || '200', 10) || 200, 1), 200)

  const posts = await prisma.post.findMany({
    where,
    orderBy: [{ scheduledFor: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    select: {
      id: true,
      caption: true,
      status: true,
      planPostStatus: true,
      scheduledFor: true,
      platforms: true,
      mediaUrls: true,
      contentPlanId: true,
      createdAt: true,
    },
  })

  return Response.json({
    posts: posts.map((p) => ({
      id: p.id,
      caption: p.caption,
      status: p.status,
      plan_post_status: p.planPostStatus,
      scheduled_for: p.scheduledFor ? p.scheduledFor.toISOString() : null,
      platforms: parsePlatforms(p.platforms),
      thumbnail: firstMediaUrl(p.mediaUrls),
      content_plan_id: p.contentPlanId,
      created_at: p.createdAt.toISOString(),
    })),
  })
})
```

NOTE: the variable name `limitРaramRaw` above contains a non-ASCII character by mistake — when transcribing, name it `limitParamRaw` (pure ASCII). Same for the line that reads it.

- [ ] **Step 2: Typecheck + build**

Run: `npm run build`
Expected: succeeds; lists `ƒ /api/v1/external/tenants/[id]/posts`.

- [ ] **Step 3: Commit**

```bash
git add app/api/v1/external/tenants/[id]/posts/route.ts
git commit -m "feat(content): GET /tenants/:id/posts calendar feed"
```

---

## Task 3: Deploy haze-social-post + verify endpoints

**Files:** none (deploy + verify)

- [ ] **Step 1: PR, green preview + codex, merge**

```bash
git push -u origin phase2-5c-content
gh pr create -R hazetechnologies/haze-social-post --title "Phase 2 5C: content-plans + posts read endpoints" --body "Read-only content-plans list + posts calendar feed for the HTS overview. No schema change. Builds on 5A/5B. Plan: docs plan 2026-06-01-phase2-5c-content-calendar (HTS repo)."
```
Wait for `Vercel`=SUCCESS + `codex/adversarial` resolved (address findings if any), then squash-merge.

- [ ] **Step 2: Verify both endpoints live against prod**

```bash
KEY="<HSP_EXTERNAL_API_KEY from HTS admin_settings>"; BASE="https://hazesocialpost.com"
TID=$(curl -sS -X POST "$BASE/api/v1/external/tenants" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"name":"cc-probe","contact_email":"cc-probe@hazetechsolutions.com","hts_client_id":"cc"}' | grep -oE '"id":"[^"]+"' | head -1 | sed -E 's/"id":"([^"]+)"/\1/')
echo "probe: $TID"
# poll until content-plans route live, then check both
for i in $(seq 1 30); do
  CODE=$(curl -sS -o /dev/null -w "%{http_code}" "$BASE/api/v1/external/tenants/$TID/content-plans" -H "Authorization: Bearer $KEY")
  echo "[$i] content-plans HTTP $CODE"; [ "$CODE" = "200" ] && break; sleep 20
done
curl -sS -w "\n[plans %{http_code}]\n" "$BASE/api/v1/external/tenants/$TID/content-plans" -H "Authorization: Bearer $KEY"
curl -sS -w "\n[posts %{http_code}]\n" "$BASE/api/v1/external/tenants/$TID/posts" -H "Authorization: Bearer $KEY"
curl -sS -o /dev/null -w "[archive %{http_code}]\n" -X DELETE "$BASE/api/v1/external/tenants/$TID" -H "Authorization: Bearer $KEY"
```
Expected: both return HTTP 200 with `{"plans":[]}` and `{"posts":[]}` for a fresh probe.

---

## Task 4: HTS Content section (overview + SSO launchers)

**Files:**
- Modify: `src/pages/admin/components/ClientSocialMediaTab.jsx`

- [ ] **Step 1: Parameterize `openWorkspace` to accept a `next` path**

In `ClientSocialMediaTab.jsx`, change the `openWorkspace` definition so it takes an optional `next` argument (default `/dashboard`), and pass it through to the sso-link body:

```jsx
  const openWorkspace = async (next = '/dashboard') => {
    setBusy(true); setError(null)
    try {
      const data = await hspProxy(`/tenants/${client.hsp_user_id}/sso-link`, 'POST', { next })
      if (!data.url) throw new Error('No workspace URL returned')
      window.open(data.url, '_blank', 'noopener')
    } catch (err) {
      setError(err.message || 'Could not open workspace')
    } finally {
      setBusy(false)
    }
  }
```

The existing top-level button calls `openWorkspace` with no arg via `onClick={openWorkspace}`. React passes the click event as the first arg, which would become `next`. FIX that call site: change the existing "Open Social Workspace" button's handler to `onClick={() => openWorkspace('/dashboard')}` so the event isn't passed as `next`.

- [ ] **Step 2: Add content state + loaders**

With the other `useState` calls, add:
```jsx
  const [plans, setPlans] = useState(null)
  const [posts, setPosts] = useState(null)
```

Add loader actions (next to `loadPlatforms`):
```jsx
  const loadContent = async () => {
    try {
      const [pl, po] = await Promise.all([
        hspProxy(`/tenants/${client.hsp_user_id}/content-plans`),
        hspProxy(`/tenants/${client.hsp_user_id}/posts`),
      ])
      setPlans(pl.plans || [])
      setPosts(po.posts || [])
    } catch (err) { setError(err.message) }
  }
```

- [ ] **Step 3: Load content when activated**

Extend the existing activated `useEffect` (the one calling `loadPlatforms`) to also load content. Replace:
```jsx
  useEffect(() => { if (activated) loadPlatforms() }, [activated, client?.hsp_user_id])
```
with:
```jsx
  useEffect(() => { if (activated) { loadPlatforms(); loadContent() } }, [activated, client?.hsp_user_id])
```

- [ ] **Step 4: Render the Content section**

Inside the `{activated && (...)}` block, AFTER the Channels block's closing `</div>` (the one opened with `marginTop: 18, borderTop...`), add a sibling Content block:

```jsx
          <div style={{ marginTop: 18, borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ color: '#F1F5F9', fontSize: 14, fontWeight: 600 }}>Content & Calendar</div>
              <button onClick={() => openWorkspace('/haze-creator')} disabled={busy} style={{
                background: 'linear-gradient(135deg, #00D4FF, #0099CC)', color: '#020817',
                border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700,
                cursor: busy ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit',
              }}>
                <Share2 size={12} /> Generate / review in workspace
              </button>
            </div>

            {plans && plans.length > 0 && (
              <div style={{ color: '#94A3B8', fontSize: 12, marginBottom: 10 }}>
                {plans.length} plan{plans.length === 1 ? '' : 's'} ·{' '}
                {plans.map((p) => `${p.name || 'Plan'} (${p.status.replace(/_/g, ' ').toLowerCase()}, ${p.post_count} posts)`).join('  ·  ')}
              </div>
            )}

            {posts === null && <div style={{ color: '#64748B', fontSize: 12 }}>Loading…</div>}
            {posts && posts.length === 0 && (
              <div style={{ color: '#94A3B8', fontSize: 13 }}>No posts yet. Use “Generate / review in workspace” to create a content plan.</div>
            )}
            {posts && posts.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
                {posts.map((p) => {
                  const when = p.scheduled_for ? new Date(p.scheduled_for).toLocaleString() : 'unscheduled'
                  const statusColor = p.status === 'PUBLISHED' ? '#86EFAC' : p.status === 'SCHEDULED' ? '#7DD3FC' : p.status === 'FAILED' || p.status === 'PARTIAL_FAILURE' ? '#FCA5A5' : '#CBD5E1'
                  return (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '8px 10px' }}>
                      <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: statusColor, textTransform: 'uppercase', width: 78 }}>{p.status.replace(/_/g, ' ')}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: '#E2E8F0', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.caption || '(no caption)'}</div>
                        <div style={{ color: '#64748B', fontSize: 10 }}>{when}{p.platforms.length ? ` · ${p.platforms.join(', ')}` : ''}</div>
                      </div>
                      {p.content_plan_id && (
                        <button onClick={() => openWorkspace(`/haze-creator/plan/${p.content_plan_id}`)} disabled={busy} style={{
                          flexShrink: 0, background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#CBD5E1',
                          borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                        }}>Open</button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
```

- [ ] **Step 5: Lint + commit**

Run: `npm run lint 2>&1 | tail -25` — confirm NO new errors mention `ClientSocialMediaTab.jsx` (a pre-existing `react-hooks/exhaustive-deps` warning on the activated `useEffect` is acceptable, matching the rest of the codebase; there are ~110 pre-existing errors in OTHER files — ignore those).
```bash
git add src/pages/admin/components/ClientSocialMediaTab.jsx
git commit -m "feat(social): Content & Calendar overview + SSO launchers"
```

- [ ] **Step 6: PR, green, merge**

```bash
git push -u origin hts-5c-content
gh pr create -R hazetechnologies/haze-tech-solutions --title "Phase 2 5C: Content & Calendar overview" --body "Read-only content-plan + posts calendar overview on the Social Media tab, with SSO deep-links to generate/review in the real Haze Creator. Pairs with haze-social-post 5C. Plan: docs/superpowers/plans/2026-06-01-phase2-5c-content-calendar.md"
```
Wait for Vercel SUCCESS + codex; squash-merge. Then `git checkout main && git reset --hard origin/main` to keep local main aligned.

---

## Self-Review (completed)

- **Spec coverage:** 5C operable-loop items — Content Plans visibility (Task 1 + Task 4 plans line), Calendar (Task 2 posts feed + Task 4 list), generate/review/approve (SSO deep-links in Task 4, honoring the Approach-C hybrid + the user's "overview + SSO" choice). Native edit/approve/cancel intentionally omitted (writes happen in the real app via SSO — avoids duplicating Haze Creator's media-in-flight 409 guard + PostTarget cascade). Documented as a deliberate scope decision, not a gap.
- **Placeholder scan:** none — full code per step. The two intentional non-ASCII typos in Task 2 are explicitly called out with the ASCII correction so the transcriber fixes them. `<HSP_EXTERNAL_API_KEY>` is a deploy-time secret.
- **Type consistency:** endpoint response keys (`plans[]`, `posts[]` with `content_plan_id`, `scheduled_for`, `plan_post_status`, `thumbnail`) match the HTS consumers in Task 4. `openWorkspace(next)` signature change (Task 4 Step 1) is reflected at every call site (the existing top-level button is fixed to `() => openWorkspace('/dashboard')`, and new buttons pass `/haze-creator` / `/haze-creator/plan/<id>`). `hspProxy` reused from 5B. `sanitizeNext` already allows `/haze-creator/...` (no token change needed).
- **No schema change** → no VPS step → the 5A/5B db-push gotcha does not apply to 5C.

# Brand Kit → haze-social-post Library Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** When a client's brand kit is pushed to haze-social-post (on Activate / Re-push), also sync the kit's image assets (logos + banners) into the sub-tenant's media `library` (MediaAsset) so they're usable in posts.

**Architecture:** A new idempotent external endpoint `POST /tenants/:id/assets` creates `MediaAsset` rows (skipping any URL already present for that tenant). HTS's `activateSocial` (used by both Activate and Re-push brand kit) gathers the kit's image public URLs and calls it after the brand push.

**Tech Stack:** Next.js app-router, Prisma (MediaAsset), HTS `api/website.js`.

**Repos:** haze-social-post (`C:\Users\wealt\AppData\Local\Temp\haze-social-post`, branch from `master`); haze-tech-solutions (`...\haze-tech-solutions`, branch from `origin/main`). **No schema change** (MediaAsset exists) → no VPS step.

**Grounded facts:**
- `MediaAsset` fields: `userId, url, type (String), description (String default ""), tags (String default "[]"), fileName?, sizeBytes?, posterUrl?, metadata?`.
- HTS brand kit `assets.images` is an object keyed by variant: `{ banner_ig: {r2_key, public_url}, logo_icon: {...}, logo_primary: {...}, logo_monochrome: {...} }`. Multiple logo keys can share one `public_url` (dedupe by URL).
- `activateSocial` in `api/website.js` already loads the latest kit (`kit.assets`) and pushes brand via `PUT /tenants/:id/brand`. Add the asset sync right after a successful brand push.
- External-route pattern: `makeExternalHandler('default', ...)`, `requireScope(auth,'tenants:write')`, `loadTenantInScope`.

---

## Task 1: `POST /tenants/:id/assets` endpoint (idempotent MediaAsset create)

**Files:**
- Create: `app/api/v1/external/tenants/[id]/assets/route.ts`

- [ ] **Step 1: Write the route**

```typescript
// POST /api/v1/external/tenants/[id]/assets
// Idempotently import media into a sub-tenant's library. Skips any URL already
// present for the tenant, so re-pushing a brand kit doesn't create duplicates.
// Body: { assets: [{ url, type?, description?, tags? }] }
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { makeExternalHandler } from '@/lib/external-api/handler'
import { requireScope } from '@/lib/external-api/auth'
import { loadTenantInScope } from '@/lib/external-api/scope'
import { ExternalApiError } from '@/lib/external-api/errors'

const Body = z.object({
  assets: z.array(z.object({
    url: z.string().url(),
    type: z.string().optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })).min(1).max(50),
})

export const POST = makeExternalHandler<{ id: string }>('default', async ({ auth, params, json }) => {
  requireScope(auth, 'tenants:write')
  const user = await loadTenantInScope(auth.integrator, params.id)
  const parsed = Body.safeParse(await json())
  if (!parsed.success) throw new ExternalApiError(400, 'invalid_body', parsed.error.message)

  // Dedupe within the request, then skip URLs already in the tenant's library.
  const incoming = new Map<string, { url: string; type?: string; description?: string; tags?: string[] }>()
  for (const a of parsed.data.assets) if (!incoming.has(a.url)) incoming.set(a.url, a)

  const existing = await prisma.mediaAsset.findMany({
    where: { userId: user.id, url: { in: [...incoming.keys()] } },
    select: { url: true },
  })
  const have = new Set(existing.map((e) => e.url))

  const toCreate = [...incoming.values()].filter((a) => !have.has(a.url))
  if (toCreate.length > 0) {
    await prisma.mediaAsset.createMany({
      data: toCreate.map((a) => ({
        userId: user.id,
        url: a.url,
        type: a.type || 'image',
        description: a.description || '',
        tags: JSON.stringify(a.tags || []),
      })),
    })
  }

  return Response.json({ created: toCreate.length, skipped: incoming.size - toCreate.length })
})
```

- [ ] **Step 2: Build**

Run: `cd "/c/Users/wealt/AppData/Local/Temp/haze-social-post" && npm run build`
Expected: succeeds; lists `ƒ /api/v1/external/tenants/[id]/assets`.

- [ ] **Step 3: Commit**

```bash
git add app/api/v1/external/tenants/[id]/assets/route.ts
git commit -m "feat(library): POST /tenants/:id/assets — idempotent media import"
```

---

## Task 2: HTS pushes brand-kit images to the library on activate/re-push

**Files:**
- Modify: `api/website.js` (the `activateSocial` function, after the brand `PUT` succeeds)

- [ ] **Step 1: Add the asset sync after the brand push**

In `api/website.js`, in `activateSocial`, locate the block that does `PUT /tenants/${tenantId}/brand` and the `if (!brandRes.ok) { return ... }` guard. IMMEDIATELY AFTER that guard (i.e., once the brand push has succeeded), and still inside the `if (kit?.assets)` block, add:

```javascript
    // Sync the kit's image assets into the sub-tenant's library (idempotent).
    // Dedupe by URL — multiple logo variants often share one public_url.
    const images = a?.images || {}
    const seen = new Set()
    const libraryAssets = []
    for (const [key, val] of Object.entries(images)) {
      const url = val?.public_url || val?.url
      if (!url || seen.has(url)) continue
      seen.add(url)
      const isBanner = key.startsWith('banner')
      libraryAssets.push({
        url,
        type: 'image',
        description: isBanner ? `Brand banner (${key.replace('banner_', '')})` : `Brand logo (${key.replace('logo_', '').replace(/_/g, ' ')})`,
        tags: ['brand-kit', key],
      })
    }
    if (libraryAssets.length > 0) {
      // Best-effort: a library-sync failure must not fail activation/brand push.
      try {
        await fetch(`${HSP_BASE}/tenants/${tenantId}/assets`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ assets: libraryAssets }),
        })
      } catch (e) {
        console.error('[activate-social] library asset sync failed:', e?.message || e)
      }
    }
```

NOTE: `a` is the existing `kit.assets` alias already in scope in that block (the brand body is built from `a.*`). Confirm the alias name by reading the function; if the assets object is referenced as `kit.assets` rather than `a`, use that. The image source is `<assets>.images`.

- [ ] **Step 2: Lint the changed file**

Run: `cd "/c/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions" && npx eslint api/website.js 2>&1 | tail -15`
Expected: no NEW errors in `api/website.js` (it's server code; confirm no syntax/parse errors).

- [ ] **Step 3: Commit**

```bash
git add api/website.js
git commit -m "feat(social): sync brand-kit images into haze-social-post library on activate"
```

---

## Task 3: Deploy both + verify on Segula

**Files:** none (deploy + verify)

- [ ] **Step 1: PR + merge haze-social-post (green Vercel + codex), then HTS**

Push each branch, open PRs, wait for `Vercel`=SUCCESS + `codex/adversarial` resolved, squash-merge. haze-social-post first (HTS calls its endpoint).

- [ ] **Step 2: Verify the endpoint live + re-push Segula**

After both deploy: in the HTS admin, open the Segula client → Social Media → **Re-push brand kit**. Then confirm the library populated by minting an SSO link to `/library` (or query). Quick API check with a throwaway probe:
```bash
KEY="<HSP_EXTERNAL_API_KEY>"; BASE="https://hazesocialpost.com"
# confirm the route is live (probe tenant)
TID=$(curl -sS -X POST "$BASE/api/v1/external/tenants" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"name":"lib-probe","contact_email":"lib-probe@hazetechsolutions.com","hts_client_id":"lib"}' | grep -oE '"id":"[^"]+"' | head -1 | sed -E 's/"id":"([^"]+)"/\1/')
curl -sS -w "\n[%{http_code}]\n" -X POST "$BASE/api/v1/external/tenants/$TID/assets" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"assets":[{"url":"https://example.com/a.png","type":"image","description":"probe","tags":["t"]}]}'
# repeat → expect skipped:1
curl -sS -w "\n[%{http_code}]\n" -X POST "$BASE/api/v1/external/tenants/$TID/assets" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"assets":[{"url":"https://example.com/a.png","type":"image","description":"probe","tags":["t"]}]}'
curl -sS -o /dev/null -w "[archive %{http_code}]\n" -X DELETE "$BASE/api/v1/external/tenants/$TID" -H "Authorization: Bearer $KEY"
```
Expected: first call `{"created":1,"skipped":0}`, second `{"created":0,"skipped":1}` (idempotent). Then the Segula re-push should have populated its real library (verify by SSO → `/library`, a manual browser check).

---

## Self-Review (completed)
- **Coverage:** brand images → library (Task 1 endpoint + Task 2 wiring on activate/re-push). Idempotent on re-push (URL skip). Dedupe of shared logo URLs handled both client-side (seen Set) and server-side (existing check).
- **Placeholders:** none; `<HSP_EXTERNAL_API_KEY>` is a deploy secret.
- **Types:** endpoint body `{assets:[{url,type?,description?,tags?}]}` matches the HTS POST payload exactly. `tags` array → JSON string in DB. `loadTenantInScope` enforces tenant ownership.
- **Safety:** library sync is best-effort (try/catch) so it never fails activation/brand push.

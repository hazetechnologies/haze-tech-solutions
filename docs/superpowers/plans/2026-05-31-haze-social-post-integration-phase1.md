# Haze Social Post Integration — Phase 1 Plan
*2026-05-31 (revised after reading repo)*
*Spec: [`2026-05-31-haze-social-post-integration-design.md`](../specs/2026-05-31-haze-social-post-integration-design.md)*

## Revision note

This plan originally referenced `Organization` and `Account` models in haze-social-post. After reading the repo, neither exists in the relevant form — haze-social-post is single-tenant per `User`, and the existing `Account` model is NextAuth's per-user OAuth identity record (used for "sign in with Google", etc.). Two name changes that ripple through the plan:

- `Organization` (the imagined tenant) → `User` (the actual tenant unit). Sub-tenant = synthetic User flagged `integrator_id = <HTS>`.
- New `Account` model (the imagined integrator) → new `Integrator` model. Avoids collision with NextAuth's `Account`.

All task structure (A–I), task sizes, and the dependency graph carry over verbatim.

## Phase 1 scope

External-API skeleton on haze-social-post + Setup-screen on HTS that lets an admin activate social media for a client (1 click → sub-tenant User created in haze-social-post → brand kit pushed). After Phase 1 ships, HTS clients have a sub-tenant User with their brand profile loaded but no platforms connected and no content plans generated yet. Those come in Phases 2 and 3.

## Open questions — locked-in answers

| # | Question | Resolution |
|---|----------|------------|
| 1 | Billing for sub-tenants | Sub-tenant Users get a default **Pro tier** (`User.plan = 'PRO'`) at creation. No quota surprises during agency work. HTS pays haze-social-post an aggregate monthly internal fee = sub-tenant count × per-seat rate, settled via Stripe Subscriptions. Billing rolls up from `SELECT COUNT(*) FROM "User" WHERE integrator_id=$1 AND "disabledAt" IS NULL` cron. |
| 2 | Integrator model on haze-social-post | Add a real `Integrator` table now (NOT named `Account` — that collides with NextAuth's OAuth-identity table). `ExternalApiKey.integrator_id` and `User.integrator_id` foreign-key to it. Cheap insurance for a second integrator later. |
| 3 | Connect-link authentication | Magic-link, 24h expiry. Reuses NextAuth's `VerificationToken` table (already in haze-social-post — used by the existing email-magic-link login flow). The link's token maps to `(user_id, intent='connect', platform_list)`. On click, the recipient is logged in as the sub-tenant User with a session restricted to OAuth-flow endpoints only. |
| 4 | OAuth callback URLs | Clients OAuth into haze-social-post — existing per-platform callback URLs unchanged. When HTS calls `POST /tenants/:id/connect-links`, it passes a `return_url`. After each platform's OAuth flow lands, haze-social-post redirects to `return_url?status=success&platform=instagram&tenant_id=...`. HTS sees the param, refreshes the connected-platforms list, surfaces a toast. |

## Task list

### A — haze-social-post: schema (1 migration, ~30 min)

- [ ] `prisma/schema.prisma`: add models
  - `Integrator { id, name, billing_email, stripe_customer_id?, created_at, updated_at, users User[], apiKeys ExternalApiKey[] }`
  - `ExternalApiKey { id, integrator_id, key_hash @unique, scopes String[], created_at, last_used_at, revoked_at? }`
  - Index `(integrator_id, revoked_at)` on `ExternalApiKey`
- [ ] `User` model gains: `integrator_id String?` + `@@index([integrator_id, disabledAt])` for cheap "active sub-tenants" lookups
- [ ] Seed (idempotent SQL, not a Prisma seed script): one `Integrator { name: "HTS" }`, one `ExternalApiKey` for HTS (script prints plaintext exactly once — admin pastes into HTS admin/secrets afterwards). Plaintext stored nowhere on the haze-social-post side.
- [ ] `prisma migrate dev` locally, then `prisma migrate deploy` on VPS Postgres (per memory `feedback_haze_clips_migrate_deploy`)

### B — haze-social-post: auth middleware (1 file, ~30 min)

- [ ] `lib/external-api/auth.ts` exporting `requireExternalKey(req): Promise<{ integrator, scopes }>`
  - Parses `Authorization: Bearer <token>` → `sha256(token)` → looks up `ExternalApiKey` by `key_hash`, `revoked_at IS NULL`
  - Updates `last_used_at` (debounced; only once per minute to avoid write storm)
  - Returns `{ integrator, scopes }` or throws 401
- [ ] `lib/external-api/rate-limit.ts` — Redis-backed token bucket, 200 req/min default, 600 req/min for polling routes (`GET /tenants/:id/posts`, `GET /tenants/:id/content-plans/:plan_id`)
- [ ] `lib/external-api/scope.ts` exporting `requireTenantScope(integrator, user)`: throws 403 if `user.integrator_id !== integrator.id`

### C — haze-social-post: sub-tenant CRUD routes (~1 hour)

All routes under `app/api/v1/external/tenants/`. Each calls `requireExternalKey` first, then `requireTenantScope`.

- [ ] `POST /api/v1/external/tenants/route.ts` — `{ name, contact_email, hts_client_id }` → creates `User` with `integrator_id = <HTS>`, `plan = 'PRO'`, `email = contact_email`, `name = name`, NO password. Returns `{ id, status }`.
- [ ] `GET /api/v1/external/tenants/[id]/route.ts` — returns `{ id, name, contact_email, status, connected_platforms: [], post_count, plan }`. `status` derives from `disabledAt` (null → "active", non-null → "disabled").
- [ ] `PATCH /api/v1/external/tenants/[id]/route.ts` — updates name, email; rejects status `disabled` for tenants with pending publishes (`Post.status IN ('SCHEDULED','PUBLISHING')`).
- [ ] `DELETE /api/v1/external/tenants/[id]/route.ts` — soft-delete (sets `disabledAt`, `disabledReason = 'integrator_archived'`); preserves data; revokes any in-progress connect-links.

### D — haze-social-post: brand + FAQ push (~45 min)

- [ ] `PUT /api/v1/external/tenants/[id]/brand/route.ts` — accepts HTS's brand-kit shape, upserts `BrandProfile` keyed on `userId` (idempotent). Mapping per spec table.
- [ ] `PUT /api/v1/external/tenants/[id]/faq/route.ts` — replaces `User.faqs` (JSON) atomically.
- [ ] Validation: zod schema for brand payload; reject if `palette` has more or fewer than 5 entries or hex format is wrong.

### E — haze-social-post: tests (~1 hour)

- [ ] Vitest specs for `requireExternalKey` (valid / revoked / wrong-hash / missing header)
- [ ] Vitest specs for `requireTenantScope` (cross-integrator access denied)
- [ ] Integration test: create sub-tenant → push brand → GET sub-tenant → assert brand_profile_complete=true
- [ ] Rate-limit test: 201 requests in 60s → last 1 gets 429

### F — HTS: schema migration (~15 min)

- [ ] `supabase/migrations/2026_05_31_clients_hsp_user_id.sql`:
  - `ALTER TABLE clients ADD COLUMN hsp_user_id text UNIQUE`
  - `INSERT INTO admin_settings (key, value, secret) VALUES ('HSP_EXTERNAL_API_KEY', '', true) ON CONFLICT DO NOTHING`
- [ ] Apply via Supabase Mgmt API per memory `reference_supabase`

### G — HTS: proxy endpoint (~30 min)

- [ ] `api/website.js`: add `case 'hsp-proxy'` action — forwards `req.body.path` + `req.body.method` + `req.body.body` to `https://hazesocialposts.com/api/v1/external<path>` with `Authorization: Bearer ${HSP_EXTERNAL_API_KEY}` (fetched via `getSetting`). Returns upstream response verbatim. `requireAdmin` gates the route — the proxy must NEVER be hit by anonymous traffic.
- [ ] Optional: log requests to a new `hsp_proxy_logs` table for debugging.

### H — HTS: Setup screen (~1 hour)

- [ ] `src/pages/admin/components/ClientSocialMediaTab.jsx`:
  - If `!client.hsp_user_id`: render *"Activate social media"* button → on click, call `hsp-proxy` to `POST /tenants` with `{ name: client.name, contact_email: client.email, hts_client_id: client.id }` → save returned id to `clients.hsp_user_id` (via internal mutation, not the proxy) → call `hsp-proxy` to `PUT /tenants/:id/brand` with the latest brand_kits row's `assets` mapped to the brand payload → success toast
  - If `client.hsp_user_id`: render *"Activated. {N} platforms connected."* placeholder — channels come in Phase 2
- [ ] Wire the tab into `src/pages/admin/ClientDetailPage.jsx` alongside existing Brand Kit / Website / Stripe tabs.

### I — Smoke test (~30 min)

- [ ] On Vercel preview: pick Segula client → Activate social media → verify a new sub-tenant User appears in haze-social-post's admin (filter by `integrator_id`) → verify brand profile populated correctly
- [ ] Trigger a brand-kit regen on Segula → re-activate → verify brand profile updates without creating a duplicate sub-tenant (idempotency)

## Ship checklist before Phase 2

- [ ] All A–I tasks merged on both sides
- [ ] At least one real HTS client (Segula) has a sub-tenant User with brand profile pushed
- [ ] HSP_EXTERNAL_API_KEY rotated once successfully (sanity-check the revoke-and-replace flow)
- [ ] Codex adversarial review clean on the haze-social-post PR
- [ ] Codex adversarial review clean on the HTS PR

## Risks watch

| Risk | Mitigation |
|------|------------|
| HTS proxy becomes an open vector | `requireAdmin` on the proxy route; never expose proxy to portal users |
| Sub-tenant User count explodes haze-social-post DB | Add `WHERE "disabledAt" IS NULL` to every active-tenant query; cleanup cron |
| Integrator-owned Users collide with normal-signup logic (free tier limits, onboarding flow, email-deliverability checks) | All paths that gate on user state must check `integrator_id IS NULL` before enforcing self-signup rules. Audit existing middleware/cron during task B. |
| Brand-kit schema drift between products | Zod schema in haze-social-post; HTS rebuilds payload from brand_kits row every push; never references hsp side schema directly |
| API key leaks via Vercel logs | Don't log the key. Mask in any error output. Rotate quarterly. |

## Out of scope (deferred to Phase 2+)

- Channel connect-link issuance + connected-platforms UI (Phase 2)
- Haze Creator trigger + Calendar grid (Phase 3)
- Webhooks haze-social-post → HTS (Phase 4)
- Analytics rollups (Phase 4)
- Bulk actions across multiple sub-tenants (later)

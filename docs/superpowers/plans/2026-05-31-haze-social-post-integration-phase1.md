# Haze Social Post Integration — Phase 1 Plan
*2026-05-31*
*Spec: [`2026-05-31-haze-social-post-integration-design.md`](../specs/2026-05-31-haze-social-post-integration-design.md)*

## Phase 1 scope

External-API skeleton on haze-social-post + Setup-screen on HTS that lets an admin activate social media for a client (1 click → sub-org created in haze-social-post → brand kit pushed). After Phase 1 ships, HTS clients have a sub-org with their brand profile loaded but no platforms connected and no content plans generated yet. Those come in Phases 2 and 3.

## Open questions — locked-in answers

| # | Question | Resolution |
|---|----------|------------|
| 1 | Billing for sub-orgs | Sub-orgs get a default **Pro tier** at creation (no quota surprises during agency work). HTS pays haze-social-post an aggregate monthly internal fee = sub-org count × per-seat rate, settled via Stripe Subscriptions. No metering inside the API itself — billing rolls up from a `SELECT COUNT(*) FROM Organization WHERE parent_account_id=$1` cron. |
| 2 | Account model on haze-social-post | Add a real `Account` table now. Schema below. `ExternalApiKey.account_id` foreign-keys to it; `Organization.parent_account_id` foreign-keys to it. Hard-coding `parent_account = 'HTS'` is rejected — cheap insurance for a second integrator later. |
| 3 | Connect-link authentication | Magic-link, 24h expiry. Reuses NextAuth's `EmailProvider` token table (already in haze-social-post). The link's hash maps to `(org_id, intent='connect', platform_list)`. On click, the recipient is logged in as the sub-org owner with a session that's restricted to OAuth-flow endpoints only. |
| 4 | OAuth callback URLs | Clients OAuth into haze-social-post — existing per-platform callback URLs unchanged. When HTS calls `POST /orgs/:id/connect-links`, it passes a `return_url`. After each platform's OAuth flow lands, haze-social-post redirects to `return_url?status=success&platform=instagram&org_id=...`. HTS sees the param, refreshes the connected-platforms list, surfaces a toast. |

## Task list

### A — haze-social-post: schema (1 migration, ~30 min)

- [ ] `prisma/schema.prisma`: add models
  - `Account { id, name, billing_email, stripe_customer_id?, created_at, updated_at }`
  - `ExternalApiKey { id, account_id, key_hash, scopes (string[]), created_at, last_used_at, revoked_at? }`
  - Index `(account_id, revoked_at)` on `ExternalApiKey`
- [ ] `Organization` model gains: `parent_account_id?`, `parent_account_billing_plan? (default 'PRO')`
- [ ] Seed: one HTS Account, one ExternalApiKey for HTS (admin pastes the plaintext into HTS admin/secrets afterwards)
- [ ] `prisma migrate dev` locally, then `prisma migrate deploy` on VPS Postgres (per memory `feedback_haze_clips_migrate_deploy`)

### B — haze-social-post: auth middleware (1 file, ~30 min)

- [ ] `lib/external-api/auth.ts` exporting `requireExternalKey(req): Promise<{ account, scopes }>`
  - Parses `Authorization: Bearer <token>` → `sha256(token)` → looks up `ExternalApiKey` by `key_hash`, `revoked_at IS NULL`
  - Updates `last_used_at` (debounced; only once per minute to avoid write storm)
  - Returns `{ account, scopes }` or throws 401
- [ ] `lib/external-api/rate-limit.ts` — Redis-backed token bucket, 200 req/min default, 600 req/min for polling routes (`GET /orgs/:id/posts`, `GET /orgs/:id/content-plans/:plan_id`)
- [ ] `lib/external-api/scope.ts` exporting `requireOrgScope(account, org)`: throws 403 if `org.parent_account_id !== account.id`

### C — haze-social-post: org CRUD routes (~1 hour)

All routes under `app/api/v1/external/orgs/`. Each calls `requireExternalKey` first.

- [ ] `POST /api/v1/external/orgs/route.ts` — `{ name, contact_email, hts_client_id }` → creates Organization with `parent_account_id` + default billing plan; returns `{ id, status }`
- [ ] `GET /api/v1/external/orgs/[id]/route.ts` — returns `{ id, name, status, connected_platforms: [], post_count, plan }`
- [ ] `PATCH /api/v1/external/orgs/[id]/route.ts` — updates name, contact_email, status; rejects status `archived` for orgs with pending publishes
- [ ] `DELETE /api/v1/external/orgs/[id]/route.ts` — soft-delete (sets `archived_at`); preserves data; revokes any in-progress connect-links

### D — haze-social-post: brand + FAQ push (~45 min)

- [ ] `PUT /api/v1/external/orgs/[id]/brand/route.ts` — accepts HTS's brand-kit shape, upserts `BrandProfile` (idempotent). Mapping per spec table.
- [ ] `PUT /api/v1/external/orgs/[id]/faq/route.ts` — replaces the FAQ list atomically (`DELETE ... INSERT` in a transaction).
- [ ] Validation: zod schema for brand payload; reject if `palette` has more or fewer than 5 entries or hex format is wrong.

### E — haze-social-post: tests (~1 hour)

- [ ] Vitest specs for `requireExternalKey` (valid / revoked / wrong-hash / missing header)
- [ ] Vitest specs for `requireOrgScope` (cross-account access denied)
- [ ] Integration test: create org → push brand → GET org → assert brand_profile_complete=true
- [ ] Rate-limit test: 201 requests in 60s → last 1 gets 429

### F — HTS: schema migration (~15 min)

- [ ] `supabase/migrations/2026_05_31_clients_hsp_org_id.sql`:
  - `ALTER TABLE clients ADD COLUMN hsp_org_id text UNIQUE`
  - `INSERT INTO admin_settings (key, value, secret) VALUES ('HSP_EXTERNAL_API_KEY', '', true) ON CONFLICT DO NOTHING`
- [ ] Apply via Supabase Mgmt API per memory `reference_supabase`

### G — HTS: proxy endpoint (~30 min)

- [ ] `api/website.js`: add `case 'hsp-proxy'` action — forwards `req.body.path` + `req.body.method` + `req.body.body` to `https://hazesocialposts.com/api/v1/external<path>` with `Authorization: Bearer ${HSP_EXTERNAL_API_KEY}` (fetched via `getSetting`). Returns upstream response verbatim. `requireAdmin` gates the route — the proxy must NEVER be hit by anonymous traffic.
- [ ] Optional: log requests to a new `hsp_proxy_logs` table for debugging.

### H — HTS: Setup screen (~1 hour)

- [ ] `src/pages/admin/components/ClientSocialMediaTab.jsx`:
  - If `!client.hsp_org_id`: render *"Activate social media"* button → on click, call `hsp-proxy` to `POST /orgs` with `{ name: client.name, contact_email: client.email, hts_client_id: client.id }` → save returned id to `clients.hsp_org_id` (via internal mutation, not the proxy) → call `hsp-proxy` to `PUT /orgs/:id/brand` with the latest brand_kits row's `assets` mapped to the brand payload → success toast
  - If `client.hsp_org_id`: render *"Activated. {N} platforms connected."* placeholder — channels come in Phase 2
- [ ] Wire the tab into `src/pages/admin/ClientDetailPage.jsx` alongside existing Brand Kit / Website / Stripe tabs.

### I — Smoke test (~30 min)

- [ ] On Vercel preview: pick Segula client → Activate social media → verify a new sub-org appears in haze-social-post's admin (filter by `parent_account_id`) → verify brand profile populated correctly
- [ ] Trigger a brand-kit regen on Segula → re-activate → verify brand profile updates without creating a duplicate sub-org (idempotency)

## Ship checklist before Phase 2

- [ ] All A–I tasks merged on both sides
- [ ] At least one real HTS client (Segula) has a sub-org with brand profile pushed
- [ ] HSP_EXTERNAL_API_KEY rotated once successfully (sanity-check the revoke-and-replace flow)
- [ ] Codex adversarial review clean on the haze-social-post PR
- [ ] Codex adversarial review clean on the HTS PR

## Risks watch

| Risk | Mitigation |
|------|------------|
| HTS proxy becomes an open vector | `requireAdmin` on the proxy route; never expose proxy to portal users |
| Sub-org count explodes haze-social-post DB | Add `WHERE archived_at IS NULL` to every active-org query; cleanup cron |
| Brand-kit schema drift between products | Zod schema in haze-social-post; HTS rebuilds payload from brand_kits row every push; never references hsp side schema directly |
| API key leaks via Vercel logs | Don't log the key. Mask in any error output. Rotate quarterly. |

## Out of scope (deferred to Phase 2+)

- Channel connect-link issuance + connected-platforms UI (Phase 2)
- Haze Creator trigger + Calendar grid (Phase 3)
- Webhooks haze-social-post → HTS (Phase 4)
- Analytics rollups (Phase 4)
- Bulk actions across multiple sub-orgs (later)

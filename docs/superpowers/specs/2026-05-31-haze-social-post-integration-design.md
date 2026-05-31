# Haze Social Post Integration — Design Spec
*2026-05-31*

## Problem

HTS sells social media management as a service. Today, the social-media engine (Haze Creator multi-post plan generation, 7-platform publisher, scheduler, optimal-time analyzer, evergreen recycler) lives entirely in [`haze-social-post`](https://github.com/hazetechnologies/haze-social-post). HTS clients can't see or trigger any of it from the HTS portal — admins have to leave the platform, log into haze-social-post, switch tenants, and run the work there.

We need HTS to be able to drive the social media engine on behalf of HTS clients without rebuilding any of it.

## Chosen approach — API integration (vs. duplication or third app)

Build a multi-tenant **external API** on haze-social-post. HTS consumes it via a single per-account API key. Every HTS client maps 1:1 to a sub-Organization in haze-social-post. HTS pushes brand data + content-plan requests, polls/receives publish status.

**Rejected alternatives:**
- *Duplicate Haze Creator + publishers + scheduler into HTS*: doubles maintenance for OAuth flows, token refresh, retry logic, optimal-time calc, evergreen recycler. Months of working code re-built. Drift inevitable.
- *Spin up a third platform for "agency-mode" social*: same duplication cost plus a third codebase, three deploys, three sets of credentials. Premature scaling.

## Non-goals (v1)

- Multi-account multi-platform OAuth on the HTS side — clients OAuth into haze-social-post directly via a hosted connect flow (link issued by HTS).
- Real-time webhook fan-out from haze-social-post → HTS. Polling is fine for v1; webhooks come later when latency matters.
- HTS embedding haze-social-post's UI in an iframe. We mirror the relevant screens with native HTS components so styling/branding stays consistent.

## Architecture

```
┌─────────────────────────┐         ┌──────────────────────────────────┐
│   HTS (Next.js + Vercel)│         │  haze-social-post (Next.js+VPS)  │
│                         │  HTTPS  │                                  │
│  /admin/clients/:id     │ ──────► │  /api/v1/external/orgs           │
│  /admin/clients/:id     │  Bearer │  /api/v1/external/orgs/:id/brand │
│   ↳ "Social Media" tab  │  key    │  /api/v1/external/.../content    │
│                         │ ◄────── │  /api/v1/external/.../posts      │
│  HTS DB (Supabase)      │  JSON   │  Postgres + Worker (BullMQ)      │
│  - clients              │         │  - Organization (tenant)         │
│  - hsp_org_id mapping   │         │  - BrandProfile / FAQ            │
└─────────────────────────┘         │  - Sequence / Post / PostTarget  │
                                    │  - bot worker (Meta DMs)         │
                                    └──────────────────────────────────┘
```

**Single HTS-owned tenant key** signs every request. The key carries a scope claim: "may create + manage sub-orgs". Sub-orgs created via this API are flagged `parent_account = 'HTS'` so they don't show up in haze-social-post's normal signup analytics.

**HTS persists `hsp_org_id` per client** in a new `clients.hsp_org_id` column. That's the only schema change on the HTS side.

## Auth model

- haze-social-post adds a `ExternalApiKey` model: `{ id, key_hash, owner_account, scopes, created_at, last_used_at, revoked_at }`.
- HTS stores its key in `admin_settings` (DB-first secret) — fetched via `getSetting('HSP_EXTERNAL_API_KEY')` at request time.
- Every `/api/v1/external/*` route validates `Authorization: Bearer <key>` against the hash, resolves `owner_account = 'HTS'`, then enforces sub-org scope: HTS can only touch orgs whose `parent_account = 'HTS'`.
- Rate limit: 200 req/min per key, 429 on exceed. Polling endpoints get a higher ceiling (600/min).

## Endpoints (v1)

All under `/api/v1/external/` on haze-social-post. JSON bodies, `Bearer <key>` auth.

### Org lifecycle
- `POST /orgs` — create sub-org for a new HTS client. Body: `{ name, contact_email, hts_client_id }`. Returns `{ id, status }`.
- `GET  /orgs/:id` — fetch sub-org snapshot (plan, post count, connected platforms).
- `PATCH /orgs/:id` — update name/email/status. Suspend or archive.
- `DELETE /orgs/:id` — soft-delete (preserves data; revokes API access).

### Brand profile push
- `PUT /orgs/:id/brand` — overwrite the brand profile. Body matches HTS's brand-kit schema (`business_name`, `business_description`, `vibe`, `palette`, `voice_tone`, `inspirations`, `audience`, `existing_logo_url`, `imagery_direction`, `tagline`, `cta`, `bios`, `hashtags`, `content_pillars`). Idempotent.
- `PUT /orgs/:id/faq` — overwrite the FAQ list. Body: `[{ question, answer }, …]`. Idempotent.

### Channel connect (OAuth handoff)
- `POST /orgs/:id/connect-links` — request a short-lived connect URL for one or more platforms. Body: `{ platforms: ["instagram", "facebook", ...] }`. Returns `{ links: { instagram: "https://hazesocialposts.com/connect?token=…", … } }`. HTS opens this in a new tab; the client OAuths inside haze-social-post; token comes back as `connected: true`.
- `GET /orgs/:id/connected-platforms` — list which platforms are currently OAuth'd.

### Content generation
- `POST /orgs/:id/content-plans` — trigger Haze Creator. Body: `{ post_count: 14, platforms: [...], date_range: { start, end }, theme_overrides: "..." }`. Returns `{ plan_id, status: "generating" }` immediately (async worker job).
- `GET  /orgs/:id/content-plans/:plan_id` — poll status. Returns `{ status: "generating"|"ready"|"failed", posts: [...], error }`.
- `POST /orgs/:id/content-plans/:plan_id/approve` — mark plan posts as scheduled for publish (publisher cron then takes over).

### Post management
- `GET  /orgs/:id/posts?status=&platform=&from=&to=` — list posts (paginated).
- `GET  /orgs/:id/posts/:post_id` — fetch one post + all PostTargets (per-platform variants).
- `PATCH /orgs/:id/posts/:post_id` — edit caption, scheduled_for, media. Only when status=DRAFT or SCHEDULED.
- `DELETE /orgs/:id/posts/:post_id` — cancel a scheduled post.
- `POST /orgs/:id/posts/:post_id/publish-now` — bypass schedule and publish immediately.

### Optimal-time + recycle
- `GET /orgs/:id/suggest-time?platform=&duration_days=14` — return data-driven optimal hours (this just reuses the existing suggest-time analyzer).
- `POST /orgs/:id/posts/:post_id/recycle` — mark a published post as eligible for evergreen recycling.

## Data contract: brand push

HTS's brand kit row maps cleanly to haze-social-post's `BrandProfile` + related tables. Mapping:

| HTS `brand_kits.assets`     | haze-social-post                    |
|-----------------------------|--------------------------------------|
| `bios.{instagram, …}`       | `BrandProfile.bios.{platform}`       |
| `voice_tone` (markdown)     | `BrandProfile.voice_tone`            |
| `color_palette[]`           | `BrandProfile.palette` JSON          |
| `content_pillars[]`         | `BrandProfile.content_pillars` JSON  |
| `hashtags[]`                | `BrandProfile.default_hashtags`      |
| `tagline`, `cta`            | `BrandProfile.tagline`, `cta`        |
| `images.logo_primary.url`   | `BrandProfile.logo_url`              |

HTS already has all of these. The push is one PUT.

## HTS UI changes

New tab on `/admin/clients/:client_id`: **"Social Media"**. Shown only when `client.hsp_org_id` is set. Sub-screens:

1. **Setup** (shown when `hsp_org_id` is null):
   - Button: *"Activate social media for this client"* → calls `POST /api/website?action=activate-social` which (a) calls `POST /api/v1/external/orgs` on haze-social-post, (b) stores returned id in `clients.hsp_org_id`, (c) immediately pushes brand kit via `PUT .../brand`.
2. **Channels** (lists connected platforms; button to issue a connect link to share with the client).
3. **Content Plans** (form to trigger Haze Creator; list of past plans with status).
4. **Calendar** (grid of scheduled + published posts; clicking a post opens it in a modal mirrored from haze-social-post's edit view).
5. **Analytics** (sparkline of post counts + engagement; just fetches the existing summary endpoint).

All five screens are thin React components hitting a new HTS internal route `api/website?action=hsp-proxy&path=...` that forwards to the external API with the HTS-side API key (so the haze-social-post API key never lands in the browser).

## Failure modes + retries

| Scenario                                         | Behavior                                              |
|--------------------------------------------------|-------------------------------------------------------|
| haze-social-post returns 5xx                     | HTS retries 3× with exponential backoff (1s/2s/4s).  |
| haze-social-post unreachable for >30s            | HTS marks the action `queued`; cron retries every 5m. |
| Sub-org create succeeds but brand push fails     | `hsp_org_id` saved on HTS side; brand push retried.   |
| Content plan generation hangs (haze-social-post worker stuck) | HTS surfaces "stuck for >30m" warning + button to re-trigger. |
| API key revoked                                  | HTS shows banner; admin re-pastes key in admin/secrets. |

## Phasing

- **Phase 1 (week 1):** External-API skeleton on haze-social-post — org CRUD, brand push, API key auth. HTS gains `clients.hsp_org_id` column + Setup screen.
- **Phase 2 (week 2):** Channels (connect-link issue + connected-platforms list). Manual smoke: connect Segula's Instagram via the issued link.
- **Phase 3 (week 3):** Content Plans — Haze Creator trigger + polling + Calendar grid. Publisher cron already runs on haze-social-post; no new work there.
- **Phase 4 (later):** Webhooks from haze-social-post → HTS so HTS can drop the polling loop. Analytics rollups. Bulk actions.

## Open questions

1. **Billing**: do HTS-driven content plans count against the HTS account's plan limits on haze-social-post, or do sub-orgs have their own quotas? Recommended: HTS pays a flat per-sub-org fee internally; sub-orgs get a default Pro tier so they're not surprise-throttled.
2. **Account model on haze-social-post**: do we need a real `Account` table, or is "owner_account = 'HTS'" hard-coded enough for v1? Probably an `Account` table now is cheap insurance for a second integrator later.
3. **Authentication for the connect-link**: should the link auto-sign-in the client as the sub-org owner, or require them to register a haze-social-post password? Magic-link is the right v1 — passwordless, expires in 24h.
4. **OAuth callback URLs**: the seven platforms have hard-coded callback URLs on haze-social-post. Sub-orgs inherit those, which means the client OAuths *into haze-social-post* (not HTS). The redirect after the OAuth flow points the client back at HTS via a query param. Acceptable for v1.

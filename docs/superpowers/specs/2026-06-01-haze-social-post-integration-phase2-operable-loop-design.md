# Haze Social Post Integration — Phase 2: Operable Loop (Agency-Operated) — Design Spec
*2026-06-01*

> Builds on `2026-05-31-haze-social-post-integration-design.md` (the original integration design)
> and the shipped Phase 1 (sub-tenant CRUD + brand push + FAQ push, live in production).

## Context & decisions

Phase 1 shipped the plumbing: an HTS client can be **activated**, which creates a synthetic
integrator-owned `User` ("sub-tenant") on haze-social-post and pushes the brand kit. Verified in
production (create → idempotent existing → brand push → archive all green). But an activated client
is **parked, not posting** — there is no way to connect channels, generate content, or schedule from
HTS admin, and the sub-tenant has no login on haze-social-post.

This phase closes that gap. Four decisions were locked during brainstorming:

1. **Milestone = the full operable loop**, in one milestone: connect channels → generate a content
   plan → review/approve on a calendar → it publishes. Channels alone (the original spec's Phase 2)
   has no payoff until content + calendar exist, so we build the whole loop.
2. **Operating model = agency-operated.** The HTS operator (you) drives everything from HTS admin.
   The client touches exactly one thing: authorizing their own social accounts (only they can OAuth
   their own Instagram/Facebook). The client never logs into haze-social-post.
3. **Approval = review-and-approve gate.** A generated plan lands as drafts in a "pending approval"
   state on the HTS calendar. The operator edits captions/timing/media, then clicks **Approve** to
   release the plan to the publisher. Nothing publishes without operator sign-off.
4. **Media = full hazesocialpost parity.** The sub-tenant has the same capabilities as a normal
   hazesocialpost account (asset library upload, AI image gen via gpt-image-2, Seedance video,
   ElevenLabs voiceover). Parity is delivered via SSO into the real app, **not** rebuilt in HTS.

## Chosen approach — Hybrid (Approach C)

"Full parity, operated by you" was evaluated three ways:

- **A — Mirror every screen natively in HTS.** Rebuild the asset library, media editor, Seedance
  flow, calendar, analytics as native HTS React. *Rejected:* this re-implements the very app the
  integration exists to avoid duplicating; months of UI work that drifts on every haze-social-post
  change. "Full parity" via this path is the most expensive possible route.
- **B — SSO into the real app for everything.** One "Open Social Workspace" button SSOs the operator
  into the real haze-social-post UI scoped to the sub-tenant. Parity is free and permanent; tiny
  build. *Downside:* HTS admin is not the single pane; the operator context-switches for everything,
  including the at-a-glance + approval workflow they want in HTS.
- **C — Hybrid (chosen).** Native HTS for the **thin, branded, high-frequency** surfaces — channel
  status, calendar overview, the approve gate, content-plan trigger — and an **SSO deep-link** into
  the real haze-social-post UI for the **heavy editors** — asset library upload, media/post editor,
  Seedance. Bounded build, no duplication of the hard parts, parity where it's expensive to rebuild.

**Key simplification from choosing C:** because asset/media editing rides the SSO session, we do
**not** build asset-upload or media-generation endpoints in the external API. They come for free
through the SSO'd session in the real app.

**Seam rule:** HTS owns *overview + scheduling + approval*. The real app owns *deep media editing*.
The only crossings are the per-post **"Edit media"** deep-link and the top-level **"Open Social
Workspace"** button.

## haze-social-post auth context (shapes the SSO design)

From `lib/auth.ts`:
- NextAuth, **JWT session strategy**, 24h `maxAge`.
- Providers: Google OAuth + Credentials (email+password). **Sub-tenants have no password**, so SSO
  cannot reuse the Credentials provider — a dedicated token-validating provider is required.
- Revocation hooks already exist: `disabledAt` (kills the JWT) and `sessionInvalidatedAt`
  (invalidates tokens issued before a timestamp). SSO sessions inherit these for free.
- `onboardedAt` gate exists — null on API-created tenants, which would dump an SSO'd operator into
  the onboarding wizard. This is why the integrator-user gate sweep (Section 5) is mandatory.
- ADMIN users are forced through Credentials + 2FA and blocked from Google. Sub-tenants are role
  `USER`, plan `PRO`, so they never touch the 2FA path.

## Architecture

```
┌──────────────────────────────┐        ┌────────────────────────────────────────┐
│  HTS admin (React + Vercel)  │  HTTPS │  haze-social-post (Next.js + VPS worker) │
│  /admin/clients/:id          │ Bearer │  /api/v1/external/tenants/:id/...         │
│   ↳ Social Media tab         │  key   │   - sso-link        (NEW)                │
│     · Channels               │ ─────► │   - connect-links   (NEW)                │
│     · Content Plans          │  via   │   - connected-platforms (NEW)            │
│     · Calendar (+approve)    │ proxy  │   - content-plans / posts (NEW)          │
│     · "Open Social Workspace"│        │  /api/integrator-sso  (NEW session route)│
│        + per-post "Edit media"│◄───── │  NextAuth (JWT) · Haze Creator · cron    │
│        (SSO into real app) ──┼──SSO──►│  publisher · BullMQ worker               │
└──────────────────────────────┘        └────────────────────────────────────────┘
```

HTS calls every external endpoint through the **existing** `?action=hsp-proxy` forwarder (admin-only,
bearer key resolved server-side via `getSetting('HSP_EXTERNAL_API_KEY')`). **No new HTS API routes**
are needed for this milestone — only UI and the proxied calls.

## The SSO "operate as" mechanism

The only security-sensitive new piece.

**Minting (`POST /api/v1/external/tenants/:id/sso-link`)**
- Body (optional): `{ next: "/haze-creator" }` to deep-link a specific screen; defaults to the
  dashboard.
- Returns `{ url, expires_at }`.
- Mints a **single-use, HMAC-signed token**: 5-minute TTL, scoped to that one sub-tenant `User`,
  only mintable by the integrator that owns the user (enforced by the existing `requireTenantScope`).
- A nonce row is persisted (`SsoToken { id, token_hash, user_id, integrator_id, next, expires_at,
  consumed_at }`) and marked `consumed_at` on first use → replay-safe.

**Consuming (`GET /api/integrator-sso?token=...`)**
- Validates the HMAC + nonce (unconsumed, unexpired), loads the sub-tenant `User`, confirms
  `disabledAt` is null.
- Starts a NextAuth session **as that user** via a new **`integrator-sso` Credentials provider** whose
  `authorize` validates the one-time token (instead of a password) and returns the user. This keeps
  us inside NextAuth's JWT machinery, so `disabledAt` / `sessionInvalidatedAt` revocation apply
  unchanged.
- Marks the nonce consumed, then redirects to `next` (sanitized to a same-origin path allowlist).
- Resulting session is a normal PRO `USER` — never ADMIN, no 2FA path.

**Surfacing in HTS**
- Top-level **"Open Social Workspace"** button and per-post **"Edit media"** deep-link both call
  `hsp-proxy → POST sso-link` on click and immediately `window.open` the returned URL. A token is
  therefore never long-lived in the DOM and never reused.

## External API endpoints (new)

All under `/api/v1/external/`, JSON, `Bearer <key>`, `requireScope` + `requireTenantScope`.

| Endpoint | Purpose |
|---|---|
| `POST /tenants/:id/sso-link` | Operate-as session (above). |
| `POST /tenants/:id/connect-links` | Body `{ platforms: [...], return_url }` → `{ links: { platform: url } }`. Each link is a magic-link login as the sub-tenant restricted to the OAuth-connect flow; on completion redirects to `return_url?status&platform&tenant_id`. |
| `GET /tenants/:id/connected-platforms` | List linked platforms + account handles. |
| `POST /tenants/:id/content-plans` | Body `{ post_count, platforms, date_range, theme_overrides?, agent_mode? }` → `{ plan_id, status: "generating" }`. Queues the existing Haze Creator BullMQ job. |
| `GET /tenants/:id/content-plans` | List plans (id, status, counts, created_at). |
| `GET /tenants/:id/content-plans/:planId` | Poll one plan: `{ status, posts: [...], error? }`. |
| `POST /tenants/:id/content-plans/:planId/approve` | Release plan posts to the publisher (DRAFT → SCHEDULED). Blocks if zero platforms connected. |
| `GET /tenants/:id/posts?status=&platform=&from=&to=` | Calendar feed (paginated). |
| `GET /tenants/:id/posts/:postId` | One post + PostTargets. |
| `PATCH /tenants/:id/posts/:postId` | Edit caption / scheduledFor / media — only when DRAFT or SCHEDULED. |
| `DELETE /tenants/:id/posts/:postId` | Cancel a scheduled post. |
| `GET /tenants` (fix) | Collection list currently returns **405** (only POST is wired). Add GET so HTS can render an "activated clients" overview. |

Every endpoint reuses existing haze-social-post internals (Haze Creator `createPlan` pipeline, the
cron publisher, the suggest-time analyzer). **No social engine is rebuilt.**

## HTS admin UI

`ClientSocialMediaTab.jsx` keeps its Setup/Activated screen and gains sub-tabs, all via `hsp-proxy`:

- **Channels** — `GET connected-platforms` list; per-platform **"Issue connect link"**
  (`POST connect-links`) producing a copyable URL + "Email to client" action. The one client
  touchpoint. A platform shows ✅ connected or a "Send link" prompt.
- **Content Plans** — trigger form (post count, platforms, date range, optional theme / Agent Mode)
  → `POST content-plans`; a list of past plans below with live polled status
  (generating / ready / failed).
- **Calendar** — month/week grid (`GET posts`). Freshly generated drafts render in a distinct
  "pending approval" style. Per-post: inline quick-edit of caption + scheduled time (`PATCH`), cancel
  (`DELETE`), an **"Edit media"** SSO deep-link, and the **Approve** action (per-plan release).
- **Workspace** — top-level **"Open Social Workspace"** SSO button for everything not mirrored
  (asset library upload, Seedance, analytics deep-dives).

## Integrator-user gate sweep (mandatory)

SSO logs the operator in *as* the sub-tenant, so the sub-tenant hits every gate a self-signup user
hits. Each must no-op for integrator-owned users (`integrator_id IS NOT NULL`). The implementation
plan will inventory these by grepping `onboardedAt`, plan/quota checks, and signup-side guards; the
known set:

- **Onboarding wizard** — set `onboardedAt` at tenant-create time (or skip the wizard when
  `integrator_id` is set) so SSO lands on the workspace, not the wizard.
- **Free-tier limits / quota** — sub-tenants are `PRO`; confirm `canGeneratePlan` and publish quotas
  read the PRO tier and are not gated by a missing Stripe/payment record (integrator users have no
  Stripe customer).
- **Email verification / "complete your profile" interstitials** — `emailVerified` is pre-set at
  create; audit any other completion prompts.
- **Self-signup analytics + nurture emails** — exclude `integrator_id IS NOT NULL` so synthetic
  tenants don't pollute funnels or receive onboarding/nurture email.

## Failure modes & retries

Extends the original spec's table:

| Scenario | Behavior |
|---|---|
| SSO token expired / replayed | haze-social-post rejects → HTS shows "link expired, click again" (single-use, 5-min by design). |
| `connect-links` issued, client never authorizes | Channel stays "pending"; re-issue anytime; posts cannot target an unconnected platform. |
| Content-plan job hangs (worker stuck) | Existing ">30m stuck" warning + re-trigger button. |
| Approve with zero connected platforms | Blocked: "connect at least one channel first." |
| Tenant `disabledAt` set | SSO + all proxy calls 403; HTS shows a suspended banner. |
| haze-social-post 5xx / unreachable | HTS retries 3× exponential (1s/2s/4s); >30s → `queued`, cron retries every 5m (inherited from Phase 1 design). |

## Internal phasing

One milestone, shipped in three reviewable slices — each its own PR + adversarial review:

- **5A — SSO spine.** `sso-link` endpoint + `SsoToken` model + `integrator-sso` provider +
  `/api/integrator-sso` route + the gate sweep (Section 5) + "Open Social Workspace" button in HTS.
  *This slice alone makes tenants operable via the real app — earliest usable value.*
- **5B — Channels.** `connect-links` + `connected-platforms` endpoints + Channels sub-tab.
- **5C — Content + Calendar.** content-plan endpoints + posts endpoints + Content Plans and Calendar
  sub-tabs + the approve gate. Fix the `GET /tenants` 405 here.

After 5A you can already operate a client end-to-end (inside the real app); 5B and 5C progressively
pull the channel/overview/approval surfaces into HTS admin.

## Non-goals (this milestone)

- Native HTS rebuild of the asset library / media editor / Seedance (Approach A) — explicitly rejected.
- Real-time webhooks haze-social-post → HTS (polling is fine; webhooks are a later phase).
- Per-client auto-approve toggle — the review gate is universal for now (revisit if volume demands).
- Billing/quota metering of integrator usage — sub-tenants default to PRO; integrator-level billing
  is deferred (original spec open question #1).

## Open questions

1. **Connect-link delivery** — auto-email to the client from HTS, or operator copies the link and
   sends manually? Plan assumes a copyable link **plus** an optional "Email to client" action; the
   email path can be deferred if it adds friction.
2. **`return_url` for connect-links** — confirm the exact HTS admin path the OAuth flow should bounce
   back to so the Channels tab can show a fresh-connected toast.
3. **SSO `next` allowlist** — finalize the set of same-origin paths the SSO redirect may target
   (dashboard, `/haze-creator`, a specific post editor URL).

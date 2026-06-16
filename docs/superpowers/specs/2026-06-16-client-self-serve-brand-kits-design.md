# Client Self-Serve Brand Kits + Pipeline Polish — Design

**Date:** 2026-06-16
**Status:** Approved (pending spec review)

## Problem

Active social-media clients cannot start their own brand kit. The portal Brand Kit
page ([src/pages/portal/PortalBrandKit.jsx](../../../src/pages/portal/PortalBrandKit.jsx))
is view-and-approve only; the intake questionnaire lives in the **admin** area
([src/pages/admin/components/BrandKitIntakeForm.jsx](../../../src/pages/admin/components/BrandKitIntakeForm.jsx))
and the trigger endpoint ([api/start-brand-kit.js](../../../api/start-brand-kit.js))
is `requireAdmin`. So every kit must be kicked off by an account manager.

This session also surfaced three quality issues on the kit pipeline itself:
generated logos are not transparent (can't drop onto branding cleanly), the
banner call-to-action button design is disliked, and there is no guard against a
client regenerating endlessly.

## Goals

1. A social-media client can complete a brand-kit brief in their portal and have
   it **auto-generate** exactly like the admin flow (logos → client logo approval
   → banners).
2. Regeneration is allowed but **capped by a per-billing-cycle limit**.
3. Logos are delivered with **transparent backgrounds**.
4. The cover **CTA** appears only on the YouTube cover and uses an outline/ghost
   style.

## Non-Goals (deferred)

- localStorage draft autosave on the client form (admin form has it; not needed v1).
- Audit-prefill path for the client form (clients use `cold_start` only).
- Admin power-user overrides on the client form (imagery direction, tagline
  override, CTA override).
- Per-plan-tier limit configuration (we use a single global default for now).
- A standalone background-removal post-process (we rely on gpt-image-2 native
  `background: transparent`).

---

## A. Client self-serve intake form

### A1. Shared input validator — `api/_lib/brand-kit-inputs.js` (new)

Extract the field/color/length validation currently inlined in
[api/start-brand-kit.js:34-88](../../../api/start-brand-kit.js) into a pure ESM
function:

```js
export function validateBrandKitInputs(inputs) // → { ok: true } | { ok: false, error: string }
```

Rules (unchanged from today): `path` must be `audit_prefill` | `cold_start`;
required fields per path; `color_preference` OR `brand_colors[]` (XOR-ish: at
least one); `brand_colors[].hex` is `#RRGGBB` and `.name` ∈ {primary, secondary,
accent}; `existing_logo_url` is http(s); `imagery_direction` ≤ 500; `tagline_override`
≤ 80; `cta_override` ≤ 24.

`api/start-brand-kit.js` is refactored to call this (behavior identical). The new
client action calls it too.

**Test:** `api/_lib/brand-kit-inputs.test.js` (Deno) — happy path, each missing
required field, the color XOR rule, each length cap, bad hex, bad path.

### A2. Client-authed trigger — `POST /api/website?action=start-brand-kit-self` (new)

Added to [api/website.js](../../../api/website.js), mirroring the `portalSocial`
auth pattern ([api/website.js:1140](../../../api/website.js)):

1. **Auth:** `Bearer` session → `userClient.auth.getUser(token)` → resolve
   `clients` row by `user_id` via the service-role client. Never trust a body
   `client_id`.
2. **Gate:** `409 { error: 'not_activated' }` if `!client.hsp_user_id`.
3. **Limit (see section B):** `409 { error: 'limit_reached', resets_at }` if the
   client is at/over their cycle limit.
4. **Dedupe:** `409 { error: 'in_progress' }` if the client's latest kit status ∈
   {`pending`, `generating`, `awaiting_logo_approval`}.
5. Force `inputs.path = 'cold_start'`, run `validateBrandKitInputs`; on failure
   `400` with the message.
6. Insert `brand_kits` row (`client_id` from the resolved client,
   `source_audit_id: null`, `status: 'pending'`, `progress_message: 'Queued…'`).
7. Invoke the edge function with `{ kit_id }` (same as admin) and return
   `{ kit_id }`.

### A3. Client form component — `src/pages/portal/PortalBrandKitIntakeForm.jsx` (new)

Simplified, client-friendly version of the admin form. Fields:

- Business name (prefilled from `client.company` / `client.name`) — required
- What does the business do? (textarea) — required (`business_description`)
- Industry — required
- Target audience (textarea) — required
- Brand vibe chips, pick 1–3 — required (reuse `VIBE_OPTIONS`)
- Color preference (description) **or** explicit brand colors (primary/secondary/
  accent hex pickers) — at least one required
- Inspirations / references — required
- Voice/tone preference — optional
- "Already have a logo?" URL — optional (`existing_logo_url`)

No imagery/tagline/CTA power knobs. On submit, POST to
`?action=start-brand-kit-self`. Surface the API's friendly error messages
(`not_activated`, `limit_reached` with reset date, `in_progress`, validation 400).
On success, call back to the parent to reload the kit (which flips the page into
the existing progress/approval flow).

### A4. Wire into `PortalBrandKit.jsx`

`useClient()` already does `select('*')`, so `client.hsp_user_id` is available.

- **No kit + `hsp_user_id` set** → render `PortalBrandKitIntakeForm`.
- **No kit + no `hsp_user_id`** → keep today's "your account manager will set one
  up" message.
- **`pending` / `generating` / `awaiting_logo_approval`** → unchanged (existing
  poll + logo-approval UI).
- **`done` / `failed`** → existing view, plus a **"Start over / regenerate"**
  button that re-opens the intake form (which creates a fresh kit, subject to the
  limit). On `failed`, the existing error banner (now showing the real reason,
  e.g. KIE credits) stays visible above the button.

---

## B. Per-billing-cycle generation limit

### B1. Config

Global default stored in `admin_settings`, key `brand_kit_cycle_limit`, **default
2**. Read via the existing `getSetting` helper with a numeric fallback of `2`.

### B2. Counting helper — `api/_lib/brand-kit-limit.js` (new)

```js
// Returns { allowed: boolean, used: number, limit: number, resetsAt: string|null }
export function evaluateBrandKitLimit({ kits, limit, periodStart })
```

Pure function for testability. `kits` = the client's brand_kits rows (with
`status`, `created_at`). Counts rows where `created_at >= periodStart` and
`status !== 'failed'`. `allowed = used < limit`.

### B3. Period resolution (in the action, not the pure helper)

1. Find the client's active subscription: `subscriptions` rows with `status ∈
   {active, trialing}`, pick the latest `current_period_end`.
2. `periodStart = current_period_end − interval`, where interval comes from the
   plan `billing_cycle` (`monthly` → 1 month, `annual` → 12 months; default 1
   month).
3. **Fallback** (no active sub or null `current_period_end`): rolling 30 days
   (`now − 30d`).
4. `resetsAt = current_period_end` (or `periodStart + 30d` in the fallback) — used
   in the `limit_reached` message.

**Test:** `api/_lib/brand-kit-limit.test.js` (Deno) — under limit, at limit, over
limit, failed rows excluded, in-flight + done counted, empty list.

> Note: the first (initial) generation counts toward the limit. With the default
> of 2/cycle that means one initial + one regenerate per cycle. Adjust
> `brand_kit_cycle_limit` to taste.

---

## C. Transparent-background logos

In [supabase/functions/generate-brand-kit/index.ts](../../../supabase/functions/generate-brand-kit/index.ts):

- `generateImageWithRetry` (logo-only path) adds to the OpenAI request body:
  `background: 'transparent'` and `output_format: 'png'`.

In [supabase/functions/generate-brand-kit/prompts.ts](../../../supabase/functions/generate-brand-kit/prompts.ts):

- `logo_primary`, `logo_icon`, `logo_monochrome` prompts: replace "white
  background" with "transparent background (no background fill)". Monochrome
  becomes "single-color … on a transparent background".

Verify `resizeToFinalDims` (post-process.ts) and `uploadImage` preserve PNG
alpha; if resize flattens alpha, fix the encode to keep RGBA.

Benefit: clean downloadable logos AND clean banner compositing (no opaque box
behind the logo in `compose-banner.ts`, which already expects a possibly-
transparent PNG).

---

## D. CTA only on YouTube, outline/ghost style

In [supabase/functions/generate-brand-kit/compose-banner.ts](../../../supabase/functions/generate-brand-kit/compose-banner.ts):

- Add `withCta: boolean` to `BannerLayout`, `true` only for `banner_yt`; `false`
  for every other layout. The tagline still renders on all copy-bearing covers;
  only the CTA button is gated.
- Render the CTA pill only when `layout.withCta && cta` (instead of
  `layout.withCopy && cta`).
- Rework `makeCtaPill` into an **outline/ghost** button: transparent interior,
  a stroked border in the accent color, and accent-colored label text (instead of
  solid accent fill + white text). Keep the stadium shape and centered label;
  draw the border as a rounded outline (e.g. concentric rounded shapes or a
  border ring), not a filled box.

---

## Data flow (client happy path)

```
Client → PortalBrandKit (no kit, hsp_user_id set)
  → PortalBrandKitIntakeForm submit
  → POST /api/website?action=start-brand-kit-self
      auth → gate(hsp_user_id) → limit → dedupe → validate → insert brand_kits(pending)
      → invoke edge generate-brand-kit { kit_id }
  → edge: text + 3 transparent logos → status=awaiting_logo_approval
  → PortalBrandKit polls, shows 3 logos → client approves one
  → POST ?action=approve-logo (existing) → edge banners (CTA only on YT) → done
  → PortalBrandKit shows finished kit + "Start over / regenerate"
```

## Error handling

- `not_activated` (409) → form not shown for non-social clients; if hit anyway,
  friendly message.
- `limit_reached` (409) → message: "You've used all N brand-kit generations for
  this cycle. Resets on <date>."
- `in_progress` (409) → "A brand kit is already being generated."
- Validation (400) → field-specific message from the shared validator.
- Banner/credit failures → already surfaced via the KIE envelope hardening
  (shipped 2026-06-16, commit 95a5ec5); `brand_kits.error` carries the real reason.

## Testing

- Deno unit: `validateBrandKitInputs`, `evaluateBrandKitLimit`.
- Manual: social client sees form; submit → logos → approve → banners; non-social
  client sees the manager message; regenerate respects the limit; a re-rendered
  kit has transparent logos and a ghost CTA only on the YouTube cover; admin flow
  unchanged.

## Files

**New**
- `api/_lib/brand-kit-inputs.js` + `.test.js`
- `api/_lib/brand-kit-limit.js` + `.test.js`
- `src/pages/portal/PortalBrandKitIntakeForm.jsx`

**Modified**
- `api/start-brand-kit.js` (use shared validator)
- `api/website.js` (new `start-brand-kit-self` action)
- `src/pages/portal/PortalBrandKit.jsx` (render form + regenerate)
- `supabase/functions/generate-brand-kit/index.ts` (transparent logo params)
- `supabase/functions/generate-brand-kit/prompts.ts` (transparent logo prompts)
- `supabase/functions/generate-brand-kit/compose-banner.ts` (YT-only ghost CTA)

**Config (no migration)**
- `admin_settings.brand_kit_cycle_limit` (default 2)

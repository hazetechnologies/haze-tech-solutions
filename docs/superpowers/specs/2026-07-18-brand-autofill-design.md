# Brand Kit "Autofill from website + logo" — Design

**Date:** 2026-07-18
**Status:** Approved

## Problem

Filling the admin brand-kit intake is manual. When a client already has a website
and a logo, the AI can read both and pre-fill most of the brief.

## Goal

Add an "Autofill from website & logo" action to the **admin** `BrandKitIntakeForm`
that scrapes an entered website URL + the uploaded logo and uses Claude (vision)
to populate 8 fields the admin can then edit:
`business_description, industry, audience, color_preference,
brand_colors{primary,secondary,accent}, imagery_direction, tagline_override,
cta_override`.

## Non-Goals

- Client portal form (these fields — imagery/tagline/CTA — are admin-only). Admin form only.
- Rendered-page scraping via the VPS browser-agent (plain server fetch for v1;
  JS-only sites yield less — upgrade later if needed).
- Persisting the website URL on the client/kit (URL is scrape-only input for now).
- Auto-submitting the kit — autofill only populates fields; the admin still reviews + clicks generate.

## Decisions (locked)

- **Fills/overwrites** the 8 fields on click (deliberate action; admin edits after).
  Never touches business_name, vibe, or inspirations.
- **Scrape = server-side `fetch`** of the URL's HTML, stripped to text.
- **Model:** Claude `claude-sonnet-4-6` with **vision** (logo passed as an image block).
- **Admin-gated** (`requireAdmin`). Requires at least a website URL OR a logo.
- **Fail-soft:** scrape failure → proceed with just the logo; AI/parse failure →
  clear error, form untouched.

---

## A. Pure helpers — `api/_lib/brand-autofill.js` (+ `.test.js`)

- `isSafePublicUrl(url): boolean` — true only for `http:`/`https:` with a hostname
  that is NOT localhost / `127.` / `10.` / `192.168.` / `172.16–31.` / `169.254.` /
  `::1` / ends in `.local` / `.internal`. (Lightweight SSRF guard; admin-gated so
  this is defense-in-depth.)
- `htmlToText(html): string` — drop `<script>`/`<style>`/`<noscript>` blocks and
  HTML comments, keep `<title>`/meta description/OG content, strip remaining tags,
  decode a few common entities, collapse whitespace, and **cap at 15000 chars**.
- `buildAutofillPrompt({ siteText, hasLogo }): { system, user }` — instructs Claude
  to act as a brand strategist and return ONLY a JSON object with exactly the 8
  keys (brand_colors as an object with `primary`/`secondary`/`accent` `#RRGGBB`
  strings; infer the palette primarily from the logo image when present, else from
  the site). Empty string for any field it genuinely can't infer.
- `parseBrandAutofill(text): {...8 fields}` — tolerant (first `{`..last `}`), never
  throws; returns all 8 keys, missing → `''` (and `brand_colors` → `{primary:'',
  secondary:'',accent:''}`); validates each hex is `#RRGGBB` else drops it to `''`.

Unit-tested (Deno): `isSafePublicUrl` (allow public, reject localhost/private/ftp),
`htmlToText` (strips script/style, caps length, keeps title), `parseBrandAutofill`
(clean JSON, fenced/prose, bad hex → '', garbage → all-empty).

## B. Endpoint — `POST /api/website?action=brand-autofill`

Admin-gated (`requireAdmin`). Body `{ website_url?, logo_url? }`.
1. `400` if BOTH are empty.
2. If `website_url` present and `isSafePublicUrl` → `fetch` it (8s `AbortSignal.timeout`,
   `User-Agent` header, cap the response body) → `htmlToText`. On any error/timeout/
   unsafe URL, `siteText = ''` and continue (fail-soft; only hard-fail if BOTH the
   site text is empty AND no logo → `400 nothing_to_read`).
3. `apiKey = getSetting('anthropic_api_key','ANTHROPIC_API_KEY')`; `400 ai_not_configured` if absent.
4. `trackedClaude({ apiKey, model:'claude-sonnet-4-6', system, messages, params:{max_tokens:1500}, eventProperties:{surface:'brand-autofill'} })`
   where `messages = [{ role:'user', content: [ {type:'text', text:user}, ...(logo_url ? [{type:'image', source:{type:'url', url:logo_url}}] : []) ] }]`.
   (tracked-claude passes `messages` straight to Anthropic, which supports url image sources.)
5. `502 ai_failed` on non-200; else `return parseBrandAutofill(extractText(data))` (200).

## C. Admin form — `src/pages/admin/components/BrandKitIntakeForm.jsx`

- Add `website_url: ''` to form state (both `initial` branches; scrape-only, not sent in the kit `inputs`).
- Near the TOP of the form (before "What does the business do?"), add a **Website URL**
  input + an **"✨ Autofill from website & logo"** button, with `autofilling`/`autofillErr` state.
- `handleAutofill()`:
  - Guard: require `form.website_url.trim()` OR `form.existing_logo_url.trim()`; else set error.
  - POST `{ website_url: form.website_url.trim() || undefined, logo_url: form.existing_logo_url.trim() || undefined }`
    with the admin Bearer session token.
  - On success, `setField` each returned non-empty string field
    (business_description, industry, audience, color_preference, imagery_direction,
    tagline_override, cta_override) and `setColor('primary'|'secondary'|'accent', hex)`
    for any returned valid hex. Leave a field untouched if the AI returned empty for it.
  - Spinner on the button; inline error line.

## Error handling
- `nothing_to_read` (400) — neither a readable site nor a logo.
- `ai_not_configured` (400) / `ai_failed` (502) — surfaced to the admin inline.
- Unsafe/failed URL → silently skipped (proceeds with logo); if that leaves nothing, `400`.

## Testing
- Deno unit: `isSafePublicUrl`, `htmlToText`, `parseBrandAutofill`.
- Build green. Manual: enter a real business site + an uploaded logo → the 8 fields
  populate with sensible values and a hex palette; a bad URL still autofills from the
  logo; no URL + no logo → friendly error.

## Files
**New:** `api/_lib/brand-autofill.js` + `api/_lib/brand-autofill.test.js`
**Modified:** `api/website.js` (import helpers + `brand-autofill` action),
`src/pages/admin/components/BrandKitIntakeForm.jsx` (Website URL + autofill button).
**No migration.** Edge function untouched (this is Node api + admin UI only).

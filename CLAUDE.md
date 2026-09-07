# haze-tech-solutions

Agency platform. Vite + React 19 + Supabase, deployed on Vercel.

## Fast paths

<!-- Verified 2026-07-29 in C:\repos\haze-tech-solutions. If a command here is wrong, fix this block in the same commit. -->

| Task | Command |
|---|---|
| Package manager | `npm` (`package-lock.json`) |
| Dev server | `npm run dev` (vite) |
| Build / verify gate | `npm run build` (`vite build` + `scripts/build-locale-shells.mjs`) |
| Lint | `npm run lint` (`eslint .`) |
| Preview built app | `npm run preview` |
| Tests | **none** — no test script |

**Work in `C:\repos\haze-tech-solutions`.** The copy under OneDrive is stale
(several commits behind); don't do git work there.

## Baseline noise — do not chase this

- **`npm run lint` exits 1 with 210 errors and 3 warnings** on a clean
  checkout. This is the pre-existing baseline, not your change. The bar is: no
  *new* errors in files you touched. Don't fix the backlog unless asked.
- `npm run build` is the reliable gate; a chunk-size warning is expected.
- **`npm run build` needs Supabase env vars.** Without `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY` the build still exits 0, but the bundle throws
  `supabaseUrl is required` at boot and the app renders a blank page. A green
  build is therefore NOT proof the app runs — put them in a gitignored
  `.env.local` before doing any browser verification.
- The `api/_lib/*.test.js` files are **Deno** tests (`deno test api/_lib/`),
  not Node. There is no `npm test` — don't go looking for one.

## Multilingual (en / es / pt / fr / de)

- Copy lives in `src/i18n/locales/*.js`; `useI18n()` gives `t`, `tl` (arrays)
  and `path()` (locale-aware internal links). Missing keys fall back to English.
- Two route lists in `src/i18n/config.js` drive everything — router prefixes,
  hreflang, sitemap, static shells and the build guard:
  - `LOCALIZED_ROUTES` — fully translated. Homepage + the 3 service pages.
    Get a per-locale shell and a reciprocal hreflang cluster.
  - `ENGLISH_ONLY_ROUTES` — chrome translated, substance not (plan names,
    blog posts and feature bullets are DB rows with no locale column).
    Indexed in English only: self-canonical, real English `<title>`, NO
    hreflang. Translating the `products`/`plans` rows is what would promote
    `/pricing` back to `LOCALIZED_ROUTES`.
- Everything else (blog posts, `/cart`, admin, portal, 404) canonicalises to
  its English URL and publishes no hreflang.
- **`dist/index.html` is the English HOMEPAGE shell, not a generic fallback.**
  The SPA catch-all serves `dist/app.html` (same bundle, page-specific tags
  stripped). Serving index.html there stamps `canonical=<site root>` + the
  homepage hreflang onto every blog post — it de-indexes the blog.
- `npm run build` fails if `vercel.json` or `robots.txt` drift from those
  lists. The guard was defeated 8 ways in review before it held: it now checks
  exact rewrite set, exact destinations, duplicate sources, allowlisted extras,
  catch-all position and target, files on disk, and the locale Disallow rules.
- **Link rule:** use `path()` for internal links on a translated page, EXCEPT
  `/blog`, `/blog/:slug` and `/affiliate`. Prefixing blog post links multiplies
  every post by 5 crawlable duplicate URLs of identical English content.
- **Long-string layout:** German and French run far longer than English and
  broke the hero and CTA rows. `scrollWidth === clientWidth` does NOT catch it
  — `overflow-hidden` hides the overflow while still clipping the text. Measure
  `getBoundingClientRect().right > innerWidth` per element instead, and look at
  a screenshot.

## Conventions

- API routes live in `api/*` and follow a router pattern — Vercel Hobby caps
  the project at 12 serverless functions, so add handlers to an existing router
  rather than creating new top-level files.
- `api/*` imports **require explicit `.js` extensions** (ESM).
- Credentials are DB-first via the `admin_settings` table, not env vars, for
  anything an admin can change at runtime.
- Env vars are documented in `.env.example`.
- Supabase schema lives in root `supabase-*.sql` and `supabase/`.

## What's already built here

Read before adding anything adjacent — most of this has no skill advertising it.

- AI website scaffold generator (Claude → pushes new repo via GitHub PAT) — `supabase/functions/generate-website-scaffold/`
- AI brand-kit generator: logos (gpt-image-2) → approval gate → 7 banners (KIE img2img) — `supabase/functions/generate-brand-kit/`
- AI social-media audit (Instagram/YouTube fetch + GPT report) — `supabase/functions/generate-social-audit/`
- Website chatbot (OpenAI tool-calling, session persistence) — `api/chat.js`
- Email auto-responder (IMAP poll + FAQ-aware replies) — `api/_lib/email-responder.js`
- Event-driven notifications, 12+ event types — `api/_lib/notification-registry.js`
- Stripe billing: checkout, portal, invoicing, webhook-synced subscriptions — `api/website.js`, `api/stripe-webhook.js`
- Affiliate commission engine, idempotent on first payment — `api/_lib/affiliate-commissions.js`
- SEO article ingestion from hazeseo via HMAC-signed webhook — `api/hazeseo-publish.js`
- Website/design audit + AI client reports — `api/audit.js`, `api/design-audit.js`, `api/generate-report.js`

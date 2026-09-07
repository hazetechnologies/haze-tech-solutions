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

## Multilingual (en / es / pt-BR / fr / de)

- Copy lives in `src/i18n/locales/*.js`; `useI18n()` gives `t`, `tl` (arrays)
  and `path()` (locale-aware internal links). Missing keys fall back to English.
- Translated pages are enumerated **once** in `LOCALIZED_ROUTES`
  (`src/i18n/config.js`). That single list drives the router prefixes, the
  hreflang cluster, the sitemap, and the static shells.
- `npm run build` emits one static HTML shell per locale x route into `dist/`
  (correct `lang`, title, description, canonical, hreflang) — a client-only
  translation is worth nothing to search. The build **fails** if `vercel.json`
  lacks a rewrite for a shell it just wrote.
- Adding a locale or a translated route means: update `LOCALES` /
  `LOCALIZED_ROUTES`, add the dictionary, then regenerate the `vercel.json`
  rewrites (the build error lists exactly which are missing).
- Pages in `UNTRANSLATED_LOCALIZED_ROUTES` (`/audit`, `/free-social-audit`,
  `/cart`) stay reachable under a prefix but get **no** hreflang and a canonical
  pointing at the English original.

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

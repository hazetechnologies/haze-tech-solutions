# haze-tech-solutions

Agency platform. Vite + React 19 + Supabase, deployed on Vercel.

## Fast paths

<!-- Verified 2026-07-29 in C:\repos\haze-tech-solutions. If a command here is wrong, fix this block in the same commit. -->

| Task | Command |
|---|---|
| Package manager | `npm` (`package-lock.json`) |
| Dev server | `npm run dev` (vite) |
| Build / verify gate | `npm run build` (vite build) |
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
- The `api/_lib/*.test.js` files are **Deno** tests (`deno test api/_lib/`),
  not Node. There is no `npm test` — don't go looking for one.

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

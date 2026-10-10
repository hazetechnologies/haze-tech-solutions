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

- **`npm run lint` exits 1 with 52 errors and 3 warnings** on a clean checkout
  (verified 2026-10-10). This is the pre-existing baseline, not your change.
  The bar is: no *new* errors in files you touched. Don't fix the backlog
  unless asked. Almost all of it is unused `motion` imports and unused `Icon`
  destructures.
- It used to read 246. The difference was not a cleanup: `eslint.config.js`
  applied `globals.browser` to every file, so **every `process.env` read in
  `api/*` was reported as `no-undef`** — ~194 false positives that made "did my
  change add an error?" unanswerable. The config now gives `api/**` and
  `scripts/**` Node globals, and `api/**/*.test.js` the `Deno` global.
- `npm run build` is the reliable gate; a chunk-size warning is expected.
- The `api/_lib/*.test.js` files are **Deno** tests (`deno test api/_lib/`),
  not Node. There is no `npm test` — don't go looking for one. The edge
  functions have Deno tests too: `deno test supabase/functions/<fn>/`. Both
  must run under a BARE `deno test` with no permission flags — a test that
  needs `--allow-read` breaks the documented invocation, so import what you
  need instead of reading it off disk.

## Website templates

`src/lib/websiteTemplates.js` is the ONE list of website-builder templates.
The portal picker renders it and `api/website.js` validates `?action=intake`
against it. Adding a template = one entry there + a `template-<id>` GitHub
template repo in the hazetechnologies org whose `content.json` matches
`AiContent` in `supabase/functions/generate-website-scaffold/types.ts`.

Do not restate the id list anywhere else. It was previously hardcoded in four
places; PR #98 updated one of them, and the flagship template answered
`400 Invalid template_id` for about three months.

## Website delivery (deploy → preview → approve → live)

A generated site is **hosted by us**, not handed over: the products sell
"Custom domain wired up + Vercel deploy" and the maintenance tiers presume we
operate the site. See `docs/superpowers/specs/2026-10-08-website-delivery-preview-design.md`.

- Status machine: `done → deploying → preview_ready → {changes_requested |
  approved} → live`, plus `failed`. The legal transitions live in
  **`api/_lib/website-delivery.js`** and are Deno-tested — change them there,
  not inline in a handler.
- `api/_lib/vercel.js` is the only place that talks to the Vercel API. **Never
  construct a `<project>.vercel.app` URL** — that subdomain is a global
  namespace and project names come from `slugify(client.name)`, so a guess can
  be a stranger's site. `resolvePreviewUrl` returns `{ url, confirmed }` and a
  project reaches `preview_ready` only when `confirmed` is true.
- Every status write is a **compare-and-swap on the status that was read**, and
  the notification is emitted only by the caller that won it. The admin UI and
  `cron-website-deploy-watch` poll the same build concurrently; without the CAS
  a client gets emailed twice.
- Delivery handlers write `notified_status` alongside `status` so the 5-minute
  `cron-notify-status` watcher sees no pending transition and cannot send a
  second copy.
- Attaching a domain is not the same as it resolving. `attach-domain` is
  re-runnable: it returns the DNS records first, and only flips to `live` once
  Vercel reports the domain **verified**.

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

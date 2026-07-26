# CLAUDE.md

Guidance for agents working in this repo. Read the `fast-build` skill
(`.claude/skills/fast-build/`) for how to work quickly; this file covers
what the project *is*.

## What this is

Marketing site + client portal + admin console for Haze Tech Solutions,
deployed on **Vercel**. Single-page React app plus a set of Vercel
serverless functions. No separate backend server — the `api/` directory
*is* the backend.

## Stack

- **Frontend:** React 19, Vite 8, React Router 7, Tailwind 3, Framer Motion
- **Backend:** Vercel serverless functions in `api/` (Node runtime)
- **Data/auth:** Supabase (`@supabase/supabase-js`)
- **Payments:** Stripe · **Email:** nodemailer / imapflow / EmailJS
- **AI:** Anthropic + OpenAI SDKs (blog gen, audits, chatbot)
- **Storage:** Cloudflare R2 (S3-compatible) · **Telemetry:** Sentry, PostHog, GA4
- Language is **JavaScript (ESM)**, not TypeScript. `.jsx` for components.

## Commands

| Task | Command |
|---|---|
| Dev server | `npm run dev` |
| Production build | `npm run build` |
| Lint | `npm run lint` |
| Preview built app | `npm run preview` |

**Verify a change with `npm run build`** — it is the reliable gate and
currently passes clean (one chunk-size warning is expected). **`npm run
lint` has a large pre-existing baseline of errors** (~210 on a fresh
checkout, e.g. unused `Icon` imports, `process` undefined in
`vite.config.js`). Do **not** read a red lint run as "I broke something":
the bar is *don't add new lint errors in files you touched*, not a clean
tree. Fixing the whole backlog is out of scope unless asked.

There is no `npm test` script and no CI test job. The `*.test.js` files
under `api/_lib/` are written for **Deno** (`Deno.test(...)`) — run them
with `deno test api/_lib/` if Deno is available; otherwise they don't
execute in this project's normal flow. Don't assume `npm test` exists.

## Layout

```
src/
  main.jsx, App.jsx        # entry + all routes (React Router)
  MainSite.jsx             # public marketing landing
  components/              # shared UI (Navbar, Hero, ChatWidget, …)
  pages/                   # route views
    admin/                 # admin console (auth-gated via ProtectedRoute)
    portal/                # client portal (auth-gated via PortalProtectedRoute)
    affiliate/             # affiliate dashboard/landing
  lib/                     # supabase client, AuthContext, cart, pricing,
                           #   telemetry, route guards — shared app logic
  hooks/                   # small reusable hooks

api/                       # Vercel serverless functions (one file = one route)
  website.js               # large multiplexer: dispatches on ?action=…
                           #   (maxDuration 60; hosts the cron endpoints)
  _lib/                    # shared server helpers (stripe, email, r2,
                           #   tracked-claude/openai, notifications, …)

supabase/                  # Supabase project config
supabase-*.sql             # schema files (portal, products, automation, …)
scripts/                   # one-off .mjs maintenance scripts (brand kits,
                           #   stripe catalog sync, image gen, smoke tests)
docs/superpowers/          # plans/ and specs/ — design docs for larger work
```

## Conventions & things to know

- **API routes:** each `api/*.js` file is one endpoint. Many admin/cron
  actions are folded into `api/website.js` and dispatched by `?action=`;
  check there before adding a new top-level route.
- **Auth guards:** admin routes use `src/lib/ProtectedRoute.jsx`; portal
  routes use `PortalProtectedRoute.jsx`. Keep new gated pages behind the
  matching guard.
- **Server secrets** live in Vercel env vars; server helpers assume
  `process.env`. Client-exposed vars must be prefixed `VITE_` (see
  `.env.example`). Never hardcode secrets or commit a real `.env`.
- **Crons:** driven by both `vercel.json` crons and
  `.github/workflows/responder-cron.yml`, hitting `?action=cron-*`
  endpoints authenticated with `CRON_SECRET`. Endpoints are idempotent
  (claim-before-send dedup) — preserve that when editing them.
- **Styling:** Tailwind utility classes; config in `tailwind.config.js`.
- **Bigger changes:** look in `docs/superpowers/{plans,specs}` for existing
  design docs before starting, and add one there for substantial work.

## Guardrails

- Don't introduce TypeScript or a new test framework without being asked —
  match the existing JS/ESM style.
- Don't edit `package-lock.json` by hand; let npm manage it.
- Don't touch `supabase-*.sql` schema casually — these describe live tables.
- Keep cron/webhook endpoints idempotent.

# Observability — PostHog + Sentry

**Date:** 2026-05-01
**Status:** Design approved, pending implementation plan
**Estimated effort:** 3–4 hours

## Goal

Add product analytics, session replay, error tracking, and LLM observability to haze-tech-solutions so we can:

- See how visitors move through the site and where they drop off
- Watch session replays when something breaks for a user
- Capture and triage frontend errors (currently invisible)
- Track every AI call (cost, latency, prompt, completion) across the chatbot, audit pipelines, and the upcoming branding generator

Sentry alerts go to `info@hazetechsolutions.com`. Both tools use accounts the user owns; keys are already in `.env`.

## Out of scope

- Sentry on Vercel API routes and Supabase Edge Functions (frontend-only by user choice)
- PostHog dashboard/funnel construction (events flow in; dashboards built in the PostHog UI as needs arise)
- Feature-flag usage (SDK installed, flags will be defined when the branding rollout needs them)
- Backend performance tracing beyond what's auto-captured

## Architecture

Three runtimes are touched:

1. **Browser (React 19 SPA)** — PostHog product analytics, session replay, feature-flag SDK; Sentry error tracking
2. **Vercel API routes (Node)** — `@posthog/ai` wraps OpenAI client; no Sentry
3. **Supabase Edge Function (Deno)** — manual `fetch` to PostHog `/capture/` after each OpenAI call; no Sentry

### Why split the LLM-tracking approach across runtimes

`@posthog/ai` is a clean wrap-the-client SDK that emits `$ai_generation` events automatically, but it's published for Node and the browser only. Supabase Edge Functions run on Deno, where the SDK doesn't import cleanly. The pragmatic fix is to send the same events manually via `fetch` — PostHog's capture API is unauthenticated for project keys (write-only public), so this is ~15 lines.

## Components

### 1. Frontend SDK initialization

**Files touched:** `src/main.jsx` (init), `src/lib/posthog.js` (new), `src/lib/sentry.js` (new), `src/App.jsx` (Sentry error boundary).

**PostHog (`src/lib/posthog.js`):**

```js
import posthog from 'posthog-js'

posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
  api_host: import.meta.env.VITE_POSTHOG_HOST,
  person_profiles: 'identified_only',
  capture_pageview: true,
  capture_pageleave: true,
  autocapture: true,
  session_recording: {
    maskAllInputs: true,
    maskTextSelector: '.ph-mask',
  },
})

export default posthog
```

**Sentry (`src/lib/sentry.js`):**

```js
import * as Sentry from '@sentry/react'

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  environment: import.meta.env.MODE,
})

export default Sentry
```

**App-level error boundary** wraps `<RouterProvider>` (or the equivalent) in `src/App.jsx` using `<Sentry.ErrorBoundary fallback={<FallbackUI />}>`.

### 2. Identification flow

A single `src/hooks/useTelemetryIdentity.js` hook subscribes to Supabase auth state and identifies in both tools:

```js
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && session?.user) {
    posthog.identify(session.user.id, { email: session.user.email })
    Sentry.setUser({ id: session.user.id, email: session.user.email })
  } else if (event === 'SIGNED_OUT') {
    posthog.reset()
    Sentry.setUser(null)
  }
})
```

Lead-form identification is wired into the three submit handlers:

- `src/components/Contact.jsx` — on successful submit
- `src/pages/FreeSocialAudit.jsx` — on successful submit
- `src/pages/AuditPage.jsx` (website audit) — on successful submit

Each calls `posthog.identify(email, { name, source: '<form-id>' })` then `posthog.capture('lead_submitted', { source })`. PostHog automatically merges the prior anonymous session into the identified profile.

### 3. Custom events

| Event | Surface | Properties |
|---|---|---|
| `cta_clicked` | All CTA buttons | `cta_id`, `location` (hero, services, navbar, etc.) |
| `lead_submitted` | All three lead forms | `source` |
| `social_audit_started` | `FreeSocialAudit.jsx` submit | `audit_id` |
| `social_audit_completed` | `AuditResults.jsx` poll → completed | `audit_id`, `duration_ms` |
| `social_audit_failed` | `AuditResults.jsx` poll → failed | `audit_id`, `error` |
| `website_audit_started` | `AuditPage.jsx` submit | `audit_id` |
| `website_audit_completed` | `AuditPage.jsx` result page | `audit_id`, `duration_ms` |
| `website_audit_failed` | `AuditPage.jsx` result page | `audit_id`, `error` |
| `chatbot_opened` | `ChatWidget.jsx` open | — |
| `chatbot_message_sent` | `ChatWidget.jsx` sendMessage | `message_length` |
| `portal_login_attempted` | `portal/login` submit | — |
| `portal_login_succeeded` | `portal/login` success | — |
| `portal_login_failed` | `portal/login` error | `error_code` |

`page_view` and `pageleave` are auto-captured.

CTA tagging: each existing button gets a `cta_id` prop (e.g., `hero-get-started`, `hero-free-social-audit`, `hero-free-website-audit`, `hero-see-our-work`, `services-social-media-audit-link`). A small `<TrackedButton>` wrapper or shared `useCtaTracker` hook avoids repetition.

### 4. LLM observability

**Vercel API routes** (Node — wrap with `@posthog/ai`):

- `api/chat.js`
- `api/audit.js`
- `api/design-audit.js`
- `api/generate-report.js`

Wiring per route:

```js
import OpenAI from 'openai'
import { PostHog } from 'posthog-node'
import { withTracing } from '@posthog/ai'

const phClient = new PostHog(process.env.POSTHOG_PROJECT_API_KEY, {
  host: process.env.POSTHOG_HOST,
  flushAt: 1,
})
const openai = withTracing(new OpenAI(), phClient, {
  posthogDistinctId: req.body.userId ?? 'anonymous',
})
```

`POSTHOG_PROJECT_API_KEY` is the same value as `VITE_POSTHOG_KEY` (PostHog project keys are write-only public). Naming distinction makes the server-vs-client intent explicit.

**Supabase Edge Function** (`supabase/functions/generate-social-audit/index.ts`) — manual capture:

```ts
async function trackAiGeneration({
  distinctId, model, promptTokens, completionTokens, latencyMs, auditId,
}: AiGenerationParams) {
  await fetch(`${Deno.env.get('POSTHOG_HOST')}/capture/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: Deno.env.get('POSTHOG_PROJECT_API_KEY'),
      event: '$ai_generation',
      distinct_id: distinctId,
      properties: {
        $ai_model: model,
        $ai_input_tokens: promptTokens,
        $ai_output_tokens: completionTokens,
        $ai_latency: latencyMs,
        audit_id: auditId,
      },
    }),
  }).catch(() => {})
}
```

Called after each `openai.chat.completions.create({ ... })` in the Edge Function. The fire-and-forget `.catch(() => {})` ensures telemetry failures never break audit generation.

### 5. Environment variables

**Vercel (production + preview + development):**

| Var | Value | Surface |
|---|---|---|
| `VITE_POSTHOG_KEY` | `phc_…` | Browser (build-time) |
| `VITE_POSTHOG_HOST` | `https://us.i.posthog.com` | Browser |
| `VITE_SENTRY_DSN` | `https://…ingest.us.sentry.io/…` | Browser |
| `POSTHOG_PROJECT_API_KEY` | same as `VITE_POSTHOG_KEY` | Node API routes (server) |
| `POSTHOG_HOST` | `https://us.i.posthog.com` | Node API routes (server) |

Set via Vercel CLI (token already on file).

**Supabase Edge Function secrets:**

| Var | Value |
|---|---|
| `POSTHOG_PROJECT_API_KEY` | `phc_…` |
| `POSTHOG_HOST` | `https://us.i.posthog.com` |

Set via Supabase Management API (token in chat scrollback per handoff — flagged for rotation).

### 6. Sentry alerting + source maps

- **Alerts:** Default rule — email `info@hazetechsolutions.com` on first occurrence of any new issue, frequency-based for recurring issues. Configured in Sentry UI.
- **Source maps:** Use Sentry's Vercel marketplace integration. Auto-uploads source maps on each Vercel deploy and ties releases to commit SHAs. No extra build config beyond installing the integration.

## Privacy

- PostHog session replay masks all `<input>`, `<textarea>`, `<select>` content by default
- `.ph-mask` CSS class as escape hatch for any non-input element that displays sensitive data
- User identity tied to Supabase auth user ID (when logged in) or lead email (after public-form submission) — same data category as already stored in DB and EmailJS
- No password or auth-token capture

## Testing strategy

Manual smoke after deploy:

1. Visit homepage → verify `$pageview` event in PostHog within 30 sec
2. Click "Free Social Audit" CTA → verify `cta_clicked` event with `cta_id: hero-free-social-audit`
3. Submit free-social-audit form with test email → verify `lead_submitted` and identified profile appear in PostHog
4. Trigger an audit, wait for completion → verify `social_audit_completed` and `$ai_generation` events (the latter from Edge Function manual capture)
5. Throw a test error from a button (`throw new Error('sentry-smoke-test')`) → verify Sentry issue + email alert to `info@hazetechsolutions.com`
6. Open chatbot, send a message → verify `chatbot_message_sent` and `$ai_generation` events (latter from `@posthog/ai` wrap)
7. Spot-check a session replay → confirm form inputs are masked

No unit tests; this is integration glue with no business logic worth isolating.

## Risks

- **Bundle size:** PostHog (~50KB gzipped) + Sentry (~70KB gzipped) = ~120KB extra on the SPA. Acceptable for a marketing site; revisit if Lighthouse drops.
- **Adblocker bypass:** A meaningful share of visitors block PostHog's default endpoint. PostHog's reverse-proxy feature (via Vercel) sidesteps this — deferred for now, easy to add later.
- **Edge Function manual capture:** If PostHog's API changes the `/capture/` shape, our hand-rolled Deno code breaks silently. Risk is low (stable public API), and the failure mode is missing telemetry, not broken audits.
- **Source-map upload failures:** Don't block deploys; minified stack traces still useful in Sentry, just less readable.

## Implementation order

1. Install SDKs and add init code (frontend only) — verify pageviews flow
2. Add identification + lead-form events — verify identified profiles
3. Add CTA + audit + chatbot events — verify event taxonomy
4. Wire `@posthog/ai` into the four Vercel API routes — verify `$ai_generation` events
5. Wire manual capture into the Edge Function — verify `$ai_generation` from Deno path
6. Vercel env vars + Sentry-Vercel integration + Supabase secrets — verify production
7. Smoke test the seven steps above on production

## Open questions

None remaining.

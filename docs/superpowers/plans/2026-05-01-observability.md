# Observability (PostHog + Sentry) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire PostHog (analytics + session replay + feature flags + LLM observability) and Sentry (frontend error tracking) into the haze-tech-solutions site, with identified user/lead profiles and AI cost telemetry across the chatbot, audit pipelines, and the upcoming branding generator.

**Architecture:** Frontend SDK init in `src/main.jsx` reading `VITE_*` env vars; Sentry React error boundary at app root; identification driven by Supabase auth state and lead-form submit handlers; LLM tracking via a single `trackedOpenAi()` helper that wraps the existing raw-`fetch` calls (Node helper for Vercel API routes, Deno mirror for the Supabase Edge Function); Vercel env vars and Supabase Edge Function secrets configured via the CLI / Supabase Management API.

**Tech Stack:** React 19 + Vite, Vercel API routes (Node 22), Supabase Edge Functions (Deno), `posthog-js`, `posthog-node`, `@sentry/react`, Vercel CLI, Supabase Management API.

**Spec:** `docs/superpowers/specs/2026-05-01-observability-design.md`

---

## Deviation from spec

The spec called for `@posthog/ai`'s `withTracing` to wrap the OpenAI client. The codebase calls OpenAI via raw `fetch`, not the OpenAI SDK, so `withTracing` doesn't apply. Pragmatic fix: a 30-line shared helper (`trackedOpenAi`) that wraps the existing fetch calls, captures latency + token usage from the response, and fires `$ai_generation` events. Same event shape as `@posthog/ai` would emit. Documented in Task 13.

The spec also listed `api/audit.js` and `api/design-audit.js` for LLM wrapping — those routes don't call OpenAI (PageSpeed and HTML parsing respectively). Dropped from LLM tracking scope; confirmed via grep before plan was written.

---

## File map

**New files:**
- `src/lib/posthog.js` — PostHog browser init + exports singleton
- `src/lib/sentry.js` — Sentry browser init
- `src/lib/telemetry.js` — `trackEvent`, `trackCta`, identify helpers; thin wrapper over `posthog`
- `src/hooks/useTelemetryIdentity.js` — Subscribes to `useAuth()` and identifies on login/logout
- `src/components/SentryFallback.jsx` — Fallback UI for Sentry error boundary
- `api/_lib/tracked-openai.js` — Node helper: wrapped OpenAI fetch + PostHog `$ai_generation` capture
- `supabase/functions/_shared/tracked-openai.ts` — Deno mirror of the same helper

**Modified files:**
- `src/main.jsx` — Import init modules
- `src/App.jsx` — Wrap routes with `<Sentry.ErrorBoundary>`; mount `useTelemetryIdentity` inside `AuthProvider`
- `src/components/Contact.jsx` — Lead-form identify + `lead_submitted` event
- `src/pages/FreeSocialAudit.jsx` — Lead-form identify + `lead_submitted` + `social_audit_started` events
- `src/pages/AuditPage.jsx` — Lead-form identify + `lead_submitted` + `website_audit_started` + `_completed` + `_failed` events
- `src/pages/AuditResults.jsx` — `social_audit_completed` / `_failed` events when poll resolves
- `src/components/Hero.jsx` — CTA tracking on the four hero buttons
- `src/components/Services.jsx` — CTA tracking on social-audit link
- `src/components/Navbar.jsx` — CTA tracking on Client Login + nav links
- `src/components/ChatWidget.jsx` — `chatbot_opened` + `chatbot_message_sent` events
- `src/pages/portal/PortalLogin.jsx` — `portal_login_attempted/succeeded/failed` events
- `src/pages/admin/AdminLogin.jsx` — same login events
- `api/chat.js` — Use `trackedOpenAi()` instead of raw fetch
- `api/generate-report.js` — Use `trackedOpenAi()` instead of raw fetch
- `supabase/functions/generate-social-audit/index.ts` — Use `trackedOpenAi()` instead of raw fetch in `callOpenAI`
- `package.json` — Add `posthog-js`, `posthog-node`, `@sentry/react`

**Verification environment:**
- Each task's verification step uses `npm run dev` and the local site at `http://localhost:5173/`, plus the PostHog dashboard at `https://us.posthog.com` and the Sentry dashboard at `https://sentry.io/`.
- A few tasks require deployment to Vercel preview to verify (env-var tasks); those tasks call this out explicitly.

---

## Phase 1 — Frontend SDK init (Tasks 1–4)

### Task 1: Install SDK packages

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install browser SDKs**

```bash
cd "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions"
npm install posthog-js@^1.200.0 posthog-node@^4.10.0 @sentry/react@^8.50.0
```

Expected: 3 packages added, no peer-dependency warnings.

- [ ] **Step 2: Verify install**

```bash
npm ls posthog-js posthog-node @sentry/react
```

Expected: all three packages listed at requested versions.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(observability): add posthog-js, posthog-node, @sentry/react"
```

---

### Task 2: PostHog browser init module

**Files:**
- Create: `src/lib/posthog.js`

- [ ] **Step 1: Write the module**

```js
// src/lib/posthog.js
import posthog from 'posthog-js'

const KEY = import.meta.env.VITE_POSTHOG_KEY
const HOST = import.meta.env.VITE_POSTHOG_HOST

let initialized = false

export function initPosthog() {
  if (initialized) return posthog
  if (!KEY || !HOST) {
    console.warn('[posthog] VITE_POSTHOG_KEY or VITE_POSTHOG_HOST missing — telemetry disabled')
    return posthog
  }
  posthog.init(KEY, {
    api_host: HOST,
    person_profiles: 'identified_only',
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: true,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '.ph-mask',
    },
  })
  initialized = true
  return posthog
}

export default posthog
```

- [ ] **Step 2: Run dev server and verify import resolves**

```bash
npm run dev
```

Open `http://localhost:5173/` → no console errors related to posthog import. Stop the server (Ctrl+C).

- [ ] **Step 3: Commit**

```bash
git add src/lib/posthog.js
git commit -m "feat(observability): add PostHog browser init module"
```

---

### Task 3: Sentry browser init module + fallback UI

**Files:**
- Create: `src/lib/sentry.js`
- Create: `src/components/SentryFallback.jsx`

- [ ] **Step 1: Write Sentry init**

```js
// src/lib/sentry.js
import * as Sentry from '@sentry/react'

const DSN = import.meta.env.VITE_SENTRY_DSN

let initialized = false

export function initSentry() {
  if (initialized) return Sentry
  if (!DSN) {
    console.warn('[sentry] VITE_SENTRY_DSN missing — error tracking disabled')
    return Sentry
  }
  Sentry.init({
    dsn: DSN,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    environment: import.meta.env.MODE,
  })
  initialized = true
  return Sentry
}

export default Sentry
```

- [ ] **Step 2: Write fallback UI**

```jsx
// src/components/SentryFallback.jsx
export default function SentryFallback({ resetError }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      background: '#020817',
      color: '#F1F5F9',
      fontFamily: '"Plus Jakarta Sans", sans-serif',
      textAlign: 'center',
    }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '1rem' }}>
        Something broke on our end
      </h1>
      <p style={{ color: '#94A3B8', marginBottom: '2rem', maxWidth: 480 }}>
        Our team has been notified. You can reload, head back home, or email us if it persists.
      </p>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button
          onClick={resetError}
          style={{
            background: 'linear-gradient(135deg, #00D4FF, #0099CC)',
            color: '#020817',
            border: 'none',
            padding: '0.7rem 1.4rem',
            borderRadius: 8,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
        <a
          href="/"
          style={{
            background: 'transparent',
            color: '#00CFFF',
            border: '1px solid rgba(0, 207, 255, 0.4)',
            padding: '0.7rem 1.4rem',
            borderRadius: 8,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Back to home
        </a>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run dev server, confirm no import errors**

```bash
npm run dev
```

Open `http://localhost:5173/` → no new console errors. Stop the server.

- [ ] **Step 4: Commit**

```bash
git add src/lib/sentry.js src/components/SentryFallback.jsx
git commit -m "feat(observability): add Sentry browser init + fallback UI"
```

---

### Task 4: Wire init into main.jsx + Sentry boundary into App.jsx

**Files:**
- Modify: `src/main.jsx`
- Modify: `src/App.jsx:1-39`

- [ ] **Step 1: Update main.jsx**

Replace the entire file contents:

```jsx
// src/main.jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initPosthog } from './lib/posthog'
import { initSentry } from './lib/sentry'

initPosthog()
initSentry()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 2: Update App.jsx imports + wrap routes**

In `src/App.jsx`, add the Sentry import after line 4:

```jsx
import * as Sentry from '@sentry/react'
import SentryFallback from './components/SentryFallback'
```

Then wrap the `<BrowserRouter>` in a `<Sentry.ErrorBoundary>`. Replace the return block (lines 38–94 currently) with:

```jsx
export default function App() {
  return (
    <Sentry.ErrorBoundary fallback={({ resetError }) => <SentryFallback resetError={resetError} />}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public */}
            <Route path="/"       element={<MainSite />} />
            <Route path="/audit"  element={<AuditPage />} />
            <Route path="/audit/:id" element={<AuditResults />} />
            <Route path="/free-social-audit" element={<FreeSocialAudit />} />
            <Route path="/blog"   element={<BlogPage />} />
            <Route path="/blog/:slug" element={<BlogPost />} />

            {/* Admin login */}
            <Route path="/admin/login" element={<AdminLogin />} />

            {/* Redirect /admin → /admin/dashboard */}
            <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />

            {/* Protected admin shell */}
            <Route path="/admin" element={
              <ProtectedRoute><AdminLayout /></ProtectedRoute>
            }>
              <Route path="dashboard"       element={<Dashboard />} />
              <Route path="leads"           element={<Leads />} />
              <Route path="portfolio"       element={<PortfolioManager />} />
              <Route path="blog"            element={<BlogManager />} />
              <Route path="press"           element={<PressManager />} />
              <Route path="clients"         element={<ClientManager />} />
              <Route path="clients/:clientId" element={<ClientDetail />} />
              <Route path="products"        element={<ProductsManager />} />
              <Route path="settings"        element={<Settings />} />
              <Route path="business-info"   element={<BusinessInfo />} />
              <Route path="faqs"            element={<FaqManager />} />
              <Route path="triggers"        element={<AutomationTriggers />} />
              <Route path="social-audits"   element={<SocialAudits />} />
              <Route path="social-audits/:id" element={<SocialAuditDetail />} />
            </Route>

            {/* Portal login */}
            <Route path="/portal/login" element={<PortalLogin />} />

            {/* Redirect /portal → /portal/dashboard */}
            <Route path="/portal" element={<Navigate to="/portal/dashboard" replace />} />

            {/* Protected client portal */}
            <Route path="/portal" element={
              <PortalProtectedRoute><PortalLayout /></PortalProtectedRoute>
            }>
              <Route path="dashboard"            element={<PortalDashboard />} />
              <Route path="projects/:projectId"  element={<PortalProject />} />
              <Route path="invoices"             element={<PortalInvoices />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </Sentry.ErrorBoundary>
  )
}
```

- [ ] **Step 3: Verify pageview event lands**

```bash
npm run dev
```

Open `http://localhost:5173/`. Open PostHog dashboard → **Activity** → **Live events**. Within 30 seconds, confirm a `$pageview` event with the right URL appears. Then stop the dev server.

If no event arrives: check browser console for `[posthog]` warning (env var missing) or for a CORS error (host URL wrong).

- [ ] **Step 4: Verify Sentry boundary by throwing a test error**

Add a temporary throw to `src/MainSite.jsx` at the top of the component body:

```jsx
if (window.location.search.includes('sentry-test')) throw new Error('sentry-smoke-test')
```

Run `npm run dev`, visit `http://localhost:5173/?sentry-test=1`. Expected: SentryFallback UI appears. Open Sentry dashboard → **Issues** → confirm a new issue with title `Error: sentry-smoke-test`. Then **remove the test throw** and verify the page loads normally again.

- [ ] **Step 5: Commit**

```bash
git add src/main.jsx src/App.jsx
git commit -m "feat(observability): init PostHog + Sentry, add Sentry error boundary"
```

---

## Phase 2 — Identification (Tasks 5–7)

### Task 5: Telemetry helpers module

**Files:**
- Create: `src/lib/telemetry.js`

- [ ] **Step 1: Write the module**

```js
// src/lib/telemetry.js
import posthog from './posthog'
import * as Sentry from '@sentry/react'

export function trackEvent(name, properties = {}) {
  posthog.capture(name, properties)
}

export function trackCta(ctaId, location, extra = {}) {
  posthog.capture('cta_clicked', { cta_id: ctaId, location, ...extra })
}

export function identifyUser({ id, email, ...traits }) {
  if (!id) return
  posthog.identify(id, { email, ...traits })
  Sentry.setUser({ id, email })
}

export function identifyLead({ email, name, source, ...traits }) {
  if (!email) return
  posthog.identify(email, { email, name, lead_source: source, ...traits })
  Sentry.setUser({ id: email, email })
}

export function resetIdentity() {
  posthog.reset()
  Sentry.setUser(null)
}
```

- [ ] **Step 2: Verify import resolves**

```bash
npm run dev
```

Open `http://localhost:5173/` → no new console errors. Stop the server.

- [ ] **Step 3: Commit**

```bash
git add src/lib/telemetry.js
git commit -m "feat(observability): add telemetry helpers (trackEvent, identify, reset)"
```

---

### Task 6: useTelemetryIdentity hook + mount in App

**Files:**
- Create: `src/hooks/useTelemetryIdentity.js`
- Modify: `src/App.jsx`

- [ ] **Step 1: Write the hook**

```js
// src/hooks/useTelemetryIdentity.js
import { useEffect, useRef } from 'react'
import { useAuth } from '../lib/AuthContext'
import { identifyUser, resetIdentity } from '../lib/telemetry'

export default function useTelemetryIdentity() {
  const { user } = useAuth()
  const lastUserIdRef = useRef(null)

  useEffect(() => {
    const currentId = user?.id ?? null
    if (currentId === lastUserIdRef.current) return
    lastUserIdRef.current = currentId

    if (user?.id) {
      identifyUser({ id: user.id, email: user.email })
    } else {
      resetIdentity()
    }
  }, [user])
}
```

- [ ] **Step 2: Mount the hook inside AuthProvider context**

In `src/App.jsx`, the hook needs to live inside `<AuthProvider>` to access `useAuth()`. Create a small inner component. Add this above the `App` export:

```jsx
function TelemetryIdentityMount() {
  useTelemetryIdentity()
  return null
}
```

Add the import:

```jsx
import useTelemetryIdentity from './hooks/useTelemetryIdentity'
```

Insert `<TelemetryIdentityMount />` as the first child of `<AuthProvider>`:

```jsx
<AuthProvider>
  <TelemetryIdentityMount />
  <BrowserRouter>
    {/* ...routes... */}
  </BrowserRouter>
</AuthProvider>
```

- [ ] **Step 3: Verify identify fires on login**

Run `npm run dev`. Open `http://localhost:5173/admin/login` (or `/portal/login`). Log in with an existing test account.

Open PostHog → **Persons** → find the person matching the user's UUID. Confirm the email property is set.

Open Sentry → trigger another `?sentry-test=1` error after login → confirm the issue shows the user's email.

- [ ] **Step 4: Verify reset fires on logout**

While logged in, log out. Open PostHog → **Activity** → confirm subsequent events show as anonymous (different distinct_id).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useTelemetryIdentity.js src/App.jsx
git commit -m "feat(observability): identify users on Supabase auth state change"
```

---

### Task 7: Lead-form identification (Contact, FreeSocialAudit, AuditPage)

**Files:**
- Modify: `src/components/Contact.jsx:35-107` (handleSubmit)
- Modify: `src/pages/FreeSocialAudit.jsx:31-88` (handleSubmit)
- Modify: `src/pages/AuditPage.jsx:114-167` (handleSubmit)

- [ ] **Step 1: Add identifyLead + lead_submitted to Contact.jsx**

In `src/components/Contact.jsx`, add the import at line 5 (after `supabase` import):

```jsx
import { identifyLead, trackEvent } from '../lib/telemetry'
```

Inside `handleSubmit`, immediately after the `setStatus('loading')` call (around line 37), add:

```js
identifyLead({ email: form.email, name: form.name, source: 'contact' })
trackEvent('lead_submitted', { source: 'contact', service: form.service })
```

- [ ] **Step 2: Add identifyLead + events to FreeSocialAudit.jsx**

In `src/pages/FreeSocialAudit.jsx`, add the import after line 4:

```jsx
import { identifyLead, trackEvent } from '../lib/telemetry'
```

Inside `handleSubmit`, immediately after `setStatus('loading')` (around line 42), add:

```js
identifyLead({ email: form.email, name: form.name, source: 'free-social-audit' })
trackEvent('lead_submitted', { source: 'free-social-audit' })
```

After a successful response, immediately after `const { audit_id } = await res.json()` (around line 80), add:

```js
trackEvent('social_audit_started', { audit_id })
```

- [ ] **Step 3: Add identifyLead + events to AuditPage.jsx**

In `src/pages/AuditPage.jsx`, add the import after line 5:

```jsx
import { identifyLead, trackEvent } from '../lib/telemetry'
```

Inside `handleSubmit`, immediately after `setPhase('loading')` (around line 117), add:

```js
identifyLead({ email: lead.email, name: lead.name, source: 'website-audit' })
trackEvent('lead_submitted', { source: 'website-audit', url: lead.url })
trackEvent('website_audit_started', { url: lead.url })
```

In the `try` block, immediately before `setPhase('report')` (around line 162), add:

```js
trackEvent('website_audit_completed', { url, overall_score: scores.overall })
```

In the `catch` block, immediately after `setErrorMsg(...)` (around line 164), add:

```js
trackEvent('website_audit_failed', { url, error: err.message })
```

- [ ] **Step 4: Verify in dev**

Run `npm run dev`. Submit each form with throwaway test data (`smoke-test+contact@example.com`, etc.). Open PostHog → **Persons** → confirm 3 new identified persons with emails matching. Open **Activity** → confirm `lead_submitted` events with correct `source` for each.

For the website audit, also verify `website_audit_started` fires immediately and `website_audit_completed` fires when the audit finishes (~30 sec).

- [ ] **Step 5: Commit**

```bash
git add src/components/Contact.jsx src/pages/FreeSocialAudit.jsx src/pages/AuditPage.jsx
git commit -m "feat(observability): identify leads + emit lead_submitted/website_audit events"
```

---

## Phase 3 — Custom events (Tasks 8–11)

### Task 8: CTA tracking on Hero, Services, Navbar

**Files:**
- Modify: `src/components/Hero.jsx`
- Modify: `src/components/Services.jsx`
- Modify: `src/components/Navbar.jsx`

- [ ] **Step 1: Hero.jsx — track all four CTAs**

In `src/components/Hero.jsx`, add the import after the `framer-motion` line:

```jsx
import { trackCta } from '../lib/telemetry'
```

Modify each of the four CTA handlers:

- **Get Started button** (`onClick={() => handleScroll('#contact')}`) → wrap:

```jsx
onClick={() => { trackCta('hero-get-started', 'hero'); handleScroll('#contact') }}
```

- **Free Social Audit Link** (`to="/free-social-audit"`) → add `onClick`:

```jsx
<Link
  to="/free-social-audit"
  onClick={() => trackCta('hero-free-social-audit', 'hero')}
  className="text-sm"
  ...
>
```

- **Free Website Audit Link** (`to="/audit"`) → add `onClick`:

```jsx
<Link
  to="/audit"
  onClick={() => trackCta('hero-free-website-audit', 'hero')}
  className="text-sm"
  ...
>
```

- **See Our Work button** → wrap:

```jsx
onClick={() => { trackCta('hero-see-our-work', 'hero'); handleScroll('#portfolio') }}
```

- [ ] **Step 2: Services.jsx — find and track the social-audit link**

```bash
grep -n "free-social-audit\|/audit" "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions/src/components/Services.jsx"
```

For each Link or anchor pointing to `/free-social-audit` or `/audit`, add an `onClick` handler with `trackCta('services-<descriptor>', 'services')`. Use descriptive cta_id: e.g., `services-social-media-audit`, `services-website-audit`.

Add the import at the top of the file:

```jsx
import { trackCta } from '../lib/telemetry'
```

- [ ] **Step 3: Navbar.jsx — track Client Login + nav links**

In `src/components/Navbar.jsx`, add the import after line 5 (`logoIcon` import):

```jsx
import { trackCta } from '../lib/telemetry'
```

Wrap the **Client Login** button click (around line 106):

```jsx
onClick={() => { trackCta('navbar-client-login', 'navbar'); navigate('/portal/login') }}
```

Wrap the same on the mobile menu (around line 187):

```jsx
onClick={() => { trackCta('navbar-client-login', 'navbar-mobile'); navigate('/portal/login'); setMenuOpen(false) }}
```

For each `navLinks` button (line 92 and line 84), add tracking:

```jsx
onClick={() => { trackCta(`navbar-${link.label.toLowerCase()}`, 'navbar'); handleNavClick(link.href) }}
```

```jsx
onClick={() => { trackCta(`navbar-${link.label.toLowerCase()}`, 'navbar'); navigate(link.href) }}
```

- [ ] **Step 4: Verify in dev**

Run `npm run dev`. Click each CTA. Confirm in PostHog **Activity** that `cta_clicked` fires with the right `cta_id` and `location` for each.

- [ ] **Step 5: Commit**

```bash
git add src/components/Hero.jsx src/components/Services.jsx src/components/Navbar.jsx
git commit -m "feat(observability): track CTA clicks across hero, services, navbar"
```

---

### Task 9: Audit completion/failure events on AuditResults

**Files:**
- Modify: `src/pages/AuditResults.jsx:34-64` (poll function)

- [ ] **Step 1: Add tracking when poll resolves**

In `src/pages/AuditResults.jsx`, add the import after line 5 (`remarkGfm` import):

```jsx
import { trackEvent } from '../lib/telemetry'
```

Inside the `poll` function, replace the existing block (lines 49–55) that handles completion/failure:

```js
async function poll() {
  try {
    const res = await fetch(`/api/social-audit-status/${id}`)
    const data = await res.json()
    if (cancelled) return
    setState(data)

    if (data.status === 'completed') {
      const duration_ms = Date.now() - startedAt.current
      trackEvent('social_audit_completed', { audit_id: id, duration_ms })
      return
    }
    if (data.status === 'failed') {
      trackEvent('social_audit_failed', { audit_id: id, error: data.error })
      return
    }
    if (Date.now() - startedAt.current > MAX_POLL_MS) {
      setStalled(true)
      trackEvent('social_audit_failed', { audit_id: id, error: 'stalled' })
      return
    }
    timer = setTimeout(poll, POLL_INTERVAL_MS)
  } catch {
    if (!cancelled) timer = setTimeout(poll, POLL_INTERVAL_MS * 2)
  }
}
```

- [ ] **Step 2: Verify in dev**

Run `npm run dev`. Submit a free-social-audit form with a throwaway IG handle (e.g., `@nasa`). Wait for the result page to show the report. Confirm in PostHog **Activity** that `social_audit_completed` fires with `audit_id` and `duration_ms` (should be ~25–35 seconds in ms).

- [ ] **Step 3: Commit**

```bash
git add src/pages/AuditResults.jsx
git commit -m "feat(observability): emit social_audit_completed/failed events on poll resolve"
```

---

### Task 10: Chatbot events

**Files:**
- Modify: `src/components/ChatWidget.jsx`

- [ ] **Step 1: Add tracking for open + message-sent**

In `src/components/ChatWidget.jsx`, add the import after line 2 (`createPortal` import):

```jsx
import { trackEvent } from '../lib/telemetry'
```

In the `ChatWidgetInner` function, modify the closed-state click handler (around line 49). Replace:

```jsx
<div onClick={() => setOpen(true)} style={{...}}>
```

with:

```jsx
<div onClick={() => { trackEvent('chatbot_opened'); setOpen(true) }} style={{...}}>
```

In the `sendMessage` function (around line 24), at the very top (after the `if (!text || loading) return` line), add:

```js
trackEvent('chatbot_message_sent', { message_length: text.length })
```

- [ ] **Step 2: Verify in dev**

Run `npm run dev`. Click chatbot bubble (lower right). Confirm `chatbot_opened` fires. Type a message and send. Confirm `chatbot_message_sent` fires with `message_length`.

- [ ] **Step 3: Commit**

```bash
git add src/components/ChatWidget.jsx
git commit -m "feat(observability): emit chatbot_opened + chatbot_message_sent events"
```

---

### Task 11: Login attempt/success/failure events

**Files:**
- Modify: `src/pages/portal/PortalLogin.jsx`
- Modify: `src/pages/admin/AdminLogin.jsx`

- [ ] **Step 1: Read both login files to find their submit handlers**

```bash
grep -n "handleSubmit\|signIn\|onSubmit" "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions/src/pages/portal/PortalLogin.jsx" "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions/src/pages/admin/AdminLogin.jsx"
```

For each file, locate the form submit handler that calls `signIn(...)` or `supabase.auth.signInWithPassword(...)`.

- [ ] **Step 2: PortalLogin.jsx — add events**

Add the import:

```jsx
import { trackEvent } from '../../lib/telemetry'
```

In the submit handler, immediately before the `signIn`/`signInWithPassword` call, add:

```js
trackEvent('portal_login_attempted')
```

After the call resolves, branch on success/failure:

```js
if (error) {
  trackEvent('portal_login_failed', { error_code: error.message })
  // ...existing error UI handling
} else {
  trackEvent('portal_login_succeeded')
  // ...existing success handling
}
```

- [ ] **Step 3: AdminLogin.jsx — same changes**

Apply the identical pattern. Use event names `portal_login_attempted` / `portal_login_succeeded` / `portal_login_failed` but include `{ surface: 'admin' }` in each event's properties to distinguish in PostHog.

Update both files so events on PortalLogin pass `{ surface: 'portal' }` and events on AdminLogin pass `{ surface: 'admin' }`.

- [ ] **Step 4: Verify in dev**

Run `npm run dev`. Visit `/portal/login` and `/admin/login`. Try one bad password and one good password on each. Confirm 2 attempted, 2 succeeded, 2 failed events in PostHog with the `surface` property set correctly.

- [ ] **Step 5: Commit**

```bash
git add src/pages/portal/PortalLogin.jsx src/pages/admin/AdminLogin.jsx
git commit -m "feat(observability): emit portal/admin login attempt/success/failure events"
```

---

## Phase 4 — LLM observability (Tasks 12–14)

### Task 12: Node OpenAI tracking helper

**Files:**
- Create: `api/_lib/tracked-openai.js`

- [ ] **Step 1: Write the helper**

```js
// api/_lib/tracked-openai.js
import { PostHog } from 'posthog-node'

const POSTHOG_KEY = process.env.POSTHOG_PROJECT_API_KEY || process.env.VITE_POSTHOG_KEY
const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://us.i.posthog.com'

let phClient = null
function getClient() {
  if (phClient) return phClient
  if (!POSTHOG_KEY) return null
  phClient = new PostHog(POSTHOG_KEY, { host: POSTHOG_HOST, flushAt: 1, flushInterval: 0 })
  return phClient
}

/**
 * Calls OpenAI chat completions and emits a $ai_generation event to PostHog.
 * Wraps raw fetch (we don't use the OpenAI SDK in this codebase).
 *
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {Array}  opts.messages
 * @param {object} [opts.params] - extra fields merged into the body (max_tokens, temperature, response_format, etc.)
 * @param {string} [opts.distinctId='anonymous']
 * @param {object} [opts.eventProperties] - extra properties to include in the PostHog event
 * @returns {Promise<{ data: object, status: number }>}
 */
export async function trackedOpenAi({ apiKey, model, messages, params = {}, distinctId = 'anonymous', eventProperties = {} }) {
  const start = Date.now()
  const body = { model, messages, ...params }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  })
  const latencyMs = Date.now() - start
  const data = await res.json()

  const client = getClient()
  if (client) {
    const usage = data.usage || {}
    client.capture({
      distinctId,
      event: '$ai_generation',
      properties: {
        $ai_model: model,
        $ai_provider: 'openai',
        $ai_input_tokens: usage.prompt_tokens ?? null,
        $ai_output_tokens: usage.completion_tokens ?? null,
        $ai_total_tokens: usage.total_tokens ?? null,
        $ai_latency: latencyMs,
        $ai_http_status: res.status,
        ...eventProperties,
      },
    })
    await client.shutdown().catch(() => {})
    phClient = null
  }

  return { data, status: res.status }
}
```

- [ ] **Step 2: Sanity check the import resolves in a Vercel API route**

Create a temporary smoke route to confirm the helper imports cleanly:

```bash
cat > "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions/api/_smoke-tracked-openai.js" <<'EOF'
import { trackedOpenAi } from './_lib/tracked-openai.js'
export default async function handler(req, res) {
  res.status(200).json({ ok: typeof trackedOpenAi === 'function' })
}
EOF
```

Run `npm run dev` in one terminal, then in another:

```bash
curl http://localhost:5173/api/_smoke-tracked-openai
```

Expected: `{"ok":true}`. Then delete the smoke file:

```bash
rm "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions/api/_smoke-tracked-openai.js"
```

- [ ] **Step 3: Commit**

```bash
git add api/_lib/tracked-openai.js
git commit -m "feat(observability): add Node OpenAI tracking helper (trackedOpenAi)"
```

---

### Task 13: Wire trackedOpenAi into api/chat.js and api/generate-report.js

**Files:**
- Modify: `api/chat.js:97-150` (the `try` block that calls OpenAI)
- Modify: `api/generate-report.js:215-235` (its OpenAI fetch block)

- [ ] **Step 1: api/chat.js — replace the OpenAI fetch**

Add the import at the top of `api/chat.js`:

```js
import { trackedOpenAi } from './_lib/tracked-openai.js'
```

Replace the `try` block starting at line 98 (the one that begins with `const aiRes = await fetch('https://api.openai.com/v1/chat/completions', ...)`):

Original:

```js
try {
    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: 0.7,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.slice(-10),
        ],
      }),
    })

    const aiData = await aiRes.json()
    let reply = aiData.choices?.[0]?.message?.content || 'Sorry, something went wrong.'
```

Replace with:

```js
try {
    const { data: aiData } = await trackedOpenAi({
      apiKey: openaiKey,
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.slice(-10),
      ],
      params: { max_tokens: maxTokens, temperature: 0.7 },
      distinctId: sessionId || 'anonymous',
      eventProperties: { surface: 'chatbot' },
    })

    let reply = aiData.choices?.[0]?.message?.content || 'Sorry, something went wrong.'
```

- [ ] **Step 2: api/generate-report.js — replace its OpenAI fetch**

Add the import at the top:

```js
import { trackedOpenAi } from './_lib/tracked-openai.js'
```

Read lines 215–250 to see the exact existing structure, then replace the OpenAI fetch with `trackedOpenAi`. Pass `distinctId: req.body?.lead_id ?? req.body?.email ?? 'anonymous'` and `eventProperties: { surface: 'automation-report' }`.

Use the same pattern as Step 1: keep the body shape the same, just route the call through `trackedOpenAi` and read `aiData.choices...` from the returned `data`.

- [ ] **Step 3: Verify chatbot end-to-end in dev**

Run `npm run dev`. Open the chatbot, send a message. Confirm:
- The chatbot reply still works
- PostHog → **Activity** → `$ai_generation` event appears with `$ai_model`, `$ai_input_tokens`, `$ai_output_tokens`, `$ai_latency`, `surface: 'chatbot'`
- PostHog → **LLM observability** dashboard (left sidebar) → the call appears with cost calculated

- [ ] **Step 4: Commit**

```bash
git add api/chat.js api/generate-report.js
git commit -m "feat(observability): instrument api/chat and api/generate-report with trackedOpenAi"
```

---

### Task 14: Deno OpenAI tracking helper + Edge Function wiring

**Files:**
- Create: `supabase/functions/_shared/tracked-openai.ts`
- Modify: `supabase/functions/generate-social-audit/index.ts:85-110` (the `callOpenAI` helper)

- [ ] **Step 1: Write the Deno helper**

```ts
// supabase/functions/_shared/tracked-openai.ts
const POSTHOG_KEY = Deno.env.get('POSTHOG_PROJECT_API_KEY')
const POSTHOG_HOST = Deno.env.get('POSTHOG_HOST') ?? 'https://us.i.posthog.com'

interface TrackedOpenAiOpts {
  apiKey: string
  model: string
  messages: unknown[]
  params?: Record<string, unknown>
  distinctId?: string
  eventProperties?: Record<string, unknown>
}

interface TrackedOpenAiResult {
  data: any
  status: number
}

export async function trackedOpenAi({
  apiKey, model, messages, params = {}, distinctId = 'anonymous', eventProperties = {},
}: TrackedOpenAiOpts): Promise<TrackedOpenAiResult> {
  const start = Date.now()
  const body = { model, messages, ...params }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  })
  const latencyMs = Date.now() - start
  const data = await res.json()

  if (POSTHOG_KEY) {
    const usage = data.usage ?? {}
    fetch(`${POSTHOG_HOST}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: POSTHOG_KEY,
        event: '$ai_generation',
        distinct_id: distinctId,
        properties: {
          $ai_model: model,
          $ai_provider: 'openai',
          $ai_input_tokens: usage.prompt_tokens ?? null,
          $ai_output_tokens: usage.completion_tokens ?? null,
          $ai_total_tokens: usage.total_tokens ?? null,
          $ai_latency: latencyMs,
          $ai_http_status: res.status,
          ...eventProperties,
        },
      }),
    }).catch(() => {})
  }

  return { data, status: res.status }
}
```

- [ ] **Step 2: Update Edge Function to use trackedOpenAi**

Read `supabase/functions/generate-social-audit/index.ts` lines 85–110 to see the existing `callOpenAI` function structure. Then refactor it to use the helper.

Add the import at the top of the file (with other imports):

```ts
import { trackedOpenAi } from '../_shared/tracked-openai.ts'
```

Replace the body of `callOpenAI` so it calls `trackedOpenAi` instead of raw fetch. Keep the same function signature (preserves its callers). Pass `distinctId: auditId ?? 'anonymous'` and `eventProperties: { surface: 'social-audit', audit_id: auditId }`. The `auditId` is available in the calling scope at `index.ts:69` — pass it down via a new parameter or via a closure variable.

The minimal-impact approach: add `auditId: string` as a third parameter to `callOpenAI` and update the single call site at line 69 to pass it.

- [ ] **Step 3: Set Edge Function secrets**

```bash
SUPABASE_TOKEN="sbp_REDACTED_USE_LOCAL_ENV"
PROJECT_REF="ioxpfvxcsclgmwyslxjj"
POSTHOG_KEY=$(grep '^VITE_POSTHOG_KEY=' "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions/.env" | cut -d= -f2)

curl -X POST "https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/secrets" \
  -H "Authorization: Bearer ${SUPABASE_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"POSTHOG_PROJECT_API_KEY\":\"${POSTHOG_KEY}\",\"POSTHOG_HOST\":\"https://us.i.posthog.com\"}"
```

Expected: `{}` or 200 status.

Verify:

```bash
curl -X GET "https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/secrets" \
  -H "Authorization: Bearer ${SUPABASE_TOKEN}"
```

Expected: list including `POSTHOG_PROJECT_API_KEY` and `POSTHOG_HOST`.

- [ ] **Step 4: Deploy the Edge Function**

```bash
cd "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions"
npx supabase functions deploy generate-social-audit --project-ref ioxpfvxcsclgmwyslxjj
```

Expected: success message with deployed URL.

- [ ] **Step 5: End-to-end verify a real audit**

Run `npm run dev`. Submit a free-social-audit with a throwaway IG handle. Wait for the report to render. Open PostHog → **Activity** → confirm `$ai_generation` events with `surface: 'social-audit'` and `audit_id` matching the URL `/audit/{id}`.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/tracked-openai.ts supabase/functions/generate-social-audit/index.ts
git commit -m "feat(observability): instrument Edge Function OpenAI calls with trackedOpenAi"
```

---

## Phase 5 — Vercel + Sentry config (Tasks 15–17)

### Task 15: Set Vercel environment variables

**Files:**
- (No file changes — Vercel CLI configuration)

- [ ] **Step 1: Set the five env vars in Vercel**

Use the Vercel access token from `.env` (`Vercel_Access_Token=vcp_1xBLG...`).

```bash
cd "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions"
TOKEN=$(grep '^Vercel_Access_Token=' .env | cut -d= -f2)
PH_KEY=$(grep '^VITE_POSTHOG_KEY=' .env | cut -d= -f2)
PH_HOST=$(grep '^VITE_POSTHOG_HOST=' .env | cut -d= -f2)
SENTRY_DSN=$(grep '^VITE_SENTRY_DSN=' .env | cut -d= -f2)

for ENV in production preview development; do
  echo "$PH_KEY"     | npx vercel env add VITE_POSTHOG_KEY $ENV --token=$TOKEN --yes
  echo "$PH_HOST"    | npx vercel env add VITE_POSTHOG_HOST $ENV --token=$TOKEN --yes
  echo "$SENTRY_DSN" | npx vercel env add VITE_SENTRY_DSN $ENV --token=$TOKEN --yes
  echo "$PH_KEY"     | npx vercel env add POSTHOG_PROJECT_API_KEY $ENV --token=$TOKEN --yes
  echo "$PH_HOST"    | npx vercel env add POSTHOG_HOST $ENV --token=$TOKEN --yes
done
```

If `vercel env add` complains the var already exists, run `npx vercel env rm <NAME> $ENV --token=$TOKEN --yes` first, then re-add.

- [ ] **Step 2: Verify all five vars are set in all three environments**

```bash
npx vercel env ls --token=$TOKEN
```

Expected: a table showing 15 rows (5 vars × 3 environments). Confirm each var is present in all three environments.

- [ ] **Step 3: Trigger a deploy and confirm build succeeds**

The next git push (Phase 7) will rebuild. No commit needed for this task.

---

### Task 16: Sentry-Vercel integration for source maps

**Files:**
- (No file changes — UI configuration)

- [ ] **Step 1: Install the Sentry-Vercel integration**

Open https://vercel.com/integrations/sentry in a browser. Click **Add Integration** → select the `haze-tech-solutions` Vercel project → connect it to the Sentry project that owns the DSN already in `.env`.

Sentry will auto-add the following Vercel env vars:
- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `NEXT_PUBLIC_SENTRY_DSN` (Sentry's installer adds this; we ignore it — we use `VITE_SENTRY_DSN`)

- [ ] **Step 2: Confirm env vars appear in Vercel**

```bash
npx vercel env ls --token=$TOKEN
```

Expected: at least `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` are present (Sentry may add more).

- [ ] **Step 3: Add Vite Sentry plugin for source-map upload**

Install:

```bash
cd "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions"
npm install --save-dev @sentry/vite-plugin
```

Read `vite.config.js` (or `.ts`):

```bash
cat vite.config.js 2>/dev/null || cat vite.config.ts 2>/dev/null
```

Modify the config to add the Sentry plugin and enable source maps. Add at the top:

```js
import { sentryVitePlugin } from '@sentry/vite-plugin'
```

Add to the plugins array (last entry):

```js
sentryVitePlugin({
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  disable: !process.env.SENTRY_AUTH_TOKEN, // skip locally
})
```

Add to the build config:

```js
build: {
  sourcemap: true,
}
```

(If a `build` block already exists, add `sourcemap: true` to it.)

- [ ] **Step 4: Verify build still works**

```bash
npm run build
```

Expected: build completes successfully (locally without auth token, source-map upload is skipped via `disable`).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vite.config.*
git commit -m "feat(observability): add Sentry-Vite source-map upload plugin"
```

---

### Task 17: Sentry alert rule

**Files:**
- (No file changes — Sentry UI configuration)

- [ ] **Step 1: Configure default alert rule in Sentry**

Open https://sentry.io/ → navigate to the project that owns the DSN. Go to **Settings** → **Alerts** → **Create Alert Rule** (Issue alert).

Configure:
- **When:** A new issue is created
- **Filter:** (none — all issues)
- **Action:** Send a notification to email `info@hazetechsolutions.com`
- **Frequency:** No more than once per 30 minutes per issue (default)

Save the rule with name `Email on new issue → info@hazetechsolutions.com`.

- [ ] **Step 2: Verify by triggering a test error post-deploy**

After Phase 7 deploy, visit `https://www.hazetechsolutions.com/?sentry-test=1` (the temporary throw was removed in Task 4 step 4 — re-add it temporarily with the `?sentry-test=1` guard, deploy, trigger, then remove).

Confirm an email arrives at `info@hazetechsolutions.com` from Sentry within ~5 minutes.

(This step is contingent on Phase 7 deploy completing — defer until then.)

---

## Phase 6 — Final integration (Task 18)

### Task 18: Open PR, merge, smoke test on production

**Files:**
- (Branch + PR — no file changes)

- [ ] **Step 1: Confirm clean working tree**

```bash
cd "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions"
git status --short
```

Expected: only the pre-existing untracked files from prior sessions (`.claude/`, `n8n-*.json`, etc.). All observability commits should already be present in `git log`.

- [ ] **Step 2: Create branch and push**

Direct push to `main` is blocked by the harness's PR-review rule. Use a feature branch:

```bash
git checkout -b feat/observability-posthog-sentry
git push -u origin feat/observability-posthog-sentry
```

Expected: branch pushed successfully.

- [ ] **Step 3: Open PR**

```bash
gh pr create --title "feat(observability): wire PostHog + Sentry across frontend, API, edge fn" --body "$(cat <<'EOF'
## Summary
Wires PostHog (analytics + session replay + feature flags + LLM observability) and Sentry (frontend error tracking) into haze-tech-solutions per the spec at `docs/superpowers/specs/2026-05-01-observability-design.md`.

## What's instrumented
- Frontend pageviews, autocapture, session replay (all inputs masked)
- Identification on Supabase auth + on lead-form submit (Contact, FreeSocialAudit, AuditPage)
- CTA tracking across Hero, Services, Navbar
- Audit-flow events: `social_audit_started/completed/failed`, `website_audit_started/completed/failed`
- Chatbot events: `chatbot_opened`, `chatbot_message_sent`
- Login events: `portal_login_attempted/succeeded/failed` (admin + portal)
- LLM observability: `$ai_generation` events from `api/chat.js`, `api/generate-report.js`, and `supabase/functions/generate-social-audit/index.ts` via shared `trackedOpenAi` helper
- Sentry React error boundary with custom fallback UI
- Sentry-Vercel integration for source-map upload

## Out of scope
- Sentry on Vercel API routes / Edge Functions (frontend-only by spec)
- PostHog dashboards (events flow in; build dashboards in PostHog UI)
- Specific feature flags (SDK installed; use cases land with the branding feature)

## Test plan
- [ ] Production homepage loads, no console errors
- [ ] PostHog `$pageview` appears in dashboard within 30 sec
- [ ] CTA click on Hero "Free Social Audit" → `cta_clicked` event with `cta_id: hero-free-social-audit`
- [ ] Submit `/free-social-audit` test → identified person + `lead_submitted` + `social_audit_started` + `social_audit_completed` + `$ai_generation` events all appear; report renders correctly
- [ ] Open chatbot → `chatbot_opened` event; send message → `chatbot_message_sent` + `$ai_generation` events
- [ ] Visit `/?sentry-test=1` → SentryFallback UI; new Sentry issue + email alert to info@hazetechsolutions.com
- [ ] Spot-check session replay in PostHog → all form inputs masked

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Capture the PR URL from the output.

- [ ] **Step 4: Wait for Vercel preview deploy**

Visit the PR URL on GitHub. Wait for Vercel's preview-deploy comment with the preview URL (`https://haze-tech-solutions-<hash>.vercel.app`). May take 1–3 minutes.

- [ ] **Step 5: Run smoke checks on the preview URL**

For each item in the PR test plan:
1. Visit the page on the preview URL
2. Verify the event/issue lands in PostHog or Sentry
3. Mark the checkbox in the PR description

If any check fails: do NOT merge. Diagnose and push fixes to the same branch.

- [ ] **Step 6: Merge**

Once all smoke checks pass:

```bash
gh pr merge --squash --delete-branch
git fetch origin
git reset --hard origin/main
```

Expected: PR merged, branch deleted, local `main` aligned with origin.

- [ ] **Step 7: Final smoke check on production**

After Vercel auto-deploys main, repeat the test plan against `https://www.hazetechsolutions.com/`. Confirm all events flow as expected.

- [ ] **Step 8: Commit memory updates**

Update memory to reflect that observability is shipped:

Create or update a project memory file via the auto-memory system (the agent should do this automatically after completing the work).

---

## Self-review

- **Spec coverage:** Each spec section has at least one task — Frontend init (Tasks 1–4), Identification (Tasks 5–7), Custom events (Tasks 8–11), LLM observability (Tasks 12–14), Vercel/Supabase env config (Task 15, plus Edge secrets in Task 14), Sentry source maps + alerts (Tasks 16–17), Smoke test (Task 18).
- **Spec deviation flagged:** The `@posthog/ai` SDK swap to a `trackedOpenAi` fetch wrapper is documented at the top of this plan and in Tasks 12–14.
- **No placeholders:** Each step contains the actual code or command to run. The two cases that ask the engineer to read existing code first (Task 11 step 1 grep, Task 13 step 2 read) are followed by explicit instructions on what to change.
- **Type consistency:** `trackedOpenAi` has the same signature in Node and Deno, returns `{ data, status }` from both. `trackEvent`, `trackCta`, `identifyUser`, `identifyLead`, `resetIdentity` are referenced by exact name everywhere they're used. Event names are consistent (`lead_submitted`, `social_audit_started/completed/failed`, `website_audit_started/completed/failed`, `chatbot_opened`, `chatbot_message_sent`, `portal_login_attempted/succeeded/failed`, `cta_clicked`).
- **Verification per task:** Every code task has a dev-server or curl-based verification step, not just "run the tests."

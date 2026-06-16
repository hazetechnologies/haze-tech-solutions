# Client Self-Serve Brand Kits + Pipeline Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let active social-media clients start (and regenerate, up to a per-cycle limit) their own brand kit from the portal, with transparent logos and a YouTube-only ghost CTA.

**Architecture:** A new client-authed action in `api/website.js` validates + rate-limits + triggers the existing `generate-brand-kit` edge function; the portal Brand Kit page renders an intake form inline. Two pure helpers (validator, limit) are shared and Deno-unit-tested. The edge function is tweaked for transparent logos and a YouTube-only outline CTA.

**Tech Stack:** Vercel Node serverless (`api/*.js`, ESM), React (Vite) portal, Supabase Postgres, Supabase Deno Edge Function, imagescript, Deno test runner (already used in this repo).

**Spec:** `docs/superpowers/specs/2026-06-16-client-self-serve-brand-kits-design.md`

**Run tests with:** `deno test --allow-net <file>` (Deno is installed at `~/.deno/bin`; add it to PATH in the shell first: `export PATH="$HOME/.deno/bin:$PATH"`).

---

## Task 1: Shared input validator

**Files:**
- Create: `api/_lib/brand-kit-inputs.js`
- Create: `api/_lib/brand-kit-inputs.test.js`
- Modify: `api/start-brand-kit.js` (replace inline validation with the shared call)

- [ ] **Step 1: Write the failing test**

Create `api/_lib/brand-kit-inputs.test.js`:

```js
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { validateBrandKitInputs } from './brand-kit-inputs.js'

const base = {
  path: 'cold_start',
  business_name: 'Acme', business_description: 'We do things',
  industry: 'Coffee', audience: 'Locals', vibe: ['warm'],
  inspirations: 'Blue Bottle', color_preference: 'earthy',
}

Deno.test('accepts a complete cold_start payload', () => {
  assertEquals(validateBrandKitInputs(base), { ok: true })
})

Deno.test('rejects a bad path', () => {
  const r = validateBrandKitInputs({ ...base, path: 'nope' })
  assertEquals(r.ok, false)
})

Deno.test('rejects a missing required field', () => {
  const { industry: _omit, ...rest } = base
  const r = validateBrandKitInputs(rest)
  assertEquals(r.ok, false)
  assertEquals(r.error.includes('industry'), true)
})

Deno.test('rejects empty vibe array', () => {
  assertEquals(validateBrandKitInputs({ ...base, vibe: [] }).ok, false)
})

Deno.test('requires color_preference OR brand_colors', () => {
  const { color_preference: _c, ...rest } = base
  assertEquals(validateBrandKitInputs(rest).ok, false)
  assertEquals(validateBrandKitInputs({ ...rest, brand_colors: [{ name: 'primary', hex: '#aabbcc' }] }).ok, true)
})

Deno.test('rejects bad hex and bad color name', () => {
  const { color_preference: _c, ...rest } = base
  assertEquals(validateBrandKitInputs({ ...rest, brand_colors: [{ name: 'primary', hex: 'red' }] }).ok, false)
  assertEquals(validateBrandKitInputs({ ...rest, brand_colors: [{ name: 'bogus', hex: '#aabbcc' }] }).ok, false)
})

Deno.test('rejects non-http logo url and enforces length caps', () => {
  assertEquals(validateBrandKitInputs({ ...base, existing_logo_url: 'ftp://x' }).ok, false)
  assertEquals(validateBrandKitInputs({ ...base, tagline_override: 'x'.repeat(81) }).ok, false)
  assertEquals(validateBrandKitInputs({ ...base, cta_override: 'x'.repeat(25) }).ok, false)
  assertEquals(validateBrandKitInputs({ ...base, imagery_direction: 'x'.repeat(501) }).ok, false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$HOME/.deno/bin:$PATH" && deno test --allow-net api/_lib/brand-kit-inputs.test.js`
Expected: FAIL — module `./brand-kit-inputs.js` not found.

- [ ] **Step 3: Write the implementation**

Create `api/_lib/brand-kit-inputs.js`:

```js
// api/_lib/brand-kit-inputs.js
// Pure validator for brand-kit generation inputs, shared by the admin trigger
// (api/start-brand-kit.js) and the client self-serve action
// (api/website.js ?action=start-brand-kit-self). Returns { ok: true } or
// { ok: false, error }.

const REQUIRED_COLD_START = ['business_name', 'business_description', 'industry', 'audience', 'vibe', 'inspirations']
const REQUIRED_AUDIT_PREFILL = ['business_name', 'industry', 'audience', 'vibe', 'inspirations']

export function validateBrandKitInputs(inputs) {
  if (!inputs || typeof inputs !== 'object') return { ok: false, error: 'inputs required' }
  const path = inputs.path
  if (path !== 'audit_prefill' && path !== 'cold_start') {
    return { ok: false, error: `inputs.path must be 'audit_prefill' or 'cold_start'` }
  }
  const required = path === 'cold_start' ? REQUIRED_COLD_START : REQUIRED_AUDIT_PREFILL
  for (const f of required) {
    const v = inputs[f]
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) {
      return { ok: false, error: `inputs.${f} is required for path '${path}'` }
    }
  }
  const hasColorText = typeof inputs.color_preference === 'string' && inputs.color_preference.trim().length > 0
  const hasBrandColors = Array.isArray(inputs.brand_colors) && inputs.brand_colors.length > 0
  if (!hasColorText && !hasBrandColors) {
    return { ok: false, error: 'Provide either color_preference (text) or brand_colors[] (explicit hex)' }
  }
  if (hasBrandColors) {
    for (const c of inputs.brand_colors) {
      if (!c?.hex || !/^#[0-9a-fA-F]{6}$/.test(c.hex)) {
        return { ok: false, error: `brand_colors[].hex must be a #RRGGBB value (got "${c?.hex}")` }
      }
      if (!['primary', 'secondary', 'accent'].includes(c.name)) {
        return { ok: false, error: `brand_colors[].name must be 'primary', 'secondary', or 'accent' (got "${c?.name}")` }
      }
    }
  }
  if (inputs.existing_logo_url && !/^https?:\/\//.test(inputs.existing_logo_url)) {
    return { ok: false, error: 'existing_logo_url must be a full http(s):// URL' }
  }
  if (inputs.imagery_direction !== undefined) {
    if (typeof inputs.imagery_direction !== 'string') return { ok: false, error: 'imagery_direction must be a string' }
    if (inputs.imagery_direction.length > 500) return { ok: false, error: 'imagery_direction must be 500 characters or fewer' }
  }
  if (inputs.tagline_override !== undefined) {
    if (typeof inputs.tagline_override !== 'string') return { ok: false, error: 'tagline_override must be a string' }
    if (inputs.tagline_override.length > 80) return { ok: false, error: 'tagline_override must be 80 characters or fewer' }
  }
  if (inputs.cta_override !== undefined) {
    if (typeof inputs.cta_override !== 'string') return { ok: false, error: 'cta_override must be a string' }
    if (inputs.cta_override.length > 24) return { ok: false, error: 'cta_override must be 24 characters or fewer' }
  }
  return { ok: true }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="$HOME/.deno/bin:$PATH" && deno test --allow-net api/_lib/brand-kit-inputs.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Refactor `api/start-brand-kit.js` to use it**

At the top of `api/start-brand-kit.js`, add the import:

```js
import { validateBrandKitInputs } from './_lib/brand-kit-inputs.js'
```

Then replace the entire inline validation block (from the `const path = inputs.path` line through the end of the `cta_override` length check, i.e. lines ~29-88 — everything between the `inputs required` check and the `// Verify client exists` comment) with:

```js
  const v = validateBrandKitInputs(inputs)
  if (!v.ok) return res.status(400).json({ error: v.error })
```

Leave the `client_id` / `inputs` presence checks above it and the `// Verify client exists` insert logic below it untouched. Also delete the now-unused `REQUIRED_PATH1_FIELDS` / `REQUIRED_PATH3_FIELDS` constants at the top of the file.

- [ ] **Step 6: Verify the build still compiles**

Run: `npm run build`
Expected: build succeeds (Vite bundles the frontend; the api refactor is import-only and must not break the build).

- [ ] **Step 7: Commit**

```bash
git add api/_lib/brand-kit-inputs.js api/_lib/brand-kit-inputs.test.js api/start-brand-kit.js
git commit -m "refactor(brand-kit): extract shared validateBrandKitInputs"
```

---

## Task 2: Per-cycle limit counting helper

**Files:**
- Create: `api/_lib/brand-kit-limit.js`
- Create: `api/_lib/brand-kit-limit.test.js`

- [ ] **Step 1: Write the failing test**

Create `api/_lib/brand-kit-limit.test.js`:

```js
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { evaluateBrandKitLimit } from './brand-kit-limit.js'

const periodStart = new Date('2026-06-01T00:00:00Z')
const inP = (s) => ({ status: s, created_at: '2026-06-10T00:00:00Z' })   // inside period
const old = (s) => ({ status: s, created_at: '2026-05-10T00:00:00Z' })   // before period

Deno.test('allows when under limit', () => {
  const r = evaluateBrandKitLimit({ kits: [inP('done')], limit: 2, periodStart })
  assertEquals(r, { allowed: true, used: 1, limit: 2, resetsAt: null })
})

Deno.test('blocks at the limit', () => {
  const r = evaluateBrandKitLimit({ kits: [inP('done'), inP('generating')], limit: 2, periodStart })
  assertEquals(r.allowed, false)
  assertEquals(r.used, 2)
})

Deno.test('failed kits do not count', () => {
  const r = evaluateBrandKitLimit({ kits: [inP('failed'), inP('failed'), inP('done')], limit: 2, periodStart })
  assertEquals(r.used, 1)
  assertEquals(r.allowed, true)
})

Deno.test('kits before the period start do not count', () => {
  const r = evaluateBrandKitLimit({ kits: [old('done'), old('done'), inP('done')], limit: 2, periodStart })
  assertEquals(r.used, 1)
})

Deno.test('empty list is allowed', () => {
  assertEquals(evaluateBrandKitLimit({ kits: [], limit: 2, periodStart }).allowed, true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="$HOME/.deno/bin:$PATH" && deno test --allow-net api/_lib/brand-kit-limit.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `api/_lib/brand-kit-limit.js`:

```js
// api/_lib/brand-kit-limit.js
// Pure helper: decide whether a client may generate another brand kit this
// billing cycle. Failed kits do NOT count (a failed generation — e.g. KIE out
// of credits — shouldn't burn an attempt); pending/generating/
// awaiting_logo_approval/done all count.

export function evaluateBrandKitLimit({ kits, limit, periodStart, resetsAt = null }) {
  const start = periodStart instanceof Date ? periodStart : new Date(periodStart)
  const used = (kits || []).filter((k) => {
    if (k.status === 'failed') return false
    return new Date(k.created_at) >= start
  }).length
  return { allowed: used < limit, used, limit, resetsAt }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="$HOME/.deno/bin:$PATH" && deno test --allow-net api/_lib/brand-kit-limit.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add api/_lib/brand-kit-limit.js api/_lib/brand-kit-limit.test.js
git commit -m "feat(brand-kit): add per-cycle generation limit helper"
```

---

## Task 3: Client-authed trigger action `start-brand-kit-self`

**Files:**
- Modify: `api/website.js` (add the action case + two functions)

No automated test (no Node test runner; the pure logic it relies on is covered in Tasks 1–2). Verified by build + manual QA in Task 7.

- [ ] **Step 1: Add imports**

At the top of `api/website.js`, alongside the existing imports, add:

```js
import { validateBrandKitInputs } from './_lib/brand-kit-inputs.js'
import { evaluateBrandKitLimit } from './_lib/brand-kit-limit.js'
```

- [ ] **Step 2: Register the action**

In the `switch (action)` block (after the `case 'portal-social':` line ~45), add:

```js
    case 'start-brand-kit-self': return req.method === 'POST' ? startBrandKitSelf(req, res) : methodNotAllowed(res, 'POST')
```

- [ ] **Step 3: Add the handler + billing-period helper**

Add these two functions to `api/website.js` (place them right after the `portalSocial` function, near line ~1186):

```js
// POST ?action=start-brand-kit-self — client-facing self-serve brand kit trigger.
// Auth = logged-in portal client; client_id is resolved server-side. Gated to
// social clients (clients.hsp_user_id) and capped by a per-billing-cycle
// generation limit. Body: { inputs }. Mirrors the admin api/start-brand-kit.js.
async function startBrandKitSelf(req, res) {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (!SERVICE_ROLE_KEY) return res.status(500).json({ error: 'config_error', message: 'Service role key not configured' })

  // 1. Authenticate the portal client.
  const authHeader = req.headers.authorization || ''
  const m = /^Bearer\s+(.+)$/.exec(authHeader)
  if (!m) return res.status(401).json({ error: 'unauthorized' })
  const userClient = createClient(url, anonKey)
  const { data: { user: caller }, error: authErr } = await userClient.auth.getUser(m[1].trim())
  if (authErr || !caller) return res.status(401).json({ error: 'unauthorized' })

  // 2. Resolve THIS caller's client row + social-activation gate.
  const admin = createClient(url, SERVICE_ROLE_KEY)
  const { data: client } = await admin
    .from('clients').select('id, company, name, hsp_user_id').eq('user_id', caller.id).maybeSingle()
  if (!client) return res.status(403).json({ error: 'forbidden', message: 'no client for this user' })
  if (!client.hsp_user_id) return res.status(409).json({ error: 'not_activated', message: 'Social media is not set up for your account yet.' })

  // 3. Load this client's kits (newest first) for dedupe + limit.
  const { data: kits } = await admin
    .from('brand_kits').select('id, status, created_at').eq('client_id', client.id)
    .order('created_at', { ascending: false })

  // 4. Dedupe: block while a kit is in flight.
  const IN_FLIGHT = ['pending', 'generating', 'awaiting_logo_approval']
  if ((kits || []).some((k) => IN_FLIGHT.includes(k.status))) {
    return res.status(409).json({ error: 'in_progress', message: 'A brand kit is already being generated.' })
  }

  // 5. Per-cycle limit.
  const limitRaw = await getSetting('brand_kit_cycle_limit', null)
  const parsed = parseInt(limitRaw, 10)
  const limit = Number.isFinite(parsed) ? parsed : 2
  const { periodStart, resetsAt } = await resolveBillingPeriod(admin, client.id)
  const { allowed, used } = evaluateBrandKitLimit({ kits: kits || [], limit, periodStart })
  if (!allowed) {
    return res.status(409).json({
      error: 'limit_reached',
      message: `You've used all ${limit} brand-kit generations for this cycle${resetsAt ? `. Resets on ${new Date(resetsAt).toLocaleDateString()}` : ''}.`,
      used, limit, resets_at: resetsAt,
    })
  }

  // 6. Validate inputs (self-serve is always cold_start).
  const inputs = { ...(req.body?.inputs || {}), path: 'cold_start' }
  const v = validateBrandKitInputs(inputs)
  if (!v.ok) return res.status(400).json({ error: 'invalid_inputs', message: v.error })

  // 7. Insert the kit + fire the edge function (same contract as the admin trigger).
  const { data: row, error: insErr } = await admin
    .from('brand_kits')
    .insert({ client_id: client.id, source_audit_id: null, inputs, status: 'pending', progress_message: 'Queued…' })
    .select('id').single()
  if (insErr) return res.status(500).json({ error: 'db_error', message: insErr.message })

  try {
    const edgeUrl = `${process.env.SUPABASE_EDGE_FUNCTION_URL}/generate-brand-kit`
    const edgeRes = await fetch(edgeUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ kit_id: row.id }),
    })
    if (!edgeRes.ok) console.error('start-brand-kit-self edge invoke non-ok:', edgeRes.status, await edgeRes.text())
  } catch (err) {
    console.error('start-brand-kit-self edge invoke failed:', err)
  }
  return res.status(200).json({ kit_id: row.id })
}

// Resolve the client's current billing-period window from their active
// subscription. subscriptions links to plans via stripe_price_id (there is no
// subscription_plan_id column). Falls back to a rolling 30-day window when there
// is no active subscription with a period end.
async function resolveBillingPeriod(admin, clientId) {
  const { data: subs } = await admin
    .from('subscriptions')
    .select('current_period_end, status, stripe_price_id')
    .eq('client_id', clientId)
    .in('status', ['active', 'trialing'])
    .order('current_period_end', { ascending: false })
    .limit(1)
  const sub = subs?.[0]
  if (sub?.current_period_end) {
    const end = new Date(sub.current_period_end)
    let months = 1
    if (sub.stripe_price_id) {
      const { data: plan } = await admin
        .from('subscription_plans').select('billing_cycle').eq('stripe_price_id', sub.stripe_price_id).maybeSingle()
      if (plan?.billing_cycle === 'annual') months = 12
    }
    const start = new Date(end)
    start.setMonth(start.getMonth() - months)
    return { periodStart: start, resetsAt: end.toISOString() }
  }
  const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const resetsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  return { periodStart: start, resetsAt }
}
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add api/website.js
git commit -m "feat(brand-kit): client self-serve trigger with gate + per-cycle limit"
```

---

## Task 4: Client intake form component

**Files:**
- Create: `src/pages/portal/PortalBrandKitIntakeForm.jsx`

- [ ] **Step 1: Create the component**

Create `src/pages/portal/PortalBrandKitIntakeForm.jsx`:

```jsx
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useClient } from '../../lib/PortalProtectedRoute'
import { AlertCircle, Sparkles } from 'lucide-react'

const VIBE_OPTIONS = [
  'minimalist', 'warm', 'premium', 'playful', 'bold', 'organic',
  'corporate', 'futuristic', 'vintage', 'edgy', 'friendly', 'serious',
]

// onStarted(kitId) is called after a successful submit so the parent can reload.
export default function PortalBrandKitIntakeForm({ onStarted }) {
  const client = useClient()
  const [form, setForm] = useState({
    business_name: client?.company || client?.name || '',
    business_description: '', industry: '', audience: '',
    vibe: [], color_preference: '', inspirations: '',
    voice_tone_preference: '', existing_logo_url: '',
    brand_colors: { primary: '', secondary: '', accent: '' },
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const setField = (k, v) => setForm((p) => ({ ...p, [k]: v }))
  const toggleVibe = (v) => setField('vibe', form.vibe.includes(v) ? form.vibe.filter((x) => x !== v) : [...form.vibe, v])
  const setColor = (role, hex) => setForm((p) => ({ ...p, brand_colors: { ...p.brand_colors, [role]: hex } }))

  const validBrandColors = ['primary', 'secondary', 'accent']
    .map((name) => ({ name, hex: form.brand_colors[name] }))
    .filter((c) => /^#[0-9a-fA-F]{6}$/.test(c.hex))

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    for (const f of ['business_name', 'business_description', 'industry', 'audience', 'inspirations']) {
      if (!form[f].trim()) { setError(`Please fill in: ${f.replace(/_/g, ' ')}`); return }
    }
    if (form.vibe.length === 0) { setError('Pick at least one vibe.'); return }
    if (!form.color_preference.trim() && validBrandColors.length === 0) {
      setError('Describe a color preference OR pick explicit brand colors below.'); return
    }
    if (form.existing_logo_url && !/^https?:\/\//.test(form.existing_logo_url.trim())) {
      setError('Logo URL must start with http:// or https://'); return
    }
    setSubmitting(true)
    try {
      const { brand_colors: _bc, ...clean } = form
      const inputs = {
        ...clean,
        existing_logo_url: form.existing_logo_url.trim() || undefined,
        voice_tone_preference: form.voice_tone_preference.trim() || undefined,
        ...(validBrandColors.length > 0 ? { brand_colors: validBrandColors } : {}),
      }
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/website?action=start-brand-kit-self', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.message || json.error || `Error ${res.status}`)
      onStarted(json.kit_id)
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  return (
    <div style={cardStyle}>
      <h2 style={h2}><Sparkles size={16} style={{ display: 'inline', marginRight: 8 }} />Create your Brand Kit</h2>
      <p style={{ color: '#94A3B8', fontSize: 13, marginTop: 0, marginBottom: 18 }}>
        Tell us about your brand and we'll generate logos, banners, bios, and a brand guide. You'll pick your favorite logo before we finish the rest.
      </p>
      {error && <div style={errorBanner}><AlertCircle size={15} /><span>{error}</span></div>}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Business name *">
          <input value={form.business_name} onChange={(e) => setField('business_name', e.target.value)} style={inputStyle} />
        </Field>
        <Field label="What does your business do? *">
          <textarea value={form.business_description} onChange={(e) => setField('business_description', e.target.value)} style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} placeholder="e.g. Small-batch artisan coffee roaster" />
        </Field>
        <Field label="Industry *">
          <input value={form.industry} onChange={(e) => setField('industry', e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Target audience *">
          <textarea value={form.audience} onChange={(e) => setField('audience', e.target.value)} style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} placeholder="Who's your ideal customer?" />
        </Field>
        <Field label="Brand vibe * (pick 1-3)">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {VIBE_OPTIONS.map((v) => (
              <button key={v} type="button" onClick={() => toggleVibe(v)} style={{
                background: form.vibe.includes(v) ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.04)',
                border: form.vibe.includes(v) ? '1px solid #00D4FF' : '1px solid rgba(255,255,255,0.08)',
                color: form.vibe.includes(v) ? '#00D4FF' : '#94A3B8',
                borderRadius: 100, padding: '4px 12px', fontSize: 12, cursor: 'pointer',
              }}>{v}</button>
            ))}
          </div>
        </Field>
        <Field label="Color preference (description)">
          <input value={form.color_preference} onChange={(e) => setField('color_preference', e.target.value)} style={inputStyle} placeholder="e.g. Earthy with one bold accent" />
          <p style={hint}>Required unless you pick explicit colors below.</p>
        </Field>
        <Field label="Brand colors (optional — explicit hex)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {['primary', 'secondary', 'accent'].map((role) => (
              <div key={role} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ minWidth: 78, fontSize: 12, color: '#94A3B8', textTransform: 'capitalize' }}>{role}</span>
                <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(form.brand_colors[role]) ? form.brand_colors[role] : '#000000'} onChange={(e) => setColor(role, e.target.value)} style={{ width: 36, height: 28, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, background: 'transparent', cursor: 'pointer', padding: 0 }} aria-label={`${role} color`} />
                <input type="text" value={form.brand_colors[role]} onChange={(e) => setColor(role, e.target.value)} placeholder="#RRGGBB" spellCheck={false} style={{ ...inputStyle, flex: 1, fontFamily: 'ui-monospace, monospace' }} />
              </div>
            ))}
          </div>
        </Field>
        <Field label="Inspirations / brand references *">
          <input value={form.inspirations} onChange={(e) => setField('inspirations', e.target.value)} style={inputStyle} placeholder="e.g. Blue Bottle, Stumptown" />
        </Field>
        <Field label="Voice/tone preference (optional)">
          <input value={form.voice_tone_preference} onChange={(e) => setField('voice_tone_preference', e.target.value)} style={inputStyle} placeholder="e.g. Knowledgeable but unpretentious" />
        </Field>
        <Field label="Already have a logo? (optional)">
          <input value={form.existing_logo_url} onChange={(e) => setField('existing_logo_url', e.target.value)} style={inputStyle} placeholder="https://... (public URL to PNG/SVG/JPG)" />
          <p style={hint}>When provided, we skip logo generation and design banners around it.</p>
        </Field>
        <button type="submit" disabled={submitting} style={{
          background: submitting ? 'rgba(0,212,255,0.4)' : 'linear-gradient(135deg, #00D4FF, #0099CC)',
          color: '#020817', border: 'none', borderRadius: 8, padding: '10px 20px',
          fontWeight: 700, fontSize: 14, cursor: submitting ? 'not-allowed' : 'pointer', marginTop: 8,
        }}>{submitting ? 'Starting…' : 'Generate my Brand Kit'}</button>
      </form>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', color: '#94A3B8', fontSize: 12, fontWeight: 500, marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  )
}

const cardStyle = { background: '#0F172A', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 28 }
const h2 = { fontFamily: "'Orbitron', sans-serif", fontSize: 16, fontWeight: 700, color: '#F1F5F9', letterSpacing: '0.04em', marginTop: 0, marginBottom: 12 }
const inputStyle = { width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(0,212,255,0.15)', borderRadius: 8, padding: '10px 12px', color: '#F1F5F9', fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 13, outline: 'none' }
const hint = { color: '#475569', fontSize: 11, margin: '4px 0 0' }
const errorBanner = { display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 12px', color: '#FCA5A5', fontSize: 13, marginBottom: 16 }
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: build succeeds (the component is not yet imported anywhere — this just confirms it compiles).

- [ ] **Step 3: Commit**

```bash
git add src/pages/portal/PortalBrandKitIntakeForm.jsx
git commit -m "feat(brand-kit): client intake form component"
```

---

## Task 5: Wire the form + regenerate into PortalBrandKit

**Files:**
- Modify: `src/pages/portal/PortalBrandKit.jsx`

- [ ] **Step 1: Import the form**

At the top of `src/pages/portal/PortalBrandKit.jsx`, after the existing imports, add:

```jsx
import PortalBrandKitIntakeForm from './PortalBrandKitIntakeForm'
```

- [ ] **Step 2: Replace the empty-state (`!kit`) branch**

Replace the existing `if (!kit) { ... }` block (lines ~61-70) with:

```jsx
  if (!kit) {
    if (client?.hsp_user_id) {
      return <PortalBrandKitIntakeForm onStarted={() => { setLoading(true); loadKit() }} />
    }
    return (
      <div style={cardStyle}>
        <h2 style={h2}>Brand Kit</h2>
        <p style={{ color: '#94A3B8', fontSize: 13 }}>
          No brand kit yet. Your account manager will set one up — you'll see it here once it's ready.
        </p>
      </div>
    )
  }
```

- [ ] **Step 3: Add a "regenerate" mode flag**

Just below the existing `const [error, setError] = useState(null)` (line ~17), add:

```jsx
  const [regenerating, setRegenerating] = useState(false)
```

Then, immediately after the `if (loading) return ...` line (line ~59), add an early branch so the form shows when the client chose to start over (only meaningful for social clients, who are the only ones with a kit they could regenerate):

```jsx
  if (regenerating) {
    return <PortalBrandKitIntakeForm onStarted={() => { setRegenerating(false); setLoading(true); loadKit() }} />
  }
```

- [ ] **Step 4: Add the "Start over" button to the `done` view**

In the `status === 'done'` return block, inside the outer `<div style={cardStyle}>`, immediately after the intro `<p>` (the "All your social media assets…" paragraph, line ~155), add:

```jsx
      <button onClick={() => setRegenerating(true)} style={{
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(0,212,255,0.3)',
        color: '#00D4FF', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600,
        cursor: 'pointer', marginBottom: 18,
      }}>↻ Start over / regenerate</button>
```

- [ ] **Step 5: Add the "Start over" button to the `failed` view**

In the `kit.status === 'failed'` return block, immediately after the `errorBanner` div (line ~80), add:

```jsx
        {client?.hsp_user_id && (
          <button onClick={() => setRegenerating(true)} style={{
            marginTop: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(0,212,255,0.3)',
            color: '#00D4FF', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>↻ Try again</button>
        )}
```

- [ ] **Step 6: Verify the build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/pages/portal/PortalBrandKit.jsx
git commit -m "feat(brand-kit): render intake form + regenerate in portal"
```

---

## Task 6: Transparent-background logos

**Files:**
- Modify: `supabase/functions/generate-brand-kit/index.ts` (OpenAI request body)
- Modify: `supabase/functions/generate-brand-kit/prompts.ts` (logo prompts)

- [ ] **Step 1: Add transparency params to the OpenAI logo request**

In `supabase/functions/generate-brand-kit/index.ts`, in `generateImageWithRetry`, change the request body (currently `model`, `prompt`, `size`, `n`) to include transparency:

```js
        body: JSON.stringify({
          model: 'gpt-image-2',
          prompt,
          size,
          n: 1,
          background: 'transparent',
          output_format: 'png',
        }),
```

- [ ] **Step 2: Rewrite the three logo prompts to ask for transparency**

In `supabase/functions/generate-brand-kit/prompts.ts`, edit the three logo cases:

- `logo_primary`: replace `white background, scalable.` with `on a fully transparent background (no background fill), scalable.`
- `logo_icon`: replace `white background, scalable.` with `on a fully transparent background (no background fill), scalable.`
- `logo_monochrome`: replace `Pure black on white background.` with `Pure single-color mark on a fully transparent background (no background fill).`

- [ ] **Step 3: Type-check the edge function**

Run: `export PATH="$HOME/.deno/bin:$PATH" && deno check supabase/functions/generate-brand-kit/index.ts`
Expected: `Check` passes with no errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/generate-brand-kit/index.ts supabase/functions/generate-brand-kit/prompts.ts
git commit -m "feat(brand-kit): generate logos on transparent backgrounds"
```

> Note: `resizeToFinalDims` (post-process.ts) uses imagescript `Image.decode`/`encode`, which preserves RGBA, and `uploadImage` already sets `image/png`. No change needed there — transparency is preserved end-to-end.

---

## Task 7: CTA only on YouTube cover, outline/ghost style

**Files:**
- Modify: `supabase/functions/generate-brand-kit/compose-banner.ts`

- [ ] **Step 1: Add a `withCta` flag to the layout type**

In `supabase/functions/generate-brand-kit/compose-banner.ts`, add `withCta: boolean` to the `BannerLayout` interface (after `withCopy`):

```ts
  withCopy: boolean                                      // false for tiny/circle assets
  withCta: boolean                                       // CTA button only on the YouTube cover
```

- [ ] **Step 2: Set `withCta` per layout**

In `layoutFor`, add `withCta: true` ONLY to the `banner_yt` case and `withCta: false` to every other case (including the `default`). For example `banner_yt` becomes:

```ts
    case 'banner_yt': // 2560×1440, content must stay in the centered 1546×423 TV-safe strip
      return { mode: 'horizontal', box: { x: 560, y: 540, w: 1440, h: 360 }, logoH: 360, taglineSize: 74, ctaSize: 52, withCopy: true, withCta: true }
```

And every other returned object (`banner_x`, `banner_linkedin_cover`, `banner_fb`, `banner_ig`, `banner_tiktok`, `profile_picture`, and `default`) gets `withCta: false` added to it.

- [ ] **Step 3: Gate CTA rendering on `withCta`**

In `composeBanner`, change the pill creation line from:

```ts
  const pill = layout.withCopy && cta ? await makeCtaPill(font, cta, layout.ctaSize, accentHex, lightHex) : null
```

to:

```ts
  const pill = layout.withCta && cta ? await makeCtaPill(font, cta, layout.ctaSize, accentHex, lightHex) : null
```

- [ ] **Step 4: Rework `makeCtaPill` into an outline/ghost button**

Replace the body of `makeCtaPill` with an outlined version — accent-colored border + accent-colored label, transparent interior:

```ts
// Build a stadium-shaped OUTLINE (ghost) CTA: accent border + accent label, no
// fill, so the scenery shows through. Drawn by stamping a filled accent stadium
// then knocking out the interior with a slightly smaller transparent stadium.
async function makeCtaPill(font: Uint8Array, label: string, fontSize: number, accentHex: string, _unusedTextHex: string): Promise<Image> {
  const text = await Image.renderText(font, fontSize, label, hexToColor(accentHex, 255))
  const padX = Math.round(fontSize * 0.9)
  const padY = Math.round(fontSize * 0.55)
  const pillW = text.width + padX * 2
  const pillH = text.height + padY * 2
  const r = Math.floor(pillH / 2)
  const border = Math.max(2, Math.round(fontSize * 0.08))
  const pill = new Image(pillW, pillH)
  const accent = hexToColor(accentHex, 255)
  const clear = 0x00000000
  // Outer stadium in accent.
  pill.drawBox(r + 1, 1, Math.max(1, pillW - 2 * r), pillH, accent)
  pill.drawCircle(r, Math.floor(pillH / 2), r, accent)
  pill.drawCircle(pillW - r, Math.floor(pillH / 2), r, accent)
  // Knock out the interior to leave only a ring of width `border`.
  const ir = Math.max(1, r - border)
  pill.drawBox(r + 1, 1 + border, Math.max(1, pillW - 2 * r), Math.max(1, pillH - 2 * border), clear)
  pill.drawCircle(r, Math.floor(pillH / 2), ir, clear)
  pill.drawCircle(pillW - r, Math.floor(pillH / 2), ir, clear)
  // Center the accent label inside the ring.
  pill.composite(text, Math.round((pillW - text.width) / 2), Math.round((pillH - text.height) / 2))
  return pill
}
```

- [ ] **Step 5: Type-check the edge function**

Run: `export PATH="$HOME/.deno/bin:$PATH" && deno check supabase/functions/generate-brand-kit/compose-banner.ts`
Expected: `Check` passes (no unused-var error — `_unusedTextHex` is prefixed with `_`).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/generate-brand-kit/compose-banner.ts
git commit -m "feat(brand-kit): YouTube-only ghost CTA on covers"
```

---

## Task 8: Deploy + configure + manual verification

**Files:** none (deploy + config + QA)

- [ ] **Step 1: Set the limit config (optional override of the code default 2)**

The code defaults to `2` when `admin_settings.brand_kit_cycle_limit` is absent, so this is only needed to use a different number. To set it, run (from the haze-tech OneDrive dir with the Mgmt token sourced), or set it in `/admin/settings` if that UI exposes arbitrary keys:

```bash
# from: OneDrive/.../Website Builders/haze-tech-solutions, with .env sourced
# Upsert admin_settings.brand_kit_cycle_limit = "2" via the service role key.
curl -s -X POST "$VITE_SUPABASE_URL/rest/v1/admin_settings?on_conflict=key" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" -H "Prefer: resolution=merge-duplicates" \
  -d '{"key":"brand_kit_cycle_limit","value":"2"}'
```

- [ ] **Step 2: Deploy the edge function (Tasks 6 + 7)**

```bash
# from OneDrive haze-tech dir with .env sourced; SUPABASE_ACCESS_TOKEN=$SUPABASE_MGMT_API_TOKEN
cd /c/repos/haze-tech-solutions
npx --yes supabase@latest functions deploy generate-brand-kit --project-ref ioxpfvxcsclgmwyslxjj --use-api
```

Expected: `Deployed Functions on project ioxpfvxcsclgmwyslxjj: generate-brand-kit`.

- [ ] **Step 3: Push to deploy api + frontend (Vercel auto-deploys main)**

```bash
git push origin main
```

- [ ] **Step 4: Manual QA checklist**

- A social client (has `hsp_user_id`) with no kit sees the intake form in the Brand Kit tab; a non-social client sees the "account manager" message.
- Submitting the form returns 200 and the page flips to the logo-approval flow; approving a logo finishes banners → `done`.
- The finished kit's logos are **transparent** (download a logo, confirm no opaque background).
- Re-rendered covers show the CTA **only** on the YouTube banner, and it's an **outline/ghost** button; other covers show the tagline only.
- Hitting "Start over" past the configured limit returns the friendly `limit_reached` message with a reset date; a `failed` kit does not consume an attempt.
- Admin flow (`/admin/clients/<id>` → Start Brand Kit) still works unchanged.

- [ ] **Step 5: Final commit (if any QA fixes were needed)**

```bash
git add -A && git commit -m "fix(brand-kit): QA follow-ups for client self-serve"
```

---

## Self-Review Notes

- **Spec coverage:** A (Tasks 1,3,4,5) · B (Tasks 2,3 + Task 8 config) · C (Task 6) · D (Task 7). All four spec sections map to tasks.
- **Types/names consistent:** `validateBrandKitInputs` → `{ ok, error }`; `evaluateBrandKitLimit` → `{ allowed, used, limit, resetsAt }`; `resolveBillingPeriod` → `{ periodStart, resetsAt }`; layout flag `withCta` used in both `layoutFor` and `composeBanner`.
- **No migration:** limit is an `admin_settings` row with a code default; no schema change.

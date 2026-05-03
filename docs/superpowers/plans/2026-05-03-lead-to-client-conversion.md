# Lead → Client Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-click "Convert" button to the admin Leads page that creates a client (with magic-link invite) and links the lead forward, with email-collision detection.

**Architecture:** New Vercel API route orchestrates the conversion (auth gate → invite via `inviteUserByEmail` → insert client → mark lead with `converted_to_client_id`). Email-collision returns 409, frontend offers a "link to existing client" path. New `/portal/accept-invite` page handles the invited user's password setup. No automated tests — codebase has no test framework; verification is via curl + manual UI smoke test (matches brand-kit feature pattern).

**Tech Stack:** React + Vite + react-router-dom, Vercel serverless (`api/`), Supabase Auth + Postgres, PostHog telemetry.

**Spec:** `docs/superpowers/specs/2026-05-03-lead-to-client-conversion-design.md`

---

## File Structure

| File | Action | Purpose |
|---|---|---|
| `supabase-schema.sql` | Modify (append) | Append migration block for the new column + index |
| `api/convert-lead.js` | Create | Vercel route: full convert + link-only modes |
| `src/pages/admin/components/ConvertLeadModal.jsx` | Create | Three sub-states: form, collision-confirm, success |
| `src/pages/admin/Leads.jsx` | Modify | Add Convert button + ✓ Converted badge + modal wiring |
| `src/pages/portal/AcceptInvite.jsx` | Create | Password-set landing page for invited users |
| `src/App.jsx` | Modify | Register `/portal/accept-invite` route |

---

## Pre-flight

Working repo: `c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions/`. All `git`, `npm`, and file paths in this plan are relative to that directory unless otherwise noted.

Supabase project ref: `ioxpfvxcsclgmwyslxjj`. Mgmt token + service role key are in chat scrollback / `.env`. The token has been flagged for rotation — if it's been rotated since this plan was written, ask the user for the new one before Task 1.

Make a feature branch before starting:
```bash
git -C "<repo>" checkout -b feat/convert-lead-to-client
```

---

## Task 1: Schema migration

**Files:**
- Modify: `supabase-schema.sql` (append at end of file)

- [ ] **Step 1: Append migration to schema file**

Append this block to the END of `supabase-schema.sql`:

```sql

-- ─── Lead → Client conversion (2026-05-03) ────────────────────────────
-- Forward link from a converted lead to the client it became.
-- ON DELETE SET NULL: if a client is removed, the lead remains as
-- historical record but the link clears.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS converted_to_client_id uuid
  REFERENCES clients(id) ON DELETE SET NULL;

-- Partial index — most leads will not be converted, so keep index small.
CREATE INDEX IF NOT EXISTS leads_converted_to_client_id_idx
  ON leads(converted_to_client_id) WHERE converted_to_client_id IS NOT NULL;
```

- [ ] **Step 2: Apply migration to production Supabase via Mgmt API**

```bash
SUPABASE_TOKEN=<mgmt-token-from-env>
curl -s -X POST "https://api.supabase.com/v1/projects/ioxpfvxcsclgmwyslxjj/database/query" \
  -H "Authorization: Bearer $SUPABASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"ALTER TABLE leads ADD COLUMN IF NOT EXISTS converted_to_client_id uuid REFERENCES clients(id) ON DELETE SET NULL; CREATE INDEX IF NOT EXISTS leads_converted_to_client_id_idx ON leads(converted_to_client_id) WHERE converted_to_client_id IS NOT NULL;"}'
```

Expected: `[]` (empty array = success for DDL).

- [ ] **Step 3: Verify column exists**

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/ioxpfvxcsclgmwyslxjj/database/query" \
  -H "Authorization: Bearer $SUPABASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='\''leads'\'' AND column_name='\''converted_to_client_id'\'';"}'
```

Expected: `[{"column_name":"converted_to_client_id","data_type":"uuid","is_nullable":"YES"}]`

- [ ] **Step 4: Commit**

```bash
git add supabase-schema.sql
git commit -m "feat(leads): add converted_to_client_id column + index"
```

---

## Task 2: API route `convert-lead.js` — full convert mode

**Files:**
- Create: `api/convert-lead.js`

- [ ] **Step 1: Create the file with full-convert logic**

Create `api/convert-lead.js`:

```javascript
import { createClient } from '@supabase/supabase-js'

const SITE_URL = process.env.VITE_SITE_URL || 'https://www.hazetechsolutions.com'

function err(res, status, code, message, extras = {}) {
  return res.status(status).json({ error: code, message, ...extras })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return err(res, 405, 'method_not_allowed', 'POST only')
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

  if (!serviceKey) return err(res, 500, 'config_error', 'Service role key not configured')

  const authHeader = req.headers.authorization
  if (!authHeader) return err(res, 401, 'unauthorized', 'Missing authorization header')

  const userClient = createClient(supabaseUrl, anonKey)
  const { data: { user: caller }, error: authError } =
    await userClient.auth.getUser(authHeader.replace('Bearer ', ''))
  if (authError || !caller) return err(res, 401, 'unauthorized', 'Invalid token')

  const adminClient = createClient(supabaseUrl, serviceKey)

  // Admin gate: caller must NOT be a row in clients
  const { data: callerClient } = await adminClient
    .from('clients').select('id').eq('user_id', caller.id).maybeSingle()
  if (callerClient) return err(res, 403, 'forbidden', 'Only admins can convert leads')

  const body = req.body || {}
  const { lead_id, link_only, existing_client_id } = body
  if (!lead_id) return err(res, 400, 'bad_request', 'lead_id required')

  // Load lead
  const { data: lead, error: leadErr } = await adminClient
    .from('leads').select('id, name, email, business_name, converted_to_client_id').eq('id', lead_id).single()
  if (leadErr || !lead) return err(res, 404, 'lead_not_found', 'Lead not found')

  if (lead.converted_to_client_id) {
    return err(res, 409, 'already_converted', 'Lead has already been converted',
      { existing_client_id: lead.converted_to_client_id })
  }

  if (!lead.email) return err(res, 400, 'bad_request', 'Lead has no email')

  // ─── Link-only mode ──────────────────────────────────────────────
  if (link_only) {
    if (!existing_client_id) return err(res, 400, 'bad_request', 'existing_client_id required for link_only')

    const { data: existing, error: exErr } = await adminClient
      .from('clients').select('id, email, name').eq('id', existing_client_id).single()
    if (exErr || !existing) return err(res, 404, 'client_not_found', 'Existing client not found')

    if (existing.email !== lead.email) {
      return err(res, 400, 'email_mismatch', 'Existing client email does not match lead email')
    }

    const { error: linkErr } = await adminClient
      .from('leads').update({ status: 'closed', converted_to_client_id: existing.id }).eq('id', lead.id)
    if (linkErr) return err(res, 500, 'lead_update_failed', linkErr.message)

    return res.status(200).json({
      client_id: existing.id,
      lead_id: lead.id,
      invite_sent: false,
      mode: 'link_only',
    })
  }

  // ─── Full convert mode ──────────────────────────────────────────
  const { name, company, phone, product, price, subscription_terms } = body
  if (!name) return err(res, 400, 'bad_request', 'name required')

  // Pre-flight email collision check
  const { data: existingByEmail } = await adminClient
    .from('clients').select('id, name, email').eq('email', lead.email).maybeSingle()
  if (existingByEmail) {
    return err(res, 409, 'client_exists', 'A client with this email already exists', {
      existing_client_id: existingByEmail.id,
      existing_client_name: existingByEmail.name,
    })
  }

  // Send invite
  const { data: inviteData, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(
    lead.email,
    { redirectTo: `${SITE_URL}/portal/accept-invite` }
  )
  if (inviteErr) {
    const msg = (inviteErr.message || '').toLowerCase()
    if (msg.includes('rate limit') || inviteErr.status === 429) {
      return err(res, 429, 'invite_rate_limited',
        'Email rate limit reached. Try again in an hour or set up custom SMTP at /admin/secrets.')
    }
    return err(res, 500, 'invite_failed', inviteErr.message)
  }

  const newUserId = inviteData?.user?.id
  if (!newUserId) return err(res, 500, 'invite_failed', 'Invite returned no user id')

  // Insert client row
  const { data: client, error: clientErr } = await adminClient
    .from('clients')
    .insert({
      user_id: newUserId,
      name,
      email: lead.email,
      company: company || null,
      phone: phone || null,
      product: product || null,
      price: price != null && price !== '' ? Number(price) : null,
      subscription_terms: subscription_terms || null,
    })
    .select('id')
    .single()

  if (clientErr) {
    // Rollback: delete the invited auth user
    await adminClient.auth.admin.deleteUser(newUserId).catch(e => console.error('rollback delete failed:', e))
    return err(res, 500, 'client_insert_failed', clientErr.message)
  }

  // Update lead — log warning if it fails but don't fail the whole request
  const { error: leadUpdateErr } = await adminClient
    .from('leads').update({ status: 'closed', converted_to_client_id: client.id }).eq('id', lead.id)
  if (leadUpdateErr) {
    console.warn(`convert-lead: client ${client.id} created but lead ${lead.id} update failed:`, leadUpdateErr.message)
  }

  return res.status(200).json({
    client_id: client.id,
    lead_id: lead.id,
    invite_sent: true,
    mode: 'full',
    lead_update_warning: leadUpdateErr ? leadUpdateErr.message : null,
  })
}
```

- [ ] **Step 2: Verify the file parses (no runtime test yet — needs deploy)**

```bash
node --check api/convert-lead.js
```

Expected: no output (silent success).

- [ ] **Step 3: Commit**

```bash
git add api/convert-lead.js
git commit -m "feat(api): add convert-lead route (full + link-only modes)"
```

---

## Task 3: ConvertLeadModal component

**Files:**
- Create: `src/pages/admin/components/ConvertLeadModal.jsx`

- [ ] **Step 1: Create the modal**

Create `src/pages/admin/components/ConvertLeadModal.jsx`:

```jsx
import { useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { trackEvent } from '../../../lib/telemetry'
import { X, Send, Link2, CheckCircle2, AlertCircle } from 'lucide-react'

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(0,212,255,0.15)',
  borderRadius: 8, padding: '9px 11px',
  color: '#F1F5F9', fontFamily: "'Plus Jakarta Sans', sans-serif",
  fontSize: 13, outline: 'none',
}

const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 600, color: '#94A3B8',
  letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 5,
}

export default function ConvertLeadModal({ lead, onClose, onConverted }) {
  // sub-state: 'form' | 'collision' | 'success'
  const [view, setView] = useState('form')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // form fields — name and company prefilled, email locked
  const [form, setForm] = useState({
    name: lead.name || '',
    company: lead.business_name || '',
    phone: '',
    product: '',
    price: '',
    subscription_terms: '',
  })

  // collision state
  const [collision, setCollision] = useState(null)  // { existing_client_id, existing_client_name }

  // success state
  const [result, setResult] = useState(null)  // { client_id, mode }

  if (!lead) return null

  const setField = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  async function postConvert(payload) {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/convert-lead', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    return { res, data }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!form.name.trim()) { setError('Name is required'); return }

    setSubmitting(true)
    const startedAt = Date.now()
    trackEvent('lead_convert_started', { lead_id: lead.id, lead_source: lead.source || 'contact' })

    try {
      const { res, data } = await postConvert({
        lead_id: lead.id,
        name: form.name,
        company: form.company || null,
        phone: form.phone || null,
        product: form.product || null,
        price: form.price || null,
        subscription_terms: form.subscription_terms || null,
      })

      if (res.status === 409 && data.error === 'client_exists') {
        setCollision({
          existing_client_id: data.existing_client_id,
          existing_client_name: data.existing_client_name,
        })
        setView('collision')
        trackEvent('lead_convert_email_collision', {
          lead_id: lead.id,
          existing_client_id: data.existing_client_id,
        })
        return
      }

      if (!res.ok) {
        setError(data.message || 'Conversion failed')
        trackEvent('lead_convert_failed', {
          lead_id: lead.id,
          error_code: data.error,
          mode: 'full',
        })
        return
      }

      setResult({ client_id: data.client_id, mode: data.mode })
      setView('success')
      trackEvent('lead_convert_completed', {
        lead_id: lead.id,
        client_id: data.client_id,
        mode: data.mode,
        duration_ms: Date.now() - startedAt,
      })
      onConverted?.(data.client_id)
    } catch (e) {
      setError(e.message || 'Network error')
      trackEvent('lead_convert_failed', { lead_id: lead.id, error_code: 'network', mode: 'full' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLinkExisting() {
    setError(null)
    setSubmitting(true)
    const startedAt = Date.now()

    try {
      const { res, data } = await postConvert({
        lead_id: lead.id,
        link_only: true,
        existing_client_id: collision.existing_client_id,
      })

      if (!res.ok) {
        setError(data.message || 'Link failed')
        trackEvent('lead_convert_failed', { lead_id: lead.id, error_code: data.error, mode: 'link_only' })
        return
      }

      setResult({ client_id: data.client_id, mode: data.mode })
      setView('success')
      trackEvent('lead_convert_completed', {
        lead_id: lead.id,
        client_id: data.client_id,
        mode: 'link_only',
        duration_ms: Date.now() - startedAt,
      })
      onConverted?.(data.client_id)
    } catch (e) {
      setError(e.message || 'Network error')
      trackEvent('lead_convert_failed', { lead_id: lead.id, error_code: 'network', mode: 'link_only' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={e => e.stopPropagation()} style={modal}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#F1F5F9', marginBottom: 4 }}>
              {view === 'success' ? 'Conversion complete' : 'Convert lead to client'}
            </div>
            <div style={{ fontSize: 12, color: '#475569' }}>
              {lead.name} · {lead.email}
            </div>
          </div>
          <button onClick={onClose} style={closeBtn}><X size={18} /></button>
        </div>

        {/* Error banner */}
        {error && (
          <div style={errorBanner}>
            <AlertCircle size={14} /><span>{error}</span>
          </div>
        )}

        {/* ─── FORM VIEW ─── */}
        {view === 'form' && (
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Email (locked)</label>
                <input style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }} value={lead.email} disabled />
              </div>
              <div>
                <label style={labelStyle}>Name *</label>
                <input style={inputStyle} value={form.name} onChange={e => setField('name', e.target.value)} required />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Company</label>
                <input style={inputStyle} value={form.company} onChange={e => setField('company', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input style={inputStyle} value={form.phone} onChange={e => setField('phone', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Product</label>
                <input style={inputStyle} value={form.product} onChange={e => setField('product', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Price ($)</label>
                <input style={inputStyle} type="number" step="0.01" value={form.price} onChange={e => setField('price', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Subscription Terms</label>
                <input style={inputStyle} value={form.subscription_terms} onChange={e => setField('subscription_terms', e.target.value)} placeholder="monthly, annual, one-time…" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button type="button" onClick={onClose} disabled={submitting} style={ghostBtn}>Cancel</button>
              <button type="submit" disabled={submitting} style={primaryBtn}>
                <Send size={13} />
                {submitting ? 'Converting…' : 'Convert & invite'}
              </button>
            </div>
          </form>
        )}

        {/* ─── COLLISION VIEW ─── */}
        {view === 'collision' && (
          <div>
            <div style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: 10, padding: 14, marginBottom: 14, color: '#FACC15', fontSize: 13, lineHeight: 1.5 }}>
              A client named <strong>{collision.existing_client_name}</strong> with email <strong>{lead.email}</strong> already exists. Link this lead to them instead? (No new client will be created.)
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={onClose} disabled={submitting} style={ghostBtn}>Cancel</button>
              <button onClick={handleLinkExisting} disabled={submitting} style={primaryBtn}>
                <Link2 size={13} />
                {submitting ? 'Linking…' : 'Link to existing client'}
              </button>
            </div>
          </div>
        )}

        {/* ─── SUCCESS VIEW ─── */}
        {view === 'success' && (
          <div>
            <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10, padding: 14, marginBottom: 14, color: '#4ADE80', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 size={16} />
              {result.mode === 'link_only'
                ? 'Lead linked to existing client.'
                : `Invite sent to ${lead.email}. Client created.`}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={ghostBtn}>Close</button>
              <a href={`/admin/clients/${result.client_id}`} style={{ ...primaryBtn, textDecoration: 'none' }}>
                Open client
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const overlay = {
  position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
}
const modal = {
  background: '#0F172A', border: '1px solid rgba(0,212,255,0.2)',
  borderRadius: 16, padding: 24, width: '100%', maxWidth: 520,
  boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
  fontFamily: "'Plus Jakarta Sans', sans-serif",
}
const closeBtn = { background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: 2 }
const errorBanner = {
  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
  borderRadius: 8, padding: '10px 12px', marginBottom: 12,
  color: '#FCA5A5', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8,
}
const ghostBtn = {
  padding: '8px 14px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8, color: '#94A3B8', fontSize: 13, fontWeight: 500,
  fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer',
}
const primaryBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 14px', background: 'linear-gradient(135deg, #00D4FF, #0099CC)',
  border: 'none', borderRadius: 8, color: '#020817', fontSize: 13, fontWeight: 700,
  fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer',
}
```

- [ ] **Step 2: Verify it parses**

```bash
node --check src/pages/admin/components/ConvertLeadModal.jsx 2>&1 || echo "JSX expected — vite handles it"
```

(node --check doesn't understand JSX — failure is expected. The real verification is the dev server in Task 5.)

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/components/ConvertLeadModal.jsx
git commit -m "feat(admin): convert-lead modal (form, collision, success states)"
```

---

## Task 4: Wire modal into Leads.jsx

**Files:**
- Modify: `src/pages/admin/Leads.jsx`

- [ ] **Step 1: Add import for the modal + CheckCircle2 icon**

At the top of `src/pages/admin/Leads.jsx`, modify the lucide-react import to add `CheckCircle2` and `UserPlus`:

```jsx
import {
  Users, Search, Download, RefreshCw, AlertCircle,
  ChevronDown, FileX, Filter, BarChart2, X, ExternalLink, FileText,
  CheckCircle2, UserPlus,
} from 'lucide-react'
```

After the existing component imports (the supabase import line), add:

```jsx
import ConvertLeadModal from './components/ConvertLeadModal'
```

- [ ] **Step 2: Add `converted_to_client_id` to the SELECT**

In the `fetchLeads` callback (around `Leads.jsx:344-346`), update the `.select()` call to include the new column:

```jsx
.select('id, name, email, business_name, service_interest, source, url, perf_score, seo_score, mobile_score, security_score, cro_score, overall_score, status, notes, created_at, converted_to_client_id')
```

- [ ] **Step 3: Add modal state to the `Leads` component**

Inside the `Leads` component function, after the existing `useState` declarations (around line 333-339), add:

```jsx
const [convertingLead, setConvertingLead] = useState(null)
```

- [ ] **Step 4: Render the modal in the JSX**

Add right after the existing `<AutomationReportModal>` line (around `Leads.jsx:393`):

```jsx
<ConvertLeadModal
  lead={convertingLead}
  onClose={() => setConvertingLead(null)}
  onConverted={(client_id) => {
    // Optimistic local update so the badge appears without refetch
    if (convertingLead) {
      handleUpdate(convertingLead.id, 'converted_to_client_id', client_id)
      handleUpdate(convertingLead.id, 'status', 'closed')
    }
  }}
/>
```

- [ ] **Step 5: Add the Convert button + ✓ Converted badge in the action cell**

In the action `<td>` (around `Leads.jsx:542-563`), the column currently renders the Audit and AI Plan buttons. Replace that entire `<td style={styles.td}>` block with:

```jsx
<td style={styles.td}>
  {lead.converted_to_client_id ? (
    <a
      href={`/admin/clients/${lead.converted_to_client_id}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 7, color: '#4ADE80', fontSize: 12, textDecoration: 'none', whiteSpace: 'nowrap', marginBottom: 4 }}
      title="Open the client this lead was converted to"
    >
      <CheckCircle2 size={12} /> Converted
    </a>
  ) : (
    <button
      onClick={() => setConvertingLead(lead)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 7, color: '#00D4FF', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap', marginBottom: 4 }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,212,255,0.22)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,212,255,0.12)' }}
      title="Convert this lead to a client"
    >
      <UserPlus size={12} /> Convert
    </button>
  )}
  {lead.source === 'audit' && (
    <button
      onClick={() => setSelectedAudit(lead)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 7, color: '#A78BFA', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap', marginBottom: 4 }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.22)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.12)' }}
    >
      <BarChart2 size={12} /> Audit
    </button>
  )}
  {(lead.service_interest === 'AI Automation' || lead.service_interest === 'All Three') && (
    <button
      onClick={() => setSelectedReport(lead)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 7, color: '#00D4FF', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,212,255,0.22)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,212,255,0.12)' }}
    >
      <FileText size={12} /> AI Plan
    </button>
  )}
</td>
```

- [ ] **Step 6: Update the table header label for the action column**

In the `<thead>` (around `Leads.jsx:488`), change `'Report'` to `'Actions'` in the header array:

```jsx
{['Name', 'Email', 'Business', 'Service Interest', 'Source', 'Date', 'Status', 'Notes', 'Actions'].map(h => (
```

- [ ] **Step 7: Run the dev server and verify the page renders**

```bash
npm run dev
```

Then open `http://localhost:5173/admin/leads` (after logging in). Verify:
- The leads table loads without console errors
- Every lead row shows either a "Convert" button (for unconverted) or "✓ Converted" badge (for any rows that have a non-null `converted_to_client_id` — there should be none yet)
- Clicking Convert opens the modal with email locked, name + company prefilled

Don't actually submit yet — that's smoke-tested end-to-end in Task 7.

- [ ] **Step 8: Commit**

```bash
git add src/pages/admin/Leads.jsx
git commit -m "feat(leads): add Convert button + ✓ Converted badge to lead rows"
```

---

## Task 5: AcceptInvite landing page

**Files:**
- Create: `src/pages/portal/AcceptInvite.jsx`

- [ ] **Step 1: Create the page**

Create `src/pages/portal/AcceptInvite.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { CheckCircle2, AlertCircle } from 'lucide-react'

export default function AcceptInvite() {
  const navigate = useNavigate()
  // 'verifying' | 'ready' | 'invalid' | 'submitting' | 'success'
  const [view, setView] = useState('verifying')
  const [error, setError] = useState(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  useEffect(() => {
    let cancelled = false

    // Supabase JS auto-detects session in URL hash. We watch for SIGNED_IN
    // and verify the URL hash contains type=invite (vs a normal login).
    const hash = window.location.hash || ''
    const isInvite = hash.includes('type=invite') || hash.includes('type=recovery')

    // Give the supabase client a brief moment to process the URL hash, then check session.
    const timer = setTimeout(async () => {
      if (cancelled) return
      const { data: { session } } = await supabase.auth.getSession()
      if (session && isInvite) {
        setView('ready')
      } else if (session && !isInvite) {
        // Already logged in (returning visitor) — bounce to portal
        navigate('/portal', { replace: true })
      } else {
        setView('invalid')
      }
    }, 600)

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return
      if ((event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') && session && isInvite) {
        setView('ready')
      }
    })

    return () => {
      cancelled = true
      clearTimeout(timer)
      sub.subscription.unsubscribe()
    }
  }, [navigate])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }

    setView('submitting')
    const { error: updateErr } = await supabase.auth.updateUser({ password })
    if (updateErr) {
      setError(updateErr.message)
      setView('ready')
      return
    }

    setView('success')
    setTimeout(() => navigate('/portal', { replace: true }), 1200)
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ marginBottom: 22, textAlign: 'center' }}>
          <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 18, fontWeight: 700, color: '#00D4FF', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
            Haze Tech Solutions
          </div>
          <div style={{ fontSize: 13, color: '#94A3B8' }}>Welcome — set up your client portal</div>
        </div>

        {view === 'verifying' && (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#475569', fontSize: 13 }}>
            Verifying invite…
          </div>
        )}

        {view === 'invalid' && (
          <div style={errorPanel}>
            <AlertCircle size={20} />
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Invite link expired or invalid</div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>Please contact your account manager to receive a new invite.</div>
            </div>
          </div>
        )}

        {(view === 'ready' || view === 'submitting') && (
          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{ ...errorPanel, marginBottom: 14 }}>
                <AlertCircle size={16} />
                <div style={{ fontSize: 13 }}>{error}</div>
              </div>
            )}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>New password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                disabled={view === 'submitting'}
                style={inputStyle}
                autoComplete="new-password"
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                minLength={8}
                disabled={view === 'submitting'}
                style={inputStyle}
                autoComplete="new-password"
              />
            </div>
            <button type="submit" disabled={view === 'submitting'} style={primaryBtn}>
              {view === 'submitting' ? 'Setting password…' : 'Set password & continue'}
            </button>
          </form>
        )}

        {view === 'success' && (
          <div style={successPanel}>
            <CheckCircle2 size={20} />
            <div>
              <div style={{ fontWeight: 600 }}>Password set</div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>Redirecting to your portal…</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const pageStyle = {
  minHeight: '100vh',
  background: 'linear-gradient(180deg, #020817 0%, #0F172A 100%)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 24, fontFamily: "'Plus Jakarta Sans', sans-serif",
}
const cardStyle = {
  background: '#0F172A', border: '1px solid rgba(0,212,255,0.2)',
  borderRadius: 16, padding: 32, width: '100%', maxWidth: 380,
  boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
}
const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 600, color: '#94A3B8',
  letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6,
}
const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(0,212,255,0.15)',
  borderRadius: 8, padding: '10px 12px',
  color: '#F1F5F9', fontFamily: "'Plus Jakarta Sans', sans-serif",
  fontSize: 13, outline: 'none',
}
const primaryBtn = {
  width: '100%', padding: '11px 14px',
  background: 'linear-gradient(135deg, #00D4FF, #0099CC)',
  border: 'none', borderRadius: 8, color: '#020817',
  fontSize: 13, fontWeight: 700,
  fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer',
}
const errorPanel = {
  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
  borderRadius: 10, padding: 14, color: '#FCA5A5',
  display: 'flex', alignItems: 'flex-start', gap: 10,
}
const successPanel = {
  background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
  borderRadius: 10, padding: 14, color: '#4ADE80',
  display: 'flex', alignItems: 'center', gap: 10,
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/portal/AcceptInvite.jsx
git commit -m "feat(portal): add AcceptInvite landing page for invited clients"
```

---

## Task 6: Register the route

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Add import for AcceptInvite**

In `src/App.jsx`, find the existing portal imports (the block containing `import PortalLogin from './pages/portal/PortalLogin'`) and add this line right after them:

```jsx
import AcceptInvite    from './pages/portal/AcceptInvite'
```

- [ ] **Step 2: Add the route**

In `src/App.jsx`, find the public routes block (the `<Route path="/" element={<MainSite />} />` area, around line 54-59). Add this line right after the existing `/free-social-audit` route, but BEFORE the protected `/admin` block:

```jsx
<Route path="/portal/accept-invite" element={<AcceptInvite />} />
```

It should sit alongside the public `/audit` and `/blog` routes, NOT under any auth guard — invited users land here without being logged in.

- [ ] **Step 3: Verify the dev server starts and route resolves**

```bash
npm run dev
```

Open `http://localhost:5173/portal/accept-invite` directly in browser. Expected: the page renders showing "Verifying invite…" briefly then "Invite link expired or invalid" (since there's no token in the URL — that's the correct behavior for a direct visit).

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat(routing): register /portal/accept-invite public route"
```

---

## Task 7: End-to-end smoke test + PR

- [ ] **Step 1: Push branch and open a PR**

```bash
git push -u origin feat/convert-lead-to-client
gh pr create --title "feat: convert leads to clients" --body "$(cat <<'EOF'
## Summary
- One-click "Convert" button on each lead row in `/admin/leads`
- New `api/convert-lead.js` orchestrates `inviteUserByEmail` + client insert + lead linking
- Email-collision detection with "link to existing client" path
- New `/portal/accept-invite` page for invited users to set their password
- Schema: new `leads.converted_to_client_id` column + partial index (already applied to prod)

## Test plan
- [ ] Open `/admin/leads`, verify Convert button shows on unconverted lead rows
- [ ] Convert a fresh lead → modal opens → submit → "Invite sent ✓" success state → click "Open client" → lands on `/admin/clients/:id`
- [ ] Lead row now shows green "✓ Converted" badge linking to the new client
- [ ] Invited user receives email; clicking link lands on `/portal/accept-invite` → sets password → redirected to `/portal`
- [ ] Try converting a second lead with the same email as an existing client → modal flips to "client already exists, link?" → click Link → success → lead linked, no duplicate client
- [ ] Try converting an already-converted lead — should not be possible (button hidden)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: After Vercel preview deploy, smoke test on the preview URL**

When the PR comment from Vercel appears with a preview URL, run through this flow:

1. Sign in to the preview URL's `/admin/login` as admin
2. Go to `/admin/leads` — find a lead with a real email you control (or create a throwaway lead via the contact form)
3. Click **Convert** on that lead
4. Fill in name (prefilled), product = "Test Product", price = 1, others blank
5. Click **Convert & invite**
6. Expect: success state with "Invite sent to <email> ✓ Client created"
7. Click **Open client** — lands on `/admin/clients/<new-id>`
8. Verify lead row in `/admin/leads` now shows green "✓ Converted" badge
9. Check the email inbox for the invited address — invite email should arrive
10. Click the email link — lands on preview URL's `/portal/accept-invite`
11. Set a password — should redirect to `/portal` and show the dashboard

Then test the collision path:
12. Create a second test lead with the same email you just converted
13. Try to Convert it — modal should flip to the "client already exists" warning
14. Click **Link to existing client** — success state, second lead now shows ✓ Converted linking to the same client

If all 14 steps pass, request merge. If any fail, capture the failure (screenshot, network response, browser console) and report back before merging.

- [ ] **Step 3: Cleanup test data after merge**

After merging and the smoke-test passes, manually clean up the test client + auth user via Supabase dashboard or Mgmt API. The test leads can be left as `closed`+`converted_to_client_id` historical rows or deleted. Up to admin preference.

---

## Self-review checklist (engineer should verify before declaring done)

- [ ] Schema column `leads.converted_to_client_id` exists in production
- [ ] `api/convert-lead.js` returns 401 with no auth header (curl test)
- [ ] `api/convert-lead.js` returns 403 when called by a non-admin user
- [ ] Lead row shows Convert button when not converted, ✓ Converted badge when converted
- [ ] Modal email field is locked (disabled), name + company are prefilled, others empty
- [ ] Email-collision path: 409 from API → modal flips to collision view → link works
- [ ] Invite email is delivered (check inbox, not just "no error from Supabase")
- [ ] AcceptInvite page sets password and redirects to /portal
- [ ] PostHog Activity dashboard shows `lead_convert_started` and `lead_convert_completed` events after a conversion

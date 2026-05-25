// src/pages/admin/components/BrandKitIntakeForm.jsx
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'

const VIBE_OPTIONS = [
  'minimalist', 'warm', 'premium', 'playful', 'bold', 'organic',
  'corporate', 'futuristic', 'vintage', 'edgy', 'friendly', 'serious',
]

// Draft autosave — survives refreshes so admins don't lose long-form input.
// Scoped per client so different clients keep separate drafts.
const draftKey = (clientId) => `brand-kit-draft-${clientId}`
const readDraft = (clientId) => {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(draftKey(clientId))
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}
const writeDraft = (clientId, form) => {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(draftKey(clientId), JSON.stringify(form)) } catch { /* quota / private mode */ }
}
const clearDraft = (clientId) => {
  if (typeof window === 'undefined') return
  try { localStorage.removeItem(draftKey(clientId)) } catch { /* ignore */ }
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(0,212,255,0.15)',
  borderRadius: 8, padding: '10px 12px',
  color: '#F1F5F9', fontFamily: '"Plus Jakarta Sans", sans-serif',
  fontSize: 13, outline: 'none',
}

export default function BrandKitIntakeForm({ client, linkedAudit, onStarted }) {
  const isPath1 = !!linkedAudit

  // Prefill from audit when present
  const auditInputs = linkedAudit?.inputs || {}
  const initial = useMemo(() => ({
    business_name: client.company || client.name || '',
    business_description: '',
    industry: auditInputs.industry || '',
    audience: auditInputs.audience || '',
    vibe: [],
    color_preference: '',
    inspirations: '',
    voice_tone_preference: '',
    goal: auditInputs.goal || '',
    challenge: auditInputs.challenge || '',
    // Explicit hex picks; empty when the admin wants the AI to design a palette.
    brand_colors: { primary: '', secondary: '', accent: '' },
    // Optional URL to an existing logo — skips the 3-logo generation entirely.
    existing_logo_url: '',
    // Optional scene/backdrop direction injected only into banner + profile-picture
    // image prompts (logos stay clean).
    imagery_direction: '',
  }), [client, auditInputs])

  // Hydrate from localStorage on first mount; merge over `initial` so any
  // prefilled audit fields still shine through if the draft was saved before.
  const [form, setForm] = useState(() => {
    const draft = readDraft(client.id)
    return draft ? { ...initial, ...draft } : initial
  })
  const [draftRestored, setDraftRestored] = useState(() => !!readDraft(client.id))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // Autosave every form change. Cheap — small JSON, no debounce needed.
  useEffect(() => {
    writeDraft(client.id, form)
  }, [client.id, form])

  const discardDraft = () => {
    clearDraft(client.id)
    setForm(initial)
    setDraftRestored(false)
  }

  const setField = (k, v) => setForm(prev => ({ ...prev, [k]: v }))
  const toggleVibe = (v) => setField('vibe', form.vibe.includes(v) ? form.vibe.filter(x => x !== v) : [...form.vibe, v])
  const setColor = (role, hex) => setForm(prev => ({ ...prev, brand_colors: { ...prev.brand_colors, [role]: hex } }))

  // Extract valid #RRGGBB hex picks; ignore partial input while typing.
  const validBrandColors = ['primary', 'secondary', 'accent']
    .map(name => ({ name, hex: form.brand_colors[name] }))
    .filter(c => /^#[0-9a-fA-F]{6}$/.test(c.hex))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    // Required field check (color_preference is required only when brand_colors is empty).
    const requiredColdStart = ['business_name', 'business_description', 'industry', 'audience', 'inspirations']
    const requiredAuditPrefill = ['business_name', 'industry', 'audience', 'inspirations']
    const required = isPath1 ? requiredAuditPrefill : requiredColdStart
    for (const f of required) {
      if (!form[f] || (Array.isArray(form[f]) && form[f].length === 0)) {
        setError(`Missing required field: ${f.replace(/_/g, ' ')}`)
        return
      }
    }
    if (form.vibe.length === 0) {
      setError('Pick at least one vibe descriptor')
      return
    }
    if (!form.color_preference.trim() && validBrandColors.length === 0) {
      setError('Either describe the color preference OR pick explicit brand colors below.')
      return
    }
    if (form.existing_logo_url && !/^https?:\/\//.test(form.existing_logo_url.trim())) {
      setError('Existing logo URL must start with http:// or https://')
      return
    }

    setSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      // Strip the per-role hex object — we send the validated array shape.
      const { brand_colors: _bc, ...formClean } = form
      const inputs = {
        path: isPath1 ? 'audit_prefill' : 'cold_start',
        ...formClean,
        existing_logo_url: form.existing_logo_url.trim() || undefined,
        imagery_direction: form.imagery_direction.trim() || undefined,
        ...(validBrandColors.length > 0 ? { brand_colors: validBrandColors } : {}),
      }
      const res = await fetch('/api/start-brand-kit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          client_id: client.id,
          source_audit_id: linkedAudit?.id || null,
          inputs,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || data.error || `Request failed: ${res.status}`)
      // Successful submit — wipe the saved draft so the next kit for this
      // client starts clean (admin can re-fill from scratch or "Start over"
      // will repopulate from this same client's defaults).
      clearDraft(client.id)
      onStarted(data.kit_id)
    } catch (err) {
      setError(err.message || 'Something went wrong')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {draftRestored && (
        <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#86EFAC', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1 }}>Draft restored from your last visit — keep editing or discard to start fresh.</span>
          <button type="button" onClick={discardDraft} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 6, padding: '4px 10px', color: '#86EFAC', fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
            Discard draft
          </button>
        </div>
      )}

      {isPath1 && (
        <div style={{ background: 'rgba(0,207,255,0.08)', border: '1px solid rgba(0,207,255,0.25)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#00CFFF' }}>
          Linked to audit from {new Date(linkedAudit.created_at).toLocaleDateString()} — industry, audience, goal, challenge prefilled.
        </div>
      )}

      <Field label="Business name *">
        <input value={form.business_name} onChange={e => setField('business_name', e.target.value)} style={inputStyle} required />
      </Field>

      {!isPath1 && (
        <Field label="What does the business do? *">
          <textarea value={form.business_description} onChange={e => setField('business_description', e.target.value)} style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} placeholder="e.g. Small-batch artisan coffee roaster, retail + wholesale" />
        </Field>
      )}

      <Field label="Industry *">
        <input value={form.industry} onChange={e => setField('industry', e.target.value)} style={inputStyle} required />
      </Field>

      <Field label="Target audience *">
        <textarea value={form.audience} onChange={e => setField('audience', e.target.value)} style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} placeholder="Who's the ideal customer?" />
      </Field>

      <Field label="Brand vibe * (pick 1-3)">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {VIBE_OPTIONS.map(v => (
            <button key={v} type="button" onClick={() => toggleVibe(v)}
              style={{
                background: form.vibe.includes(v) ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.04)',
                border: form.vibe.includes(v) ? '1px solid #00D4FF' : '1px solid rgba(255,255,255,0.08)',
                color: form.vibe.includes(v) ? '#00D4FF' : '#94A3B8',
                borderRadius: 100, padding: '4px 12px', fontSize: 12, cursor: 'pointer',
              }}>{v}</button>
          ))}
        </div>
      </Field>

      <Field label="Color preference (description)">
        <input value={form.color_preference} onChange={e => setField('color_preference', e.target.value)} style={inputStyle} placeholder="e.g. Earthy with one bold accent" />
        <p style={{ color: '#475569', fontSize: 11, margin: '4px 0 0' }}>
          Free-text description for the AI to interpret. Required UNLESS you pick explicit hex codes below.
        </p>
      </Field>

      <Field label="Brand colors (optional — explicit hex)">
        <p style={{ color: '#94A3B8', fontSize: 11, margin: '0 0 8px' }}>
          Already know your brand colors? Pick them here and the AI will use them verbatim instead of designing a palette.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {['primary', 'secondary', 'accent'].map(role => (
            <div key={role} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ minWidth: 78, fontSize: 12, color: '#94A3B8', textTransform: 'capitalize' }}>{role}</span>
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(form.brand_colors[role]) ? form.brand_colors[role] : '#000000'}
                onChange={e => setColor(role, e.target.value)}
                style={{ width: 36, height: 28, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, background: 'transparent', cursor: 'pointer', padding: 0 }}
                aria-label={`${role} color picker`}
              />
              <input
                type="text"
                value={form.brand_colors[role]}
                onChange={e => setColor(role, e.target.value)}
                placeholder="#RRGGBB"
                spellCheck={false}
                style={{ ...inputStyle, flex: 1, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
              />
            </div>
          ))}
        </div>
      </Field>

      <Field label="Already have a logo? (optional)">
        <input
          value={form.existing_logo_url}
          onChange={e => setField('existing_logo_url', e.target.value)}
          style={inputStyle}
          placeholder="https://... (public URL to PNG/SVG/JPG)"
        />
        <p style={{ color: '#475569', fontSize: 11, margin: '4px 0 0' }}>
          When provided, we skip the 3-logo generation and use your logo directly. Banners are designed around it.
        </p>
      </Field>

      <Field label="Imagery direction (optional)">
        <textarea
          value={form.imagery_direction}
          onChange={e => setField('imagery_direction', e.target.value)}
          style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
          placeholder="e.g. villa interiors, yachts on Miami Intracoastal, infinity pools, beach cabanas at golden hour"
        />
        <p style={{ color: '#475569', fontSize: 11, margin: '4px 0 0' }}>
          Scenes / backdrops to include in banners (NOT logos). Be concrete — "villa interiors, yachts, pools" beats "luxury vibes".
        </p>
      </Field>

      <Field label="Inspirations / brand references *">
        <input value={form.inspirations} onChange={e => setField('inspirations', e.target.value)} style={inputStyle} placeholder="e.g. Blue Bottle, Stumptown" />
      </Field>

      {!isPath1 && (
        <Field label="Voice/tone preference (optional)">
          <input value={form.voice_tone_preference} onChange={e => setField('voice_tone_preference', e.target.value)} style={inputStyle} placeholder="e.g. Knowledgeable but unpretentious" />
        </Field>
      )}

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: 10, color: '#FCA5A5', fontSize: 12 }}>
          {error}
        </div>
      )}

      <button type="submit" disabled={submitting} style={{
        background: submitting ? 'rgba(0,212,255,0.4)' : 'linear-gradient(135deg, #00D4FF, #0099CC)',
        color: '#020817', border: 'none', borderRadius: 8, padding: '10px 20px',
        fontWeight: 700, fontSize: 14, cursor: submitting ? 'not-allowed' : 'pointer',
        marginTop: 8,
      }}>
        {submitting ? 'Starting…' : 'Generate Brand Kit'}
      </button>
    </form>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', color: '#94A3B8', fontSize: 12, fontWeight: 500, marginBottom: 6 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

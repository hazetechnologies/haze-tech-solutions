// src/pages/admin/components/BrandKitIntakeForm.jsx
import { useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'

const VIBE_OPTIONS = [
  'minimalist', 'warm', 'premium', 'playful', 'bold', 'organic',
  'corporate', 'futuristic', 'vintage', 'edgy', 'friendly', 'serious',
]

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
  }), [client, auditInputs])

  const [form, setForm] = useState(initial)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const setField = (k, v) => setForm(prev => ({ ...prev, [k]: v }))
  const toggleVibe = (v) => setField('vibe', form.vibe.includes(v) ? form.vibe.filter(x => x !== v) : [...form.vibe, v])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    // Required field check
    const requiredColdStart = ['business_name', 'business_description', 'industry', 'audience', 'color_preference', 'inspirations']
    const requiredAuditPrefill = ['business_name', 'industry', 'audience', 'color_preference', 'inspirations']
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

    setSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const inputs = {
        path: isPath1 ? 'audit_prefill' : 'cold_start',
        ...form,
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
      if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`)
      onStarted(data.kit_id)
    } catch (err) {
      setError(err.message || 'Something went wrong')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
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

      <Field label="Color preference *">
        <input value={form.color_preference} onChange={e => setField('color_preference', e.target.value)} style={inputStyle} placeholder="e.g. Earthy with one bold accent" />
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

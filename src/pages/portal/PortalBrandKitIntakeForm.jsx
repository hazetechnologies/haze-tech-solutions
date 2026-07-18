import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useClient } from '../../lib/PortalProtectedRoute'
import { AlertCircle, Sparkles } from 'lucide-react'
import { STYLE_PRESET_OPTIONS } from '../../lib/brandStylePresets'

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
    style_preset: 'auto',
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
        style_preset: form.style_preset || 'auto',
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
        <Field label="Design style">
          <select value={form.style_preset || 'auto'} onChange={(e) => setField('style_preset', e.target.value)} style={inputStyle}>
            {STYLE_PRESET_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
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

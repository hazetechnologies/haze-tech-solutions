// src/pages/portal/PortalWebsiteIntake.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const TEMPLATES = [
  { id: 'service-business',    name: 'Service Business',    blurb: 'For trades, consulting, and local services. Strong CTAs, simple bookings.' },
  { id: 'local-business',      name: 'Local Business',      blurb: 'Maps, hours, location-first. Great for restaurants and shops.' },
  { id: 'creative-portfolio',  name: 'Creative Portfolio',  blurb: 'Image-led, project showcase, gallery. For designers and creators.' },
  { id: 'saas-landing',        name: 'SaaS / Product Landing', blurb: 'Hero + features + pricing. Built for software products.' },
  { id: 'travel-agency',       name: 'Travel Agency',       blurb: 'Destinations, packages, booking — for travel and tour operators.' },
]

const PAGES_AVAILABLE = ['Home','About','Services','Contact','Blog','Portfolio','FAQ','Pricing']

export default function PortalWebsiteIntake() {
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [hasBrandKit, setHasBrandKit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  // Form state
  const [templateId, setTemplateId] = useState('')
  const [domain, setDomain] = useState('')
  const [businessDescription, setBusinessDescription] = useState('')
  const [services, setServices] = useState([''])
  const [pages, setPages] = useState(['Home','About','Services','Contact'])
  const [colorStylePrefs, setColorStylePrefs] = useState('')
  const [useBrandKit, setUseBrandKit] = useState(true)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { navigate('/portal/login'); return }
      const { data: client } = await supabase.from('clients').select('id').eq('user_id', user.id).maybeSingle()
      if (!client) { setError('No client record found'); setLoading(false); return }
      const { data: proj } = await supabase
        .from('website_projects').select('*').eq('client_id', client.id).maybeSingle()
      if (!proj) { setError('No website project activated. Contact your dev team.'); setLoading(false); return }
      if (proj.status !== 'intake_pending') {
        setError(`This intake form has already been submitted (status: ${proj.status}).`)
        setLoading(false); return
      }
      setProject(proj)
      const { data: kit } = await supabase
        .from('brand_kits').select('id').eq('client_id', client.id).eq('status','done').maybeSingle()
      setHasBrandKit(Boolean(kit))
      setLoading(false)
    })()
  }, [navigate])

  const setServiceAt = (i, v) => setServices(s => s.map((x,idx) => idx===i ? v : x))
  const addService = () => setServices(s => [...s, ''])
  const removeService = (i) => setServices(s => s.filter((_,idx) => idx!==i))
  const togglePage = (p) => setPages(prev => prev.includes(p) ? prev.filter(x=>x!==p) : [...prev, p])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!templateId) { setError('Pick a template'); return }
    const filteredServices = services.map(s => s.trim()).filter(Boolean)
    if (filteredServices.length === 0) { setError('Add at least one service'); return }
    if (pages.length === 0) { setError('Pick at least one page'); return }
    if (!domain.trim() || !businessDescription.trim()) { setError('Domain and business description required'); return }
    setSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/website?action=intake', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.id,
          template_id: templateId,
          domain: domain.trim(),
          business_description: businessDescription.trim(),
          services: filteredServices,
          pages,
          color_style_prefs: colorStylePrefs.trim(),
          use_brand_kit: hasBrandKit && useBrandKit,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || data.error || 'Submit failed')
      setSuccess(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div style={pageStyle}><p style={{ color:'#94A3B8' }}>Loading…</p></div>
  if (error && !project) return <div style={pageStyle}><p style={errStyle}>{error}</p></div>
  if (success) return (
    <div style={pageStyle}>
      <h1 style={h1}>You're all set</h1>
      <p style={{ color:'#CBD5E1', marginTop: 12 }}>
        Thanks — we'll get to work on your site and your dev team will reach out once it's ready to review.
      </p>
      <button onClick={() => navigate('/portal/dashboard')} style={btnPrimary}>Back to dashboard</button>
    </div>
  )

  return (
    <div style={pageStyle}>
      <h1 style={h1}>Website intake</h1>
      <p style={{ color:'#94A3B8', marginTop: 8 }}>Tell us about your site. Your dev team will use this to scaffold your project.</p>

      <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap: 24, marginTop: 28 }}>
        <Field label="Pick a template">
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
            {TEMPLATES.map(t => (
              <button type="button" key={t.id} onClick={() => setTemplateId(t.id)} style={tCard(templateId===t.id)}>
                <div style={{ color:'#F1F5F9', fontWeight: 700, fontSize: 14 }}>{t.name}</div>
                <div style={{ color:'#94A3B8', fontSize: 12, marginTop: 4 }}>{t.blurb}</div>
              </button>
            ))}
          </div>
        </Field>

        <Field label="Domain"><input style={input} value={domain} onChange={e=>setDomain(e.target.value)} placeholder="example.com" /></Field>

        <Field label="Business description">
          <textarea style={{ ...input, minHeight: 90 }} value={businessDescription} onChange={e=>setBusinessDescription(e.target.value)} placeholder="What does your business do? Who do you serve?" />
        </Field>

        <Field label="Services to highlight">
          <div style={{ display:'flex', flexDirection:'column', gap: 6 }}>
            {services.map((s, i) => (
              <div key={i} style={{ display:'flex', gap: 6 }}>
                <input style={input} value={s} onChange={e=>setServiceAt(i, e.target.value)} placeholder={`Service ${i+1}`} />
                {services.length > 1 && (
                  <button type="button" onClick={()=>removeService(i)} style={btnDanger}>Remove</button>
                )}
              </div>
            ))}
            <button type="button" onClick={addService} style={btnSecondary}>+ Add service</button>
          </div>
        </Field>

        <Field label="Pages needed">
          <div style={{ display:'flex', flexWrap:'wrap', gap: 8 }}>
            {PAGES_AVAILABLE.map(p => (
              <button type="button" key={p} onClick={()=>togglePage(p)} style={chip(pages.includes(p))}>{p}</button>
            ))}
          </div>
        </Field>

        <Field label="Color & style preferences">
          <textarea style={{ ...input, minHeight: 60 }} value={colorStylePrefs} onChange={e=>setColorStylePrefs(e.target.value)} placeholder="e.g. navy and gold, clean and professional, like Apple.com" />
        </Field>

        {hasBrandKit && (
          <Field label="Use my brand kit">
            <label style={{ display:'flex', alignItems:'center', gap: 8, color:'#CBD5E1' }}>
              <input type="checkbox" checked={useBrandKit} onChange={e=>setUseBrandKit(e.target.checked)} />
              Use the brand kit colors and voice
            </label>
          </Field>
        )}

        {error && <p style={errStyle}>{error}</p>}
        <button type="submit" disabled={submitting} style={btnPrimary}>
          {submitting ? 'Submitting…' : 'Submit intake'}
        </button>
      </form>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ color:'#F1F5F9', fontSize: 13, fontWeight: 600, display:'block', marginBottom: 8 }}>{label}</label>
      {children}
    </div>
  )
}

const pageStyle = { maxWidth: 800, margin: '0 auto', padding: '40px 24px', fontFamily: "'Plus Jakarta Sans', sans-serif" }
const h1 = { color:'#F1F5F9', fontSize: 28, fontWeight: 800, margin: 0 }
const input = { width:'100%', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding:'10px 12px', color:'#F1F5F9', fontSize: 13, fontFamily:'inherit' }
const btnPrimary = { background:'#00CFFF', border:'none', color:'#0F172A', borderRadius: 8, padding:'10px 18px', fontWeight: 700, cursor:'pointer', fontSize: 13 }
const btnSecondary = { background:'transparent', border:'1px solid rgba(255,255,255,0.1)', color:'#94A3B8', borderRadius: 8, padding:'8px 14px', fontSize: 12, cursor:'pointer' }
const btnDanger = { background:'transparent', border:'1px solid rgba(239,68,68,0.4)', color:'#F87171', borderRadius: 8, padding:'8px 12px', fontSize: 12, cursor:'pointer' }
const errStyle = { color:'#F87171', fontSize: 13 }
const tCard = (active) => ({ textAlign:'left', background: active ? 'rgba(0,207,255,0.08)' : 'rgba(255,255,255,0.03)', border:`1px solid ${active ? 'rgba(0,207,255,0.4)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 10, padding: 14, cursor:'pointer' })
const chip = (active) => ({ background: active ? 'rgba(0,207,255,0.1)' : 'rgba(255,255,255,0.04)', border:`1px solid ${active ? 'rgba(0,207,255,0.4)' : 'rgba(255,255,255,0.1)'}`, color: active ? '#00CFFF' : '#CBD5E1', borderRadius: 100, padding:'6px 14px', fontSize: 12, cursor:'pointer' })

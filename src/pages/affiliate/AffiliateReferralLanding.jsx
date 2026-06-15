// src/pages/affiliate/AffiliateReferralLanding.jsx
// /r/:code — a per-affiliate landing page. Sets the referral cookie (so the
// prospect stays attributed across the main site too) AND offers a direct
// lead-capture form whose submission is attributed to the affiliate.
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Check, Zap, TrendingUp, Globe, Search, ShieldCheck, ArrowRight } from 'lucide-react'
import { captureRef } from '../../lib/affiliateRef'

const C = { bg: '#040D1A', card: '#0B1A2E', cyan: '#00CFFF', orange: '#FF6B00', green: '#22C55E', text: '#E8F4FF', mut: '#93A8C0', line: 'rgba(255,255,255,0.08)' }
const LOGO = 'https://www.hazetechsolutions.com/favicon.png'
const SERVICES = ['AI Automation', 'Social Media Marketing', 'Website Development', 'SEO & Digital Marketing', 'Not sure / Multiple']

function useIsMobile(bp = 820) {
  const [m, setM] = useState(typeof window !== 'undefined' && window.innerWidth < bp)
  useEffect(() => { const on = () => setM(window.innerWidth < bp); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on) }, [bp])
  return m
}

export default function AffiliateReferralLanding() {
  const { code } = useParams()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [refName, setRefName] = useState(null)
  const [form, setForm] = useState({ name: '', email: '', business_name: '', service_interest: '', message: '' })
  const [busy, setBusy] = useState(false); const [done, setDone] = useState(false); const [error, setError] = useState(null)

  useEffect(() => {
    if (code) captureRef(code) // set the 30-day attribution cookie + localStorage
    ;(async () => {
      try {
        const r = await fetch(`/api/website?action=ref-validate&code=${encodeURIComponent(code || '')}`)
        const j = await r.json()
        if (j.valid && j.name) setRefName(j.name)
      } catch { /* ignore */ }
    })()
  }, [code])

  async function submit(e) {
    e.preventDefault(); setBusy(true); setError(null)
    try {
      const res = await fetch('/api/submit-lead', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, ref: code, source: 'contact' }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.message || 'Could not submit. Please try again.'); return }
      setDone(true)
    } catch { setError('Something went wrong.') } finally { setBusy(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ background: `radial-gradient(circle at 82% -10%, rgba(0,207,255,0.16), transparent 45%), radial-gradient(circle at 0% 110%, rgba(255,107,0,0.12), transparent 42%)` }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: isMobile ? '22px 16px 44px' : '30px 20px 64px' }}>
          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <img src={LOGO} alt="" style={{ width: 40, height: 40, borderRadius: 9 }} />
            <div style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 800, fontSize: 18 }}>HAZE <span style={{ color: C.orange }}>TECH</span> SOLUTIONS</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1.1fr) minmax(330px,0.9fr)', gap: isMobile ? 26 : 44, alignItems: 'start', marginTop: 28 }}>
            {/* Pitch */}
            <div>
              {refName && <span style={pill}>★ Recommended by {refName}</span>}
              <h1 style={{ fontFamily: "'Orbitron', sans-serif", fontSize: isMobile ? 30 : 44, lineHeight: 1.1, margin: '16px 0 14px', fontWeight: 800 }}>
                Grow your business,<br /><span style={{ color: C.cyan }}>built to scale.</span>
              </h1>
              <p style={{ color: C.mut, fontSize: isMobile ? 15 : 16, lineHeight: 1.6, maxWidth: 520 }}>
                Haze Tech Solutions gives small businesses enterprise-grade <b style={{ color: C.text }}>AI automation</b>, <b style={{ color: C.text }}>social media marketing</b>, <b style={{ color: C.text }}>websites</b>, and <b style={{ color: C.text }}>SEO</b> — all under one roof. Tell us what you need and we'll show you exactly how to grow.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22 }}>
                <Feat icon={Zap} text="AI automation that runs the busywork 24/7" />
                <Feat icon={TrendingUp} text="Social media that grows on autopilot" />
                <Feat icon={Globe} text="Websites built to convert — live in days" />
                <Feat icon={Search} text="SEO that gets you found and chosen" />
              </div>
              {/* Free-audit funnels (same lead magnets as the homepage; stay attributed) */}
              <div style={{ marginTop: 22 }}>
                <div style={{ fontSize: 12, color: C.mut, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Start with a free audit — instant, no obligation</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button onClick={() => navigate('/audit')} style={auditBtn}><Globe size={15} /> Free Website Audit <ArrowRight size={14} /></button>
                  <button onClick={() => navigate('/free-social-audit')} style={auditBtn}><TrendingUp size={15} /> Free Social Audit <ArrowRight size={14} /></button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 24, marginTop: 24, flexWrap: 'wrap', color: C.mut, fontSize: 13 }}>
                <span><b style={{ color: C.cyan, fontFamily: "'Orbitron',sans-serif" }}>50+</b> clients</span>
                <span><b style={{ color: C.cyan, fontFamily: "'Orbitron',sans-serif" }}>98%</b> satisfaction</span>
                <span><ShieldCheck size={13} style={{ verticalAlign: 'middle' }} /> No obligation</span>
              </div>
            </div>

            {/* Lead form */}
            <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
              {done ? (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <Check size={40} color={C.green} />
                  <h2 style={{ ...h2, marginTop: 12 }}>Thank you!</h2>
                  <p style={{ color: C.mut, fontSize: 14, marginTop: 6 }}>We got your request{refName ? ` (via ${refName})` : ''}. A specialist will reach out shortly.</p>
                </div>
              ) : (
                <>
                  <h2 style={h2}>Or talk to us directly</h2>
                  <p style={{ color: C.mut, fontSize: 13, marginTop: 4 }}>Prefer a conversation? Tell us about your business — no obligation.</p>
                  <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 16 }}>
                    <input required placeholder="Your name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={input} />
                    <input required type="email" placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={input} />
                    <input placeholder="Business name" value={form.business_name} onChange={e => setForm({ ...form, business_name: e.target.value })} style={input} />
                    <select value={form.service_interest} onChange={e => setForm({ ...form, service_interest: e.target.value })} style={{ ...input, cursor: 'pointer' }}>
                      <option value="">What do you need help with?</option>
                      {SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <textarea placeholder="Tell us a bit about your goals (optional)" value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} rows={3} style={{ ...input, resize: 'vertical', fontFamily: 'inherit' }} />
                    <button type="submit" disabled={busy} style={primaryBtn}>{busy ? 'Sending…' : 'Request my free consultation'}</button>
                  </form>
                  {error && <p style={{ color: '#FCA5A5', fontSize: 13, marginTop: 10 }}>{error}</p>}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Feat({ icon: Icon, text }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}><span style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(0,207,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon size={15} color={C.cyan} /></span>{text}</div>
}

const h2 = { fontFamily: "'Orbitron', sans-serif", fontSize: 18, margin: 0 }
const pill = { display: 'inline-block', fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', color: C.orange, background: 'rgba(255,107,0,0.1)', border: '1px solid rgba(255,107,0,0.3)', borderRadius: 999, padding: '6px 14px' }
const input = { background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.line}`, borderRadius: 9, padding: '11px 14px', color: C.text, fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', width: '100%' }
const primaryBtn = { background: `linear-gradient(135deg, ${C.cyan}, #0099CC)`, border: 'none', borderRadius: 9, padding: '12px 16px', color: '#020817', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer', width: '100%' }
const auditBtn = { display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(0,207,255,0.08)', border: '1px solid rgba(0,207,255,0.35)', borderRadius: 10, padding: '11px 15px', color: C.cyan, fontWeight: 700, fontSize: 13.5, fontFamily: 'inherit', cursor: 'pointer' }

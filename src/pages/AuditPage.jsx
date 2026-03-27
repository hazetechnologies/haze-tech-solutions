import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import emailjs from '@emailjs/browser'
import { supabase } from '../lib/supabase'
import {
  ArrowLeft, Search, CheckCircle, XCircle, AlertTriangle,
  Zap, Smartphone, Shield, TrendingUp, ExternalLink, RotateCcw, Check,
} from 'lucide-react'

const SERVICE_ID = 'service_4uzwhit'
const TEMPLATE_ID = 'template_oznyojk'
const PUBLIC_KEY = 'C2wRIWiA_TNE1S9mZ'

const LOADING_STEPS = [
  'Connecting to your website...',
  'Analyzing page performance...',
  'Running SEO checks...',
  'Testing mobile responsiveness...',
  'Checking security protocols...',
  'Evaluating design & conversion factors...',
  'Generating your report...',
]

/* ── Score circle ─────────────────────────────────────────── */
function ScoreCircle({ score, label, Icon }) {
  const r = 38
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  const color = score >= 90 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444'
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
      <div style={{ position: 'relative', width: '100px', height: '100px' }}>
        <svg width="100" height="100" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
          <circle
            cx="50" cy="50" r={r} fill="none"
            stroke={color} strokeWidth="7"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1.2s ease', filter: `drop-shadow(0 0 6px ${color})` }}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '1.4rem', fontWeight: 900, color }}>{grade}</span>
          <span style={{ fontSize: '0.7rem', color: '#64748B' }}>{score}/100</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <Icon size={13} style={{ color }} />
        <span style={{ fontSize: '0.82rem', color: '#94A3B8', fontWeight: 500 }}>{label}</span>
      </div>
    </div>
  )
}

/* ── Helpers ──────────────────────────────────────────────── */
function getScores(auditData) {
  const mLH = auditData.mobile.lighthouseResult

  const perf     = Math.round(mLH.categories.performance.score * 100)
  const seo      = Math.round(mLH.categories.seo.score * 100)
  const a11y     = Math.round(mLH.categories.accessibility.score * 100)
  const bp       = Math.round(mLH.categories['best-practices'].score * 100)
  const mobile   = Math.round((perf + a11y) / 2)
  const security = bp
  const cro      = auditData.design?.score ?? Math.round((a11y + bp) / 2)
  const overall  = Math.round((perf + seo + mobile + security + cro) / 5)

  return { perf, seo, mobile, security, cro, overall }
}

function getIssues(auditData) {
  const audits = auditData.mobile.lighthouseResult.audits
  return Object.values(audits)
    .filter(a => a.score !== null && a.score < 0.9 && a.details)
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
    .slice(0, 10)
    .map(a => ({
      title: a.title,
      displayValue: a.displayValue ?? null,
      severity: (a.score ?? 0) < 0.5 ? 'critical' : 'warning',
    }))
}

/* ── Input style ──────────────────────────────────────────── */
const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(0,212,255,0.15)',
  borderRadius: '8px', padding: '0.75rem 1rem',
  color: '#F1F5F9', fontFamily: '"Plus Jakarta Sans", sans-serif',
  fontSize: '0.95rem', outline: 'none',
}

/* ── Main component ───────────────────────────────────────── */
export default function AuditPage() {
  const [phase, setPhase]       = useState('form')   // form | loading | report
  const [lead, setLead]         = useState({ name: '', email: '', url: '' })
  const [step, setStep]         = useState(0)
  const [auditData, setAuditData] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')

  /* Animate loading steps */
  useEffect(() => {
    if (phase !== 'loading') return
    const id = setInterval(() => setStep(p => Math.min(p + 1, LOADING_STEPS.length - 1)), 2800)
    return () => clearInterval(id)
  }, [phase])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg('')
    setPhase('loading')
    setStep(0)

    let url = lead.url.trim()
    if (!url.startsWith('http')) url = 'https://' + url

    /* Capture lead via EmailJS */
    emailjs.send(SERVICE_ID, TEMPLATE_ID, {
      from_name: lead.name,
      from_email: lead.email,
      business_name: url,
      service_interest: 'Website Audit Request',
      message: `Website audit requested for: ${url}`,
    }, { publicKey: PUBLIC_KEY }).catch(console.error)

    try {
      const [mRes, dRes, designRes] = await Promise.all([
        fetch(`/api/audit?url=${encodeURIComponent(url)}&strategy=mobile`),
        fetch(`/api/audit?url=${encodeURIComponent(url)}&strategy=desktop`),
        fetch(`/api/design-audit?url=${encodeURIComponent(url)}`),
      ])
      const [mobile, desktop, design] = await Promise.all([mRes.json(), dRes.json(), designRes.json()])

      if (!mobile.lighthouseResult) {
        throw new Error(mobile.error?.message || 'Could not analyze this URL. Make sure it\'s a live, publicly accessible website.')
      }

      // Save audit lead to Supabase
      const scores = getScores({ mobile, desktop, design })
      supabase.from('leads').insert({
        name: lead.name,
        email: lead.email,
        business_name: url,
        service_interest: 'Website Audit',
        source: 'audit',
        url,
        perf_score: scores.perf,
        seo_score: scores.seo,
        mobile_score: scores.mobile,
        security_score: scores.security,
        cro_score: scores.cro,
        overall_score: scores.overall,
      }).then(({ error }) => { if (error) console.error('Supabase audit save error:', error) })

      setAuditData({ mobile, desktop, design, url })
      setPhase('report')
    } catch (err) {
      setErrorMsg(err.message || 'Something went wrong. Please try again.')
      setPhase('form')
    }
  }

  const reset = () => {
    setPhase('form')
    setAuditData(null)
    setLead({ name: '', email: '', url: '' })
    setErrorMsg('')
  }

  /* ── Shared page wrapper ────────────────────────────────── */
  return (
    <div style={{ background: '#020817', minHeight: '100vh', fontFamily: '"Plus Jakarta Sans", sans-serif', color: '#F1F5F9' }}>

      {/* Navbar */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(2,8,23,0.85)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(0,212,255,0.1)',
        padding: '1rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#94A3B8', textDecoration: 'none', fontSize: '0.9rem', transition: 'color 0.2s' }}>
          <ArrowLeft size={16} /> Back to Home
        </Link>
        <span style={{ fontFamily: 'Orbitron, sans-serif', color: '#00D4FF', fontSize: '0.85rem', fontWeight: 700, letterSpacing: '1px' }}>
          FREE WEBSITE AUDIT
        </span>
      </nav>

      <AnimatePresence mode="wait">

        {/* ── FORM ────────────────────────────────────────── */}
        {phase === 'form' && (
          <motion.div key="form" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            style={{ maxWidth: '620px', margin: '0 auto', padding: '5rem 1.5rem' }}>

            {/* Hero text */}
            <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)', borderRadius: '100px', padding: '0.35rem 1rem', marginBottom: '1.5rem' }}>
                <Zap size={13} style={{ color: '#00D4FF' }} />
                <span style={{ color: '#00D4FF', fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.5px' }}>FREE · INSTANT · NO CREDIT CARD</span>
              </div>
              <h1 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 'clamp(1.6rem, 4vw, 2.8rem)', fontWeight: 900, lineHeight: 1.2, marginBottom: '1rem' }}>
                How Does Your Website<br />
                <span style={{ background: 'linear-gradient(135deg, #00D4FF, #8B5CF6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Really Stack Up?</span>
              </h1>
              <p style={{ color: '#94A3B8', fontSize: '1rem', lineHeight: 1.75, maxWidth: '480px', margin: '0 auto' }}>
                Get a full audit covering performance, SEO, mobile, security, and conversion readiness — in under 60 seconds.
              </p>
            </div>

            {/* Form card */}
            <form onSubmit={handleSubmit} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(0,212,255,0.15)', borderRadius: '16px', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', color: '#94A3B8', fontSize: '0.82rem', fontWeight: 500, marginBottom: '0.4rem' }}>Your Name *</label>
                  <input required type="text" placeholder="John Smith" value={lead.name}
                    onChange={e => setLead(p => ({ ...p, name: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ display: 'block', color: '#94A3B8', fontSize: '0.82rem', fontWeight: 500, marginBottom: '0.4rem' }}>Email Address *</label>
                  <input required type="email" placeholder="you@company.com" value={lead.email}
                    onChange={e => setLead(p => ({ ...p, email: e.target.value }))} style={inputStyle} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', color: '#94A3B8', fontSize: '0.82rem', fontWeight: 500, marginBottom: '0.4rem' }}>Website URL *</label>
                <input required type="text" placeholder="yourwebsite.com" value={lead.url}
                  onChange={e => setLead(p => ({ ...p, url: e.target.value }))} style={inputStyle} />
              </div>

              {errorMsg && (
                <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px', padding: '0.75rem 1rem', color: '#f87171', fontSize: '0.88rem' }}>
                  {errorMsg}
                </div>
              )}

              <button type="submit" style={{ background: 'linear-gradient(135deg, #00D4FF, #0099BB)', border: 'none', borderRadius: '8px', padding: '0.9rem', color: '#020817', fontFamily: '"Plus Jakarta Sans", sans-serif', fontWeight: 700, fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <Search size={17} /> Run Free Audit
              </button>

              <p style={{ color: '#475569', fontSize: '0.78rem', textAlign: 'center', margin: 0 }}>
                We'll also send a copy of your report to your email.
              </p>
            </form>

            {/* What we check */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem', marginTop: '2rem' }}>
              {[
                { icon: Zap, label: 'Performance' },
                { icon: Search, label: 'SEO' },
                { icon: Smartphone, label: 'Mobile' },
                { icon: Shield, label: 'Security' },
                { icon: TrendingUp, label: 'Conversion' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px', padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                  <Icon size={18} style={{ color: '#00D4FF', margin: '0 auto 0.35rem' }} />
                  <p style={{ color: '#64748B', fontSize: '0.7rem', margin: 0, fontWeight: 500 }}>{label}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── LOADING ─────────────────────────────────────── */}
        {phase === 'loading' && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 64px)', gap: '2rem', padding: '2rem', textAlign: 'center' }}>

            {/* Spinner */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              style={{ width: '60px', height: '60px', borderRadius: '50%', border: '3px solid rgba(0,212,255,0.15)', borderTopColor: '#00D4FF' }}
            />

            <div>
              <h2 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '1.3rem', marginBottom: '0.5rem' }}>
                Analyzing <span style={{ color: '#00D4FF' }}>{lead.url}</span>
              </h2>
              <AnimatePresence mode="wait">
                <motion.p key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  style={{ color: '#94A3B8', fontSize: '0.95rem' }}>
                  {LOADING_STEPS[step]}
                </motion.p>
              </AnimatePresence>
            </div>

            {/* Dot progress */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {LOADING_STEPS.map((_, i) => (
                <div key={i} style={{
                  width: '8px', height: '8px', borderRadius: '50%', transition: 'all 0.3s',
                  background: i <= step ? '#00D4FF' : 'rgba(255,255,255,0.08)',
                  boxShadow: i <= step ? '0 0 8px rgba(0,212,255,0.5)' : 'none',
                }} />
              ))}
            </div>

            <p style={{ color: '#475569', fontSize: '0.82rem' }}>This usually takes 20–40 seconds</p>
          </motion.div>
        )}

        {/* ── REPORT ──────────────────────────────────────── */}
        {phase === 'report' && auditData && (() => {
          const scores = getScores(auditData)
          const issues = getIssues(auditData)
          const overallColor = scores.overall >= 70 ? '#22c55e' : scores.overall >= 50 ? '#f59e0b' : '#ef4444'
          const overallGrade = scores.overall >= 90 ? 'A' : scores.overall >= 80 ? 'B' : scores.overall >= 70 ? 'C' : scores.overall >= 60 ? 'D' : 'F'

          return (
            <motion.div key="report" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              style={{ maxWidth: '860px', margin: '0 auto', padding: '4rem 1.5rem' }}>

              {/* Header */}
              <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: '100px', padding: '0.35rem 1rem', marginBottom: '1.25rem' }}>
                  <CheckCircle size={13} style={{ color: '#22c55e' }} />
                  <span style={{ color: '#22c55e', fontSize: '0.78rem', fontWeight: 600 }}>AUDIT COMPLETE</span>
                </div>
                <h2 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 'clamp(1.4rem, 3vw, 2.2rem)', marginBottom: '0.5rem' }}>Website Audit Report</h2>
                <p style={{ color: '#94A3B8', fontSize: '0.88rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
                  <ExternalLink size={13} /> {auditData.url}
                </p>
              </div>

              {/* Overall score */}
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(0,212,255,0.12)', borderRadius: '16px', padding: '2.5rem', marginBottom: '1.5rem', textAlign: 'center' }}>
                <p style={{ color: '#64748B', fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '0.75rem' }}>Overall Score</p>
                <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 'clamp(4rem, 10vw, 7rem)', fontWeight: 900, lineHeight: 1, background: `linear-gradient(135deg, ${overallColor}, ${overallColor}88)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: `drop-shadow(0 0 30px ${overallColor}44)` }}>
                  {overallGrade}
                </div>
                <p style={{ color: '#475569', fontSize: '0.88rem', marginTop: '0.5rem' }}>{scores.overall} / 100 points</p>
              </div>

              {/* Score breakdown */}
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(0,212,255,0.12)', borderRadius: '16px', padding: '2rem', marginBottom: '2rem' }}>
                <h3 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '0.85rem', color: '#94A3B8', letterSpacing: '1px', marginBottom: '2rem', textAlign: 'center' }}>SCORE BREAKDOWN</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '1.5rem', justifyItems: 'center' }}>
                  <ScoreCircle score={scores.perf}     label="Performance" Icon={Zap} />
                  <ScoreCircle score={scores.seo}      label="SEO"         Icon={Search} />
                  <ScoreCircle score={scores.mobile}   label="Mobile"      Icon={Smartphone} />
                  <ScoreCircle score={scores.security} label="Security"    Icon={Shield} />
                  <ScoreCircle score={scores.cro}      label="Design & CRO" Icon={TrendingUp} />
                </div>
              </div>

              {/* Issues */}
              {issues.length > 0 && (
                <div style={{ marginBottom: '2.5rem' }}>
                  <h3 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '0.9rem', letterSpacing: '1px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    ISSUES FOUND
                    <span style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', fontSize: '0.75rem', fontFamily: '"Plus Jakarta Sans", sans-serif', fontWeight: 600, padding: '0.15rem 0.6rem', borderRadius: '100px' }}>
                      {issues.length}
                    </span>
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {issues.map((issue, i) => {
                      const isCrit = issue.severity === 'critical'
                      return (
                        <div key={i} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${isCrit ? 'rgba(239,68,68,0.18)' : 'rgba(245,158,11,0.18)'}`, borderRadius: '10px', padding: '0.9rem 1.1rem', display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
                          {isCrit
                            ? <XCircle size={17} style={{ color: '#ef4444', flexShrink: 0, marginTop: '1px' }} />
                            : <AlertTriangle size={17} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '1px' }} />
                          }
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ color: '#F1F5F9', fontSize: '0.88rem', fontWeight: 600, margin: '0 0 0.2rem' }}>{issue.title}</p>
                            {issue.displayValue && <p style={{ color: '#64748B', fontSize: '0.8rem', margin: 0 }}>{issue.displayValue}</p>}
                          </div>
                          <span style={{ flexShrink: 0, fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: '100px', background: isCrit ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)', color: isCrit ? '#ef4444' : '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            {issue.severity}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Design & Conversion checks */}
              {auditData.design?.error && (
                <div style={{ marginBottom: '2.5rem', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '12px', padding: '1.25rem 1.5rem', color: '#f59e0b', fontSize: '0.88rem' }}>
                  ⚠ Design & Conversion audit could not run — the site may be blocking external requests. Try auditing a different URL.
                </div>
              )}
              {auditData.design?.checks && (
                <div style={{ marginBottom: '2.5rem' }}>
                  <h3 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '0.9rem', letterSpacing: '1px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    DESIGN & CONVERSION AUDIT
                    <span style={{ background: 'rgba(139,92,246,0.12)', color: '#8B5CF6', border: '1px solid rgba(139,92,246,0.2)', fontSize: '0.75rem', fontFamily: '"Plus Jakarta Sans", sans-serif', fontWeight: 600, padding: '0.15rem 0.6rem', borderRadius: '100px' }}>
                      {auditData.design.passed}/{auditData.design.total} passed
                    </span>
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.6rem' }}>
                    {auditData.design.checks.map((check, i) => (
                      <div key={i} style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${check.passed ? 'rgba(34,197,94,0.15)' : check.impact === 'high' ? 'rgba(239,68,68,0.18)' : 'rgba(245,158,11,0.15)'}`, borderRadius: '10px', padding: '0.85rem 1rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                        <div style={{ flexShrink: 0, marginTop: '1px' }}>
                          {check.passed
                            ? <Check size={16} style={{ color: '#22c55e' }} />
                            : check.impact === 'high'
                              ? <XCircle size={16} style={{ color: '#ef4444' }} />
                              : <AlertTriangle size={16} style={{ color: '#f59e0b' }} />
                          }
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ color: check.passed ? '#94A3B8' : '#F1F5F9', fontSize: '0.85rem', fontWeight: 600, margin: '0 0 0.2rem', textDecoration: check.passed ? 'none' : 'none' }}>{check.title}</p>
                          <p style={{ color: '#64748B', fontSize: '0.78rem', margin: '0 0 0.25rem' }}>{check.detail}</p>
                          {!check.passed && (
                            <p style={{ color: '#8B5CF6', fontSize: '0.76rem', margin: 0 }}>Fix: {check.fix}</p>
                          )}
                        </div>
                        <span style={{ flexShrink: 0, fontSize: '0.68rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '100px', background: check.passed ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.05)', color: check.passed ? '#22c55e' : '#64748B', textTransform: 'uppercase', letterSpacing: '0.3px', alignSelf: 'flex-start' }}>
                          {check.category}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CTA */}
              <div style={{ background: 'linear-gradient(135deg, rgba(0,212,255,0.07), rgba(139,92,246,0.07))', border: '1px solid rgba(0,212,255,0.18)', borderRadius: '16px', padding: '2.5rem', textAlign: 'center', marginBottom: '2rem' }}>
                <h3 style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 'clamp(1rem, 2.5vw, 1.5rem)', marginBottom: '0.75rem' }}>
                  Ready to Fix These Issues?
                </h3>
                <p style={{ color: '#94A3B8', maxWidth: '460px', margin: '0 auto 2rem', lineHeight: 1.75, fontSize: '0.95rem' }}>
                  Our team can address every issue in this report and get your website performing at its full potential.
                </p>
                <a href="/#contact" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'linear-gradient(135deg, #00D4FF, #0099BB)', color: '#020817', fontWeight: 700, padding: '0.9rem 2.25rem', borderRadius: '8px', textDecoration: 'none', fontSize: '1rem', fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
                  Get a Free Strategy Call
                </a>
              </div>

              {/* Audit another */}
              <div style={{ textAlign: 'center' }}>
                <button onClick={reset} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.6rem 1.5rem', color: '#64748B', cursor: 'pointer', fontSize: '0.88rem', fontFamily: '"Plus Jakarta Sans", sans-serif', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                  <RotateCcw size={14} /> Audit Another Website
                </button>
              </div>

            </motion.div>
          )
        })()}

      </AnimatePresence>
    </div>
  )
}

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate, Link } from 'react-router-dom'
import { Send, AlertCircle, ArrowLeft, Sparkles, Zap, ShieldCheck } from 'lucide-react'
import { identifyLead, trackEvent } from '../lib/telemetry'

const INITIAL_FORM = {
  name: '',
  email: '',
  business: '',
  ig_self: '',
  ig_comp1: '',
  ig_comp2: '',
  yt_self: '',
  yt_comp1: '',
  yt_comp2: '',
  audience: '',
  goal: 'Leads',
  challenge: '',
}

export default function FreeSocialAudit() {
  const [form, setForm] = useState(INITIAL_FORM)
  const [status, setStatus] = useState('idle') // idle | loading | error
  const [errorMsg, setErrorMsg] = useState('')
  const navigate = useNavigate()

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMsg('')

    // Client-side: at least one platform self handle required
    if (!form.ig_self.trim() && !form.yt_self.trim()) {
      setErrorMsg('Add at least your Instagram handle or YouTube channel.')
      setStatus('error')
      return
    }

    setStatus('loading')

    identifyLead({ email: form.email, name: form.name, source: 'free-social-audit' })
    trackEvent('lead_submitted', { source: 'free-social-audit' })

    const platforms = {}
    if (form.ig_self.trim()) {
      platforms.instagram = {
        self: form.ig_self.trim(),
        competitors: [form.ig_comp1, form.ig_comp2].map(s => s.trim()).filter(Boolean),
      }
    }
    if (form.yt_self.trim()) {
      platforms.youtube = {
        self: form.yt_self.trim(),
        competitors: [form.yt_comp1, form.yt_comp2].map(s => s.trim()).filter(Boolean),
      }
    }

    try {
      const res = await fetch('/api/start-social-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id: null,
          inputs: {
            name: form.name,
            email: form.email,
            business_name: form.business,
            platforms,
            audience: form.audience,
            goal: form.goal,
            challenge: form.challenge,
          },
        }),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `Request failed (${res.status})`)
      }
      const { audit_id } = await res.json()
      if (!audit_id) throw new Error('No audit id returned')
      trackEvent('social_audit_started', { audit_id })
      navigate(`/audit/${audit_id}`)
    } catch (err) {
      console.error('start-social-audit failed:', err)
      setErrorMsg(err?.message || 'Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  const inputBase = {
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(0, 207, 255, 0.15)',
    borderRadius: 8,
    color: '#F1F5F9',
    padding: '0.75rem 1rem',
    width: '100%',
    fontFamily: '"Plus Jakarta Sans", sans-serif',
    fontSize: '0.95rem',
    transition: 'all 0.2s ease',
    outline: 'none',
  }

  return (
    <div
      style={{
        background: '#020817',
        minHeight: '100vh',
        fontFamily: '"Plus Jakarta Sans", sans-serif',
        color: '#F1F5F9',
      }}
    >
      {/* Navbar */}
      <nav
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'rgba(2,8,23,0.85)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(0,207,255,0.1)',
          padding: '1rem 2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Link
          to="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: '#94A3B8',
            textDecoration: 'none',
            fontSize: '0.9rem',
          }}
        >
          <ArrowLeft size={16} /> Back to Home
        </Link>
        <span
          style={{
            fontFamily: 'Orbitron, sans-serif',
            color: '#00CFFF',
            fontSize: '0.85rem',
            fontWeight: 700,
            letterSpacing: '1px',
          }}
        >
          FREE SOCIAL AUDIT
        </span>
      </nav>

      <section
        className="relative py-20 px-6 overflow-hidden"
        style={{ background: '#071526' }}
        aria-label="Free social media audit"
      >
        {/* Border top */}
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(to right, transparent, rgba(0,212,255,0.3), transparent)' }}
          aria-hidden="true"
        />

        {/* Orbs */}
        <div
          className="orb orb-violet"
          style={{ width: 450, height: 450, top: '-5%', right: '-10%', opacity: 0.6 }}
          aria-hidden="true"
        />
        <div
          className="orb orb-cyan"
          style={{ width: 350, height: 350, bottom: '5%', left: '-10%', opacity: 0.4 }}
          aria-hidden="true"
        />

        <div className="max-w-3xl mx-auto relative">
          {/* Header */}
          <motion.div
            className="text-center mb-12"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="section-label">Free · Instant · AI-Powered</span>
            <h1
              className="font-display font-black mt-4 mb-4 text-text-main"
              style={{ fontSize: 'clamp(2rem, 5vw, 3.25rem)', lineHeight: 1.1 }}
            >
              Free Social{' '}
              <span className="gradient-text">Media Audit</span>
            </h1>
            <p className="text-muted text-lg max-w-xl mx-auto">
              Get a competitive gap analysis vs your competitors in under 60 seconds. Powered by AI.
            </p>

            {/* Trust signals */}
            <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted">
              <span className="inline-flex items-center gap-1.5">
                <Sparkles size={14} style={{ color: '#00CFFF' }} aria-hidden="true" />
                AI-powered analysis
              </span>
              <span style={{ color: '#475569' }} aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5">
                <Zap size={14} style={{ color: '#FF6B00' }} aria-hidden="true" />
                Instant results
              </span>
              <span style={{ color: '#475569' }} aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck size={14} style={{ color: '#00CFFF' }} aria-hidden="true" />
                No credit card
              </span>
            </div>
          </motion.div>

          {/* Form card */}
          <motion.div
            className="glass-card p-8 md:p-10 relative"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
          >
            <motion.form
              onSubmit={handleSubmit}
              className="space-y-6"
              aria-label="Free social media audit form"
            >
              {/* Lead info */}
              <div>
                <p
                  style={{
                    fontSize: '0.8rem',
                    color: '#00CFFF',
                    fontWeight: 600,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    margin: '0 0 0.75rem',
                  }}
                >
                  Your Info
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium text-muted mb-2">
                      Full Name <span className="text-primary" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="name"
                      type="text"
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      placeholder="Jane Smith"
                      required
                      style={inputBase}
                      aria-required="true"
                    />
                  </div>
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-muted mb-2">
                      Email Address <span className="text-primary" aria-hidden="true">*</span>
                    </label>
                    <input
                      id="email"
                      type="email"
                      name="email"
                      value={form.email}
                      onChange={handleChange}
                      placeholder="jane@company.com"
                      required
                      style={inputBase}
                      aria-required="true"
                    />
                  </div>
                </div>
                <div className="mt-5">
                  <label htmlFor="business" className="block text-sm font-medium text-muted mb-2">
                    Business Name <span className="text-primary" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="business"
                    type="text"
                    name="business"
                    value={form.business}
                    onChange={handleChange}
                    placeholder="Acme Co."
                    required
                    style={inputBase}
                    aria-required="true"
                  />
                </div>
              </div>

              {/* Platforms */}
              <div
                className="space-y-5"
                style={{
                  background: 'rgba(0, 207, 255, 0.04)',
                  border: '1px solid rgba(0, 207, 255, 0.12)',
                  borderRadius: 12,
                  padding: '1.25rem',
                }}
              >
                <p
                  style={{
                    fontSize: '0.8rem',
                    color: '#00CFFF',
                    fontWeight: 600,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    margin: 0,
                  }}
                >
                  Platforms (provide at least one)
                </p>

                {/* Instagram */}
                <div>
                  <p style={{ fontSize: '0.75rem', color: '#94A3B8', margin: '0 0 0.5rem' }}>Instagram</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      name="ig_self"
                      value={form.ig_self}
                      onChange={handleChange}
                      placeholder="@yourbiz"
                      style={inputBase}
                      aria-label="Your Instagram handle"
                    />
                    <input
                      name="ig_comp1"
                      value={form.ig_comp1}
                      onChange={handleChange}
                      placeholder="Competitor 1"
                      style={inputBase}
                      aria-label="Instagram competitor 1"
                    />
                    <input
                      name="ig_comp2"
                      value={form.ig_comp2}
                      onChange={handleChange}
                      placeholder="Competitor 2"
                      style={inputBase}
                      aria-label="Instagram competitor 2"
                    />
                  </div>
                </div>

                {/* YouTube */}
                <div>
                  <p style={{ fontSize: '0.75rem', color: '#94A3B8', margin: '0 0 0.5rem' }}>YouTube</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      name="yt_self"
                      value={form.yt_self}
                      onChange={handleChange}
                      placeholder="@yourchannel or URL"
                      style={inputBase}
                      aria-label="Your YouTube channel"
                    />
                    <input
                      name="yt_comp1"
                      value={form.yt_comp1}
                      onChange={handleChange}
                      placeholder="Competitor 1"
                      style={inputBase}
                      aria-label="YouTube competitor 1"
                    />
                    <input
                      name="yt_comp2"
                      value={form.yt_comp2}
                      onChange={handleChange}
                      placeholder="Competitor 2"
                      style={inputBase}
                      aria-label="YouTube competitor 2"
                    />
                  </div>
                </div>
              </div>

              {/* Strategic */}
              <div>
                <label htmlFor="audience" className="block text-sm font-medium text-muted mb-2">
                  Who's your target audience? <span className="text-primary" aria-hidden="true">*</span>
                </label>
                <textarea
                  id="audience"
                  name="audience"
                  value={form.audience}
                  onChange={handleChange}
                  placeholder="e.g. Small business owners in real estate"
                  rows={2}
                  required
                  style={{ ...inputBase, resize: 'vertical' }}
                  aria-required="true"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label htmlFor="goal" className="block text-sm font-medium text-muted mb-2">
                    Primary goal <span className="text-primary" aria-hidden="true">*</span>
                  </label>
                  <select
                    id="goal"
                    name="goal"
                    value={form.goal}
                    onChange={handleChange}
                    required
                    style={{ ...inputBase, cursor: 'pointer' }}
                    aria-required="true"
                  >
                    <option value="Engagement" style={{ background: '#071526' }}>Engagement</option>
                    <option value="Leads" style={{ background: '#071526' }}>Leads</option>
                    <option value="Awareness" style={{ background: '#071526' }}>Awareness</option>
                    <option value="Sales" style={{ background: '#071526' }}>Sales</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="challenge" className="block text-sm font-medium text-muted mb-2">
                    Biggest challenge right now <span className="text-primary" aria-hidden="true">*</span>
                  </label>
                  <textarea
                    id="challenge"
                    name="challenge"
                    value={form.challenge}
                    onChange={handleChange}
                    placeholder="Inconsistent posting, low engagement, etc."
                    rows={2}
                    required
                    style={{ ...inputBase, resize: 'vertical' }}
                    aria-required="true"
                  />
                </div>
              </div>

              {/* Error banner */}
              <AnimatePresence>
                {status === 'error' && errorMsg && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg"
                    style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                    }}
                    role="alert"
                  >
                    <AlertCircle size={16} style={{ color: '#ef4444' }} aria-hidden="true" />
                    <span className="text-sm text-red-400">{errorMsg}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Submit button */}
              <motion.button
                type="submit"
                disabled={status === 'loading'}
                className="btn-primary w-full justify-center text-sm"
                whileHover={status !== 'loading' ? { scale: 1.02 } : {}}
                whileTap={status !== 'loading' ? { scale: 0.98 } : {}}
                style={status === 'loading' ? { opacity: 0.7, cursor: 'not-allowed' } : {}}
              >
                {status === 'loading' ? (
                  <>
                    <svg
                      className="animate-spin"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                    Starting your audit…
                  </>
                ) : (
                  <>
                    Run My Free Audit
                    <Send size={15} aria-hidden="true" />
                  </>
                )}
              </motion.button>

              <p style={{ color: '#475569', fontSize: '0.78rem', textAlign: 'center', margin: 0 }}>
                We'll generate your competitive gap report and email you a copy.
              </p>
            </motion.form>
          </motion.div>
        </div>
      </section>
    </div>
  )
}

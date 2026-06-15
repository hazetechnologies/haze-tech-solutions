import { useState } from 'react'
import { Link } from 'react-router-dom'
import { X, AlertCircle, ArrowRight, Lock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { trackEvent } from '../lib/telemetry'
import { effectivePrice } from '../lib/pricing'
import { getRefCode } from '../lib/affiliateRef'

// Quick-form modal triggered from /pricing.
// 1. POSTs name + email + password + plan to /api/website?action=public-checkout.
// 2. Server creates the auth user + clients row, returns Stripe Checkout URL.
// 3. We sign the user in client-side (so the portal session is warm when they
//    return from Stripe), then redirect to checkout.
// If the email already has an account, we surface a sign-in CTA instead.
export default function PurchaseModal({ product, plan, onClose }) {
  const [form, setForm] = useState({
    name: '', email: '', password: '',
    company: '', phone: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [collision, setCollision] = useState(false)

  if (!product || !plan) return null

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  // Display the price the form claims to charge — plan-level override wins,
  // otherwise computed from product × plan discount.
  const displayPrice = effectivePrice(plan, product)
  const cycleLabel = plan.billing_cycle === 'one-time' ? 'one-time' : `/ ${plan.billing_cycle}`

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null); setCollision(false)
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      setError('Name, email, and password are required.')
      return
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setSubmitting(true)
    trackEvent('purchase_started', { product_id: product.id, plan_id: plan.id })

    try {
      const res = await fetch('/api/website?action=public-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription_plan_id: plan.id,
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
          company: form.company.trim() || null,
          phone: form.phone.trim() || null,
          ref: getRefCode(),
        }),
      })

      const text = await res.text()
      let data = {}
      try { data = text ? JSON.parse(text) : {} } catch { /* leave empty */ }

      if (res.status === 409 && data.error === 'client_exists') {
        setCollision(true)
        trackEvent('purchase_email_collision', { product_id: product.id, email: form.email })
        return
      }
      if (!res.ok) {
        setError(data.message || `Server error (${res.status})`)
        trackEvent('purchase_failed', { product_id: product.id, error_code: data.error || `http_${res.status}` })
        return
      }

      // Warm the portal session so they return signed in.
      await supabase.auth.signInWithPassword({
        email: form.email.trim().toLowerCase(),
        password: form.password,
      }).catch(() => { /* non-fatal: they can still log in manually */ })

      trackEvent('purchase_redirecting_to_stripe', { product_id: product.id, plan_id: plan.id })
      window.location.href = data.url
    } catch (err) {
      setError(err.message || 'Network error')
      trackEvent('purchase_failed', { product_id: product.id, error_code: 'network' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div onClick={submitting ? undefined : onClose} style={styles.overlay}>
      <div onClick={e => e.stopPropagation()} style={styles.modal}>
        <button onClick={onClose} disabled={submitting} aria-label="Close" style={styles.closeBtn}><X size={18} /></button>

        <div style={{ marginBottom: 18 }}>
          <div style={styles.eyebrow}>You're buying</div>
          <h3 style={styles.title}>{product.name}</h3>
          <div style={styles.priceLine}>
            <span style={styles.price}>${displayPrice.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</span>
            <span style={styles.cycle}>{cycleLabel}</span>
            <span style={styles.planChip}>{plan.name}</span>
          </div>
        </div>

        {collision ? (
          <div style={styles.collisionBox}>
            <AlertCircle size={16} color="#FACC15" />
            <div>
              <p style={{ margin: 0, color: '#FDE68A', fontSize: 13, lineHeight: 1.5 }}>
                An account with <strong>{form.email}</strong> already exists.
              </p>
              <p style={{ margin: '6px 0 12px', color: '#94A3B8', fontSize: 12 }}>
                Sign in to add this product to your plan from the portal.
              </p>
              <Link
                to={`/portal/login?next=${encodeURIComponent('/portal/services')}`}
                style={styles.signInBtn}
              >
                Sign in & continue <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12 }}>
            {error && (
              <div style={styles.errorBanner}><AlertCircle size={14} /><span>{error}</span></div>
            )}
            <Field label="Full name *" value={form.name} onChange={v => set('name', v)} placeholder="Jane Doe" autoComplete="name" />
            <Field label="Email *" type="email" value={form.email} onChange={v => set('email', v)} placeholder="you@company.com" autoComplete="email" />
            <Field label="Password *" type="password" value={form.password} onChange={v => set('password', v)} placeholder="At least 8 characters" autoComplete="new-password" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Company" value={form.company} onChange={v => set('company', v)} placeholder="Optional" autoComplete="organization" />
              <Field label="Phone" type="tel" value={form.phone} onChange={v => set('phone', v)} placeholder="Optional" autoComplete="tel" />
            </div>

            <div style={styles.disclaimer}>
              <Lock size={11} /> We create your portal account first, then redirect to Stripe to collect payment. You can sign in immediately even if checkout is interrupted.
            </div>

            <button type="submit" disabled={submitting} style={styles.submitBtn}>
              {submitting ? 'Creating account…' : <>Continue to Stripe <ArrowRight size={14} /></>}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text', autoComplete }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={styles.label}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        style={styles.input}
      />
    </label>
  )
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'rgba(2,8,23,0.78)', backdropFilter: 'blur(6px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  modal: {
    position: 'relative',
    background: '#0F172A', border: '1px solid rgba(0,207,255,0.18)',
    borderRadius: 16, padding: 28, width: '100%', maxWidth: 460,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    color: '#F1F5F9',
    boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
  },
  closeBtn: {
    position: 'absolute', top: 14, right: 14,
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8, width: 32, height: 32,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#64748B', cursor: 'pointer',
  },
  eyebrow: { fontSize: 11, fontWeight: 600, color: '#00D4FF', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 },
  title: { fontFamily: "'Orbitron', sans-serif", fontSize: 18, fontWeight: 700, color: '#F1F5F9', margin: 0 },
  priceLine: { display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  price: { fontFamily: "'Orbitron', sans-serif", fontSize: 26, fontWeight: 700, color: '#F1F5F9' },
  cycle: { fontSize: 13, color: '#64748B' },
  planChip: { fontSize: 11, fontWeight: 600, color: '#A78BFA', background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', padding: '3px 9px', borderRadius: 999, letterSpacing: '0.04em' },
  label: { fontSize: 11, fontWeight: 600, color: '#94A3B8', letterSpacing: '0.04em', textTransform: 'uppercase' },
  input: {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(0,212,255,0.15)',
    borderRadius: 9, padding: '10px 12px', color: '#F1F5F9',
    fontSize: 13.5, outline: 'none', fontFamily: 'inherit',
  },
  disclaimer: {
    display: 'flex', alignItems: 'flex-start', gap: 6,
    fontSize: 11.5, color: '#64748B', lineHeight: 1.55,
    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 8, padding: '8px 10px',
  },
  submitBtn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '11px 18px', marginTop: 4,
    background: 'linear-gradient(135deg, #00D4FF, #0099CC)',
    border: 'none', borderRadius: 10, color: '#020817',
    fontSize: 14, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
  },
  errorBanner: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
    borderRadius: 8, padding: '9px 12px', color: '#FCA5A5', fontSize: 12,
  },
  collisionBox: {
    display: 'flex', gap: 10,
    background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)',
    borderRadius: 10, padding: 14,
  },
  signInBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 14px', background: 'rgba(0,212,255,0.12)',
    border: '1px solid rgba(0,212,255,0.3)', borderRadius: 8,
    color: '#00D4FF', textDecoration: 'none', fontSize: 13, fontWeight: 600,
  },
}

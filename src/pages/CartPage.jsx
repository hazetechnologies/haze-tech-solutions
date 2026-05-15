import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ShoppingCart, Trash2, ArrowRight, AlertCircle, Lock, X } from 'lucide-react'
import Navbar from '../components/Navbar'
import { useCart } from '../lib/cart'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { effectivePrice } from '../lib/pricing'
import { trackEvent } from '../lib/telemetry'

// /cart — unified cart for both anonymous and authenticated users.
//   - Loads live plan + product data from Supabase for each cart item
//   - Detects mixed billing cycles (one-time vs recurring) and rejects with a
//     clear message; bundles + most plans are uniform so this rarely fires
//   - Anonymous: shows an inline name/email/password form, hits public-cart-checkout
//   - Authenticated: skips the form, hits portal-cart-checkout
//   - Idempotency + collision handling matches the single-plan PurchaseModal
export default function CartPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { items, remove, clear, count } = useCart()
  const [enrichedItems, setEnrichedItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', email: '', password: '', company: '', phone: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [collision, setCollision] = useState(false)

  useEffect(() => { document.title = 'Your Cart — Haze Tech Solutions' }, [])

  // Enrich cart items with live plan + product data from Supabase.
  useEffect(() => {
    if (items.length === 0) { setEnrichedItems([]); setLoading(false); return }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const planIds = items.map(i => i.plan_id)
      const { data } = await supabase
        .from('subscription_plans')
        .select('id, name, billing_cycle, discount_percent, price, stripe_price_id, product_id, active, products:product_id(id, name, base_price, active)')
        .in('id', planIds)
      if (cancelled) return
      // Preserve original cart order
      const byId = new Map((data ?? []).map(d => [d.id, d]))
      setEnrichedItems(items.map(i => ({ cartItem: i, plan: byId.get(i.plan_id) || null })))
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [items])

  const validRows = enrichedItems.filter(r => r.plan && r.plan.active && r.plan.products?.active)
  const invalidRows = enrichedItems.filter(r => !r.plan || !r.plan.active || !r.plan.products?.active)
  const missingStripeIds = validRows.filter(r => !r.plan.stripe_price_id)

  const cycles = useMemo(() => Array.from(new Set(validRows.map(r => r.plan.billing_cycle))), [validRows])
  const isMixed = cycles.length > 1
  const isOneTime = cycles[0] === 'one-time'

  const total = validRows.reduce((sum, r) => sum + effectivePrice(r.plan, r.plan.products), 0)

  async function submitCheckout(e) {
    e?.preventDefault()
    setError(null); setCollision(false)
    if (validRows.length === 0) { setError('Cart is empty.'); return }
    if (isMixed) {
      setError('Cart contains a mix of one-time and recurring items. Please check those out separately.')
      return
    }
    if (missingStripeIds.length > 0) {
      setError('Some items are not ready for checkout yet ("Coming soon"). Remove them or try again later.')
      return
    }

    const payload = {
      items: validRows.map(r => ({ plan_id: r.plan.id })),
    }

    let endpoint
    if (user) {
      endpoint = '/api/website?action=portal-cart-checkout'
    } else {
      if (!form.name.trim() || !form.email.trim() || !form.password) {
        setError('Name, email, and password are required.')
        return
      }
      if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return }
      endpoint = '/api/website?action=public-cart-checkout'
      Object.assign(payload, {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        company: form.company.trim() || null,
        phone: form.phone.trim() || null,
      })
    }

    setSubmitting(true)
    trackEvent('cart_checkout_started', { mode: user ? 'portal' : 'public', item_count: validRows.length, total })

    try {
      const headers = { 'Content-Type': 'application/json' }
      if (user) {
        const { data: { session } } = await supabase.auth.getSession()
        headers.Authorization = `Bearer ${session?.access_token ?? ''}`
      }
      const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(payload) })
      const text = await res.text()
      let data = {}
      try { data = text ? JSON.parse(text) : {} } catch { /* */ }

      if (res.status === 409 && data.error === 'client_exists') {
        setCollision(true)
        return
      }
      if (!res.ok) {
        setError(data.message || `Server error (${res.status})`)
        return
      }

      // Sign the user in client-side for the public path so the portal is warm on return.
      if (!user) {
        await supabase.auth.signInWithPassword({
          email: form.email.trim().toLowerCase(), password: form.password,
        }).catch(() => {})
      }
      // Keep the cart contents until webhook confirms; user can come back if they bail.
      // (We don't clear here — only on /portal/dashboard?checkout=success.)
      window.location.href = data.url
    } catch (err) {
      setError(err.message || 'Network error')
    } finally {
      setSubmitting(false)
    }
  }

  const empty = !loading && validRows.length === 0 && invalidRows.length === 0

  return (
    <div style={{ minHeight: '100vh', background: '#020617', color: '#F1F5F9', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <Navbar />

      <section style={{ maxWidth: 980, margin: '0 auto', padding: '140px 24px 80px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <ShoppingCart size={22} color="#00D4FF" />
          <h1 style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 26, fontWeight: 800, margin: 0 }}>Your Cart</h1>
          {count > 0 && <span style={{ marginLeft: 'auto', fontSize: 13, color: '#64748B' }}>{count} item{count === 1 ? '' : 's'}</span>}
        </div>

        {loading ? (
          <SkeletonCart />
        ) : empty ? (
          <EmptyState onBrowse={() => navigate('/pricing')} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, alignItems: 'start' }}>
            {/* Items list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {invalidRows.length > 0 && (
                <div style={styles.warnBanner}>
                  <AlertCircle size={15} />
                  <span>{invalidRows.length} item{invalidRows.length === 1 ? '' : 's'} in your cart {invalidRows.length === 1 ? 'is' : 'are'} no longer available.</span>
                </div>
              )}
              {validRows.map(({ plan }) => (
                <CartLine
                  key={plan.id}
                  plan={plan}
                  onRemove={() => remove(plan.id)}
                />
              ))}
              {invalidRows.map(({ cartItem }) => (
                <div key={cartItem.plan_id} style={{ ...styles.lineCard, opacity: 0.5 }}>
                  <span style={{ color: '#94A3B8', fontSize: 13 }}>Item unavailable — </span>
                  <button onClick={() => remove(cartItem.plan_id)} style={styles.removeBtn}><X size={13} /> Remove</button>
                </div>
              ))}

              <button
                onClick={clear}
                style={{ alignSelf: 'flex-start', marginTop: 8, background: 'none', border: 'none', color: '#64748B', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}
              >Clear cart</button>
            </div>

            {/* Summary + checkout */}
            <aside style={styles.summary}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>
                Order summary
              </div>

              {validRows.map(({ plan }) => (
                <div key={plan.id} style={styles.summaryRow}>
                  <span style={{ flex: 1, fontSize: 12, color: '#CBD5E1', lineHeight: 1.4 }}>
                    {plan.products?.name} <span style={{ color: '#475569' }}>({plan.name})</span>
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#F1F5F9', whiteSpace: 'nowrap' }}>
                    ${effectivePrice(plan, plan.products).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  </span>
                </div>
              ))}

              <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '12px 0' }} />

              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#F1F5F9' }}>Total</span>
                <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 22, fontWeight: 800, color: '#F1F5F9' }}>
                  ${total.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  {!isOneTime && cycles[0] && <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}> / {cycles[0]}</span>}
                </span>
              </div>

              {isMixed && (
                <div style={styles.warnBanner}>
                  <AlertCircle size={14} />
                  <span style={{ fontSize: 11.5 }}>Cart has mixed one-time and recurring items. Check them out separately.</span>
                </div>
              )}

              {collision ? (
                <div style={styles.collisionBox}>
                  <AlertCircle size={14} color="#FACC15" />
                  <div>
                    <p style={{ color: '#FDE68A', fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                      An account with <strong>{form.email}</strong> already exists.
                    </p>
                    <Link to={`/portal/login?next=${encodeURIComponent('/cart')}`} style={styles.signInBtn}>
                      Sign in & complete checkout <ArrowRight size={11} />
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  {!user && (
                    <form onSubmit={submitCheckout} style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
                      <Field label="Full name" value={form.name} onChange={v => setForm(s => ({ ...s, name: v }))} autoComplete="name" />
                      <Field label="Email" type="email" value={form.email} onChange={v => setForm(s => ({ ...s, email: v }))} autoComplete="email" />
                      <Field label="Password" type="password" value={form.password} onChange={v => setForm(s => ({ ...s, password: v }))} autoComplete="new-password" placeholder="≥ 8 chars" />
                      <Field label="Company (optional)" value={form.company} onChange={v => setForm(s => ({ ...s, company: v }))} autoComplete="organization" />

                      <div style={styles.disclaimer}>
                        <Lock size={10} /> Your portal account is created first, then Stripe handles the card.
                      </div>
                    </form>
                  )}

                  {error && (
                    <div style={{ ...styles.warnBanner, marginBottom: 8 }}>
                      <AlertCircle size={14} /><span style={{ fontSize: 11.5 }}>{error}</span>
                    </div>
                  )}

                  <button
                    onClick={submitCheckout}
                    disabled={submitting || validRows.length === 0 || isMixed || missingStripeIds.length > 0}
                    style={styles.checkoutBtn}
                  >
                    {submitting ? 'Redirecting…' : <>Proceed to Checkout <ArrowRight size={14} /></>}
                  </button>

                  <Link to="/pricing" style={styles.continueBtn}>Continue shopping</Link>
                </>
              )}
            </aside>
          </div>
        )}
      </section>
    </div>
  )
}

function CartLine({ plan, onRemove }) {
  const price = effectivePrice(plan, plan.products)
  const cycle = plan.billing_cycle === 'one-time' ? 'one-time' : `/ ${plan.billing_cycle}`
  return (
    <div style={styles.lineCard}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: '#F1F5F9', fontSize: 14 }}>{plan.products?.name}</div>
        <div style={{ fontSize: 12, color: '#64748B', marginTop: 3 }}>{plan.name}</div>
        {!plan.stripe_price_id && (
          <div style={{ fontSize: 11, color: '#FACC15', marginTop: 5 }}>⚠ Not ready for checkout yet (Coming soon)</div>
        )}
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 16, fontWeight: 800, color: '#F1F5F9' }}>
          ${price.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
        </div>
        <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{cycle}</div>
      </div>
      <button onClick={onRemove} style={styles.removeBtn} aria-label="Remove from cart"><Trash2 size={14} /></button>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', autoComplete, placeholder }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10.5, fontWeight: 600, color: '#94A3B8', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(0,212,255,0.15)',
          borderRadius: 8, padding: '8px 10px', color: '#F1F5F9',
          fontSize: 13, fontFamily: 'inherit', outline: 'none',
        }}
      />
    </label>
  )
}

function EmptyState({ onBrowse }) {
  return (
    <div style={{ textAlign: 'center', padding: '80px 20px', background: '#0F172A', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16 }}>
      <ShoppingCart size={42} color="#334155" style={{ marginBottom: 16 }} />
      <h3 style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 18, color: '#94A3B8', margin: 0 }}>Your cart is empty</h3>
      <p style={{ color: '#64748B', fontSize: 13, margin: '8px 0 22px' }}>Browse the catalog and add services to get started.</p>
      <button onClick={onBrowse} style={{ ...styles.checkoutBtn, display: 'inline-flex' }}>
        Browse pricing <ArrowRight size={14} />
      </button>
    </div>
  )
}

function SkeletonCart() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ ...styles.lineCard, animation: 'pulse 1.5s ease-in-out infinite' }}>
            <div style={{ height: 18, width: '50%', background: 'rgba(255,255,255,0.06)', borderRadius: 6 }} />
          </div>
        ))}
      </div>
      <div style={{ ...styles.summary, animation: 'pulse 1.5s ease-in-out infinite', height: 240 }} />
    </div>
  )
}

const styles = {
  lineCard: {
    display: 'flex', alignItems: 'center', gap: 14,
    background: '#0F172A', border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 12, padding: 16,
  },
  removeBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
    borderRadius: 8, padding: '7px 10px',
    color: '#FCA5A5', fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit',
    cursor: 'pointer',
  },
  summary: {
    position: 'sticky', top: 90,
    background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(0,212,255,0.18)',
    borderRadius: 14, padding: 22,
  },
  summaryRow: { display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
  warnBanner: {
    display: 'flex', alignItems: 'flex-start', gap: 8,
    background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)',
    borderRadius: 9, padding: '9px 11px', color: '#FDE68A', fontSize: 12,
  },
  collisionBox: {
    display: 'flex', gap: 9,
    background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)',
    borderRadius: 10, padding: 13, marginBottom: 10,
  },
  signInBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8,
    padding: '7px 12px', background: 'rgba(0,212,255,0.12)',
    border: '1px solid rgba(0,212,255,0.3)', borderRadius: 7,
    color: '#00D4FF', textDecoration: 'none', fontSize: 12, fontWeight: 600,
  },
  disclaimer: {
    display: 'flex', alignItems: 'flex-start', gap: 5,
    fontSize: 10.5, color: '#64748B', lineHeight: 1.5,
    marginTop: 2,
  },
  checkoutBtn: {
    width: '100%', padding: '12px 16px',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    background: 'linear-gradient(135deg, #00D4FF, #0099CC)',
    border: 'none', borderRadius: 10,
    color: '#020617', fontSize: 13.5, fontWeight: 800, fontFamily: 'inherit',
    cursor: 'pointer',
  },
  continueBtn: {
    display: 'block', textAlign: 'center', marginTop: 10,
    color: '#64748B', fontSize: 12, textDecoration: 'none',
  },
}

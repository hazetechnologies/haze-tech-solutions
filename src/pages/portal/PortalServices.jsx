import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, Plus, AlertCircle, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useClient } from '../../lib/PortalProtectedRoute'

// /portal/services — logged-in client picks additional services to add to
// their plan. Hits /api/website?action=portal-checkout (uses session, no
// client_id needed in body) and redirects to Stripe.

function sectionFor(displayOrder) {
  if (displayOrder <= 3) return 'smm'
  if (displayOrder === 4) return 'ai'
  if (displayOrder <= 7) return 'web'
  if (displayOrder === 8) return 'seo'
  return 'maint'  // Maintenance products live at 9–11
}

const SECTIONS = [
  { key: 'smm',   title: 'Social Media Management', accent: '#FF6B00' },
  { key: 'web',   title: 'Website Development',     accent: '#00CFFF' },
  { key: 'maint', title: 'Website Maintenance',     accent: '#22C55E', helper: 'Bolt-on retainers — 4 / 8 / 16 hrs per month, attached to a website tier above.' },
  { key: 'ai',    title: 'AI Automation',           accent: '#A78BFA' },
  { key: 'seo',   title: 'SEO & Digital Marketing', accent: '#F59E0B' },
]

export default function PortalServices() {
  const client = useClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [products, setProducts] = useState([])
  const [activePriceIds, setActivePriceIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [busyPlanId, setBusyPlanId] = useState(null)
  const [error, setError] = useState(null)

  // Surface a banner when Stripe redirected back here after cancel.
  const cancelBanner = searchParams.get('checkout') === 'canceled'

  useEffect(() => {
    if (!client?.id) return
    let cancelled = false
    ;(async () => {
      const [productsRes, subsRes] = await Promise.all([
        supabase
          .from('products')
          .select('id, name, description, base_price, display_order, subscription_plans(id, name, billing_cycle, discount_percent, stripe_price_id, display_order)')
          .eq('active', true)
          .order('display_order'),
        supabase
          .from('subscriptions')
          .select('stripe_price_id, status')
          .eq('client_id', client.id)
          .in('status', ['active', 'trialing', 'past_due']),
      ])
      if (cancelled) return
      if (productsRes.error) console.error('[PortalServices] products load failed:', productsRes.error)
      if (subsRes.error)     console.error('[PortalServices] subscriptions load failed:', subsRes.error)
      setProducts(productsRes.data ?? [])
      setActivePriceIds(new Set((subsRes.data ?? []).map(s => s.stripe_price_id).filter(Boolean)))
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [client?.id])

  const grouped = useMemo(() => {
    const out = { smm: [], web: [], maint: [], ai: [], seo: [] }
    for (const p of products) {
      const sec = sectionFor(p.display_order)
      out[sec].push(p)
    }
    return out
  }, [products])

  async function handleBuy(plan) {
    setError(null)
    setBusyPlanId(plan.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/website?action=portal-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ subscription_plan_id: plan.id }),
      })
      const text = await res.text()
      let data = {}
      try { data = text ? JSON.parse(text) : {} } catch { /* leave empty */ }
      if (!res.ok) {
        setError(data.message || `Server error (${res.status})`)
        return
      }
      window.location.href = data.url
    } catch (err) {
      setError(err.message || 'Network error')
    } finally {
      setBusyPlanId(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1100, margin: '0 auto', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div>
        <h2 style={styles.pageTitle}>Add a service to your plan</h2>
        <p style={styles.pageSub}>Browse the full catalog. Anything you already have shows as <strong style={{ color: '#22C55E' }}>Active</strong>.</p>
      </div>

      {cancelBanner && (
        <div style={styles.cancelBanner}>
          <AlertCircle size={15} />
          <span>Checkout was canceled — no charge was made. Pick a plan below to try again.</span>
          <button
            onClick={() => { searchParams.delete('checkout'); setSearchParams(searchParams) }}
            style={styles.bannerClose}
            aria-label="Dismiss"
          ><X size={14} /></button>
        </div>
      )}

      {error && (
        <div style={styles.errorBanner}>
          <AlertCircle size={15} /><span>{error}</span>
        </div>
      )}

      {loading ? (
        <SkeletonGrid />
      ) : (
        SECTIONS.map(({ key, title, accent, helper }) => {
          const list = grouped[key] || []
          if (list.length === 0) return null
          return (
            <section key={key} style={styles.section}>
              <div style={{ marginBottom: 12 }}>
                <h3 style={{ ...styles.sectionTitle, color: accent }}>{title}</h3>
                {helper && <p style={styles.sectionSub}>{helper}</p>}
              </div>
              <div style={styles.grid}>
                {list.map(product => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    accent={accent}
                    activePriceIds={activePriceIds}
                    busyPlanId={busyPlanId}
                    onBuy={handleBuy}
                  />
                ))}
              </div>
            </section>
          )
        })
      )}
    </div>
  )
}

function ProductCard({ product, accent, activePriceIds, busyPlanId, onBuy }) {
  const plans = (product.subscription_plans || [])
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
  const isActive = plans.some(p => p.stripe_price_id && activePriceIds.has(p.stripe_price_id))

  const features = (product.description || '')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('•'))
    .map(l => l.replace(/^•\s*/, ''))

  return (
    <div style={{
      background: 'rgba(15,23,42,0.7)',
      border: isActive ? `1px solid ${accent}50` : '1px solid rgba(255,255,255,0.07)',
      borderRadius: 14, padding: 20,
      display: 'flex', flexDirection: 'column', gap: 12,
      position: 'relative',
    }}>
      {isActive && (
        <span style={{
          position: 'absolute', top: -10, right: 14,
          background: '#22C55E', color: '#020617',
          fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
          padding: '3px 10px', borderRadius: 999,
        }}>● ACTIVE</span>
      )}

      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: accent, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
          {product.name.replace(/^.*?— ?/, '') || product.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 26, fontWeight: 800, color: '#F1F5F9' }}>
            ${Number(product.base_price).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
          </span>
          {plans[0] && (
            <span style={{ fontSize: 12, color: '#64748B' }}>
              {plans[0].billing_cycle === 'one-time' ? 'one-time' : `/ ${plans[0].billing_cycle}`}
            </span>
          )}
        </div>
      </div>

      {features.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {features.slice(0, 4).map((f, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, color: '#94A3B8', lineHeight: 1.4 }}>
              <Check size={12} color={accent} style={{ marginTop: 2, flexShrink: 0 }} />
              <span>{f}</span>
            </li>
          ))}
          {features.length > 4 && (
            <li style={{ fontSize: 11, color: '#64748B', paddingLeft: 18 }}>+{features.length - 4} more</li>
          )}
        </ul>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 'auto' }}>
        {isActive ? (
          <div style={{ ...styles.activeNote }}>
            <Check size={13} color="#22C55E" /> You currently have this service.
          </div>
        ) : plans.length === 0 || !plans.some(p => p.stripe_price_id) ? (
          <div style={styles.unavailable}>Coming soon</div>
        ) : (
          plans.filter(p => p.stripe_price_id).map(plan => (
            <button
              key={plan.id}
              onClick={() => onBuy(plan)}
              disabled={busyPlanId !== null}
              style={{
                ...styles.buyBtn,
                background: busyPlanId === plan.id ? 'rgba(255,255,255,0.06)' : `${accent}15`,
                border: `1px solid ${accent}40`,
                color: accent,
                cursor: busyPlanId !== null ? 'not-allowed' : 'pointer',
                opacity: busyPlanId !== null && busyPlanId !== plan.id ? 0.4 : 1,
              }}
            >
              <Plus size={13} />
              {busyPlanId === plan.id ? 'Redirecting…' : `Add ${plan.name.replace(/\(.*\)/, '').trim()}`}
              {plan.discount_percent > 0 && (
                <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 800 }}>-{plan.discount_percent}%</span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  )
}

function SkeletonGrid() {
  return (
    <div style={styles.grid}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: 20, minHeight: 240 }}>
          {[60, 35, 80, 95, 75, 70].map((w, j) => (
            <div key={j} style={{ height: j === 1 ? 22 : 12, width: w + '%', background: 'rgba(255,255,255,0.06)', borderRadius: 6, marginBottom: 12, animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      ))}
    </div>
  )
}

const styles = {
  pageTitle: { fontFamily: "'Orbitron', sans-serif", fontSize: 18, fontWeight: 700, color: '#F1F5F9', margin: 0, letterSpacing: '0.04em' },
  pageSub: { color: '#64748B', fontSize: 13, margin: '6px 0 0' },
  section: { background: '#0B1120', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 14, padding: 22 },
  sectionTitle: { fontFamily: "'Orbitron', sans-serif", fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', margin: 0 },
  sectionSub: { fontSize: 12, color: '#64748B', margin: '6px 0 0' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 },
  cancelBanner: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)',
    borderRadius: 10, padding: '12px 14px', color: '#FDE68A', fontSize: 13,
  },
  bannerClose: {
    marginLeft: 'auto', background: 'transparent', border: 'none',
    color: '#FDE68A', cursor: 'pointer', display: 'flex',
  },
  errorBanner: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
    borderRadius: 10, padding: '12px 14px', color: '#FCA5A5', fontSize: 13,
  },
  buyBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '9px 12px', borderRadius: 9,
    fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
    transition: 'background 0.15s',
  },
  activeNote: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
    borderRadius: 9, padding: '9px 12px',
    color: '#86EFAC', fontSize: 12, fontWeight: 600,
  },
  unavailable: {
    padding: '9px 12px', background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)', borderRadius: 9,
    color: '#475569', fontSize: 12, fontWeight: 600, textAlign: 'center',
  },
}

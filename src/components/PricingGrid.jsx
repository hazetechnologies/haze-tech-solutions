// src/components/PricingGrid.jsx
// Reusable pricing grid — used on /pricing, the affiliate landing page, and
// (read-only) the affiliate portal. Fetches the live catalog from Supabase and
// manages its own PurchaseModal so checkout works wherever it's embedded.
// Checkout attributes to the affiliate automatically (PurchaseModal sends the
// ref code; the public-checkout endpoint stamps it on the client).
import { useEffect, useMemo, useState } from 'react'
import { Check, TrendingUp, Users, BarChart3, Search, ShoppingCart, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { effectivePrice } from '../lib/pricing'
import { useCart } from '../lib/cart'
import PurchaseModal from './PurchaseModal'

function sectionFor(o) { if (o <= 3) return 'smm'; if (o === 4) return 'ai'; if (o <= 7) return 'web'; return 'seo' }
const SECTION_META = {
  smm: { id: 'smm', title: 'Social Media Management', subtitle: 'Daily content and growth on the platforms your customers use.', accent: '#FF6B00', icon: Users },
  web: { id: 'web-dev', title: 'Website Development', subtitle: 'Brand-aligned sites built to convert — live in days.', accent: '#00CFFF', icon: BarChart3 },
  ai: { id: 'ai', title: 'AI Automation', subtitle: 'Custom workflows that run while you sleep.', accent: '#A78BFA', icon: TrendingUp },
  seo: { id: 'seo', title: 'SEO & Digital Marketing', subtitle: 'Get found. Stay found. Convert.', accent: '#22C55E', icon: Search },
}
const fmt = (v) => Number(v).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

export default function PricingGrid({ readOnly = false, note }) {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalState, setModalState] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, description, base_price, display_order, subscription_plans(id, name, billing_cycle, discount_percent, price, stripe_price_id, display_order)')
        .eq('active', true).not('name', 'ilike', 'Website Maintenance%').order('display_order')
      if (cancelled) return
      if (error) console.error('[PricingGrid] load failed:', error)
      setProducts(data ?? []); setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  const grouped = useMemo(() => {
    const g = { smm: [], web: [], ai: [], seo: [] }
    for (const p of products) g[sectionFor(p.display_order)].push(p)
    return g
  }, [products])

  if (loading) return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
      {[0, 1, 2].map(i => <div key={i} style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, minHeight: 280, animation: 'pulse 1.5s ease-in-out infinite' }} />)}
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 44 }}>
      {note && <p style={{ color: '#94A3B8', fontSize: 13, margin: 0 }}>{note}</p>}
      {['smm', 'web', 'ai', 'seo'].map(key => grouped[key].length > 0 && (
        <Section key={key} meta={SECTION_META[key]} products={grouped[key]} readOnly={readOnly} onBuy={(p, pl) => setModalState({ product: p, plan: pl })} />
      ))}
      {modalState && <PurchaseModal product={modalState.product} plan={modalState.plan} onClose={() => setModalState(null)} />}
    </div>
  )
}

function Section({ meta, products, readOnly, onBuy }) {
  const Icon = meta.icon
  return (
    <section id={meta.id}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: `${meta.accent}15`, border: `1px solid ${meta.accent}40`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={17} color={meta.accent} /></div>
        <h2 style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 19, fontWeight: 800, color: '#F1F5F9', margin: 0, letterSpacing: '0.03em' }}>{meta.title}</h2>
      </div>
      <p style={{ fontSize: 13, color: '#94A3B8', margin: '0 0 18px' }}>{meta.subtitle}</p>
      <div style={{ display: 'grid', gridTemplateColumns: products.length === 1 ? 'minmax(260px, 460px)' : 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        {products.map(p => <Card key={p.id} product={p} accent={meta.accent} readOnly={readOnly} onBuy={onBuy} />)}
      </div>
    </section>
  )
}

function Card({ product, accent, readOnly, onBuy }) {
  const { add, remove, has } = useCart()
  const plans = (product.subscription_plans || []).filter(p => p.stripe_price_id != null).sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
  const featured = product.name.toLowerCase().includes('growth') || product.name.includes('AI Automation')
  const features = (product.description || '').split('\n').map(l => l.trim()).filter(l => l.startsWith('•')).map(l => l.replace(/^•\s*/, ''))
  return (
    <div style={{ background: 'rgba(15,23,42,0.75)', border: featured ? `1px solid ${accent}60` : '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 22, position: 'relative', display: 'flex', flexDirection: 'column', gap: 13 }}>
      {featured && <span style={{ position: 'absolute', top: -10, left: 22, background: accent, color: '#020617', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', padding: '3px 10px', borderRadius: 999 }}>POPULAR</span>}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', color: accent, textTransform: 'uppercase', marginBottom: 6 }}>{product.name.replace(/^.*?— ?/, '') || product.name}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 30, fontWeight: 800, color: '#F1F5F9' }}>${fmt(plans[0] ? effectivePrice(plans[0], product) : product.base_price)}</span>
          {plans[0] && <span style={{ fontSize: 13, color: '#64748B' }}>{plans[0].billing_cycle === 'one-time' ? 'one-time' : `/ ${plans[0].billing_cycle}`}</span>}
        </div>
      </div>
      {features.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {features.slice(0, 6).map((f, i) => <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#CBD5E1', lineHeight: 1.45 }}><Check size={14} color={accent} style={{ marginTop: 2, flexShrink: 0 }} /><span>{f}</span></li>)}
          {features.length > 6 && <li style={{ fontSize: 12, color: '#64748B', paddingLeft: 22 }}>+{features.length - 6} more</li>}
        </ul>
      )}
      {!readOnly && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto', paddingTop: 8 }}>
          {plans.length === 0 ? (
            <button disabled style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#475569', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'not-allowed' }}>Coming soon</button>
          ) : plans.map(plan => {
            const inCart = has(plan.id)
            return (
              <div key={plan.id} style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => onBuy(product, plan)} style={{ flex: 1, padding: '10px 16px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, background: featured ? `linear-gradient(135deg, ${accent}, ${accent}CC)` : 'rgba(255,255,255,0.04)', color: featured ? '#020617' : '#F1F5F9', border: featured ? 'none' : `1px solid ${accent}40`, textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Buy {plan.name.replace(/\(.*\)/, '').trim()}</span>
                  {plan.discount_percent > 0 && <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.85 }}>-{plan.discount_percent}%</span>}
                </button>
                <button onClick={() => inCart ? remove(plan.id) : add(plan.id, product.id)} title={inCart ? 'Remove from cart' : 'Add to cart'} aria-label={inCart ? 'Remove from cart' : 'Add to cart'} style={{ width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: inCart ? `${accent}25` : 'rgba(255,255,255,0.04)', border: `1px solid ${inCart ? accent : 'rgba(255,255,255,0.1)'}`, borderRadius: 10, cursor: 'pointer', color: inCart ? accent : '#94A3B8', flexShrink: 0 }}>
                  {inCart ? <CheckCircle2 size={15} /> : <ShoppingCart size={15} />}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

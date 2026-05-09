import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, TrendingUp, Users, BarChart3, Search } from 'lucide-react'
import Navbar from '../components/Navbar'
import PurchaseModal from '../components/PurchaseModal'
import { supabase } from '../lib/supabase'
import { effectivePrice } from '../lib/pricing'

// Maps a product's display_order to its grouping section.
// 1–3 SMM, 4 AI Automation, 5–7 Web Setup, 8 SEO. Maintenance products
// (display_order 9–11) are filtered out at the query level.
function sectionFor(displayOrder) {
  if (displayOrder <= 3) return 'smm'
  if (displayOrder === 4) return 'ai'
  if (displayOrder <= 7) return 'web'
  return 'seo'
}

const SECTION_META = {
  smm: { id: 'smm',     title: 'Social Media Management', subtitle: 'Daily content and growth on the platforms your customers actually use.', accent: '#FF6B00', icon: Users },
  web: { id: 'web-dev', title: 'Website Development',     subtitle: 'AI-generated copy on a brand-aligned scaffold, deployed and ready.',     accent: '#00CFFF', icon: BarChart3 },
  ai:  { id: 'ai',      title: 'AI Automation',           subtitle: 'Custom workflows that run while you sleep.',                              accent: '#A78BFA', icon: TrendingUp },
  seo: { id: 'seo',     title: 'SEO & Digital Marketing', subtitle: 'Get found. Stay found. Convert.',                                          accent: '#22C55E', icon: Search },
}

function formatPrice(value) {
  return Number(value).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

export default function PricingPage() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalState, setModalState] = useState(null)  // { product, plan } | null

  useEffect(() => {
    document.title = 'Pricing — Haze Tech Solutions'
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, description, base_price, display_order, subscription_plans(id, name, billing_cycle, discount_percent, price, stripe_price_id, display_order)')
        .eq('active', true)
        .not('name', 'ilike', 'Website Maintenance%')
        .order('display_order')
      if (cancelled) return
      if (error) console.error('[Pricing] failed to load products:', error)
      // Plans are filtered to active in the FK select via RLS (public_read_plans).
      setProducts(data ?? [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  // Smooth-scroll to whatever #anchor is in the URL on initial load.
  useEffect(() => {
    if (loading) return
    const hash = window.location.hash
    if (hash) {
      requestAnimationFrame(() => {
        document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }, [loading])

  const grouped = useMemo(() => {
    const groups = { smm: [], web: [], ai: [], seo: [] }
    for (const p of products) {
      const sec = sectionFor(p.display_order)
      groups[sec].push(p)
    }
    return groups
  }, [products])

  return (
    <div style={{ minHeight: '100vh', background: '#020617', color: '#F1F5F9', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <Navbar />

      {/* Hero */}
      <section style={{ padding: '140px 24px 60px', textAlign: 'center', maxWidth: 900, margin: '0 auto' }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <span style={pricingStyles.eyebrow}>Pricing</span>
          <h1 style={pricingStyles.title}>
            Pick what you need. <span style={pricingStyles.gradient}>Pay only for that.</span>
          </h1>
          <p style={pricingStyles.subtitle}>
            One-time builds, recurring services, and bolt-on retainers — all
            self-serve. You'll have a portal account before your card is even
            charged.
          </p>
        </motion.div>
      </section>

      {/* Sections */}
      {loading ? (
        <div style={{ padding: '0 24px 80px' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 18 }}>
            {[0, 1, 2].map(i => <SkeletonCard key={i} />)}
          </div>
        </div>
      ) : (
        <>
          {grouped.smm.length > 0 && <PricingSection meta={SECTION_META.smm} products={grouped.smm} onBuy={(p, pl) => setModalState({ product: p, plan: pl })} />}
          {grouped.web.length > 0 && <PricingSection meta={SECTION_META.web} products={grouped.web} onBuy={(p, pl) => setModalState({ product: p, plan: pl })} />}
          {grouped.ai.length  > 0 && <PricingSection meta={SECTION_META.ai}  products={grouped.ai}  onBuy={(p, pl) => setModalState({ product: p, plan: pl })} />}
          {grouped.seo.length > 0 && <PricingSection meta={SECTION_META.seo} products={grouped.seo} onBuy={(p, pl) => setModalState({ product: p, plan: pl })} />}
        </>
      )}

      {/* Already a customer */}
      <section style={{ padding: '40px 24px 100px', textAlign: 'center' }}>
        <p style={{ color: '#64748B', fontSize: 13, margin: 0 }}>
          Already a customer?{' '}
          <a href="/portal/login" style={{ color: '#00D4FF', textDecoration: 'none' }}>
            Sign in to your portal
          </a>{' '}
          to add more services to your plan.
        </p>
      </section>

      {modalState && (
        <PurchaseModal
          product={modalState.product}
          plan={modalState.plan}
          onClose={() => setModalState(null)}
        />
      )}
    </div>
  )
}

function PricingSection({ meta, products, onBuy }) {
  const Icon = meta.icon
  return (
    <section id={meta.id} style={pricingStyles.section}>
      <div style={pricingStyles.sectionHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `${meta.accent}15`, border: `1px solid ${meta.accent}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon size={18} color={meta.accent} />
          </div>
          <h2 style={pricingStyles.sectionTitle}>{meta.title}</h2>
        </div>
        <p style={pricingStyles.sectionSub}>{meta.subtitle}</p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: products.length === 1 ? 'minmax(280px, 480px)' : 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: 18,
        maxWidth: products.length === 1 ? 480 : 1100,
        margin: '0 auto',
        justifyContent: 'center',
      }}>
        {products.map((product) => (
          <ProductCard key={product.id} product={product} accent={meta.accent} onBuy={onBuy} />
        ))}
      </div>
    </section>
  )
}

function ProductCard({ product, accent, onBuy }) {
  // Sort plans so the cheapest / most-frequent appears first.
  const plans = (product.subscription_plans || [])
    .filter(p => p.stripe_price_id != null) // hide plans without Stripe IDs
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))

  // Featured tier: middle of three (Growth-style anchor) or single product
  const isFeatured = product.name.toLowerCase().includes('growth') || product.name.includes('AI Automation')

  // Description renders as a bulleted list — the catalog rows have multi-line
  // descriptions starting with "•". Split and render bullets explicitly.
  const features = (product.description || '')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('•'))
    .map(l => l.replace(/^•\s*/, ''))

  return (
    <motion.div
      whileHover={{ y: -4 }}
      style={{
        background: 'rgba(15,23,42,0.75)',
        border: isFeatured ? `1px solid ${accent}60` : '1px solid rgba(255,255,255,0.07)',
        borderRadius: 16, padding: 24,
        boxShadow: isFeatured ? `0 24px 64px ${accent}1A` : 'none',
        position: 'relative',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}
    >
      {isFeatured && (
        <span style={{
          position: 'absolute', top: -10, left: 24,
          background: accent, color: '#020617',
          fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
          padding: '3px 10px', borderRadius: 999,
        }}>POPULAR</span>
      )}

      <div>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', color: accent, textTransform: 'uppercase', marginBottom: 6 }}>
          {product.name.replace(/^.*?— ?/, '') || product.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 32, fontWeight: 800, color: '#F1F5F9' }}>
            ${formatPrice(plans[0] ? effectivePrice(plans[0], product) : product.base_price)}
          </span>
          {plans[0] && (
            <span style={{ fontSize: 13, color: '#64748B' }}>
              {plans[0].billing_cycle === 'one-time' ? 'one-time' : `/ ${plans[0].billing_cycle}`}
            </span>
          )}
        </div>
      </div>

      {features.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {features.slice(0, 6).map((f, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#CBD5E1', lineHeight: 1.45 }}>
              <Check size={14} color={accent} style={{ marginTop: 2, flexShrink: 0 }} />
              <span>{f}</span>
            </li>
          ))}
          {features.length > 6 && (
            <li style={{ fontSize: 12, color: '#64748B', paddingLeft: 22 }}>
              +{features.length - 6} more
            </li>
          )}
        </ul>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto', paddingTop: 8 }}>
        {plans.length === 0 ? (
          <button disabled style={{ ...pricingStyles.disabledBtn }}>
            Coming soon
          </button>
        ) : (
          plans.map((plan) => (
            <button
              key={plan.id}
              onClick={() => onBuy(product, plan)}
              style={{
                padding: '10px 16px',
                borderRadius: 10, cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
                background: isFeatured ? `linear-gradient(135deg, ${accent}, ${accent}CC)` : 'rgba(255,255,255,0.04)',
                color: isFeatured ? '#020617' : '#F1F5F9',
                border: isFeatured ? 'none' : `1px solid ${accent}40`,
                textAlign: 'left',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
            >
              <span>Get {plan.name.replace(/\(.*\)/, '').trim()}</span>
              {plan.discount_percent > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.85 }}>
                  -{plan.discount_percent}%
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </motion.div>
  )
}

function SkeletonCard() {
  return (
    <div style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: 24, minHeight: 320 }}>
      {[60, 40, 80, 95, 75, 70, 85].map((w, i) => (
        <div key={i} style={{ height: i === 1 ? 22 : 12, width: w + '%', background: 'rgba(255,255,255,0.06)', borderRadius: 6, marginBottom: 12, animation: 'pulse 1.5s ease-in-out infinite' }} />
      ))}
    </div>
  )
}

const pricingStyles = {
  eyebrow: { fontSize: 12, fontWeight: 600, letterSpacing: '0.12em', color: '#00D4FF', textTransform: 'uppercase' },
  title: { fontFamily: "'Orbitron', sans-serif", fontSize: 'clamp(2.2rem, 5vw, 3.4rem)', fontWeight: 900, lineHeight: 1.05, marginTop: 16, marginBottom: 16, color: '#F1F5F9' },
  gradient: { background: 'linear-gradient(135deg, #00D4FF, #A78BFA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' },
  subtitle: { fontSize: 16, color: '#94A3B8', lineHeight: 1.55, maxWidth: 560, margin: '0 auto' },
  section: { padding: '60px 24px 30px' },
  sectionHeader: { textAlign: 'center', maxWidth: 720, margin: '0 auto 36px' },
  sectionTitle: { fontFamily: "'Orbitron', sans-serif", fontSize: 22, fontWeight: 800, color: '#F1F5F9', margin: 0, letterSpacing: '0.04em' },
  sectionSub: { fontSize: 14, color: '#94A3B8', margin: '8px 0 0' },
  disabledBtn: {
    padding: '10px 16px', background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10,
    color: '#475569', fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
    cursor: 'not-allowed',
  },
}

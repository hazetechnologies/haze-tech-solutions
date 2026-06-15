import { useEffect } from 'react'
import { motion } from 'framer-motion'
import Navbar from '../components/Navbar'
import PricingGrid from '../components/PricingGrid'

export default function PricingPage() {
  useEffect(() => { document.title = 'Pricing — Haze Tech Solutions' }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#020617', color: '#F1F5F9', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <Navbar />

      <section style={{ padding: '140px 24px 50px', textAlign: 'center', maxWidth: 900, margin: '0 auto' }}>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <span style={s.eyebrow}>Pricing</span>
          <h1 style={s.title}>Pick what you need. <span style={s.gradient}>Pay only for that.</span></h1>
          <p style={s.subtitle}>One-time builds, recurring services, and bolt-on retainers — all self-serve. You'll have a portal account before your card is even charged.</p>
        </motion.div>
      </section>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 60px' }}>
        <PricingGrid />
      </div>

      <section style={{ padding: '20px 24px 100px', textAlign: 'center' }}>
        <p style={{ color: '#64748B', fontSize: 13, margin: 0 }}>
          Already a customer?{' '}
          <a href="/portal/login" style={{ color: '#00D4FF', textDecoration: 'none' }}>Sign in to your portal</a>{' '}
          to add more services to your plan.
        </p>
      </section>
    </div>
  )
}

const s = {
  eyebrow: { fontSize: 12, fontWeight: 600, letterSpacing: '0.12em', color: '#00D4FF', textTransform: 'uppercase' },
  title: { fontFamily: "'Orbitron', sans-serif", fontSize: 'clamp(2.2rem, 5vw, 3.4rem)', fontWeight: 900, lineHeight: 1.05, marginTop: 16, marginBottom: 16, color: '#F1F5F9' },
  gradient: { background: 'linear-gradient(135deg, #00D4FF, #A78BFA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' },
  subtitle: { fontSize: 16, color: '#94A3B8', lineHeight: 1.55, maxWidth: 560, margin: '0 auto' },
}

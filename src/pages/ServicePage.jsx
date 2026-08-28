import { useEffect } from 'react'
import { useParams, Navigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Bot, TrendingUp, Globe, Check, ArrowRight, ArrowUpRight, Play } from 'lucide-react'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import { trackCta } from '../lib/telemetry'

// Data-driven: one reusable page for all three service marketing pages. Each has
// a 2-minute explainer video (self-hosted MP4 in /public/videos) plus copy that
// mirrors the homepage Services section and points at the REAL free-audit routes.
const SERVICES = {
  'ai-automation': {
    icon: Bot,
    accent: '#00D4FF',
    eyebrow: 'AI Automation',
    title: 'Enterprise automation,',
    titleAccent: 'built for small teams.',
    subtitle:
      'Connect the tools you already use into one engine that captures leads, answers them, updates your CRM, and does the busywork — while you sleep.',
    video: '/videos/service-ai-automation.mp4',
    primary: { label: 'Book a free automation audit', to: '/#contact', evt: 'service-ai-automation-cta' },
    included: [
      'Custom workflow design & deployment',
      'AI agent configuration & training',
      'Lead capture, scoring & instant reply',
      'CRM & third-party tool integrations',
      'Nightly data pipelines on your own private server',
      'Process bottleneck analysis',
    ],
  },
  'social-media': {
    icon: TrendingUp,
    accent: '#FF6B00',
    eyebrow: 'Social Media Management',
    title: 'Create, schedule, and grow —',
    titleAccent: 'everywhere your audience is.',
    subtitle:
      'One system for all seven platforms: a content plan built around your brand, on-brand graphics, short-form videos, and an AI assistant that turns followers into leads.',
    video: '/videos/service-social-media.mp4',
    primary: { label: 'Get a free social audit', to: '/free-social-audit', evt: 'service-social-media-cta' },
    included: [
      'Content strategy & editorial calendar',
      'Branded graphics & short-form reels',
      'Scheduled posting to 7 platforms',
      'AI comment & DM auto-responder',
      'Full brand kit — logo, colors, voice, banners',
      'Analytics & growth reporting',
    ],
  },
  'web-development': {
    icon: Globe,
    accent: '#00D4FF',
    eyebrow: 'Web Development',
    title: 'Fast, cinematic websites,',
    titleAccent: 'engineered to convert.',
    subtitle:
      'Not a page builder — real, custom-built sites on modern technology, with booking, payments, portals, blogs, and AI chat built in from day one.',
    video: '/videos/service-web-development.mp4',
    primary: { label: 'Get a free website audit', to: '/audit', evt: 'service-web-development-cta' },
    included: [
      'Conversion-focused UI/UX design',
      'Mobile-first, fast, SEO-optimized builds',
      'Booking, payments & customer portals',
      'Blog engine & AI chat built in',
      'Native mobile apps where it fits',
      'A matching brand kit from one team',
    ],
  },
}

export default function ServicePage() {
  const { slug } = useParams()
  const svc = SERVICES[slug]
  useEffect(() => {
    if (svc) document.title = `${svc.eyebrow} — Haze Tech Solutions`
  }, [svc])
  if (!svc) return <Navigate to="/" replace />

  const Icon = svc.icon
  const a = svc.accent

  return (
    <div style={{ minHeight: '100vh', background: '#020617', color: '#F1F5F9', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <Navbar />

      {/* Hero */}
      <section style={{ padding: '130px 24px 30px', maxWidth: 960, margin: '0 auto', textAlign: 'center' }}>
        <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <span style={{ width: 34, height: 34, borderRadius: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: `${a}18`, border: `1px solid ${a}44` }}>
              <Icon size={18} style={{ color: a }} aria-hidden="true" />
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: a, textTransform: 'uppercase', fontFamily: "'Orbitron', sans-serif" }}>{svc.eyebrow}</span>
          </div>
          <h1 style={s.title}>{svc.title}{' '}<span style={{ ...s.gradient, backgroundImage: `linear-gradient(120deg, ${a}, #7eccff)` }}>{svc.titleAccent}</span></h1>
          <p style={s.subtitle}>{svc.subtitle}</p>
          <div style={{ marginTop: 30, display: 'inline-flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
            <a href={svc.primary.to} onClick={() => trackCta(svc.primary.evt, 'service-page')} className="btn-primary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {svc.primary.label} <ArrowRight size={16} aria-hidden="true" />
            </a>
            <Link to="/pricing" onClick={() => trackCta('service-view-pricing', 'service-page')} style={s.secondaryBtn}>View pricing</Link>
          </div>
        </motion.div>
      </section>

      {/* Explainer video */}
      <section style={{ padding: '24px 24px 10px', maxWidth: 1000, margin: '0 auto' }}>
        <motion.div
          initial={{ opacity: 0, y: 26 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}
          style={{ borderRadius: 18, overflow: 'hidden', border: `1px solid ${a}40`, boxShadow: `0 30px 90px rgba(0,0,0,0.6), 0 0 60px ${a}18` }}
        >
          <video
            controls preload="metadata" playsInline
            style={{ display: 'block', width: '100%', height: 'auto', background: '#04101f' }}
          >
            <source src={svc.video} type="video/mp4" />
          </video>
        </motion.div>
        <p style={{ textAlign: 'center', color: '#64748B', fontSize: 13, marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 7, width: '100%', justifyContent: 'center' }}>
          <Play size={13} style={{ color: a }} aria-hidden="true" /> A 2-minute overview
        </p>
      </section>

      {/* What's included */}
      <section style={{ padding: '50px 24px', maxWidth: 960, margin: '0 auto' }}>
        <h2 style={s.h2}>What's included</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, marginTop: 26 }}>
          {svc.included.map((item) => (
            <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 13, padding: '16px 18px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <span style={{ marginTop: 2, width: 22, height: 22, borderRadius: 6, flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: `${a}18`, border: `1px solid ${a}40` }}>
                <Check size={13} style={{ color: a }} aria-hidden="true" />
              </span>
              <span style={{ color: '#cbd5e1', fontSize: 15, lineHeight: 1.5 }}>{item}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Proof / portfolio */}
      <section style={{ padding: '10px 24px 60px', maxWidth: 960, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ borderRadius: 16, padding: '34px 28px', background: 'linear-gradient(135deg, rgba(0,212,255,0.06), rgba(255,107,0,0.05))', border: '1px solid rgba(255,255,255,0.08)' }}>
          <h3 style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 22, fontWeight: 800, margin: 0, color: '#F1F5F9' }}>Real products. Real customers.</h3>
          <p style={{ color: '#94A3B8', fontSize: 15, margin: '12px auto 20px', maxWidth: 560, lineHeight: 1.55 }}>
            Everything you just saw, we designed, built, and run ourselves. See the live sites and case studies.
          </p>
          <a href="/#portfolio" onClick={() => trackCta('service-see-work', 'service-page')} style={{ ...s.secondaryBtn, borderColor: `${a}55`, color: a }}>
            See our work <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </div>
      </section>

      {/* Closing CTA */}
      <section style={{ padding: '10px 24px 90px', textAlign: 'center' }}>
        <h2 style={{ ...s.h2, marginBottom: 8 }}>Ready to start?</h2>
        <p style={{ color: '#94A3B8', fontSize: 15, marginBottom: 22 }}>Enterprise tools, built for the underdog.</p>
        <a href={svc.primary.to} onClick={() => trackCta(svc.primary.evt + '-footer', 'service-page')} className="btn-primary" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {svc.primary.label} <ArrowRight size={16} aria-hidden="true" />
        </a>
      </section>

      <Footer />
    </div>
  )
}

const s = {
  title: { fontFamily: "'Orbitron', sans-serif", fontSize: 'clamp(2.1rem, 5vw, 3.3rem)', fontWeight: 900, lineHeight: 1.06, marginTop: 6, marginBottom: 18, color: '#F1F5F9' },
  gradient: { WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' },
  subtitle: { fontSize: 17, color: '#94A3B8', lineHeight: 1.6, maxWidth: 620, margin: '0 auto' },
  h2: { fontFamily: "'Orbitron', sans-serif", fontSize: 'clamp(1.5rem, 3vw, 2rem)', fontWeight: 800, textAlign: 'center', color: '#F1F5F9', margin: 0 },
  secondaryBtn: { fontFamily: "'Orbitron', sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: '0.06em', padding: '0.8rem 1.6rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: '#cbd5e1', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 7 },
}

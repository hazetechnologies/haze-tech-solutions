import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Bot, TrendingUp, Globe, Check, ArrowRight } from 'lucide-react'
import { trackCta } from '../lib/telemetry'

const services = [
  {
    icon: Bot,
    title: 'AI Automation',
    tagline: 'Work smarter, not harder.',
    accent: '#00CFFF',
    glowColor: 'rgba(0, 207, 255, 0.25)',
    borderHover: 'rgba(0, 207, 255, 0.4)',
    bullets: [
      'Custom workflow design & deployment',
      'AI agent configuration & training',
      'Process bottleneck analysis',
      'CRM & third-party tool integrations',
    ],
  },
  {
    icon: TrendingUp,
    title: 'Social Media Marketing',
    tagline: 'Grow your audience on autopilot.',
    accent: '#FF6B00',
    glowColor: 'rgba(255, 107, 0, 0.25)',
    borderHover: 'rgba(255, 107, 0, 0.4)',
    bullets: [
      'Content strategy & editorial calendar',
      'Scheduled posting automation',
      'Analytics & growth reporting',
      'Brand voice development',
    ],
    cta: { label: 'Get a Free Social Audit', to: '/free-social-audit' },
  },
  {
    icon: Globe,
    title: 'Website Development',
    tagline: 'Sites built to convert.',
    accent: '#00CFFF',
    glowColor: 'rgba(0, 207, 255, 0.15)',
    borderHover: 'rgba(255, 107, 0, 0.4)',
    bullets: [
      'Conversion-focused UI/UX design',
      'Mobile-first responsive builds',
      'SEO-optimized structure & markup',
      'CMS integration & training',
    ],
  },
]

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15 } },
}

const cardVariants = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
}

export default function Services() {
  return (
    <section
      id="services"
      className="relative py-28 px-6 overflow-hidden"
      style={{ background: '#040D1A' }}
      aria-label="Services"
    >
      {/* Background orb — orange */}
      <div
        className="orb orb-orange"
        style={{ width: 400, height: 400, top: '10%', right: '-5%', opacity: 0.7 }}
        aria-hidden="true"
      />

      <div className="max-w-6xl mx-auto">
        {/* Section header */}
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <span className="section-label">What We Do</span>
          <h2
            className="font-display font-black mt-4 mb-4 text-text-main"
            style={{ fontSize: 'clamp(2rem, 5vw, 3.25rem)', lineHeight: 1.1 }}
          >
            Three Pillars.{' '}
            <span className="gradient-text">One Agency.</span>
          </h2>
          <p className="text-muted text-lg max-w-xl mx-auto">
            We combine AI-powered tools with expert strategy to help your business
            operate faster, look better, and grow consistently.
          </p>
        </motion.div>

        {/* Cards */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
        >
          {services.map((service) => {
            const Icon = service.icon
            return (
              <motion.article
                key={service.title}
                variants={cardVariants}
                whileHover={{
                  y: -8,
                  boxShadow: `0 24px 60px rgba(0,0,0,0.6), 0 0 40px ${service.glowColor}`,
                  borderColor: service.borderHover,
                }}
                className="glass-card p-8 flex flex-col relative cursor-default"
                style={{
                  transition: 'all 0.3s ease',
                  borderColor: 'rgba(0, 207, 255, 0.1)',
                }}
              >
                {/* Icon */}
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-6"
                  style={{
                    background: `linear-gradient(135deg, ${service.accent}22, ${service.accent}08)`,
                    border: `1px solid ${service.accent}44`,
                  }}
                >
                  <Icon size={22} style={{ color: service.accent }} aria-hidden="true" />
                </div>

                {/* Title & tagline */}
                <h3 className="font-display font-bold text-lg text-text-main mb-1">
                  {service.title}
                </h3>
                <p className="text-sm mb-6" style={{ color: service.accent }}>
                  {service.tagline}
                </p>

                {/* Bullet list */}
                <ul className="space-y-3 flex-1">
                  {service.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-3">
                      <Check
                        size={15}
                        className="mt-0.5 shrink-0"
                        style={{ color: service.accent }}
                        aria-hidden="true"
                      />
                      <span className="text-muted text-sm leading-relaxed">{bullet}</span>
                    </li>
                  ))}
                </ul>

                {/* Per-service CTA */}
                {service.cta && (
                  <Link
                    to={service.cta.to}
                    onClick={() => trackCta(service.cta.to === '/free-social-audit' ? 'services-social-media-audit' : 'services-website-audit', 'services')}
                    className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold transition-all"
                    style={{
                      color: service.accent,
                      textDecoration: 'none',
                      letterSpacing: '0.01em',
                    }}
                  >
                    {service.cta.label}
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                )}

                {/* Bottom accent line */}
                <div
                  className="mt-8 h-px w-full"
                  style={{
                    background: `linear-gradient(to right, ${service.accent}44, transparent)`,
                  }}
                />
              </motion.article>
            )
          })}
        </motion.div>

        {/* Bottom CTA */}
        <motion.div
          className="text-center mt-14"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4, duration: 0.6 }}
        >
          <p className="text-muted mb-4 text-sm">Not sure where to start?</p>
          <motion.button
            onClick={() => {
              const el = document.querySelector('#contact')
              if (el) el.scrollIntoView({ behavior: 'smooth' })
            }}
            className="btn-primary"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
          >
            Book a Consultation
          </motion.button>
        </motion.div>
      </div>
    </section>
  )
}

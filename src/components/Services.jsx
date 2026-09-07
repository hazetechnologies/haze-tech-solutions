import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Bot, TrendingUp, Globe, Check, ArrowRight } from 'lucide-react'
import { trackCta } from '../lib/telemetry'
import { useI18n } from '../i18n'

// Visual config only — every string comes from the active locale dictionary
// (services.items.<slug>) so all five languages share one layout.
const SERVICE_CARDS = [
  {
    icon: Bot,
    slug: 'ai-automation',
    accent: '#00CFFF',
    glowColor: 'rgba(0, 207, 255, 0.25)',
    borderHover: 'rgba(0, 207, 255, 0.4)',
  },
  {
    icon: TrendingUp,
    slug: 'social-media',
    accent: '#FF6B00',
    glowColor: 'rgba(255, 107, 0, 0.25)',
    borderHover: 'rgba(255, 107, 0, 0.4)',
  },
  {
    icon: Globe,
    slug: 'web-development',
    accent: '#00CFFF',
    glowColor: 'rgba(0, 207, 255, 0.15)',
    borderHover: 'rgba(255, 107, 0, 0.4)',
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
  const { t, tl, path } = useI18n()

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
          <span className="section-label">{t('services.label')}</span>
          <h2
            className="font-display font-black mt-4 mb-4 text-text-main"
            style={{ fontSize: 'clamp(2rem, 5vw, 3.25rem)', lineHeight: 1.1 }}
          >
            {t('services.title1')}{' '}
            <span className="gradient-text">{t('services.title2')}</span>
          </h2>
          <p className="text-muted text-lg max-w-xl mx-auto">
            {t('services.lead')}
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
          {SERVICE_CARDS.map((service) => {
            const Icon = service.icon
            const title = t(`services.items.${service.slug}.title`)
            const tagline = t(`services.items.${service.slug}.tagline`)
            const bullets = tl(`services.items.${service.slug}.bullets`)
            return (
              <motion.article
                key={service.slug}
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
                  {title}
                </h3>
                <p className="text-sm mb-6" style={{ color: service.accent }}>
                  {tagline}
                </p>

                {/* Bullet list */}
                <ul className="space-y-3 flex-1">
                  {bullets.map((bullet) => (
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

                {/* Link to the full service page (with a 2-minute explainer video) */}
                <Link
                  to={path(`/services/${service.slug}`)}
                  onClick={() => trackCta(`services-${service.slug}-learnmore`, 'services')}
                  className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold transition-all"
                  style={{ color: service.accent, textDecoration: 'none', letterSpacing: '0.01em' }}
                >
                  {t('services.watch')}
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>

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
          <p className="text-muted mb-4 text-sm">{t('services.ready')}</p>
          <div style={{ display: 'inline-flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px' }}>
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              style={{ display: 'inline-flex' }}
            >
              <Link
                to={path('/pricing')}
                onClick={() => trackCta('services-view-pricing', 'services')}
                className="btn-primary"
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
              >
                {t('services.viewPricing')}
              </Link>
            </motion.div>
            <motion.button
              onClick={() => {
                trackCta('services-book-consultation', 'services')
                const el = document.querySelector('#contact')
                if (el) el.scrollIntoView({ behavior: 'smooth' })
              }}
              className="text-sm"
              style={{
                fontFamily: 'Orbitron, sans-serif',
                fontWeight: 700,
                letterSpacing: '0.08em',
                padding: '0.75rem 1.75rem',
                borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'transparent',
                color: '#94A3B8',
                cursor: 'pointer',
                fontSize: '0.8rem',
              }}
              whileHover={{ scale: 1.05, color: '#F1F5F9' }}
              whileTap={{ scale: 0.97 }}
            >
              {t('services.orBook')}
            </motion.button>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

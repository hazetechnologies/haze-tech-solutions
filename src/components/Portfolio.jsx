import { motion } from 'framer-motion'
import { TrendingUp, Users, BarChart3, ArrowUpRight } from 'lucide-react'

const caseStudies = [
  {
    client: 'Coastal Coffee Co.',
    industry: 'Food & Beverage',
    service: 'AI Automation',
    serviceColor: '#00D4FF',
    icon: TrendingUp,
    challenge: 'Catering inquiries were falling through the cracks — slow manual follow-ups cost them bookings every week.',
    result: '3× response rate. 40% increase in catering bookings within 60 days.',
    metric: '+40%',
    metricLabel: 'Bookings',
    tags: ['CRM Integration', 'Lead Automation', 'Follow-up AI'],
  },
  {
    client: 'Ember Boutique',
    industry: 'Retail & Fashion',
    service: 'Social Media',
    serviceColor: '#8B5CF6',
    icon: Users,
    challenge: 'Inconsistent posting and no content strategy left their social presence stagnant at 12K followers for over a year.',
    result: '12K → 47K Instagram followers in 90 days with automated content scheduling.',
    metric: '3.9×',
    metricLabel: 'Follower Growth',
    tags: ['Content Strategy', 'Post Automation', 'Growth Analytics'],
  },
  {
    client: 'Summit Legal Group',
    industry: 'Professional Services',
    service: 'Web Development',
    serviceColor: '#00D4FF',
    icon: BarChart3,
    challenge: 'An outdated website with poor mobile performance was driving away potential clients before they even made contact.',
    result: '210% increase in organic traffic. 55% lower bounce rate. 2× contact form submissions.',
    metric: '+210%',
    metricLabel: 'Organic Traffic',
    tags: ['SEO Optimization', 'Mobile-First', 'Conversion Design'],
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

export default function Portfolio() {
  return (
    <section
      id="portfolio"
      className="relative py-28 px-6 overflow-hidden"
      style={{ background: '#0F172A' }}
      aria-label="Portfolio and case studies"
    >
      {/* Subtle top border glow */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: 'linear-gradient(to right, transparent, rgba(0,212,255,0.3), transparent)' }}
        aria-hidden="true"
      />

      {/* Background orbs */}
      <div
        className="orb orb-cyan"
        style={{ width: 500, height: 500, bottom: '-10%', left: '-10%', opacity: 0.5 }}
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
          <span className="section-label">Case Studies</span>
          <h2
            className="font-display font-black mt-4 mb-4 text-text-main"
            style={{ fontSize: 'clamp(2rem, 5vw, 3.25rem)', lineHeight: 1.1 }}
          >
            Real Businesses.{' '}
            <span className="gradient-text">Real Results.</span>
          </h2>
          <p className="text-muted text-lg max-w-xl mx-auto">
            Here's what happens when small businesses get enterprise-grade tools
            working for them around the clock.
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
          {caseStudies.map((study) => {
            const Icon = study.icon
            return (
              <motion.article
                key={study.client}
                variants={cardVariants}
                whileHover={{
                  y: -6,
                  boxShadow: `0 20px 50px rgba(0,0,0,0.5), 0 0 30px rgba(0,212,255,0.1)`,
                }}
                className="glass-card overflow-hidden flex flex-col"
                style={{
                  background: 'rgba(2, 8, 23, 0.6)',
                  transition: 'all 0.3s ease',
                }}
              >
                {/* Card header */}
                <div
                  className="px-6 py-5 flex items-start justify-between"
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    background: `linear-gradient(135deg, ${study.serviceColor}08, transparent)`,
                  }}
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="text-xs font-display font-semibold px-2 py-0.5 rounded"
                        style={{
                          color: study.serviceColor,
                          background: `${study.serviceColor}15`,
                          border: `1px solid ${study.serviceColor}30`,
                        }}
                      >
                        {study.service}
                      </span>
                    </div>
                    <h3 className="font-display font-bold text-text-main text-base">
                      {study.client}
                    </h3>
                    <p className="text-muted text-xs mt-0.5">{study.industry}</p>
                  </div>
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      background: `${study.serviceColor}15`,
                      border: `1px solid ${study.serviceColor}25`,
                    }}
                  >
                    <Icon size={18} style={{ color: study.serviceColor }} aria-hidden="true" />
                  </div>
                </div>

                {/* Body */}
                <div className="px-6 py-5 flex-1 flex flex-col">
                  <p className="text-muted text-sm leading-relaxed mb-5">
                    <span className="text-white/50 font-medium">Challenge: </span>
                    {study.challenge}
                  </p>

                  {/* Result metric */}
                  <div
                    className="rounded-xl p-4 mb-5 flex items-center gap-4"
                    style={{ background: `${study.serviceColor}08`, border: `1px solid ${study.serviceColor}18` }}
                  >
                    <div>
                      <div
                        className="font-display font-black text-3xl"
                        style={{ color: study.serviceColor }}
                      >
                        {study.metric}
                      </div>
                      <div className="text-muted text-xs">{study.metricLabel}</div>
                    </div>
                    <p className="text-sm text-text-main/80 leading-snug">
                      {study.result}
                    </p>
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-2 mt-auto">
                    {study.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-2 py-1 rounded-md text-muted"
                        style={{
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.08)',
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
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
          transition={{ delay: 0.4 }}
        >
          <p className="text-muted text-sm mb-4">
            Ready to become our next success story?
          </p>
          <motion.button
            onClick={() => {
              const el = document.querySelector('#contact')
              if (el) el.scrollIntoView({ behavior: 'smooth' })
            }}
            className="btn-primary inline-flex items-center gap-2"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
          >
            Get a Free Audit
            <ArrowUpRight size={16} aria-hidden="true" />
          </motion.button>
        </motion.div>
      </div>

      {/* Bottom border */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px"
        style={{ background: 'linear-gradient(to right, transparent, rgba(139,92,246,0.3), transparent)' }}
        aria-hidden="true"
      />
    </section>
  )
}

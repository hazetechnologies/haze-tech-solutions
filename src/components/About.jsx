import { motion } from 'framer-motion'
import { Zap, Heart, Target } from 'lucide-react'

const values = [
  {
    icon: Heart,
    title: 'Boutique & Hands-On',
    description:
      "You're not a ticket in a queue. Every client gets direct access to our team, personalized strategies, and consistent communication from day one.",
    accent: '#00CFFF',
  },
  {
    icon: Zap,
    title: 'AI-First Approach',
    description:
      'We build around the best AI tools available — not as a gimmick, but because they genuinely compress timelines, reduce costs, and unlock capabilities that weren\'t possible before.',
    accent: '#FF6B00',
  },
  {
    icon: Target,
    title: 'Results-Focused',
    description:
      'We measure success in outcomes, not deliverables. More leads, more conversions, more growth — that\'s the standard we hold ourselves to for every engagement.',
    accent: '#00CFFF',
  },
]

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
}

export default function About() {
  return (
    <section
      id="about"
      className="relative py-28 px-6 overflow-hidden"
      style={{ background: '#040D1A' }}
      aria-label="About Haze Tech Solutions"
    >
      {/* Orbs */}
      <div
        className="orb orb-violet"
        style={{ width: 450, height: 450, top: '-5%', left: '-5%', opacity: 0.6 }}
        aria-hidden="true"
      />
      <div
        className="orb orb-cyan"
        style={{ width: 350, height: 350, bottom: '0%', right: '-5%', opacity: 0.5 }}
        aria-hidden="true"
      />

      <div className="max-w-6xl mx-auto">
        {/* Two-column layout: story + founder */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center mb-24">
          {/* Story */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
          >
            <span className="section-label">Our Story</span>
            <h2
              className="font-display font-black mt-4 mb-6 text-text-main"
              style={{ fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', lineHeight: 1.15 }}
            >
              Built for the{' '}
              <span className="gradient-text">Underdog</span>
            </h2>
            <div className="space-y-4 text-muted text-base leading-relaxed">
              <p>
                Haze Tech Solutions was founded with one belief: small businesses
                and startups deserve the same caliber of automation, marketing, and
                technology that Fortune 500 companies take for granted.
              </p>
              <p>
                The gap was clear. Enterprise teams had AI tools, dedicated social
                teams, and custom-built websites. Small business owners had duct tape
                and late nights. We set out to close that gap permanently.
              </p>
              <p>
                Today we partner with founders, local businesses, and growing startups
                to build the systems, content, and digital presence that let them
                compete — and win.
              </p>
            </div>
          </motion.div>

          {/* Founder card */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="flex justify-center lg:justify-end"
          >
            <div
              className="glass-card p-8 max-w-xs w-full text-center"
              style={{ background: 'rgba(255,255,255,0.03)' }}
            >
              {/* Avatar */}
              <div className="flex justify-center mb-5">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className="relative w-24 h-24 rounded-full flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, rgba(0,207,255,0.2), rgba(255,107,0,0.2))',
                    border: '2px solid rgba(0,207,255,0.3)',
                    boxShadow: '0 0 24px rgba(0,207,255,0.2)',
                  }}
                >
                  <span
                    className="font-display font-black text-3xl gradient-text"
                    aria-label="Josiah's avatar"
                  >
                    J
                  </span>
                  {/* Online indicator */}
                  <span
                    className="absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-background"
                    style={{ background: '#22c55e' }}
                    aria-label="Available"
                  />
                </motion.div>
              </div>

              <h3 className="font-display font-bold text-text-main text-lg mb-1">
                Josiah
              </h3>
              <p className="text-primary text-sm font-medium mb-1">
                Founder & Lead Strategist
              </p>
              <p className="text-muted text-xs mb-6 leading-relaxed">
                Automation architect & growth strategist helping small businesses
                operate at enterprise speed.
              </p>

              {/* Divider */}
              <div
                className="h-px w-full mb-5"
                style={{ background: 'linear-gradient(to right, transparent, rgba(0,207,255,0.2), transparent)' }}
              />

              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { val: '50+', lbl: 'Clients' },
                  { val: '3yrs', lbl: 'Experience' },
                  { val: '98%', lbl: 'Satisfaction' },
                ].map((s) => (
                  <div key={s.lbl}>
                    <div className="font-display font-bold text-primary text-base">{s.val}</div>
                    <div className="text-muted text-xs">{s.lbl}</div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        {/* Values */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
        >
          <motion.div variants={itemVariants} className="text-center mb-12">
            <h2
              className="font-display font-black text-text-main"
              style={{ fontSize: 'clamp(1.6rem, 3.5vw, 2.5rem)' }}
            >
              Why Clients Choose{' '}
              <span className="gradient-text">Haze Tech</span>
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {values.map((val) => {
              const Icon = val.icon
              return (
                <motion.div
                  key={val.title}
                  variants={itemVariants}
                  whileHover={{
                    y: -6,
                    borderColor: `${val.accent}44`,
                    boxShadow: `0 16px 40px rgba(0,0,0,0.3), 0 0 20px ${val.accent}18`,
                  }}
                  className="glass-card p-7"
                  style={{ transition: 'all 0.3s ease' }}
                >
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center mb-5"
                    style={{
                      background: `${val.accent}15`,
                      border: `1px solid ${val.accent}30`,
                    }}
                  >
                    <Icon size={20} style={{ color: val.accent }} aria-hidden="true" />
                  </div>
                  <h3 className="font-display font-bold text-text-main text-base mb-3">
                    {val.title}
                  </h3>
                  <p className="text-muted text-sm leading-relaxed">
                    {val.description}
                  </p>
                </motion.div>
              )
            })}
          </div>
        </motion.div>
      </div>
    </section>
  )
}

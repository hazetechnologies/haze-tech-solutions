import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronDown, Sparkles } from 'lucide-react'

// Animation variants
const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.15, delayChildren: 0.3 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: 'easeOut' } },
}

const floatAnim = {
  y: [0, -18, 0],
  rotate: [0, 3, 0],
  transition: { duration: 6, repeat: Infinity, ease: 'easeInOut' },
}

export default function Hero() {
  const handleScroll = (href) => {
    const el = document.querySelector(href)
    if (el) el.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <section
      id="home"
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
      style={{ background: '#040D1A' }}
      aria-label="Hero section"
    >
      {/* ── Animated grid background ── */}
      <div
        className="absolute inset-0 grid-bg opacity-60"
        aria-hidden="true"
      />

      {/* ── Radial gradient orbs ── */}
      <div
        className="orb orb-cyan"
        style={{ width: 600, height: 600, top: '-10%', left: '-15%' }}
        aria-hidden="true"
      />
      <div
        className="orb orb-violet"
        style={{ width: 500, height: 500, bottom: '-10%', right: '-10%' }}
        aria-hidden="true"
      />
      <div
        className="orb orb-cyan"
        style={{ width: 300, height: 300, top: '40%', right: '20%', opacity: 0.6 }}
        aria-hidden="true"
      />

      {/* ── Floating geometric shapes ── */}
      <motion.div
        animate={floatAnim}
        className="absolute top-24 right-16 md:right-32 hidden sm:block"
        aria-hidden="true"
      >
        <div
          style={{
            width: 80,
            height: 80,
            border: '1px solid rgba(0, 207, 255, 0.3)',
            borderRadius: 8,
            transform: 'rotate(20deg)',
            background: 'rgba(0, 207, 255, 0.04)',
          }}
        />
      </motion.div>

      <motion.div
        animate={{ ...floatAnim, transition: { ...floatAnim.transition, duration: 8, delay: 2 } }}
        className="absolute bottom-32 left-16 hidden md:block"
        aria-hidden="true"
      >
        <div
          style={{
            width: 56,
            height: 56,
            border: '1px solid rgba(255, 107, 0, 0.35)',
            borderRadius: '50%',
            background: 'rgba(255, 107, 0, 0.05)',
          }}
        />
      </motion.div>

      <motion.div
        animate={{ ...floatAnim, transition: { ...floatAnim.transition, duration: 7, delay: 1 } }}
        className="absolute top-1/3 left-10 hidden lg:block"
        aria-hidden="true"
      >
        <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
          <polygon
            points="22,2 42,12 42,32 22,42 2,32 2,12"
            stroke="rgba(0, 207, 255, 0.2)"
            strokeWidth="1"
            fill="none"
          />
        </svg>
      </motion.div>

      {/* ── Main content ── */}
      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Eyebrow label */}
          <motion.div variants={itemVariants} className="flex justify-center mb-6">
            <span className="section-label">
              AI Automation · Social Media · Web Dev
            </span>
          </motion.div>

          {/* Main headline */}
          <motion.h1
            variants={itemVariants}
            className="font-display font-black leading-none mb-6"
            style={{ fontSize: 'clamp(2.8rem, 8vw, 6rem)' }}
          >
            <span className="gradient-text block">Built to Scale.</span>
            <span className="text-text-main block">Wired to Win.</span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            variants={itemVariants}
            className="text-muted text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            Haze Tech Solutions gives small businesses and startups access to
            enterprise-grade AI automation, social media marketing, and
            conversion-focused web development — all under one roof.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            variants={itemVariants}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center"
          >
            <motion.button
              onClick={() => handleScroll('#contact')}
              className="btn-primary text-sm"
              whileHover={{ scale: 1.06, boxShadow: '0 0 30px rgba(0,212,255,0.5)' }}
              whileTap={{ scale: 0.97 }}
            >
              Get Started
              <ArrowRight size={16} aria-hidden="true" />
            </motion.button>

            <motion.div
              whileHover={{ scale: 1.04, boxShadow: '0 0 24px rgba(0,207,255,0.25)' }}
              whileTap={{ scale: 0.97 }}
              style={{ display: 'inline-flex' }}
            >
              <Link
                to="/free-social-audit"
                className="text-sm"
                style={{
                  fontFamily: 'Orbitron, sans-serif',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  padding: '0.75rem 1.75rem',
                  borderRadius: 8,
                  border: '1px solid rgba(0, 207, 255, 0.55)',
                  background: 'rgba(0, 207, 255, 0.06)',
                  color: '#00CFFF',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  whiteSpace: 'nowrap',
                  fontSize: '0.8rem',
                  transition: 'all 0.3s ease',
                }}
              >
                <Sparkles size={15} aria-hidden="true" />
                Free Social Audit
              </Link>
            </motion.div>

            <motion.button
              onClick={() => handleScroll('#portfolio')}
              className="btn-secondary text-sm"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              See Our Work
            </motion.button>
          </motion.div>

          {/* Stats bar */}
          <motion.div
            variants={itemVariants}
            className="mt-16 pt-8 border-t border-white/5 grid grid-cols-3 gap-6 max-w-xl mx-auto"
          >
            {[
              { value: '3×', label: 'Avg Response Rate' },
              { value: '90+', label: 'Days to Results' },
              { value: '100%', label: 'Client Focused' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="font-display font-black text-2xl md:text-3xl gradient-text">
                  {stat.value}
                </div>
                <div className="text-muted text-xs mt-1">{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </div>

      {/* ── Scroll indicator ── */}
      <motion.button
        onClick={() => handleScroll('#services')}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 text-muted hover:text-primary transition-colors"
        animate={{ y: [0, 6, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        aria-label="Scroll to services"
        style={{ background: 'none', border: 'none', cursor: 'pointer' }}
      >
        <ChevronDown size={24} />
      </motion.button>
    </section>
  )
}

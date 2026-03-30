import { useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import logoIcon from '../assets/logo/haze-logo-icon.svg'

// Simple inline social icons to avoid extra deps
const InstagramIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
  </svg>
)

const LinkedInIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/>
    <rect x="2" y="9" width="4" height="12"/>
    <circle cx="4" cy="4" r="2"/>
  </svg>
)

const XIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
)

const navLinks = [
  { label: 'Home', href: '#home' },
  { label: 'Services', href: '#services' },
  { label: 'Portfolio', href: '#portfolio' },
  { label: 'About', href: '#about' },
  { label: 'Contact', href: '#contact' },
]

const serviceLinks = [
  'AI Automation',
  'Social Media Marketing',
  'Website Development',
  'Free Audit',
]

const socialLinks = [
  { label: 'Instagram', href: 'https://instagram.com', Icon: InstagramIcon },
  { label: 'LinkedIn', href: 'https://linkedin.com', Icon: LinkedInIcon },
  { label: 'X / Twitter', href: 'https://x.com', Icon: XIcon },
]

const handleScroll = (href) => {
  const el = document.querySelector(href)
  if (el) el.scrollIntoView({ behavior: 'smooth' })
}

export default function Footer() {
  const [nlEmail, setNlEmail] = useState('')
  const [nlStatus, setNlStatus] = useState('idle') // idle | loading | success | error

  const handleSubscribe = async (e) => {
    e.preventDefault()
    if (!nlEmail.trim()) return
    setNlStatus('loading')
    try {
      const { error } = await supabase.from('newsletter_subscribers').insert({ email: nlEmail.trim(), source: 'website_footer' })
      if (error) {
        if (error.code === '23505') setNlStatus('success') // already subscribed
        else throw error
      } else {
        setNlStatus('success')
        // Trigger welcome email via n8n
        fetch('https://n8n.srv934577.hstgr.cloud/webhook/newsletter-welcome', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: nlEmail.trim() }),
        }).catch(console.error)
      }
      setNlEmail('')
    } catch {
      setNlStatus('error')
    }
  }

  return (
    <footer
      className="relative pt-20 pb-10 px-6 overflow-hidden"
      style={{
        background: '#040D1A',
        borderTop: '1px solid rgba(0, 207, 255, 0.1)',
      }}
      aria-label="Site footer"
    >
      {/* Orb */}
      <div
        className="orb orb-violet"
        style={{ width: 400, height: 400, bottom: '-20%', left: '50%', transform: 'translateX(-50%)', opacity: 0.3 }}
        aria-hidden="true"
      />

      <div className="max-w-6xl mx-auto relative z-10">
        {/* Top row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-14">
          {/* Brand column */}
          <div className="md:col-span-2">
            {/* Logo */}
            <motion.div
              className="flex items-center gap-2 mb-4"
              whileHover={{ scale: 1.02 }}
              style={{ width: 'fit-content' }}
            >
              <img src={logoIcon} alt="Haze Tech" width="28" height="28" />
              <span
                className="font-display font-black text-base gradient-text"
              >
                Haze Tech Solutions
              </span>
            </motion.div>

            <p className="text-muted text-sm leading-relaxed max-w-xs mb-6">
              Built to Scale. Wired to Win. — AI automation, social media marketing,
              and website development for small businesses and startups ready to grow.
            </p>

            {/* Social icons */}
            <div className="flex items-center gap-4">
              {socialLinks.map(({ label, href, Icon }) => (
                <motion.a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="text-muted hover:text-primary transition-colors duration-200"
                  whileHover={{ scale: 1.15, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Icon />
                </motion.a>
              ))}
            </div>
          </div>

          {/* Navigation column */}
          <div>
            <h3 className="font-display font-bold text-text-main text-sm mb-5 tracking-wide">
              Navigation
            </h3>
            <ul className="space-y-3 list-none p-0 m-0">
              {navLinks.map((link) => (
                <li key={link.label}>
                  <button
                    onClick={() => handleScroll(link.href)}
                    className="text-muted text-sm hover:text-primary transition-colors duration-200 bg-transparent border-none cursor-pointer p-0"
                    style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}
                  >
                    {link.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Services column */}
          <div>
            <h3 className="font-display font-bold text-text-main text-sm mb-5 tracking-wide">
              Services
            </h3>
            <ul className="space-y-3 list-none p-0 m-0">
              {serviceLinks.map((svc) => (
                <li key={svc}>
                  <button
                    onClick={() =>
                      handleScroll(svc === 'Free Audit' ? '#contact' : '#services')
                    }
                    className="text-muted text-sm hover:text-primary transition-colors duration-200 bg-transparent border-none cursor-pointer p-0 text-left"
                    style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}
                  >
                    {svc}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Newsletter */}
        <div className="mb-14">
          <div
            className="glass-card p-6 md:p-8"
            style={{ background: 'rgba(0, 207, 255, 0.04)' }}
          >
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="flex-1">
                <h3 className="font-display font-bold text-text-main text-base mb-2">
                  Stay in the Loop
                </h3>
                <p className="text-muted text-sm m-0">
                  Get AI automation tips, marketing insights, and exclusive offers straight to your inbox.
                </p>
              </div>
              {nlStatus === 'success' ? (
                <p className="text-sm font-medium" style={{ color: '#22c55e' }}>
                  You're subscribed!
                </p>
              ) : (
                <form onSubmit={handleSubscribe} className="flex gap-3 w-full md:w-auto">
                  <input
                    type="email"
                    value={nlEmail}
                    onChange={(e) => setNlEmail(e.target.value)}
                    placeholder="you@email.com"
                    required
                    className="flex-1 md:w-64"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(0,207,255,0.15)',
                      borderRadius: 8,
                      color: '#F1F5F9',
                      padding: '0.65rem 1rem',
                      fontFamily: '"Plus Jakarta Sans", sans-serif',
                      fontSize: '0.9rem',
                      outline: 'none',
                    }}
                  />
                  <motion.button
                    type="submit"
                    disabled={nlStatus === 'loading'}
                    className="btn-primary text-sm"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    style={nlStatus === 'loading' ? { opacity: 0.6 } : {}}
                  >
                    {nlStatus === 'loading' ? 'Joining...' : 'Subscribe'}
                  </motion.button>
                </form>
              )}
              {nlStatus === 'error' && (
                <p className="text-sm" style={{ color: '#ef4444' }}>Something went wrong. Try again.</p>
              )}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div
          className="h-px w-full mb-8"
          style={{
            background: 'linear-gradient(to right, transparent, rgba(0,212,255,0.15), rgba(139,92,246,0.15), transparent)',
          }}
        />

        {/* Bottom row */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted">
          <p>
            © {new Date().getFullYear()} Haze Tech Solutions. All rights reserved.
          </p>
          <p className="flex items-center gap-1">
            Built with{' '}
            <span
              className="gradient-text font-medium"
              style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}
            >
              AI & ambition
            </span>{' '}
            in the USA
          </p>
        </div>
      </div>
    </footer>
  )
}

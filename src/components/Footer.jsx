import { motion } from 'framer-motion'

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
              <svg width="26" height="26" viewBox="0 0 64 64" fill="none" aria-hidden="true">
                <polygon
                  points="32,4 56,18 56,46 32,60 8,46 8,18"
                  fill="#040D1A"
                  stroke="#00CFFF"
                  strokeWidth="2.5"
                />
                <text
                  x="32" y="39"
                  fontFamily="sans-serif"
                  fontSize="22"
                  fontWeight="900"
                  fill="#00CFFF"
                  textAnchor="middle"
                >H</text>
              </svg>
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

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import logoIcon from '../assets/logo/haze-logo-icon.svg'
import { trackCta } from '../lib/telemetry'

const navLinks = [
  { label: 'Home', href: '#home' },
  { label: 'Services', href: '#services' },
  { label: 'Portfolio', href: '#portfolio' },
  { label: 'About', href: '#about' },
  { label: 'Blog', href: '/blog', isRoute: true },
  { label: 'Contact', href: '#contact' },
]

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = useNavigate()

  // Detect scroll to add stronger glass effect
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 30)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Close menu on resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setMenuOpen(false)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const handleNavClick = (href) => {
    setMenuOpen(false)
    const el = document.querySelector(href)
    if (el) el.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <motion.header
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{
        background: scrolled
          ? 'rgba(4, 13, 26, 0.95)'
          : 'rgba(4, 13, 26, 0.65)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: scrolled
          ? '1px solid rgba(0, 207, 255, 0.1)'
          : '1px solid transparent',
      }}
      initial={{ y: -80 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      <nav
        className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between"
        role="navigation"
        aria-label="Main navigation"
      >
        {/* Logo */}
        <motion.a
          href="#home"
          onClick={(e) => { e.preventDefault(); handleNavClick('#home') }}
          className="font-display font-black text-lg tracking-wide flex items-center gap-2 no-underline"
          style={{ textDecoration: 'none' }}
          whileHover={{ scale: 1.02 }}
        >
          <img src={logoIcon} alt="Haze Tech" width="32" height="32" />
          <span className="gradient-text">Haze Tech</span>
          <span className="text-text-main/80 font-light text-base hidden sm:inline">Solutions</span>
        </motion.a>

        {/* Desktop Nav */}
        <ul className="hidden md:flex items-center gap-8 list-none m-0 p-0">
          {navLinks.map((link) => (
            <li key={link.label}>
              {link.isRoute ? (
                <button
                  onClick={() => { trackCta(`navbar-${link.label.toLowerCase()}`, 'navbar'); navigate(link.href) }}
                  className="text-muted hover:text-text-main text-sm font-body font-medium transition-colors duration-200 bg-transparent border-none cursor-pointer p-0"
                  style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}
                >
                  {link.label}
                </button>
              ) : (
                <button
                  onClick={() => { trackCta(`navbar-${link.label.toLowerCase()}`, 'navbar'); handleNavClick(link.href) }}
                  className="text-muted hover:text-text-main text-sm font-body font-medium transition-colors duration-200 bg-transparent border-none cursor-pointer p-0"
                  style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}
                >
                  {link.label}
                </button>
              )}
            </li>
          ))}
        </ul>

        {/* CTA + Hamburger */}
        <div className="flex items-center gap-4">
          <motion.button
            onClick={() => { trackCta('navbar-client-login', 'navbar'); navigate('/portal/login') }}
            className="hidden md:inline-flex text-sm"
            style={{
              background: 'transparent',
              border: '1px solid rgba(0, 207, 255, 0.3)',
              borderRadius: '8px',
              padding: '8px 16px',
              color: '#00CFFF',
              fontFamily: '"Plus Jakarta Sans", sans-serif',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            whileHover={{ scale: 1.05, borderColor: '#00CFFF' }}
            whileTap={{ scale: 0.97 }}
            aria-label="Client portal login"
          >
            Client Login
          </motion.button>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 text-muted hover:text-primary transition-colors"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            key="mobile-menu"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            style={{
              background: 'rgba(4, 13, 26, 0.98)',
              borderTop: '1px solid rgba(0, 207, 255, 0.1)',
              overflow: 'hidden',
            }}
          >
            <ul className="flex flex-col px-6 py-4 gap-1 list-none m-0">
              {navLinks.map((link, i) => (
                <motion.li
                  key={link.label}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                >
                  <button
                    onClick={() => { trackCta(`navbar-${link.label.toLowerCase()}`, 'navbar-mobile'); link.isRoute ? navigate(link.href) : handleNavClick(link.href); setMenuOpen(false) }}
                    className="w-full text-left py-3 px-2 text-text-main font-medium border-b border-white/5 last:border-0 bg-transparent cursor-pointer hover:text-primary transition-colors"
                    style={{ fontFamily: '"Plus Jakarta Sans", sans-serif', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                  >
                    {link.label}
                  </button>
                </motion.li>
              ))}
              <motion.li
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.35 }}
                className="pt-3"
                style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
              >
                <button
                  onClick={() => { trackCta('navbar-client-login', 'navbar-mobile'); navigate('/portal/login'); setMenuOpen(false) }}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    border: '1px solid rgba(0, 207, 255, 0.3)',
                    borderRadius: '8px',
                    padding: '10px',
                    color: '#00CFFF',
                    fontFamily: '"Plus Jakarta Sans", sans-serif',
                    fontWeight: 600,
                    fontSize: '14px',
                    cursor: 'pointer',
                    textAlign: 'center',
                  }}
                >
                  Client Login
                </button>
              </motion.li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  )
}

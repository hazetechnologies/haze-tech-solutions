import { useEffect } from 'react'
import Navbar from '../../components/Navbar'
import Footer from '../../components/Footer'
import { SMS_FROM_DISPLAY } from '../../lib/smsProgram'

// Shared frame for the Privacy Policy, Text Message Terms and text sign-up
// pages: the site's nav and footer around a readable single column.
export default function LegalLayout({ title, updated, intro, children }) {
  useEffect(() => { document.title = `${title} | Haze Tech Solutions` }, [title])
  return (
    <div style={{ minHeight: '100vh', background: '#020617', color: '#F1F5F9', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <Navbar />
      <main style={{ maxWidth: 760, margin: '0 auto', padding: '132px 20px 96px' }}>
        <h1 style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 'clamp(1.9rem, 4.5vw, 2.6rem)', fontWeight: 900, lineHeight: 1.1, margin: '0 0 12px' }}>{title}</h1>
        {updated && <p style={{ color: '#94A3B8', fontSize: 14, margin: '0 0 28px' }}>Last updated {updated}</p>}
        {intro && <div className="legal-body" style={{ marginBottom: 8 }}>{intro}</div>}
        <div className="legal-body">{children}</div>
      </main>
      <Footer />
      <style>{`
        .legal-body { color: #CBD5E1; font-size: 16px; line-height: 1.7; }
        .legal-body h2 { font-family: 'Plus Jakarta Sans', sans-serif; color: #F1F5F9; font-size: 1.25rem; font-weight: 700; margin: 40px 0 12px; scroll-margin-top: 110px; }
        .legal-body p { margin: 0 0 14px; }
        .legal-body ul { margin: 0 0 14px; padding-left: 22px; }
        .legal-body li { margin: 0 0 8px; }
        .legal-body strong { color: #F1F5F9; }
        .legal-body a { color: #38BDF8; text-decoration: underline; text-underline-offset: 3px; }
        .legal-body a:hover { color: #7DD3FC; }
        .legal-body a:focus-visible { outline: 2px solid #38BDF8; outline-offset: 2px; border-radius: 2px; }
      `}</style>
    </div>
  )
}

export function Section({ id, title, children }) {
  return (
    <section id={id}>
      <h2>{title}</h2>
      {children}
    </section>
  )
}

// The sending number, never split across lines.
export function FromNumber() {
  return <span style={{ whiteSpace: 'nowrap' }}>{SMS_FROM_DISPLAY}</span>
}

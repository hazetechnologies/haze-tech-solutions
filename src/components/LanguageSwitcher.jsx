import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Globe, Check } from 'lucide-react'
import { useI18n, LOCALES, LOCALE_CODES, localizePath } from '../i18n'

/**
 * Language picker.
 *
 * Every option is a real <a href> to the sibling URL — that is what lets a
 * crawler walk from /pricing to /es/pricing. The onClick only upgrades it to a
 * client-side navigation; it is not the mechanism.
 *
 * Deliberately no auto-redirect on browser language: silently bouncing a
 * visitor (or Googlebot) to another URL hides content from the index and
 * strands people who wanted the English page.
 */
export default function LanguageSwitcher({ compact = false, variant = 'dropdown' }) {
  const { locale, routePath, t } = useI18n()
  const navigate = useNavigate()
  // Carry the query string and fragment across the switch: dropping them lost
  // UTM attribution and dumped the visitor at the top of the page.
  const { search, hash } = useLocation()
  const target = (code) => `${localizePath(routePath, code)}${search}${hash}`
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const go = (e, code) => {
    e.preventDefault()
    setOpen(false)
    try { localStorage.setItem('htsLocale', code) } catch { /* private mode */ }
    navigate(target(code))
  }

  // Inline variant: every language is a plain, always-present <a> in the
  // markup. The dropdown hides its links until it is opened, so a crawler
  // never sees them — the head's hreflang tags carry discovery on their own,
  // but a visible link set is the stronger signal and costs nothing here.
  if (variant === 'inline') {
    return (
      <nav aria-label={t('lang.label')} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <Globe size={14} aria-hidden="true" style={{ color: '#64748B', marginRight: 4 }} />
        {LOCALE_CODES.map((code, i) => {
          const active = code === locale
          return (
            <span key={code} style={{ display: 'inline-flex', alignItems: 'center' }}>
              {i > 0 && <span aria-hidden="true" style={{ color: '#334155', margin: '0 8px' }}>·</span>}
              <a
                href={target(code)}
                hrefLang={LOCALES[code].hreflang}
                onClick={(e) => go(e, code)}
                aria-current={active ? 'true' : undefined}
                style={{
                  color: active ? '#00CFFF' : '#94A3B8',
                  fontWeight: active ? 700 : 500,
                  fontSize: 13,
                  textDecoration: 'none',
                  fontFamily: '"Plus Jakarta Sans", sans-serif',
                }}
              >
                {LOCALES[code].native}
              </a>
            </span>
          )
        })}
      </nav>
    )
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('lang.choose')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: 'transparent',
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: 8,
          padding: compact ? '6px 9px' : '8px 12px',
          color: '#94A3B8',
          fontFamily: '"Plus Jakarta Sans", sans-serif',
          fontWeight: 600,
          fontSize: 13,
          cursor: 'pointer',
          lineHeight: 1,
        }}
      >
        <Globe size={15} aria-hidden="true" />
        <span style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>{locale}</span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={t('lang.label')}
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            minWidth: 168,
            listStyle: 'none',
            margin: 0,
            padding: 6,
            background: 'rgba(4, 13, 26, 0.98)',
            border: '1px solid rgba(0, 207, 255, 0.18)',
            borderRadius: 10,
            boxShadow: '0 18px 44px rgba(0,0,0,0.55)',
            zIndex: 60,
          }}
        >
          {LOCALE_CODES.map((code) => {
            const active = code === locale
            return (
              <li key={code} role="option" aria-selected={active}>
                <a
                  href={target(code)}
                  hrefLang={LOCALES[code].hreflang}
                  onClick={(e) => go(e, code)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '9px 10px',
                    borderRadius: 7,
                    textDecoration: 'none',
                    color: active ? '#00CFFF' : '#CBD5E1',
                    fontFamily: '"Plus Jakarta Sans", sans-serif',
                    fontSize: 14,
                    fontWeight: active ? 700 : 500,
                  }}
                >
                  <span>{LOCALES[code].native}</span>
                  {active && <Check size={14} aria-hidden="true" />}
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

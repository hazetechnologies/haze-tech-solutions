import { createContext, useContext, useMemo, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_CODES,
  splitLocale,
  localizePath,
  absoluteUrl,
  LOCALIZED_ROUTES,
  ENGLISH_ONLY_ROUTES,
} from './config'
import en from './locales/en'
import es from './locales/es'
import pt from './locales/pt'
import fr from './locales/fr'
import de from './locales/de'

const DICTS = { en, es, pt, fr, de }

/** Dot-path lookup: get(dict, 'hero.title1'). Returns undefined when missing. */
function get(obj, path) {
  let cur = obj
  for (const part of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = cur[part]
  }
  return cur
}

/** Always reads the English dictionary, whatever locale the URL is in. */
function enOnly(key) {
  const v = get(DICTS[DEFAULT_LOCALE], key)
  return v !== undefined ? v : key
}

const I18nContext = createContext(null)

export function I18nProvider({ children }) {
  const { pathname } = useLocation()
  const { locale, rest } = splitLocale(pathname)

  const value = useMemo(() => {
    const dict = DICTS[locale] || DICTS[DEFAULT_LOCALE]

    // Always fall back to English key-by-key: a missing translation renders the
    // English string, never a raw dotted key.
    const t = (key) => {
      const hit = get(dict, key)
      if (hit !== undefined) return hit
      const fallback = get(DICTS[DEFAULT_LOCALE], key)
      return fallback !== undefined ? fallback : key
    }

    return {
      locale,
      /** The current route with its locale prefix stripped. */
      routePath: rest,
      t,
      /** Array/object lookups (bullet lists) — same fallback behaviour as t(). */
      tl: (key) => {
        const v = t(key)
        return Array.isArray(v) ? v : []
      },
      /** Localize an internal route: path('/pricing') -> '/es/pricing' in Spanish. */
      path: (to) => localizePath(to, locale),
    }
  }, [locale, rest])

  // Keep <html lang> honest for screen readers and search engines on every
  // client-side navigation, not just the initial static shell.
  useEffect(() => {
    document.documentElement.lang = LOCALES[locale]?.htmlLang || 'en'
  }, [locale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    // Components can render outside a Router in tests/storybooks; degrade to
    // English rather than throwing.
    return {
      locale: DEFAULT_LOCALE,
      routePath: '/',
      t: (key) => {
        const v = get(DICTS[DEFAULT_LOCALE], key)
        return v !== undefined ? v : key
      },
      tl: (key) => {
        const v = get(DICTS[DEFAULT_LOCALE], key)
        return Array.isArray(v) ? v : []
      },
      path: (to) => to,
    }
  }
  return ctx
}

// ── Head management ────────────────────────────────────────────────────────
// The static per-locale shells (scripts/build-locale-shells.mjs) give crawlers
// the right <title>, description and hreflang set on first byte. This keeps
// them correct as the user navigates client-side.

function upsertMeta(selector, attrs) {
  let el = document.head.querySelector(selector)
  if (!el) {
    el = document.createElement(attrs.tag || 'meta')
    document.head.appendChild(el)
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'tag') continue
    el.setAttribute(k, v)
  }
  return el
}

/**
 * Sets title/description/canonical/hreflang for a localized route.
 * `routeKey` indexes the `seo` block of the dictionaries; `routePath` is the
 * locale-free path the alternates should point at (defaults to the current one).
 */
export function Seo({ routeKey, routePath, englishOnly = false }) {
  const { locale: activeLocale, t: activeT, routePath: current } = useI18n()
  const target = routePath || current
  // An English-only page takes its head from English whatever the URL prefix is,
  // and publishes no alternates.
  const locale = englishOnly ? DEFAULT_LOCALE : activeLocale
  const t = englishOnly ? (key) => enOnly(key) : activeT

  useEffect(() => {
    const title = t(`seo.${routeKey}.title`)
    const description = t(`seo.${routeKey}.description`)

    document.title = title
    upsertMeta('meta[name="description"]', { tag: 'meta', name: 'description', content: description })
    upsertMeta('meta[property="og:title"]', { tag: 'meta', property: 'og:title', content: title })
    upsertMeta('meta[property="og:description"]', { tag: 'meta', property: 'og:description', content: description })
    upsertMeta('meta[property="og:url"]', { tag: 'meta', property: 'og:url', content: absoluteUrl(target, locale) })
    upsertMeta('meta[property="og:locale"]', {
      tag: 'meta',
      property: 'og:locale',
      content: LOCALES[locale]?.ogLocale || 'en_US',
    })
    upsertMeta('link[rel="canonical"]', { tag: 'link', rel: 'canonical', href: absoluteUrl(target, locale) })

    // Rebuild the alternates wholesale. This must clear EVERY hreflang link,
    // not just the ones we tagged: the static per-locale shell ships its own
    // untagged set, and leaving those in place produced two conflicting
    // clusters (12 links) on the first render of every page.
    document.head
      .querySelectorAll('link[rel="alternate"][hreflang], link[data-i18n-alt]')
      .forEach((n) => n.remove())
    if (englishOnly) return
    for (const code of LOCALE_CODES) {
      const link = document.createElement('link')
      link.setAttribute('rel', 'alternate')
      link.setAttribute('hreflang', LOCALES[code].hreflang)
      link.setAttribute('href', absoluteUrl(target, code))
      link.setAttribute('data-i18n-alt', '')
      document.head.appendChild(link)
    }
    const xd = document.createElement('link')
    xd.setAttribute('rel', 'alternate')
    xd.setAttribute('hreflang', 'x-default')
    xd.setAttribute('href', absoluteUrl(target, DEFAULT_LOCALE))
    xd.setAttribute('data-i18n-alt', '')
    document.head.appendChild(xd)
  }, [locale, routeKey, target, t, englishOnly])

  return null
}

/**
 * Mounted once, inside the Router: applies <Seo> to any route listed in
 * LOCALIZED_ROUTES and stays out of the way everywhere else (blog posts,
 * admin, portal), so pages that manage their own <title> keep it.
 *
 * It sits above the page components in the tree, so its effect runs last and
 * its values win — one mechanism, no title flicker between two owners.
 */
/**
 * Every route that is NOT a translated page: point the canonical at the English
 * original and clear any hreflang.
 *
 * Two failures this prevents, both found in review:
 *  - /es/audit and /es/blog/<post> render English bodies. Self-canonicalising
 *    them would ask Google to index five copies of the same English page.
 *  - <Seo> writes into a shared <head> and has no unmount cleanup, so a
 *    client-side hop from /pricing to /cart used to leave the pricing canonical
 *    and its six alternates behind. Running on *every* non-translated route is
 *    what makes that self-correcting.
 *
 * Note it deliberately does NOT skip English. /audit is the page the localized
 * ones are being pointed at; leaving it with a stale canonical would break the
 * exact target this is protecting.
 */
function CanonicalToEnglish({ routePath }) {
  useEffect(() => {
    const href = absoluteUrl(routePath, DEFAULT_LOCALE)
    upsertMeta('link[rel="canonical"]', { tag: 'link', rel: 'canonical', href })
    upsertMeta('meta[property="og:url"]', { tag: 'meta', property: 'og:url', content: href })
    document.head
      .querySelectorAll('link[rel="alternate"][hreflang], link[data-i18n-alt]')
      .forEach((n) => n.remove())
  }, [routePath])
  return null
}

/**
 * Mounted once, inside the Router. Translated routes get the full <Seo>;
 * everything else gets an English canonical and no hreflang.
 *
 * Effect ordering: React flushes effects child-first, so this component (a
 * sibling ABOVE <Routes>) runs BEFORE the page's own effects — a page that sets
 * its own document.title wins, which is what BlogPost and CartPage rely on.
 * Canonical/hreflang have no other writer, so they are safe here.
 */
export function SeoRouter() {
  const { routePath } = useI18n()
  const entry = LOCALIZED_ROUTES.find((r) => r.path === routePath)
  if (entry) return <Seo routeKey={entry.key} routePath={entry.path} />
  const english = ENGLISH_ONLY_ROUTES.find((r) => r.path === routePath)
  if (english) return <Seo routeKey={english.key} routePath={english.path} englishOnly />
  return <CanonicalToEnglish routePath={routePath} />
}

export { LOCALES, LOCALE_CODES, DEFAULT_LOCALE, localizePath, splitLocale }

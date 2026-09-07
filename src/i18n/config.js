// Locale configuration — deliberately free of React/Vite imports so the
// post-build script (scripts/build-locale-shells.mjs) can import it in plain
// Node to emit one static HTML shell per language.
//
// SEO note: translating in the browser alone is worth ~nothing to search
// engines, because every language would share one URL. Each locale therefore
// gets its own crawlable path (/es/pricing, /fr/services/ai-automation, …),
// its own <html lang>, its own <title>/<meta description>, and a full set of
// rel="alternate" hreflang links pointing at every sibling.

export const DEFAULT_LOCALE = 'en'

export const LOCALES = {
  en: { native: 'English',   english: 'English',    hreflang: 'en',    htmlLang: 'en' },
  es: { native: 'Español',   english: 'Spanish',    hreflang: 'es',    htmlLang: 'es' },
  pt: { native: 'Português', english: 'Portuguese', hreflang: 'pt-BR', htmlLang: 'pt-BR' },
  fr: { native: 'Français',  english: 'French',     hreflang: 'fr',    htmlLang: 'fr' },
  de: { native: 'Deutsch',   english: 'German',     hreflang: 'de',    htmlLang: 'de' },
}

export const LOCALE_CODES = Object.keys(LOCALES)

/** Locales that carry a URL prefix. English is served from the bare path. */
export const PREFIXED_LOCALES = LOCALE_CODES.filter((c) => c !== DEFAULT_LOCALE)

export const SITE_URL = 'https://www.hazetechsolutions.com'

/**
 * Public routes that exist in every language and carry translated copy.
 * `key` indexes into the `seo` block of each locale dictionary.
 * Anything not listed here (admin, portal, cart, affiliate dashboard) stays
 * English-only on purpose — it is gated or transactional, not indexable.
 */
export const LOCALIZED_ROUTES = [
  { path: '/', key: 'home', priority: '1.0', changefreq: 'weekly' },
  { path: '/services/ai-automation', key: 'serviceAiAutomation', priority: '0.9', changefreq: 'monthly' },
  { path: '/services/social-media', key: 'serviceSocialMedia', priority: '0.9', changefreq: 'monthly' },
  { path: '/services/web-development', key: 'serviceWebDevelopment', priority: '0.9', changefreq: 'monthly' },
  { path: '/pricing', key: 'pricing', priority: '0.9', changefreq: 'monthly' },
  { path: '/blog', key: 'blog', priority: '0.8', changefreq: 'weekly' },
]

/**
 * Public pages that a locale-prefixed visitor can still reach (they are linked
 * from the translated nav and CTAs) but whose bodies are NOT translated —
 * long conversion forms and the cart.
 *
 * They deliberately get no hreflang cluster and no sitemap entry: announcing a
 * translation that does not exist invites Google to index near-duplicates. What
 * they DO get is a canonical pointing at the English original, because the
 * fallback shell would otherwise canonicalise /es/audit to the home page.
 */
export const UNTRANSLATED_LOCALIZED_ROUTES = ['/audit', '/free-social-audit', '/cart']

const LOCALE_PREFIX_RE = new RegExp(`^/(${PREFIXED_LOCALES.join('|')})(?=/|$)`)

/**
 * Split a pathname into its locale and the locale-free remainder.
 * `/es/pricing` -> { locale: 'es', rest: '/pricing' }
 * `/pricing`    -> { locale: 'en', rest: '/pricing' }
 */
export function splitLocale(pathname) {
  const p = pathname || '/'
  const m = LOCALE_PREFIX_RE.exec(p)
  if (!m) return { locale: DEFAULT_LOCALE, rest: p }
  const rest = p.slice(m[0].length) || '/'
  return { locale: m[1], rest: rest.startsWith('/') ? rest : `/${rest}` }
}

/** Rewrite a path into the given locale, preserving the route. */
export function localizePath(pathname, locale) {
  const { rest } = splitLocale(pathname)
  if (locale === DEFAULT_LOCALE) return rest || '/'
  return rest === '/' ? `/${locale}` : `/${locale}${rest}`
}

/**
 * Absolute URL for a locale-free route in a given locale.
 * `base` lets the serverless sitemap pass siteUrl() (env-driven) so canonical
 * hosts cannot drift between the sitemap and the HTML shells.
 */
export function absoluteUrl(routePath, locale, base = SITE_URL) {
  const root = String(base).replace(/\/+$/, '')
  const p = localizePath(routePath || '/', locale)
  return p === '/' ? `${root}/` : `${root}${p}`
}

export function isSupportedLocale(code) {
  return Object.prototype.hasOwnProperty.call(LOCALES, code)
}

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

// hreflang stays generic (`pt`, not `pt-BR`): a region-locked code would leave
// visitors in Portugal, Angola and Mozambique matching no member of the cluster
// and falling through to the English x-default. ogLocale is separate because
// Open Graph requires language_TERRITORY and rejects a bare language code.
export const LOCALES = {
  en: { native: 'English',   english: 'English',    hreflang: 'en', htmlLang: 'en', ogLocale: 'en_US' },
  es: { native: 'Español',   english: 'Spanish',    hreflang: 'es', htmlLang: 'es', ogLocale: 'es_ES' },
  pt: { native: 'Português', english: 'Portuguese', hreflang: 'pt', htmlLang: 'pt', ogLocale: 'pt_BR' },
  fr: { native: 'Français',  english: 'French',     hreflang: 'fr', htmlLang: 'fr', ogLocale: 'fr_FR' },
  de: { native: 'Deutsch',   english: 'German',     hreflang: 'de', htmlLang: 'de', ogLocale: 'de_DE' },
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
  // NOTE: /blog is deliberately NOT here. Its chrome is translated but the posts
  // come from blog_posts with no locale column, so five localized /blog URLs
  // would be five near-duplicates of the same English list, declared to Google
  // as translations of each other.
]

/**
 * The file the SPA catch-all rewrite serves. It is a copy of Vite's own
 * index.html with a deliberately EMPTY head — no canonical, no hreflang.
 *
 * dist/index.html cannot do this job: it is the English homepage shell, so
 * pointing the catch-all at it made /blog/<post>, /audit, /cart, /affiliate and
 * every 404 declare `canonical=https://www.hazetechsolutions.com/` plus the
 * homepage's hreflang cluster — which would have de-indexed the entire blog.
 */
export const SPA_FALLBACK_FILE = '/app.html'

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

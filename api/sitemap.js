// Dynamic sitemap.xml.
//
// This is a Vite SPA, so the vercel.json catch-all rewrite served index.html for
// /sitemap.xml — meaning the site effectively had NO sitemap (200, zero <loc>).
// Blog posts are added dynamically by the HazeSEO receiver, so a static file
// would go stale; this function reads blog_posts at request time.
//
// Wired up by a vercel.json rewrite: /sitemap.xml -> /api/sitemap (declared
// BEFORE the SPA catch-all so it wins).
//
// Multilingual: every route in LOCALIZED_ROUTES is emitted once per locale,
// each carrying the full xhtml:link hreflang cluster. Google requires the
// cluster to be reciprocal — every version must list every version, itself
// included — so it is generated from one list rather than hand-maintained.
import { createClient } from '@supabase/supabase-js'
import { siteUrl } from './_lib/stripe.js'
import {
  LOCALES,
  LOCALE_CODES,
  DEFAULT_LOCALE,
  LOCALIZED_ROUTES,
  absoluteUrl,
} from '../src/i18n/config.js'

// Routes that exist only in English: gated, transactional, or untranslated.
const ENGLISH_ONLY_ROUTES = [
  { path: '/affiliate', priority: '0.6', changefreq: 'monthly' },
]

function adminClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
}

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export default async function handler(req, res) {
  const base = siteUrl().replace(/\/+$/, '')
  const now = new Date().toISOString()

  const entries = []

  // Translated pages: one <url> per locale, each listing the whole cluster.
  for (const route of LOCALIZED_ROUTES) {
    const alternates = [
      ...LOCALE_CODES.map((code) => ({
        hreflang: LOCALES[code].hreflang,
        href: absoluteUrl(route.path, code, base),
      })),
      { hreflang: 'x-default', href: absoluteUrl(route.path, DEFAULT_LOCALE, base) },
    ]
    for (const code of LOCALE_CODES) {
      entries.push({
        loc: absoluteUrl(route.path, code, base),
        lastmod: now,
        changefreq: route.changefreq,
        priority: route.priority,
        alternates,
      })
    }
  }

  for (const r of ENGLISH_ONLY_ROUTES) {
    entries.push({
      loc: `${base}${r.path}`,
      lastmod: now,
      changefreq: r.changefreq,
      priority: r.priority,
      alternates: [],
    })
  }

  // A DB hiccup must never break the sitemap — degrade to the static routes.
  // Blog posts are published in English only, so they get no hreflang cluster:
  // claiming a translation that does not exist is worse than claiming none.
  try {
    const sb = adminClient()
    const { data, error } = await sb
      .from('blog_posts')
      .select('slug, updated_at')
      .eq('published', true)
      .order('updated_at', { ascending: false })
      .limit(1000)

    if (!error && Array.isArray(data)) {
      for (const p of data) {
        if (!p.slug) continue
        entries.push({
          loc: `${base}/blog/${p.slug}`,
          lastmod: p.updated_at ? new Date(p.updated_at).toISOString() : now,
          changefreq: 'monthly',
          priority: '0.7',
          alternates: [],
        })
      }
    }
  } catch (e) {
    console.error('sitemap: blog_posts fetch failed:', e?.message)
  }

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ' +
    'xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    entries
      .map((e) => {
        const alts = (e.alternates || [])
          .map(
            (a) =>
              `    <xhtml:link rel="alternate" hreflang="${xmlEscape(a.hreflang)}" href="${xmlEscape(a.href)}" />\n`,
          )
          .join('')
        return (
          `  <url>\n    <loc>${xmlEscape(e.loc)}</loc>\n    <lastmod>${e.lastmod}</lastmod>\n` +
          `    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n` +
          alts +
          '  </url>'
        )
      })
      .join('\n') +
    '\n</urlset>\n'

  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate')
  return res.status(200).send(xml)
}

// Dynamic sitemap.xml.
//
// This is a Vite SPA, so the vercel.json catch-all rewrite served index.html for
// /sitemap.xml — meaning the site effectively had NO sitemap (200, zero <loc>).
// Blog posts are added dynamically by the HazeSEO receiver, so a static file
// would go stale; this function reads blog_posts at request time.
//
// Wired up by a vercel.json rewrite: /sitemap.xml -> /api/sitemap (declared
// BEFORE the SPA catch-all so it wins).
import { createClient } from '@supabase/supabase-js'
import { siteUrl } from './_lib/stripe.js'

const STATIC_ROUTES = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/pricing', priority: '0.9', changefreq: 'monthly' },
  { path: '/blog', priority: '0.8', changefreq: 'weekly' },
  { path: '/affiliate', priority: '0.6', changefreq: 'monthly' },
  { path: '/audit', priority: '0.6', changefreq: 'monthly' },
  { path: '/free-social-audit', priority: '0.6', changefreq: 'monthly' },
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

  const entries = STATIC_ROUTES.map((r) => ({
    loc: `${base}${r.path === '/' ? '' : r.path}`,
    lastmod: now,
    changefreq: r.changefreq,
    priority: r.priority,
  }))

  // A DB hiccup must never break the sitemap — degrade to the static routes.
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
        })
      }
    }
  } catch (e) {
    console.error('sitemap: blog_posts fetch failed:', e?.message)
  }

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries
      .map(
        (e) =>
          `  <url>\n    <loc>${xmlEscape(e.loc)}</loc>\n    <lastmod>${e.lastmod}</lastmod>\n` +
          `    <changefreq>${e.changefreq}</changefreq>\n    <priority>${e.priority}</priority>\n  </url>`,
      )
      .join('\n') +
    '\n</urlset>\n'

  res.setHeader('Content-Type', 'application/xml; charset=utf-8')
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate')
  return res.status(200).send(xml)
}

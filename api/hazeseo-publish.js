// api/hazeseo-publish.js
// Receiver endpoint for the hazeseo external SEO-article engine. Verifies an
// HMAC-SHA256 signature over the raw request body, then upserts the article
// into the existing blog_posts table so it shows up on the public /blog SPA.
//
// Body must be read RAW (before JSON parsing) for the signature check, so
// bodyParser is disabled at the file level — same pattern as stripe-webhook.js.
import { createClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'node:crypto'
import sanitizeHtml from 'sanitize-html'
import { getSetting, siteUrl } from './_lib/stripe.js'

export const config = { api: { bodyParser: false } }

async function readRawBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  return Buffer.concat(chunks).toString('utf8')
}

function adminClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
}

function safeSignatureMatch(expected, provided) {
  if (!provided || typeof provided !== 'string') return false
  const expectedBuf = Buffer.from(expected, 'utf8')
  const providedBuf = Buffer.from(provided, 'utf8')
  if (expectedBuf.length !== providedBuf.length) return false
  return timingSafeEqual(expectedBuf, providedBuf)
}

const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'ul', 'ol', 'li',
  'strong', 'em', 'b', 'i', 'u', 's', 'blockquote', 'img', 'figure',
  'figcaption', 'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'code', 'pre', 'span',
]

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  }

  try {
    const raw = await readRawBody(req)

    const secret = await getSetting('hazeseo_publish_secret', 'HAZESEO_PUBLISH_SECRET')
    if (!secret) {
      console.error('hazeseo-publish: no secret configured (hazeseo_publish_secret / HAZESEO_PUBLISH_SECRET)')
      return res.status(401).json({ ok: false, error: 'not_configured' })
    }

    const expected = 'sha256=' + createHmac('sha256', secret).update(raw, 'utf8').digest('hex')
    const provided = req.headers['x-hazeseo-signature']
    if (!safeSignatureMatch(expected, provided)) {
      return res.status(401).json({ ok: false, error: 'bad signature' })
    }

    let body
    try {
      body = raw ? JSON.parse(raw) : {}
    } catch {
      return res.status(400).json({ ok: false, error: 'invalid_json' })
    }

    // Verification probe — sender checks connectivity/secret without persisting.
    if (req.headers['x-hazeseo-verify'] === '1') {
      return res.status(200).json({ ok: true })
    }

    const article = body || {}
    if (!article.slug || !article.title) {
      return res.status(400).json({ ok: false, error: 'missing_slug_or_title' })
    }

    const clean = sanitizeHtml(article.bodyHtml || '', {
      allowedTags: ALLOWED_TAGS,
      allowedAttributes: {
        a: ['href', 'title', 'target', 'rel'],
        img: ['src', 'alt', 'loading'],
        '*': ['class'],
      },
      allowedSchemes: ['http', 'https', 'mailto'],
    })

    const sb = adminClient()
    const { data, error } = await sb
      .from('blog_posts')
      .upsert({
        slug: article.slug,
        title: article.title,
        content: clean,
        excerpt: article.metaDescription ?? null,
        cover_image_url: article.heroImage?.url ?? null,
        published: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'slug' })
      .select('id')
      .single()

    if (error) {
      console.error('hazeseo-publish: upsert failed:', error)
      return res.status(500).json({ ok: false, error: 'db_error', message: error.message })
    }

    return res.status(200).json({
      ok: true,
      publishedUrl: `${siteUrl()}/blog/${article.slug}`,
      remoteId: data.id,
    })
  } catch (e) {
    console.error('hazeseo-publish: unhandled error:', e)
    return res.status(500).json({ ok: false, error: 'internal_error', message: e.message })
  }
}

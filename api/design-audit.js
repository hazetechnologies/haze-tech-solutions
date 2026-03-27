export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')

  const { url } = req.query
  if (!url) return res.status(400).json({ error: 'URL required' })

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HazeTechAudit/1.0; +https://hazetechsolutions.com)' },
      signal: AbortSignal.timeout(15000),
      redirect: 'follow',
    })

    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const html = await response.text()
    const result = analyzeHTML(html)
    res.setHeader('Cache-Control', 's-maxage=300')
    res.json(result)
  } catch (err) {
    // Return 200 with error flag so the frontend can show a graceful message
    res.status(200).json({ error: 'Could not fetch page: ' + err.message })
  }
}

function analyzeHTML(html) {
  const lower = html.toLowerCase()
  const checks = []

  /* ── helpers ─────────────────────────────────────────── */
  const tag   = (t)  => new RegExp(`<${t}[^>]*>`, 'i').test(html)
  const meta  = (n)  => new RegExp(`<meta[^>]*name=["']${n}["'][^>]*content=["']([^"']+)["']`, 'i').exec(html)
  const metaProp = (p) => new RegExp(`<meta[^>]*property=["']${p}["'][^>]*content=["']([^"']+)["']`, 'i').exec(html)

  /* 1 ── H1 headline */
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)
  const h1Text = h1 ? h1[1].replace(/<[^>]+>/g, '').trim().slice(0, 70) : null
  checks.push({
    id: 'h1', category: 'Design', impact: 'high',
    title: 'Clear headline (H1) present',
    passed: !!h1Text,
    detail: h1Text ? `"${h1Text}"` : 'No H1 tag found — visitors won\'t know what the page is about',
    fix: 'Add a single H1 above the fold that clearly states your value proposition',
  })

  /* 2 ── Meta description */
  const desc = meta('description')
  const descLen = desc ? desc[1].length : 0
  const descOk = descLen >= 50 && descLen <= 165
  checks.push({
    id: 'meta-desc', category: 'SEO & Design', impact: 'high',
    title: 'Meta description (50–165 chars)',
    passed: descOk,
    detail: !desc ? 'No meta description found'
      : descLen < 50 ? `Too short (${descLen} chars)`
      : descLen > 165 ? `Too long (${descLen} chars) — will be cut off in search results`
      : `Good (${descLen} chars)`,
    fix: 'Write a 150–160 char description that sells the click from search results',
  })

  /* 3 ── Call-to-action */
  const ctaKw = ['get started', 'get a quote', 'contact us', 'sign up', 'book', 'schedule', 'buy now', 'free trial', 'start free', 'try free', 'request', 'subscribe', 'get free', 'claim']
  const hasCTA = ctaKw.some(kw => lower.includes(kw)) || tag('button')
  checks.push({
    id: 'cta', category: 'Conversion', impact: 'high',
    title: 'Clear call-to-action present',
    passed: hasCTA,
    detail: hasCTA ? 'CTA detected' : 'No clear CTA — visitors don\'t know what to do next',
    fix: 'Add a prominent button with copy like "Get a Free Quote" or "Book a Call"',
  })

  /* 4 ── Mobile viewport */
  const hasViewport = /<meta[^>]*name=["']viewport["']/i.test(html)
  checks.push({
    id: 'viewport', category: 'Mobile', impact: 'high',
    title: 'Mobile viewport configured',
    passed: hasViewport,
    detail: hasViewport ? 'Viewport meta tag found' : 'Missing — site likely broken on mobile',
    fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">',
  })

  /* 5 ── Image alt text */
  const imgs = html.match(/<img[^>]+>/gi) || []
  const missingAlt = imgs.filter(i => !/alt=["'][^"']+["']/i.test(i)).length
  checks.push({
    id: 'img-alt', category: 'Accessibility', impact: 'medium',
    title: 'All images have alt text',
    passed: imgs.length === 0 || missingAlt === 0,
    detail: imgs.length === 0 ? 'No images found'
      : missingAlt === 0 ? `All ${imgs.length} images have alt text`
      : `${missingAlt}/${imgs.length} images missing alt text`,
    fix: 'Add descriptive alt attributes to every image for accessibility and SEO',
  })

  /* 6 ── Contact info */
  const hasPhone = /(\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4})/.test(html)
  const hasEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(html)
  checks.push({
    id: 'contact', category: 'Conversion', impact: 'high',
    title: 'Contact information visible',
    passed: hasPhone || hasEmail || lower.includes('contact'),
    detail: hasPhone || hasEmail ? 'Contact info detected' : 'No phone, email, or contact link found',
    fix: 'Display a phone number, email address, or contact form prominently',
  })

  /* 7 ── Social proof */
  const spKw = ['testimonial', 'review', 'rating', 'stars', 'trusted by', 'clients', 'customers', '★', '⭐', 'google review', 'case study']
  checks.push({
    id: 'social-proof', category: 'Conversion', impact: 'high',
    title: 'Social proof (reviews / testimonials)',
    passed: spKw.some(kw => lower.includes(kw)),
    detail: spKw.some(kw => lower.includes(kw)) ? 'Social proof elements detected' : 'No reviews or testimonials found',
    fix: 'Add customer testimonials, star ratings, or client logos to build trust',
  })

  /* 8 ── Trust signals */
  const trustKw = ['certified', 'guarantee', 'award', 'accredited', 'licensed', 'insured', 'years of experience', 'secure', 'money back', 'no contract']
  checks.push({
    id: 'trust', category: 'Conversion', impact: 'medium',
    title: 'Trust signals present',
    passed: trustKw.some(kw => lower.includes(kw)),
    detail: trustKw.some(kw => lower.includes(kw)) ? 'Trust signals found' : 'No certifications, guarantees, or trust badges detected',
    fix: 'Add trust badges, years in business, guarantees, or industry certifications',
  })

  /* 9 ── Open Graph */
  const hasOG = metaProp('og:title') || metaProp('og:description')
  checks.push({
    id: 'og', category: 'Social & SEO', impact: 'medium',
    title: 'Open Graph tags for social sharing',
    passed: !!hasOG,
    detail: hasOG ? 'OG tags found' : 'Missing — shared links on social media will look broken',
    fix: 'Add og:title, og:description, and og:image meta tags',
  })

  /* 10 ── Navigation */
  checks.push({
    id: 'nav', category: 'Design', impact: 'medium',
    title: 'Clear navigation present',
    passed: tag('nav'),
    detail: tag('nav') ? 'Navigation element found' : 'No <nav> element detected',
    fix: 'Add a navigation menu with links to your main sections',
  })

  /* 11 ── Lead capture form */
  checks.push({
    id: 'form', category: 'Conversion', impact: 'high',
    title: 'Lead capture form present',
    passed: tag('form'),
    detail: tag('form') ? 'Form element found' : 'No form detected — missing an easy way to capture leads',
    fix: 'Add a contact form, quote form, or email signup',
  })

  /* 12 ── Page title */
  const titleM = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  const titleLen = titleM ? titleM[1].trim().length : 0
  checks.push({
    id: 'title', category: 'SEO & Design', impact: 'medium',
    title: 'Page title optimized (30–65 chars)',
    passed: titleLen >= 30 && titleLen <= 65,
    detail: titleLen === 0 ? 'No page title found'
      : titleLen < 30 ? `Too short (${titleLen} chars)`
      : titleLen > 65 ? `Too long (${titleLen} chars) — truncated in Google`
      : `Good (${titleLen} chars)`,
    fix: 'Write a 50–60 char title with your main keyword + brand name',
  })

  /* 13 ── Schema markup */
  checks.push({
    id: 'schema', category: 'SEO', impact: 'medium',
    title: 'Structured data (Schema.org)',
    passed: /application\/ld\+json/i.test(html) || /itemscope/i.test(html),
    detail: /application\/ld\+json/i.test(html) ? 'JSON-LD schema found' : 'No structured data markup',
    fix: 'Add LocalBusiness or Organization schema for better search visibility',
  })

  /* 14 ── Favicon */
  checks.push({
    id: 'favicon', category: 'Design', impact: 'low',
    title: 'Favicon present',
    passed: /<link[^>]*rel=["'][^"']*icon[^"']*["']/i.test(html),
    detail: /<link[^>]*rel=["'][^"']*icon[^"']*["']/i.test(html) ? 'Favicon found' : 'No favicon — browser tab shows a blank icon',
    fix: 'Add a favicon.ico or SVG to your site root',
  })

  /* 15 ── Footer */
  checks.push({
    id: 'footer', category: 'Design', impact: 'low',
    title: 'Footer present',
    passed: tag('footer'),
    detail: tag('footer') ? 'Footer element found' : 'No footer detected',
    fix: 'Add a footer with contact info, links, and copyright notice',
  })

  /* ── Score ───────────────────────────────────────────── */
  const W = { high: 12, medium: 6, low: 3 }
  const maxScore = checks.reduce((s, c) => s + W[c.impact], 0)
  const earned   = checks.filter(c => c.passed).reduce((s, c) => s + W[c.impact], 0)
  const score    = Math.round((earned / maxScore) * 100)

  return {
    score,
    passed: checks.filter(c => c.passed).length,
    total: checks.length,
    checks,
  }
}

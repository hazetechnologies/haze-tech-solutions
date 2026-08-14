export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  const { url, strategy = 'mobile' } = req.query
  if (!url) return res.status(400).json({ error: 'URL parameter is required' })
  // Whitelist strategy and URL-encode both values so a caller can't inject extra
  // query parameters into the PageSpeed request via "url=…&key=…" style input.
  const strat = strategy === 'desktop' ? 'desktop' : 'mobile'

  const categories = ['performance', 'seo', 'accessibility', 'best-practices']
  const catParams = categories.map(c => `category=${c}`).join('&')
  const keyParam = process.env.PAGESPEED_API_KEY ? `&key=${process.env.PAGESPEED_API_KEY}` : ''
  const endpoint = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strat}&${catParams}${keyParam}`

  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(30000) })
    const data = await response.json()
    res.setHeader('Cache-Control', 's-maxage=300')
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: 'Failed to analyze URL: ' + err.message })
  }
}

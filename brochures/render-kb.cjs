// render-kb.cjs — render the 4 KB brochures to PDF via Playwright (run on VPS).
const path = require('path')
const { chromium } = require('/root/browser-agent/node_modules/playwright')
const FILES = ['kb-ai-automation', 'kb-social-media', 'kb-website', 'kb-seo', 'kb-what-is-ai-automation', 'kb-website-types']
const DIR = __dirname
;(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] })
  const page = await browser.newPage()
  for (const name of FILES) {
    await page.goto('file://' + path.join(DIR, `${name}.html`), { waitUntil: 'networkidle' })
    await page.waitForTimeout(800)
    const out = path.join(DIR, `hts-${name}.pdf`)
    await page.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true })
    console.log('wrote', out)
  }
  await browser.close()
})().catch(e => { console.error(e); process.exit(1) })

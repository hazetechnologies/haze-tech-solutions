// brochures/render-pdf.cjs — render the A4 brochure HTML files to PDF via
// Playwright Chromium. Run on the VPS (which has playwright + chromium):
//   node render-pdf.cjs
// Outputs <name>.pdf next to each .html. Uses the browser-agent's playwright.
const path = require('path')
const { chromium } = require(process.env.PW || '/root/browser-agent/node_modules/playwright')

const FILES = ['prospect', 'client', 'partner']
const DIR = __dirname

;(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] })
  const page = await browser.newPage()
  for (const name of FILES) {
    const htmlPath = path.join(DIR, `${name}.html`)
    await page.goto('file://' + htmlPath, { waitUntil: 'networkidle' })
    // Give web fonts + the remote logo a beat to settle.
    await page.waitForTimeout(800)
    const out = path.join(DIR, `hts-${name}.pdf`)
    await page.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true })
    console.log('wrote', out)
  }
  await browser.close()
})().catch(e => { console.error(e); process.exit(1) })

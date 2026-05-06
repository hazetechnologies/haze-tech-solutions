// One-shot: takes the user-provided HTS PNG and produces every site-asset variant.
// Run from worktree root:  node scripts/process-haze-logo.mjs
import sharp from 'sharp'
import { mkdirSync } from 'fs'

const SRC = 'C:/Users/wealt/Downloads/Haze Tech Real Logo.png'
const ASSETS = 'src/assets/logo'
const PUBLIC = 'public'

mkdirSync(ASSETS, { recursive: true })
mkdirSync(PUBLIC, { recursive: true })

// Source: 1448 x 1086. Hex sits in the left ~third of the image.
// Wordmark starts at x=608; hex+circuits span x=151-650 (overlap of 42px).
// We trim the rightmost circuit tips to keep the wordmark "H" out of the favicon.
const ICON_LEFT = 158
const ICON_TOP  = 260
const ICON_SIZE = 446

// 1. Full logo (Navbar + Footer reuse this) — keep at source resolution
await sharp(SRC).png({ quality: 95 }).toFile(`${ASSETS}/haze-logo-full.png`)
console.log('✓ wrote haze-logo-full.png (1448x1086)')

// 2. Icon-only crop, downsized for nav/footer
await sharp(SRC)
  .extract({ left: ICON_LEFT, top: ICON_TOP, width: ICON_SIZE, height: ICON_SIZE })
  .resize(256, 256)
  .png({ quality: 95 })
  .toFile(`${ASSETS}/haze-logo-icon.png`)
console.log('✓ wrote haze-logo-icon.png (256x256, cropped from hex region)')

// 3. Favicon — same crop, resized to 64x64
await sharp(SRC)
  .extract({ left: ICON_LEFT, top: ICON_TOP, width: ICON_SIZE, height: ICON_SIZE })
  .resize(64, 64)
  .png({ quality: 95 })
  .toFile(`${PUBLIC}/favicon.png`)
console.log('✓ wrote public/favicon.png (64x64)')

// 4. OG image — full logo on dark navy 1200x630 canvas
//    Source 1448x1086 -> fit to 800x600 inside the canvas, centered
const ogLogo = await sharp(SRC).resize({ width: 800, height: 600, fit: 'inside' }).toBuffer()
await sharp({
  create: { width: 1200, height: 630, channels: 4, background: { r: 8, g: 13, b: 24, alpha: 1 } },
})
  .composite([{ input: ogLogo, gravity: 'center' }])
  .png({ quality: 90 })
  .toFile(`${PUBLIC}/og-image.png`)
console.log('✓ wrote public/og-image.png (1200x630)')

console.log('\nAll assets generated.')

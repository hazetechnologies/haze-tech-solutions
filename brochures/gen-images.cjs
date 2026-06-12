// gen-images.cjs — generate contextual photos for the explainer videos via
// gpt-image-2, upload to R2. Run on VPS with OPENAI_API_KEY + R2_* sourced from
// haze-social-post/.env. Prints a JSON map of key -> public URL.
const { S3Client, PutObjectCommand } = require('/root/haze-social-post/node_modules/@aws-sdk/client-s3')

const IMAGES = [
  { key: 'ai-cafe', prompt: 'Photorealistic interior of a cozy modern local coffee shop, warm lighting, wooden counter, plants, inviting and professional, cinematic, shallow depth of field, no text, no logos' },
  { key: 'ai-assistant', prompt: 'Photorealistic confident small business owner smiling while using a laptop and smartphone at a clean modern desk, soft natural light, professional, cinematic, no text, no logos' },
  { key: 'sm-boutique', prompt: 'Photorealistic interior of a stylish modern retail clothing boutique, neat racks of clothes, warm boutique lighting, trendy and upscale, cinematic, no text, no logos' },
  { key: 'sm-phone', prompt: 'Photorealistic close-up of a hand holding a smartphone showing a colorful social media feed, soft blurred background, bright and modern, cinematic, no text, no logos' },
  { key: 'web-laptop', prompt: 'Photorealistic sleek laptop on a clean minimal desk displaying a modern business website homepage, bright airy workspace, cinematic, no readable text, no logos' },
  { key: 'seo-storefront', prompt: 'Photorealistic charming small business storefront on a sunny street, inviting local shop exterior with awning, cinematic, no text, no logos' },
  { key: 'seo-search', prompt: 'Photorealistic laptop screen showing a generic search results page and a city map with location pins, digital marketing concept on a modern desk, cinematic, no readable text, no logos' },
  // Recruitment-video imagery
  { key: 'rec-share', prompt: 'Photorealistic happy relaxed person smiling while looking at their smartphone in a warm modern cafe, satisfied and confident, soft natural light, cinematic, no text, no logos' },
  { key: 'rec-handshake', prompt: 'Photorealistic two friendly business professionals shaking hands in a bright modern office, partnership and trust, warm light, cinematic, no text, no logos' },
  { key: 'rec-owner', prompt: 'Photorealistic confident small business owner smiling with arms crossed inside their shop, proud and approachable, warm natural light, cinematic, no text, no logos' },
  { key: 'rec-team', prompt: 'Photorealistic happy diverse small business team collaborating and smiling around a laptop in a bright modern office, energetic and positive, cinematic, no text, no logos' },
  // Concept explainers
  { key: 'ai-concept', prompt: 'Photorealistic business person hands using a laptop with a subtle glowing blue digital AI assistant interface and floating chat bubbles above the screen, modern office, futuristic but warm, cinematic, no readable text, no logos' },
  { key: 'web-types', prompt: 'Photorealistic flat lay of a laptop, tablet and smartphone on a clean light desk, each screen showing a different modern colorful website layout, web design concept, bright airy workspace, cinematic, no readable text, no logos' },
  { key: 'brand-kit', prompt: 'Photorealistic creative branding mood board on a clean desk: a laptop showing abstract colorful logo concepts, paint color swatches, and a minimal style guide, designer workspace, cinematic, no readable text, no real brand logos' },
  { key: 'bundles', prompt: 'Photorealistic happy small business owner reviewing upward-trending growth charts on a laptop in a bright modern office, momentum and success, cinematic, no readable text, no logos' },
  { key: 'platforms', prompt: 'Photorealistic hand holding a smartphone showing a vibrant grid of colorful social media content posts, soft modern workspace behind, social media concept, cinematic, no readable text, no real logos' },
]

async function genImage(prompt) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-2', prompt, size: '1536x1024', n: 1, quality: 'medium' }),
  })
  if (!res.ok) throw new Error(`openai images ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = await res.json()
  return Buffer.from(data.data[0].b64_json, 'base64')
}

function s3() { return new S3Client({ region: 'auto', endpoint: process.env.R2_ENDPOINT, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } }) }
async function uploadR2(buf, key) { await s3().send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET || process.env.R2_BUCKET_NAME, Key: key, Body: buf, ContentType: 'image/png' })); return `${process.env.R2_PUBLIC_BASE.replace(/\/$/, '')}/${key}` }

const PUBLIC = (process.env.R2_PUBLIC_BASE || '').replace(/\/$/, '')
async function existsOnR2(key) {
  try { const r = await fetch(`${PUBLIC}/hts-promo/img/${key}.png`, { method: 'HEAD' }); return r.ok } catch { return false }
}

;(async () => {
  const map = {}
  for (const img of IMAGES) {
    if (await existsOnR2(img.key)) { process.stderr.write(`skip ${img.key} (exists)\n`); map[img.key] = `${PUBLIC}/hts-promo/img/${img.key}.png`; continue }
    process.stderr.write(`gen ${img.key}…\n`)
    const buf = await genImage(img.prompt)
    map[img.key] = await uploadR2(buf, `hts-promo/img/${img.key}.png`)
  }
  console.log(JSON.stringify(map, null, 2))
})().catch(e => { console.error('ERROR:', e.message); process.exit(1) })

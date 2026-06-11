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

;(async () => {
  const map = {}
  for (const img of IMAGES) {
    process.stderr.write(`gen ${img.key}…\n`)
    const buf = await genImage(img.prompt)
    map[img.key] = await uploadR2(buf, `hts-promo/img/${img.key}.png`)
  }
  console.log(JSON.stringify(map, null, 2))
})().catch(e => { console.error('ERROR:', e.message); process.exit(1) })

// Local image generation script — bypasses edge function to avoid timeout/rate-limit issues.
// Reads existing text assets from DB, generates 9 images serially (1 per 13s),
// uploads to R2, and patches the kit row to done.
// Usage: node scripts/generate-images-local.mjs <kit_id> [kit_id2 ...]
import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'

// Load from .env if present
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
try {
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '../.env')
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim()
  }
} catch {}

const SUPABASE_URL  = process.env.VITE_SUPABASE_URL
const SK            = process.env.SUPABASE_SERVICE_ROLE_KEY
const OPENAI_KEY    = process.env.OPENAI_API_KEY
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID
const R2_SECRET     = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET     = process.env.R2_BUCKET || 'haze-tech-brand-kits'
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://pub-b7118fbfb8444240959bec83b07fafba.r2.dev'

if (!SUPABASE_URL || !SK || !OPENAI_KEY || !R2_ACCOUNT_ID || !R2_ACCESS_KEY || !R2_SECRET) {
  console.error('Missing required env vars. Ensure VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY are set in .env')
  process.exit(1)
}
const SERIAL_DELAY_MS = 13_000  // 1 image every 13s = ~4.6/min, safely under 5/min cap

const SIZES = {
  logo_primary:    { gen: '1024x1024', w: 1024, h: 1024, fit: 'fill' },
  logo_icon:       { gen: '1024x1024', w: 1024, h: 1024, fit: 'fill' },
  logo_monochrome: { gen: '1024x1024', w: 1024, h: 1024, fit: 'fill' },
  profile_picture: { gen: '1024x1024', w: 1024, h: 1024, fit: 'fill' },
  banner_ig:       { gen: '1024x1536', w: 1080, h: 1920, fit: 'cover' },
  banner_fb:       { gen: '1536x1024', w: 820,  h: 312,  fit: 'cover' },
  banner_yt:       { gen: '1536x1024', w: 2560, h: 1440, fit: 'cover' },
  banner_x:        { gen: '1536x1024', w: 1500, h: 500,  fit: 'cover' },
  banner_tiktok:   { gen: '1024x1024', w: 200,  h: 200,  fit: 'cover' },
}

const sb = createClient(SUPABASE_URL, SK)
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET },
})

function buildImagePrompt(assetId, inputs, palette) {
  const paletteText = palette.map(c => `${c.name}: ${c.hex}`).join(', ')
  const base = `Brand: ${inputs.business_name}. Vibe: ${inputs.vibe.join(', ')}. Color palette: ${paletteText}. Style references: ${inputs.inspirations}.`
  switch (assetId) {
    case 'logo_primary':    return `Primary brand logo for "${inputs.business_name}". Clean modern logo design, ${inputs.vibe[0]} aesthetic, white background, scalable, high-contrast. ${base}`
    case 'logo_icon':       return `Icon-only version of the "${inputs.business_name}" brand mark. Square format, no text, abstract or symbolic icon, white background, scalable. ${base}`
    case 'logo_monochrome': return `Monochrome (single-color) version of the "${inputs.business_name}" logo. Pure black on white background. ${base}`
    case 'profile_picture': return `Square social media profile picture for "${inputs.business_name}". Logo lockup centered, generous padding around edges, optimized for circular crop, brand colors. ${base}`
    case 'banner_ig':       return `Vertical Instagram story banner for "${inputs.business_name}". Hero composition, brand colors, ample empty space at top and bottom for text overlay. ${base}`
    case 'banner_fb':       return `Wide horizontal Facebook cover image for "${inputs.business_name}". Cinematic composition, brand colors, focal point centered, text-friendly negative space. ${base}`
    case 'banner_yt':       return `Wide YouTube channel banner for "${inputs.business_name}". 16:9 cinematic, brand colors, focal element centered (safe area for all screen sizes), professional. ${base}`
    case 'banner_x':        return `Ultra-wide X (Twitter) header banner for "${inputs.business_name}". Horizontal panoramic composition, brand colors, focal point off-center to the right. ${base}`
    case 'banner_tiktok':   return `Square TikTok profile picture for "${inputs.business_name}". Bold, simple, high-contrast, instantly readable at small sizes. ${base}`
  }
}

async function generateImage(prompt, size) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-2', prompt, size, n: 1 }),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`OpenAI ${res.status}: ${txt.slice(0, 200)}`)
  }
  const json = await res.json()
  const item = json.data?.[0]
  if (item?.b64_json) return Buffer.from(item.b64_json, 'base64')
  if (item?.url) {
    const dl = await fetch(item.url)
    return Buffer.from(await dl.arrayBuffer())
  }
  throw new Error('No image data in response')
}

async function resizeImage(buf, w, h, fit) {
  return sharp(buf).resize(w, h, { fit, position: 'center' }).png().toBuffer()
}

async function uploadToR2(buf, key) {
  await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buf, ContentType: 'image/png' }))
  return { r2_key: key, public_url: `${R2_PUBLIC_URL}/${key}` }
}

async function processKit(kitId) {
  const { data: row } = await sb.from('brand_kits').select('inputs,assets,client_id').eq('id', kitId).single()
  if (!row) throw new Error(`kit ${kitId} not found`)

  const inputs = row.inputs
  const existingAssets = row.assets || {}
  const palette = existingAssets.color_palette
  if (!palette) throw new Error(`No color_palette in assets — text generation may not have run yet`)

  console.log(`\n── ${inputs.business_name} (${kitId}) ──`)
  console.log(`  Existing text assets: ${Object.keys(existingAssets).filter(k=>k!=='images').join(', ')}`)

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const images = {}

  const assetIds = Object.keys(SIZES)
  for (let i = 0; i < assetIds.length; i++) {
    const assetId = assetIds[i]
    const spec = SIZES[assetId]
    console.log(`  [${i+1}/9] ${assetId} ...`)

    const prompt = buildImagePrompt(assetId, inputs, palette)
    const raw = await generateImage(prompt, spec.gen)
    const resized = await resizeImage(raw, spec.w, spec.h, spec.fit)
    const key = `brand-kits/${row.client_id}/${timestamp}/${assetId}.png`
    const uploaded = await uploadToR2(resized, key)
    images[assetId] = uploaded
    console.log(`    ✓ uploaded → ${uploaded.public_url.slice(0, 80)}...`)

    // Persist progress after each image
    await sb.from('brand_kits').update({ assets: { ...existingAssets, images } }).eq('id', kitId)

    if (i < assetIds.length - 1) {
      process.stdout.write(`    waiting ${SERIAL_DELAY_MS/1000}s for rate limit...\r`)
      await new Promise(r => setTimeout(r, SERIAL_DELAY_MS))
    }
  }

  await sb.from('brand_kits').update({ status: 'done', progress_message: null, assets: { ...existingAssets, images } }).eq('id', kitId)
  console.log(`  ✅ ${inputs.business_name} complete — ${Object.keys(images).length} images`)
}

const kitIds = process.argv.slice(2)
if (!kitIds.length) {
  console.error('Usage: node scripts/generate-images-local.mjs <kit_id> [kit_id2 ...]')
  process.exit(1)
}

for (const id of kitIds) {
  await processKit(id)
}
console.log('\nAll done.')

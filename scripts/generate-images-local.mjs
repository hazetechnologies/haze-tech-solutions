// Local image generation — bypasses edge function to avoid timeout issues.
// Logos via OpenAI direct (parallel), then KIE AI img2img for banners+profile (logo as reference).
// Usage: node scripts/generate-images-local.mjs <kit_id> [kit_id2 ...]
import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'
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
const KIE_API_KEY   = process.env.KIE_API_KEY
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID
const R2_SECRET     = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET     = process.env.R2_BUCKET || 'haze-tech-brand-kits'
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://pub-b7118fbfb8444240959bec83b07fafba.r2.dev'
const KIE_BASE      = 'https://api.kie.ai/api/v1'

if (!SUPABASE_URL || !SK || !OPENAI_KEY || !KIE_API_KEY || !R2_ACCOUNT_ID || !R2_ACCESS_KEY || !R2_SECRET) {
  console.error('Missing required env vars.')
  process.exit(1)
}

const LOGO_ASSET_IDS = ['logo_primary', 'logo_icon', 'logo_monochrome']
const REFERENCE_ASSET_IDS = ['profile_picture', 'banner_ig', 'banner_fb', 'banner_yt', 'banner_x', 'banner_tiktok', 'banner_linkedin_cover']

const SIZES = {
  logo_primary:         { gen: '1024x1024', w: 1024, h: 1024,  fit: 'fill' },
  logo_icon:            { gen: '1024x1024', w: 1024, h: 1024,  fit: 'fill' },
  logo_monochrome:      { gen: '1024x1024', w: 1024, h: 1024,  fit: 'fill' },
  profile_picture:      { gen: '1024x1024', w: 1024, h: 1024,  fit: 'fill', kie_ratio: '1:1' },
  banner_ig:            { gen: '1024x1536', w: 1080, h: 1920,  fit: 'cover', kie_ratio: '9:16' },
  banner_fb:            { gen: '1536x1024', w: 820,  h: 312,   fit: 'cover', kie_ratio: '16:9' },
  banner_yt:            { gen: '1536x1024', w: 2560, h: 1440,  fit: 'cover', kie_ratio: '16:9' },
  banner_x:             { gen: '1536x1024', w: 1500, h: 500,   fit: 'cover', kie_ratio: '16:9' },
  banner_tiktok:        { gen: '1024x1024', w: 200,  h: 200,   fit: 'cover', kie_ratio: '1:1' },
  banner_linkedin_cover:{ gen: '1536x1024', w: 1128, h: 191,   fit: 'cover', kie_ratio: '16:9' },
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
    case 'logo_primary':          return `Primary brand logo for "${inputs.business_name}". Clean modern logo design, ${inputs.vibe[0]} aesthetic, white background, scalable, high-contrast. ${base}`
    case 'logo_icon':             return `Icon-only version of the "${inputs.business_name}" brand mark. Square format, no text, abstract or symbolic icon, white background, scalable. ${base}`
    case 'logo_monochrome':       return `Monochrome (single-color) version of the "${inputs.business_name}" logo. Pure black on white background. ${base}`
    case 'profile_picture':       return `Square social media profile picture for "${inputs.business_name}". Feature the exact same logo design shown in the reference image, centered with generous padding, optimized for circular crop, on brand-colored background. ${base}`
    case 'banner_ig':             return `Vertical Instagram story banner for "${inputs.business_name}". Feature the exact same logo from the reference image prominently. Hero composition, brand colors, ample empty space at top/bottom for text overlay. ${base}`
    case 'banner_fb':             return `Wide horizontal Facebook cover for "${inputs.business_name}". Feature the exact same logo from the reference image. Cinematic composition, brand colors, text-friendly negative space. ${base}`
    case 'banner_yt':             return `Wide YouTube channel banner for "${inputs.business_name}". Feature the exact same logo from the reference image. 16:9 cinematic, brand colors, focal element centered, professional. ${base}`
    case 'banner_x':              return `Ultra-wide X (Twitter) header for "${inputs.business_name}". Feature the exact same logo from the reference image, positioned off-center. Horizontal panoramic, brand colors. ${base}`
    case 'banner_tiktok':         return `Square TikTok profile picture for "${inputs.business_name}". Feature the exact same logo from the reference image. Bold, high-contrast, readable at small sizes. ${base}`
    case 'banner_linkedin_cover': return `Ultra-wide LinkedIn company cover for "${inputs.business_name}". Feature the exact same logo from the reference image, left-aligned. Professional, clean horizontal composition, brand colors. ${base}`
  }
}

async function generateLogoOpenAI(prompt, size) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-2', prompt, size, n: 1 }),
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = await res.json()
  const item = json.data?.[0]
  if (item?.b64_json) return Buffer.from(item.b64_json, 'base64')
  if (item?.url) return Buffer.from(await (await fetch(item.url)).arrayBuffer())
  throw new Error('No image data from OpenAI')
}

async function createKieTask(prompt, aspectRatio, logoUrl) {
  const res = await fetch(`${KIE_BASE}/jobs/createTask`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KIE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-image-2-image-to-image',
      input: { prompt, input_urls: [logoUrl], aspect_ratio: aspectRatio, resolution: '1K' },
    }),
  })
  if (!res.ok) throw new Error(`KIE createTask ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = await res.json()
  const taskId = json.data?.taskId
  if (!taskId) throw new Error(`KIE: no taskId in response`)
  return taskId
}

async function pollKieTask(taskId, assetId) {
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 5000))
    const res = await fetch(`${KIE_BASE}/jobs/recordInfo?taskId=${taskId}`, {
      headers: { Authorization: `Bearer ${KIE_API_KEY}` },
    })
    if (!res.ok) continue
    const json = await res.json()
    const d = json.data
    if (!d) continue
    if (d.state === 'fail') throw new Error(`KIE task failed for ${assetId}: ${d.failMsg || 'unknown'}`)
    if (d.state === 'success') {
      if (d.resultJson) {
        const parsed = JSON.parse(d.resultJson)
        const url = parsed.resultUrls?.[0]
        if (url) return url
      }
      if (d.resultUrl) return d.resultUrl
      throw new Error(`KIE success but no URL for ${assetId}`)
    }
  }
  throw new Error(`KIE timed out for ${assetId}`)
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
  if (!palette) throw new Error(`No color_palette — text generation may not have run yet`)

  console.log(`\n── ${inputs.business_name} (${kitId}) ──`)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const images = {}

  // ── Step 1: logos in parallel via OpenAI ──
  console.log('  [Step 1] Generating 3 logos via OpenAI...')
  const logoResults = await Promise.all(
    LOGO_ASSET_IDS.map(async (assetId) => {
      const spec = SIZES[assetId]
      const prompt = buildImagePrompt(assetId, inputs, palette)
      const raw = await generateLogoOpenAI(prompt, spec.gen)
      const resized = await resizeImage(raw, spec.w, spec.h, spec.fit)
      const key = `brand-kits/${row.client_id}/${timestamp}/${assetId}.png`
      const uploaded = await uploadToR2(resized, key)
      console.log(`    ✓ ${assetId}`)
      return [assetId, uploaded]
    })
  )
  for (const [id, ref] of logoResults) images[id] = ref

  // Persist logos immediately
  await sb.from('brand_kits').update({ assets: { ...existingAssets, images: { ...images } } }).eq('id', kitId)

  const logoPrimaryUrl = images['logo_primary'].public_url
  console.log(`  logo_primary: ${logoPrimaryUrl.slice(0, 70)}...`)

  // ── Step 2: reference assets via KIE AI img2img in parallel ──
  console.log(`  [Step 2] Firing ${REFERENCE_ASSET_IDS.length} KIE AI img2img tasks in parallel...`)
  const taskMap = {}
  for (const assetId of REFERENCE_ASSET_IDS) {
    const spec = SIZES[assetId]
    const prompt = buildImagePrompt(assetId, inputs, palette)
    taskMap[assetId] = await createKieTask(prompt, spec.kie_ratio, logoPrimaryUrl)
    console.log(`    queued ${assetId} → taskId: ${taskMap[assetId]}`)
  }

  // Poll all tasks in parallel
  console.log('  Polling KIE AI tasks...')
  const refResults = await Promise.all(
    REFERENCE_ASSET_IDS.map(async (assetId) => {
      const taskId = taskMap[assetId]
      const resultUrl = await pollKieTask(taskId, assetId)
      const raw = Buffer.from(await (await fetch(resultUrl)).arrayBuffer())
      const spec = SIZES[assetId]
      const resized = await resizeImage(raw, spec.w, spec.h, spec.fit)
      const key = `brand-kits/${row.client_id}/${timestamp}/${assetId}.png`
      const uploaded = await uploadToR2(resized, key)
      console.log(`    ✓ ${assetId}`)
      return [assetId, uploaded]
    })
  )
  for (const [id, ref] of refResults) images[id] = ref

  await sb.from('brand_kits').update({
    status: 'done',
    progress_message: null,
    assets: { ...existingAssets, images },
  }).eq('id', kitId)
  console.log(`  ✅ ${inputs.business_name} — ${Object.keys(images).length}/10 images`)
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

// Regenerate a single brand-kit image asset using the kit's current logo_primary as ref.
// Usage: node scripts/regen-single-asset.mjs <client_id> <asset_id>
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

try {
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env')
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim()
  }
} catch (e) { console.error('env load failed:', e.message) }

const [, , CLIENT_ID, ASSET_ID] = process.argv
if (!CLIENT_ID || !ASSET_ID) { console.error('Usage: node regen-single-asset.mjs <client_id> <asset_id>'); process.exit(1) }

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY
const sb = createClient(SUPABASE_URL, SK)

const R2_BUCKET = 'haze-tech-brand-kits'
const R2_PUBLIC = 'https://pub-b7118fbfb8444240959bec83b07fafba.r2.dev'
const KIE_API_KEY = process.env.KIE_API_KEY
const KIE_BASE = 'https://api.kie.ai/api/v1'

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
})

const ASPECT = {
  profile_picture: '1:1', banner_ig: '9:16', banner_fb: '16:9', banner_yt: '16:9',
  banner_x: '16:9', banner_tiktok: '1:1', banner_linkedin_cover: '16:9',
}
const FINAL_DIMS = {
  profile_picture: [1024, 1024], banner_ig: [1080, 1920], banner_fb: [820, 312],
  banner_yt: [2560, 1440], banner_x: [1500, 500], banner_tiktok: [200, 200],
  banner_linkedin_cover: [1128, 191],
}

const PROMPTS = (biz, palette) => {
  const colors = palette ? palette.map(p => `${p.hex} ${p.name}`).join(', ') : ''
  const base = `Brand identity asset for "${biz}". Use the provided logo image as the visual anchor. Colors: ${colors}. Maintain dark professional aesthetic. No text overlay unless integral to the logo.`
  return {
    profile_picture: `${base} — Square profile picture, centered logo with subtle gradient background.`,
    banner_ig:       `${base} — Vertical Instagram story banner, 9:16, logo small in upper area, gradient backdrop.`,
    banner_fb:       `${base} — Facebook cover banner, 16:9, logo on left, brand colors as gradient.`,
    banner_yt:       `${base} — YouTube channel banner, 16:9, logo centered, professional brand background.`,
    banner_x:        `${base} — Twitter/X header banner, wide aspect, logo centered, brand colors.`,
    banner_tiktok:   `${base} — TikTok profile picture, square, centered logo on solid backdrop.`,
    banner_linkedin_cover: `${base} — LinkedIn cover image, wide aspect, logo aligned left, professional palette.`,
  }
}

const { data: kit } = await sb.from('brand_kits').select('*').eq('client_id', CLIENT_ID).single()
const logoUrl = kit.assets?.images?.logo_primary?.public_url
if (!logoUrl) throw new Error('logo_primary missing')
console.log(`Using logo: ${logoUrl}`)

const biz = kit.inputs?.business_name || kit.inputs?.business_description || 'this brand'
const prompt = PROMPTS(biz, kit.assets?.color_palette)[ASSET_ID]
if (!prompt) throw new Error(`No prompt template for ${ASSET_ID}`)
console.log(`Prompt: ${prompt.slice(0, 120)}...`)

console.log('Creating KIE task...')
const createRes = await fetch(`${KIE_BASE}/jobs/createTask`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${KIE_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'gpt-image-2-image-to-image',
    input: { prompt, input_urls: [logoUrl], aspect_ratio: ASPECT[ASSET_ID], resolution: '1K' },
  }),
})
const createJson = await createRes.json()
const taskId = createJson.data?.taskId
if (!taskId) throw new Error(`No taskId: ${JSON.stringify(createJson)}`)
console.log(`Task ${taskId}, polling...`)

let resultUrl
for (let i = 0; i < 90; i++) {
  await new Promise(r => setTimeout(r, 5_000))
  const r = await fetch(`${KIE_BASE}/jobs/recordInfo?taskId=${taskId}`, {
    headers: { 'Authorization': `Bearer ${KIE_API_KEY}` },
  })
  const j = await r.json()
  const d = j.data
  if (!d) continue
  process.stdout.write(`  poll ${i+1}: state=${d.state}\n`)
  if (d.state === 'fail') throw new Error(`KIE failed: ${d.failMsg}`)
  if (d.state === 'success') {
    if (d.resultJson) resultUrl = JSON.parse(d.resultJson).resultUrls?.[0]
    else resultUrl = d.resultUrl
    break
  }
}
if (!resultUrl) throw new Error('KIE timeout')

console.log(`Downloading ${resultUrl.slice(0,80)}...`)
const dl = await fetch(resultUrl)
const raw = Buffer.from(await dl.arrayBuffer())
const [w, h] = FINAL_DIMS[ASSET_ID]
const resized = await sharp(raw).resize(w, h, { fit: 'cover' }).png({ quality: 90 }).toBuffer()

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const key = `brand-kits/${CLIENT_ID}/${ts}/${ASSET_ID}.png`
await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: resized, ContentType: 'image/png' }))

const newRef = { r2_key: key, public_url: `${R2_PUBLIC}/${key}` }
const newImages = { ...(kit.assets?.images || {}), [ASSET_ID]: newRef }
const newAssets = { ...kit.assets, images: newImages }
await sb.from('brand_kits').update({ assets: newAssets, updated_at: new Date().toISOString() }).eq('id', kit.id)

console.log(`✓ Updated ${ASSET_ID} → ${newRef.public_url}`)

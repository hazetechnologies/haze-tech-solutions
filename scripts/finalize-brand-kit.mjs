// Detect missing images for a brand kit, generate them sequentially via KIE,
// stitch into assets.images, mark status=done.
// Usage:  node scripts/finalize-brand-kit.mjs <client_id>
import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
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

const [, , CLIENT_ID] = process.argv
if (!CLIENT_ID) { console.error('Usage: node finalize-brand-kit.mjs <client_id>'); process.exit(1) }

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

const ALL_ASSETS = ['logo_primary', 'logo_icon', 'logo_monochrome', 'profile_picture',
  'banner_ig', 'banner_fb', 'banner_yt', 'banner_x', 'banner_tiktok', 'banner_linkedin_cover']
const KIE_ASSETS = ['profile_picture', 'banner_ig', 'banner_fb', 'banner_yt', 'banner_x', 'banner_tiktok', 'banner_linkedin_cover']
const ASPECT = {
  profile_picture: '1:1', banner_ig: '9:16', banner_fb: '16:9', banner_yt: '16:9',
  banner_x: '16:9', banner_tiktok: '1:1', banner_linkedin_cover: '16:9',
}
const FINAL_DIMS = {
  logo_primary: [1024, 1024], logo_icon: [1024, 1024], logo_monochrome: [1024, 1024],
  profile_picture: [1024, 1024], banner_ig: [1080, 1920], banner_fb: [820, 312],
  banner_yt: [2560, 1440], banner_x: [1500, 500], banner_tiktok: [200, 200],
  banner_linkedin_cover: [1128, 191],
}

// Prompts: simplified versions; rely on logo as visual reference for KIE img2img
const PROMPTS = (kitInputs, palette) => {
  const biz = kitInputs.business_name || kitInputs.business_description || 'this brand'
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

async function findExistingImages() {
  // List R2 prefix and group by timestamped folder; pick the most recent
  const r = await s3.send(new ListObjectsV2Command({
    Bucket: R2_BUCKET, Prefix: `brand-kits/${CLIENT_ID}/`, MaxKeys: 1000,
  }))
  const byFolder = new Map()
  for (const o of (r.Contents || [])) {
    const parts = o.Key.split('/')
    if (parts.length < 4) continue
    const folder = parts[2]
    if (!byFolder.has(folder)) byFolder.set(folder, { ts: o.LastModified, items: {} })
    const assetId = parts[3].replace(/\.png$/, '')
    byFolder.get(folder).items[assetId] = {
      r2_key: o.Key,
      public_url: `${R2_PUBLIC}/${o.Key}`,
      lastModified: o.LastModified,
    }
    if (o.LastModified > byFolder.get(folder).ts) byFolder.get(folder).ts = o.LastModified
  }
  return byFolder
}

async function createKieTask(prompt, aspectRatio, logoUrl) {
  const res = await fetch(`${KIE_BASE}/jobs/createTask`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${KIE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-image-2-image-to-image',
      input: { prompt, input_urls: [logoUrl], aspect_ratio: aspectRatio, resolution: '1K' },
    }),
  })
  if (!res.ok) throw new Error(`KIE createTask ${res.status}: ${await res.text()}`)
  const json = await res.json()
  return json.data?.taskId
}

async function pollKie(taskId) {
  for (let i = 0; i < 90; i++) {
    await new Promise(r => setTimeout(r, 5_000))
    const res = await fetch(`${KIE_BASE}/jobs/recordInfo?taskId=${taskId}`, {
      headers: { 'Authorization': `Bearer ${KIE_API_KEY}` },
    })
    if (!res.ok) continue
    const json = await res.json()
    const d = json.data
    if (!d) continue
    if (d.state === 'fail') throw new Error(`KIE failed: ${d.failMsg}`)
    if (d.state === 'success') {
      if (d.resultJson) return JSON.parse(d.resultJson).resultUrls?.[0]
      return d.resultUrl
    }
  }
  throw new Error(`KIE timeout for task ${taskId}`)
}

async function generateAndUpload(assetId, prompt, logoUrl, ts) {
  console.log(`  → ${assetId}: creating KIE task...`)
  const taskId = await createKieTask(prompt, ASPECT[assetId], logoUrl)
  console.log(`  → ${assetId}: task ${taskId}, polling...`)
  const url = await pollKie(taskId)
  console.log(`  → ${assetId}: downloading ${url.slice(0, 80)}...`)
  const dl = await fetch(url)
  if (!dl.ok) throw new Error(`download fail ${dl.status}`)
  const raw = Buffer.from(await dl.arrayBuffer())
  const [w, h] = FINAL_DIMS[assetId]
  const resized = await sharp(raw).resize(w, h, { fit: 'cover' }).png({ quality: 90 }).toBuffer()
  const key = `brand-kits/${CLIENT_ID}/${ts}/${assetId}.png`
  await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: resized, ContentType: 'image/png' }))
  console.log(`  ✓ ${assetId}: uploaded to ${key}`)
  return { r2_key: key, public_url: `${R2_PUBLIC}/${key}` }
}

async function main() {
  const { data: kit } = await sb.from('brand_kits').select('*').eq('client_id', CLIENT_ID).single()
  if (!kit) throw new Error(`No kit for client ${CLIENT_ID}`)
  console.log(`Kit: ${kit.id}, status: ${kit.status}\n`)

  const folders = await findExistingImages()
  const sorted = [...folders.entries()].sort((a, b) => b[1].ts - a[1].ts)

  // Build the most-complete picture by walking newest folders first
  const stitched = {}
  let primaryFolder = null
  for (const [folder, info] of sorted) {
    for (const [aid, ref] of Object.entries(info.items)) {
      if (!stitched[aid]) { stitched[aid] = { r2_key: ref.r2_key, public_url: ref.public_url }; if (!primaryFolder) primaryFolder = folder }
    }
  }
  console.log('Existing assets across all folders:')
  for (const aid of ALL_ASSETS) {
    console.log(`  ${stitched[aid] ? '✓' : '✗'} ${aid}`)
  }

  const missing = ALL_ASSETS.filter(a => !stitched[a])
  if (missing.length === 0) {
    console.log('\nAll 10 assets present. Just stitching into DB.')
  } else {
    console.log(`\nMissing: ${missing.join(', ')}`)
    // For missing KIE-generated assets, regenerate using logo_primary as ref
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const logoUrl = stitched.logo_primary?.public_url
    if (!logoUrl) throw new Error('Cannot regenerate banners: logo_primary missing')

    const palette = (kit.assets || {}).color_palette
    const inputs = kit.inputs || {}
    const prompts = PROMPTS(inputs, palette)

    for (const aid of missing) {
      if (!KIE_ASSETS.includes(aid)) {
        console.log(`SKIP ${aid}: not a KIE asset (would need OpenAI logo gen)`)
        continue
      }
      stitched[aid] = await generateAndUpload(aid, prompts[aid], logoUrl, ts)
    }
  }

  // Update brand_kits row
  const newAssets = { ...(kit.assets || {}), images: stitched }
  await sb.from('brand_kits').update({
    status: 'done', progress_message: null, error: null,
    assets: newAssets, updated_at: new Date().toISOString(),
  }).eq('id', kit.id)

  console.log('\n✅ Brand kit finalized.')
  console.log('Final image count:', Object.keys(stitched).length)
}

main().catch(e => { console.error('ERROR:', e); process.exit(1) })

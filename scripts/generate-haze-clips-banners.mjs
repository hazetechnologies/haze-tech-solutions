// One-off: generates Haze Clips banners using the existing chosen logo from R2.
// Skips logo regeneration — uses the user-approved logo_primary directly.
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

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SK           = process.env.SUPABASE_SERVICE_ROLE_KEY
const KIE_API_KEY  = process.env.KIE_API_KEY
const R2_ACCOUNT_ID= process.env.R2_ACCOUNT_ID
const R2_ACCESS_KEY= process.env.R2_ACCESS_KEY_ID
const R2_SECRET    = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET    = 'haze-tech-brand-kits'
const R2_PUBLIC_URL= 'https://pub-b7118fbfb8444240959bec83b07fafba.r2.dev'
const KIE_BASE     = 'https://api.kie.ai/api/v1'

const KIT_ID    = '8105b3b2-2aee-4990-ace0-bae579cb3ca2'
const CLIENT_ID = '9c752275-76c3-4895-8fe7-cee5b81524ec'
const BASE_URL  = `${R2_PUBLIC_URL}/brand-kits/${CLIENT_ID}/2026-05-04T16-43-27`

// Existing logos — the user-approved design
const EXISTING_LOGOS = {
  logo_primary:    { r2_key: `brand-kits/${CLIENT_ID}/2026-05-04T16-43-27/logo_primary.png`,    public_url: `${BASE_URL}/logo_primary.png` },
  logo_icon:       { r2_key: `brand-kits/${CLIENT_ID}/2026-05-04T16-43-27/logo_icon.png`,       public_url: `${BASE_URL}/logo_icon.png` },
  logo_monochrome: { r2_key: `brand-kits/${CLIENT_ID}/2026-05-04T16-43-27/logo_monochrome.png`, public_url: `${BASE_URL}/logo_monochrome.png` },
}

const REFERENCE_ASSET_IDS = ['profile_picture','banner_ig','banner_fb','banner_yt','banner_x','banner_tiktok','banner_linkedin_cover']
const SIZES = {
  profile_picture:      { w: 1024, h: 1024,  fit: 'fill',  kie_ratio: '1:1'  },
  banner_ig:            { w: 1080, h: 1920,  fit: 'cover', kie_ratio: '9:16' },
  banner_fb:            { w: 820,  h: 312,   fit: 'cover', kie_ratio: '16:9' },
  banner_yt:            { w: 2560, h: 1440,  fit: 'cover', kie_ratio: '16:9' },
  banner_x:             { w: 1500, h: 500,   fit: 'cover', kie_ratio: '16:9' },
  banner_tiktok:        { w: 200,  h: 200,   fit: 'cover', kie_ratio: '1:1'  },
  banner_linkedin_cover:{ w: 1128, h: 191,   fit: 'cover', kie_ratio: '16:9' },
}

const sb = createClient(SUPABASE_URL, SK)
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET },
})

function buildPrompt(assetId, inputs, palette) {
  const paletteText = palette.map(c => `${c.name}: ${c.hex}`).join(', ')
  const base = `Brand: ${inputs.business_name}. Vibe: ${inputs.vibe.join(', ')}. Color palette: ${paletteText}. Style references: ${inputs.inspirations}.`
  switch (assetId) {
    case 'profile_picture':       return `Square social media profile picture for "Haze Clips". Feature the exact same logo design from the reference image — the purple H with circular neon ring — centered with generous padding, optimized for circular crop. ${base}`
    case 'banner_ig':             return `Vertical Instagram story banner for "Haze Clips". Feature the exact same logo design from the reference image prominently. Dark background, electric purple/cyan neon atmosphere, cinematic, ample empty space for text. ${base}`
    case 'banner_fb':             return `Wide horizontal Facebook cover for "Haze Clips". Feature the exact same logo from the reference image. Dark cinematic background, purple/cyan gradient lighting, professional. ${base}`
    case 'banner_yt':             return `Wide YouTube channel banner for "Haze Clips". Feature the exact same logo from the reference image. Dark cinematic 16:9 background, electric neon atmosphere, creator-focused energy. ${base}`
    case 'banner_x':              return `Ultra-wide X (Twitter) header for "Haze Clips". Feature the exact same logo from the reference image, positioned off-center. Dark panoramic background, neon purple/cyan accents. ${base}`
    case 'banner_tiktok':         return `Square TikTok profile picture for "Haze Clips". Feature the exact same logo from the reference image. Bold, high-contrast dark background, instantly recognizable at small sizes. ${base}`
    case 'banner_linkedin_cover': return `Ultra-wide LinkedIn company cover for "Haze Clips". Feature the exact same logo from the reference image, left-aligned. Professional dark background, subtle purple/cyan gradient. ${base}`
  }
}

async function createKieTask(prompt, aspectRatio, logoUrl) {
  const res = await fetch(`${KIE_BASE}/jobs/createTask`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KIE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-2-image-to-image', input: { prompt, input_urls: [logoUrl], aspect_ratio: aspectRatio, resolution: '1K' } }),
  })
  if (!res.ok) throw new Error(`KIE ${res.status}: ${(await res.text()).slice(0,200)}`)
  const j = await res.json()
  if (!j.data?.taskId) throw new Error('No taskId from KIE')
  return j.data.taskId
}

async function pollKieTask(taskId, assetId) {
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 5000))
    const res = await fetch(`${KIE_BASE}/jobs/recordInfo?taskId=${taskId}`, { headers: { Authorization: `Bearer ${KIE_API_KEY}` } })
    if (!res.ok) continue
    const j = await res.json()
    const d = j.data
    if (!d) continue
    if (d.state === 'fail') throw new Error(`KIE failed for ${assetId}: ${d.failMsg}`)
    if (d.state === 'success') {
      const url = d.resultJson ? JSON.parse(d.resultJson).resultUrls?.[0] : d.resultUrl
      if (url) return url
    }
  }
  throw new Error(`KIE timed out for ${assetId}`)
}

async function run() {
  const { data: row } = await sb.from('brand_kits').select('inputs,assets').eq('id', KIT_ID).single()
  const inputs = row.inputs
  const existingAssets = row.assets || {}
  const palette = existingAssets.color_palette
  if (!palette) throw new Error('No color_palette in assets')

  console.log(`\n── Haze Clips (using existing logo) ──`)
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const images = { ...EXISTING_LOGOS }

  const logoPrimaryUrl = EXISTING_LOGOS.logo_primary.public_url
  console.log(`  Using existing logo: ${logoPrimaryUrl.slice(0, 70)}...`)

  // Fire all 7 KIE AI tasks in parallel
  console.log(`  Firing ${REFERENCE_ASSET_IDS.length} KIE AI tasks...`)
  const taskMap = {}
  for (const assetId of REFERENCE_ASSET_IDS) {
    const prompt = buildPrompt(assetId, inputs, palette)
    taskMap[assetId] = await createKieTask(prompt, SIZES[assetId].kie_ratio, logoPrimaryUrl)
    console.log(`    queued ${assetId} → ${taskMap[assetId]}`)
  }

  // Poll all in parallel
  console.log('  Polling...')
  const results = await Promise.all(
    REFERENCE_ASSET_IDS.map(async (assetId) => {
      const resultUrl = await pollKieTask(taskMap[assetId], assetId)
      const raw = Buffer.from(await (await fetch(resultUrl)).arrayBuffer())
      const { w, h, fit } = SIZES[assetId]
      const resized = await sharp(raw).resize(w, h, { fit, position: 'center' }).png().toBuffer()
      const key = `brand-kits/${CLIENT_ID}/${timestamp}/${assetId}.png`
      await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: resized, ContentType: 'image/png' }))
      const ref = { r2_key: key, public_url: `${R2_PUBLIC_URL}/${key}` }
      console.log(`    ✓ ${assetId}`)
      return [assetId, ref]
    })
  )
  for (const [id, ref] of results) images[id] = ref

  await sb.from('brand_kits').update({
    status: 'done',
    progress_message: null,
    assets: { ...existingAssets, images },
  }).eq('id', KIT_ID)
  console.log(`  ✅ Haze Clips complete — ${Object.keys(images).length}/10 images`)
}

run().catch(e => { console.error(e); process.exit(1) })

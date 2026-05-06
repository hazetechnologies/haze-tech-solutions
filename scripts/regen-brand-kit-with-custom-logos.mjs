// One-shot: re-generate text + banners for an existing brand kit using
// user-provided logos. Skips OpenAI logo generation; uses the uploaded
// PNGs as the KIE img2img reference instead.
//
// Usage:  node scripts/regen-brand-kit-with-custom-logos.mjs <client_id> <source_png_path>
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// Load .env from parent repo root
try {
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env')
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim()
  }
} catch (e) { console.error('env load failed:', e.message) }

const [, , CLIENT_ID, SRC_PATH] = process.argv
if (!CLIENT_ID || !SRC_PATH) {
  console.error('Usage: node regen-brand-kit-with-custom-logos.mjs <client_id> <source_png_path>')
  process.exit(1)
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY
const sb = createClient(SUPABASE_URL, SK)

const R2_ACCOUNT  = process.env.R2_ACCOUNT_ID
const R2_KEY      = process.env.R2_ACCESS_KEY_ID
const R2_SECRET   = process.env.R2_SECRET_ACCESS_KEY
const R2_BUCKET   = 'haze-tech-brand-kits'
// Public URL for the bucket — discovered from existing kit assets (not derivable from R2_ACCOUNT_ID)
const R2_PUBLIC   = process.env.R2_PUBLIC_URL || 'https://pub-b7118fbfb8444240959bec83b07fafba.r2.dev'

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_KEY, secretAccessKey: R2_SECRET },
})

async function uploadVariant(bytes, key) {
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET, Key: key, Body: bytes, ContentType: 'image/png',
  }))
  return { r2_key: key, public_url: `${R2_PUBLIC.replace(/\/$/, '')}/${key}` }
}

async function main() {
  console.log(`── Regen brand kit for client ${CLIENT_ID} with custom logo ${SRC_PATH} ──\n`)

  // 1. Look up existing kit
  const { data: kit, error: kitErr } = await sb
    .from('brand_kits').select('id, status').eq('client_id', CLIENT_ID).maybeSingle()
  if (kitErr || !kit) throw new Error(`No brand_kit row for client_id ${CLIENT_ID}: ${kitErr?.message}`)
  console.log(`✓ Found brand_kit ${kit.id} (current status: ${kit.status})`)

  // 2. Process source PNG into 3 logo variants
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const meta = await sharp(SRC_PATH).metadata()
  console.log(`Source: ${meta.width}x${meta.height}`)

  // logo_primary: fit source into 1024x1024 with dark navy padding
  const primary = await sharp(SRC_PATH)
    .resize({ width: 1024, height: 1024, fit: 'contain', background: { r: 8, g: 13, b: 24, alpha: 1 } })
    .png({ quality: 95 })
    .toBuffer()

  // logo_icon: same fit (square, decent for profile use)
  const icon = primary

  // logo_monochrome: grayscale + slight contrast bump
  const monochrome = await sharp(SRC_PATH)
    .resize({ width: 1024, height: 1024, fit: 'contain', background: { r: 8, g: 13, b: 24, alpha: 1 } })
    .grayscale()
    .png({ quality: 95 })
    .toBuffer()

  // 3. Upload all 3 variants to R2
  console.log(`\nUploading to R2 under brand-kits/${CLIENT_ID}/${ts}/`)
  const logo_primary    = await uploadVariant(primary,    `brand-kits/${CLIENT_ID}/${ts}/logo_primary.png`)
  const logo_icon       = await uploadVariant(icon,       `brand-kits/${CLIENT_ID}/${ts}/logo_icon.png`)
  const logo_monochrome = await uploadVariant(monochrome, `brand-kits/${CLIENT_ID}/${ts}/logo_monochrome.png`)
  console.log(`  ✓ logo_primary:    ${logo_primary.public_url}`)
  console.log(`  ✓ logo_icon:       ${logo_icon.public_url}`)
  console.log(`  ✓ logo_monochrome: ${logo_monochrome.public_url}`)

  // 4. Reset status so the edge function will re-run
  await sb.from('brand_kits').update({
    status: 'pending', progress_message: 'Re-generating with custom logos…', error: null,
  }).eq('id', kit.id)

  // 5. Invoke the edge function with existing_logos
  console.log(`\nInvoking generate-brand-kit edge function...`)
  const invokeRes = await fetch(`${SUPABASE_URL}/functions/v1/generate-brand-kit`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SK}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kit_id: kit.id,
      existing_logos: { logo_primary, logo_icon, logo_monochrome },
    }),
  })
  if (!invokeRes.ok) {
    const txt = await invokeRes.text().catch(() => '')
    throw new Error(`Invoke failed ${invokeRes.status}: ${txt}`)
  }
  console.log(`✓ Invoked (${invokeRes.status})`)

  // 6. Poll until done/failed
  console.log(`\nPolling status...`)
  let final
  for (let i = 0; i < 120; i++) {
    await new Promise(r => setTimeout(r, 5_000))
    const { data } = await sb.from('brand_kits').select('*').eq('id', kit.id).single()
    process.stdout.write(`  [${i+1}/120] ${data.status} - ${data.progress_message || '(no msg)'}\n`)
    if (data.status === 'done' || data.status === 'failed') { final = data; break }
  }
  if (!final) { console.log('\n❌ Timed out'); return }
  if (final.status === 'failed') { console.log(`\n❌ FAILED: ${final.error}`); return }

  // 7. Verify
  const a = final.assets || {}
  console.log(`\n✅ Done. Asset keys present:`)
  console.log(`   text:   bios=${!!a.bios} voice_tone=${!!a.voice_tone} hashtags=${a.hashtags?.length ?? 0} pillars=${a.content_pillars?.length ?? 0} palette=${a.color_palette?.length ?? 0}`)
  console.log(`   images: ${Object.keys(a.images || {}).join(', ')}`)
  console.log(`   logo_primary URL: ${a.images?.logo_primary?.public_url}`)
}

main().catch(e => { console.error('ERROR:', e); process.exit(1) })

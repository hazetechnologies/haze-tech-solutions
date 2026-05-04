// supabase/functions/generate-brand-kit/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { trackedOpenAi } from '../_shared/tracked-openai.ts'
import { trackedClaude, extractText } from '../_shared/tracked-claude.ts'
import {
  STRUCTURED_SCHEMA,
  buildStructuredSystemPrompt,
  buildStructuredUserPrompt,
  buildVoiceTonePrompt,
  buildContentPillarsPrompt,
  buildColorPalettePrompt,
  buildImagePrompt,
} from './prompts.ts'
import type {
  BrandKitInputs,
  BrandKitAssets,
  ColorPaletteEntry,
  ContentPillar,
  ImageAssetId,
  ImageAssetRef,
} from './types.ts'
import { uploadImage } from '../_shared/r2-upload.ts'
import { resizeToFinalDims } from './post-process.ts'
import { ALL_ASSET_IDS, SIZES } from './sizes.ts'

const OPENAI_KEY    = Deno.env.get('OPENAI_API_KEY')!
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')!
const KIE_API_KEY   = Deno.env.get('KIE_API_KEY')!
const KIE_BASE      = 'https://api.kie.ai/api/v1'
const OPUS_MODEL    = 'claude-opus-4-7'
const MINI_MODEL    = 'gpt-4o-mini'
const IMAGE_RETRY_DELAYS_MS = [15_000, 30_000, 60_000]

// Logos are generated first via OpenAI direct (fast, consistent quality).
// Banners + profile pic use KIE AI img2img with logo_primary as reference.
const LOGO_ASSET_IDS: ImageAssetId[] = ['logo_primary', 'logo_icon', 'logo_monochrome']
const REFERENCE_ASSET_IDS: ImageAssetId[] = [
  'profile_picture', 'banner_ig', 'banner_fb', 'banner_yt',
  'banner_x', 'banner_tiktok', 'banner_linkedin_cover',
]
const KIE_ASPECT_RATIOS: Record<string, string> = {
  profile_picture:      '1:1',
  banner_ig:            '9:16',
  banner_fb:            '16:9',
  banner_yt:            '16:9',
  banner_x:             '16:9',
  banner_tiktok:        '1:1',
  banner_linkedin_cover:'16:9',
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }
  const { kit_id } = await req.json().catch(() => ({}))
  if (!kit_id) {
    return new Response(JSON.stringify({ error: 'kit_id required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }

  // @ts-ignore EdgeRuntime is a Supabase global
  EdgeRuntime.waitUntil(processBrandKit(kit_id))

  return new Response(JSON.stringify({ ok: true, kit_id }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

async function processBrandKit(kit_id: string): Promise<void> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  async function update(patch: Record<string, unknown>) {
    await supabase.from('brand_kits').update(patch).eq('id', kit_id)
  }

  try {
    const { data: row, error: readErr } = await supabase
      .from('brand_kits')
      .select('inputs, client_id')
      .eq('id', kit_id)
      .single()

    if (readErr || !row) {
      await update({ status: 'failed', error: `row not found: ${readErr?.message}` })
      return
    }

    const inputs = row.inputs as BrandKitInputs
    const client_id = row.client_id as string

    await update({ status: 'generating', progress_message: 'Drafting copy…' })

    // ── Text generation (parallel) ──
    const textAssets = await generateAllText(inputs, kit_id)

    // Persist text assets immediately so we don't lose them if image gen times out
    await update({
      progress_message: 'Drafting copy done. Generating images…',
      assets: { ...textAssets },
    })

    // ── Image generation (parallel — all 9 fired at once, retry-with-backoff per image) ──
    const images = await generateAllImages(inputs, textAssets.color_palette, client_id, kit_id)

    const assets: Partial<BrandKitAssets> = {
      ...textAssets,
      images: images as any,
    }

    await update({
      status: 'done',
      progress_message: null,
      assets,
    })
  } catch (err) {
    await update({
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

// ── Text generation (parallel) ──

async function generateAllText(inputs: BrandKitInputs, kit_id: string) {
  const evtProps = { surface: 'brand-kit', kit_id }

  const [structured, voiceTone, pillarsResp, palette] = await Promise.all([
    callMiniStructured(inputs, kit_id, evtProps),
    callOpusVoiceTone(inputs, kit_id, evtProps),
    callOpusPillars(inputs, kit_id, evtProps),
    callOpusPalette(inputs, kit_id, evtProps),
  ])

  return {
    bios: structured.bios,
    hashtags: structured.hashtags,
    handles: inputs.path === 'cold_start' ? structured.handles : undefined,
    platform_priority: inputs.path === 'cold_start' ? structured.platform_priority : undefined,
    voice_tone: voiceTone,
    content_pillars: pillarsResp,
    color_palette: palette,
  }
}

async function callMiniStructured(inputs: BrandKitInputs, kitId: string, evtProps: Record<string, unknown>) {
  const { data, status } = await trackedOpenAi({
    apiKey: OPENAI_KEY,
    model: MINI_MODEL,
    messages: [
      { role: 'system', content: buildStructuredSystemPrompt() },
      { role: 'user',   content: buildStructuredUserPrompt(inputs) },
    ],
    params: {
      response_format: { type: 'json_schema', json_schema: STRUCTURED_SCHEMA },
    },
    distinctId: kitId,
    eventProperties: evtProps,
  })
  if (status !== 200) throw new Error(`mini structured failed: ${status}: ${JSON.stringify(data).slice(0,300)}`)
  const content = data.choices?.[0]?.message?.content ?? '{}'
  return JSON.parse(content) as {
    bios: { instagram: string; tiktok: string; youtube: string; x: string; facebook: string; linkedin: string }
    hashtags: string[]
    handles: string[]
    platform_priority: string
  }
}

async function callOpusVoiceTone(inputs: BrandKitInputs, kitId: string, evtProps: Record<string, unknown>): Promise<string> {
  const { system, user } = buildVoiceTonePrompt(inputs)
  const { data, status } = await trackedClaude({
    apiKey: ANTHROPIC_KEY,
    model: OPUS_MODEL,
    system,
    messages: [{ role: 'user', content: user }],
    params: { max_tokens: 1500 },
    distinctId: kitId,
    eventProperties: evtProps,
  })
  if (status !== 200) throw new Error(`opus voice_tone failed: ${status}: ${JSON.stringify(data).slice(0,300)}`)
  return extractText(data)
}

async function callOpusPillars(inputs: BrandKitInputs, kitId: string, evtProps: Record<string, unknown>): Promise<ContentPillar[]> {
  const { system, user } = buildContentPillarsPrompt(inputs)
  const { data, status } = await trackedClaude({
    apiKey: ANTHROPIC_KEY,
    model: OPUS_MODEL,
    system,
    messages: [{ role: 'user', content: user }],
    params: { max_tokens: 1500 },
    distinctId: kitId,
    eventProperties: evtProps,
  })
  if (status !== 200) throw new Error(`opus pillars failed: ${status}: ${JSON.stringify(data).slice(0,300)}`)
  const text = extractText(data)
  const parsed = JSON.parse(text) as { pillars: ContentPillar[] }
  if (!parsed.pillars || !Array.isArray(parsed.pillars)) {
    throw new Error('opus pillars: malformed JSON (no .pillars array)')
  }
  return parsed.pillars
}

async function callOpusPalette(inputs: BrandKitInputs, kitId: string, evtProps: Record<string, unknown>): Promise<ColorPaletteEntry[]> {
  const { system, user } = buildColorPalettePrompt(inputs)
  const { data, status } = await trackedClaude({
    apiKey: ANTHROPIC_KEY,
    model: OPUS_MODEL,
    system,
    messages: [{ role: 'user', content: user }],
    params: { max_tokens: 1000 },
    distinctId: kitId,
    eventProperties: evtProps,
  })
  if (status !== 200) throw new Error(`opus palette failed: ${status}: ${JSON.stringify(data).slice(0,300)}`)
  const text = extractText(data)
  const parsed = JSON.parse(text) as { palette: ColorPaletteEntry[] }
  if (!parsed.palette || parsed.palette.length !== 5) {
    throw new Error('opus palette: expected exactly 5 colors')
  }
  return parsed.palette
}

// ── Image generation ──
// Step 1: logos via OpenAI direct (3 parallel, low rate-limit pressure)
// Step 2: banners + profile pic via KIE AI img2img with logo_primary as reference
//         → all 7 fired simultaneously as async tasks, polled in parallel

async function generateAllImages(
  inputs: BrandKitInputs,
  palette: ColorPaletteEntry[],
  clientId: string,
  kitId: string,
): Promise<Record<ImageAssetId, ImageAssetRef>> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const out: Partial<Record<ImageAssetId, ImageAssetRef>> = {}

  // ── Step 1: generate logos in parallel via OpenAI ──
  const logoResults = await Promise.all(
    LOGO_ASSET_IDS.map(async (assetId) => {
      const spec = SIZES[assetId]
      const prompt = buildImagePrompt(assetId, inputs, palette)
      const generated = await generateImageWithRetry(prompt, spec.generationSize, kitId, assetId)
      const resized = await resizeToFinalDims(generated, spec)
      const uploaded = await uploadImage({ bytes: resized, clientId, timestamp, assetId })
      return [assetId, uploaded] as const
    })
  )
  for (const [assetId, uploaded] of logoResults) out[assetId] = uploaded

  // ── Step 2: banners + profile pic via KIE AI img2img ──
  const logoPrimaryUrl = out['logo_primary']!.public_url

  const referenceResults = await Promise.all(
    REFERENCE_ASSET_IDS.map(async (assetId) => {
      const spec = SIZES[assetId]
      const prompt = buildImagePrompt(assetId, inputs, palette)
      const aspectRatio = KIE_ASPECT_RATIOS[assetId] ?? '16:9'

      // Create KIE AI task
      const taskId = await createKieTask(prompt, aspectRatio, logoPrimaryUrl, kitId, assetId)
      // Poll until done
      const resultUrl = await pollKieTask(taskId, assetId)
      // Download + resize + upload to R2
      const raw = await downloadRemoteImage(resultUrl, assetId)
      const resized = await resizeToFinalDims(raw, spec)
      const uploaded = await uploadImage({ bytes: resized, clientId, timestamp, assetId })
      return [assetId, uploaded] as const
    })
  )
  for (const [assetId, uploaded] of referenceResults) out[assetId] = uploaded

  return out as Record<ImageAssetId, ImageAssetRef>
}

// ── KIE AI helpers ──

async function createKieTask(
  prompt: string,
  aspectRatio: string,
  logoUrl: string,
  kitId: string,
  assetId: string,
): Promise<string> {
  const res = await fetch(`${KIE_BASE}/jobs/createTask`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${KIE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-image-2-image-to-image',
      input: {
        prompt,
        input_urls: [logoUrl],
        aspect_ratio: aspectRatio,
        resolution: '1K',
      },
    }),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`KIE createTask ${res.status} on ${assetId}: ${txt.slice(0, 300)}`)
  }
  const json = await res.json() as { data?: { taskId?: string } }
  const taskId = json.data?.taskId
  if (!taskId) throw new Error(`KIE createTask: no taskId returned for ${assetId}`)
  return taskId
}

async function pollKieTask(taskId: string, assetId: string): Promise<string> {
  // Poll every 5s for up to 5 minutes
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 5_000))
    const res = await fetch(`${KIE_BASE}/jobs/recordInfo?taskId=${taskId}`, {
      headers: { 'Authorization': `Bearer ${KIE_API_KEY}` },
    })
    if (!res.ok) continue
    const json = await res.json() as { data?: { state?: string; resultJson?: string; resultUrl?: string; failMsg?: string } }
    const d = json.data
    if (!d) continue
    if (d.state === 'fail') throw new Error(`KIE task failed for ${assetId}: ${d.failMsg ?? 'unknown'}`)
    if (d.state === 'success') {
      // resultJson is a stringified JSON with resultUrls array
      if (d.resultJson) {
        const parsed = JSON.parse(d.resultJson) as { resultUrls?: string[] }
        const url = parsed.resultUrls?.[0]
        if (url) return url
      }
      if (d.resultUrl) return d.resultUrl
      throw new Error(`KIE task succeeded but no result URL for ${assetId}`)
    }
  }
  throw new Error(`KIE task timed out for ${assetId} (taskId: ${taskId})`)
}

async function downloadRemoteImage(url: string, assetId: string): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`failed to download KIE result for ${assetId}: ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

async function generateImageWithRetry(
  prompt: string,
  size: '1024x1024' | '1024x1536' | '1536x1024',
  kitId: string,
  assetId: string,
): Promise<Uint8Array> {
  let lastErr: unknown = null
  for (let attempt = 0; attempt < IMAGE_RETRY_DELAYS_MS.length + 1; attempt++) {
    try {
      const start = Date.now()
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-image-2',
          prompt,
          size,
          n: 1,
        }),
      })
      const latencyMs = Date.now() - start

      // Fire-and-forget telemetry (image gen has its own endpoint, not chat completions,
      // so we manually capture rather than going through trackedOpenAi).
      const POSTHOG_KEY = Deno.env.get('POSTHOG_PROJECT_API_KEY')
      const POSTHOG_HOST = Deno.env.get('POSTHOG_HOST') ?? 'https://us.i.posthog.com'
      if (POSTHOG_KEY) {
        fetch(`${POSTHOG_HOST}/capture/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: POSTHOG_KEY,
            event: '$ai_generation',
            distinct_id: kitId,
            properties: {
              $ai_model: 'gpt-image-2',
              $ai_provider: 'openai',
              $ai_latency: latencyMs,
              $ai_http_status: res.status,
              surface: 'brand-kit',
              kit_id: kitId,
              asset_id: assetId,
            },
          }),
        }).catch(() => {})
      }

      if (res.status === 429 && attempt < IMAGE_RETRY_DELAYS_MS.length) {
        await new Promise(r => setTimeout(r, IMAGE_RETRY_DELAYS_MS[attempt]))
        continue
      }
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        throw new Error(`gpt-image-2 ${res.status} on ${assetId}: ${errText.slice(0, 300)}`)
      }
      const json = await res.json() as { data?: Array<{ b64_json?: string; url?: string }> }
      const item = json.data?.[0]
      if (!item) throw new Error(`gpt-image-2 returned no image for ${assetId}`)
      if (item.b64_json) {
        return Uint8Array.from(atob(item.b64_json), c => c.charCodeAt(0))
      }
      if (item.url) {
        const dl = await fetch(item.url)
        if (!dl.ok) throw new Error(`failed to download generated image for ${assetId}: ${dl.status}`)
        return new Uint8Array(await dl.arrayBuffer())
      }
      throw new Error(`gpt-image-2 returned no b64_json or url for ${assetId}`)
    } catch (err) {
      lastErr = err
      if (attempt < IMAGE_RETRY_DELAYS_MS.length) {
        await new Promise(r => setTimeout(r, IMAGE_RETRY_DELAYS_MS[attempt]))
        continue
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`image gen exhausted retries: ${String(lastErr)}`)
}

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

const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY')!
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')!
const OPUS_MODEL = 'claude-opus-4-7'
const MINI_MODEL = 'gpt-4o-mini'
const IMAGE_RETRY_DELAYS_MS = [10_000, 20_000, 40_000]  // 3 retry attempts (tighter — wall time matters)

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
    bios: { instagram: string; tiktok: string; youtube: string; x: string; facebook: string }
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

// ── Image generation (serial with retry-on-rate-limit) ──

async function generateAllImages(
  inputs: BrandKitInputs,
  palette: ColorPaletteEntry[],
  clientId: string,
  kitId: string,
): Promise<Record<ImageAssetId, ImageAssetRef>> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

  // Fire all 9 image generations in parallel. Each has its own retry-with-backoff
  // for 429 rate-limit errors. Wall time ~30-60 sec instead of 90-270 sec serial.
  const results = await Promise.all(
    ALL_ASSET_IDS.map(async (assetId) => {
      const spec = SIZES[assetId]
      const prompt = buildImagePrompt(assetId, inputs, palette)
      const generated = await generateImageWithRetry(prompt, spec.generationSize, kitId, assetId)
      const resized = await resizeToFinalDims(generated, spec)
      const uploaded = await uploadImage({
        bytes: resized,
        clientId,
        timestamp,
        assetId,
      })
      return [assetId, uploaded] as const
    })
  )

  const out: Partial<Record<ImageAssetId, ImageAssetRef>> = {}
  for (const [assetId, uploaded] of results) out[assetId] = uploaded
  return out as Record<ImageAssetId, ImageAssetRef>
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

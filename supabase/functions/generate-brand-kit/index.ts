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
  buildContentCalendarPrompt,
  buildColorPalettePrompt,
} from './prompts.ts'
import type {
  BrandKitInputs,
  BrandKitAssets,
  ColorPaletteEntry,
  ContentPillar,
  ContentCalendarEntry,
} from './types.ts'

const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY')!
const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')!
const OPUS_MODEL = 'claude-opus-4-7'
const MINI_MODEL = 'gpt-4o-mini'

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

    await update({ progress_message: 'Drafting copy done. Images next…' })

    // Image generation (Task 8 implements). For now, empty images map.
    const images: Partial<Record<string, { r2_key: string; public_url: string }>> = {}

    const assets: Partial<BrandKitAssets> = {
      ...textAssets,
      images: images as any,
    }

    await update({
      status: 'done',
      progress_message: null,
      assets,
    })

    void client_id  // used in Task 8
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

  // Calendar depends on pillar names — call after pillars resolves
  const calendar = await callOpusCalendar(inputs, pillarsResp.map(p => p.name), kit_id, evtProps)

  return {
    bios: structured.bios,
    hashtags: structured.hashtags,
    handles: inputs.path === 'cold_start' ? structured.handles : undefined,
    platform_priority: inputs.path === 'cold_start' ? structured.platform_priority : undefined,
    voice_tone: voiceTone,
    content_pillars: pillarsResp,
    content_calendar: calendar,
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

async function callOpusCalendar(inputs: BrandKitInputs, pillarNames: string[], kitId: string, evtProps: Record<string, unknown>): Promise<ContentCalendarEntry[]> {
  const { system, user } = buildContentCalendarPrompt(inputs, pillarNames)
  const { data, status } = await trackedClaude({
    apiKey: ANTHROPIC_KEY,
    model: OPUS_MODEL,
    system,
    messages: [{ role: 'user', content: user }],
    params: { max_tokens: 4000 },
    distinctId: kitId,
    eventProperties: evtProps,
  })
  if (status !== 200) throw new Error(`opus calendar failed: ${status}: ${JSON.stringify(data).slice(0,300)}`)
  const text = extractText(data)
  const parsed = JSON.parse(text) as { calendar: ContentCalendarEntry[] }
  if (!parsed.calendar || !Array.isArray(parsed.calendar)) {
    throw new Error('opus calendar: malformed JSON (no .calendar array)')
  }
  return parsed.calendar
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

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { resolveStylePreset, parseArtDirection, buildImagePrompt, buildHighlightCoverPrompt, STRUCTURED_SCHEMA, EMPTY_ART_DIRECTION } from './prompts.ts'

const inputs = {
  path: 'cold_start', business_name: 'Acme', industry: 'Coffee', audience: 'Locals',
  vibe: ['warm'], inspirations: 'Blue Bottle',
} as any
const palette = [
  { name: 'primary', hex: '#112233', use: '' },
  { name: 'secondary', hex: '#445566', use: '' },
  { name: 'accent', hex: '#FF8800', use: '' },
] as any

Deno.test('resolveStylePreset returns preset guidance for a known preset', () => {
  assertEquals(resolveStylePreset('luxury').includes('luxury'), true)
})
Deno.test('resolveStylePreset infers for auto/unknown', () => {
  assertEquals(resolveStylePreset('auto').toLowerCase().includes('infer'), true)
  assertEquals(resolveStylePreset(undefined).toLowerCase().includes('infer'), true)
  assertEquals(resolveStylePreset('bogus').toLowerCase().includes('infer'), true)
})
Deno.test('parseArtDirection reads clean JSON', () => {
  const a = parseArtDirection('{"style_summary":"s","logo_style":"l","typography":"t","banner_imagery_style":"b","composition":"c"}')
  assertEquals(a, { style_summary: 's', logo_style: 'l', typography: 't', banner_imagery_style: 'b', composition: 'c' })
})
Deno.test('parseArtDirection tolerates fences/prose and fills missing with empty', () => {
  const a = parseArtDirection('here:\n```json\n{"logo_style":"l"}\n```')
  assertEquals(a.logo_style, 'l')
  assertEquals(a.style_summary, '')
})
Deno.test('parseArtDirection returns all-empty on garbage (never throws)', () => {
  assertEquals(parseArtDirection('no json'), EMPTY_ART_DIRECTION)
  assertEquals(parseArtDirection(''), EMPTY_ART_DIRECTION)
})
Deno.test('buildImagePrompt injects logo direction for a logo asset', () => {
  const art = { ...EMPTY_ART_DIRECTION, logo_style: 'ZLOGOZ', typography: 'ZTYPEZ' }
  const p = buildImagePrompt('logo_option_1', inputs, palette, art)
  assertEquals(p.includes('ZLOGOZ'), true)
  assertEquals(p.includes('ZTYPEZ'), true)
})
Deno.test('buildImagePrompt injects imagery direction for a banner asset', () => {
  const art = { ...EMPTY_ART_DIRECTION, banner_imagery_style: 'ZIMGZ', composition: 'ZCOMPZ' }
  const p = buildImagePrompt('banner_yt', inputs, palette, art)
  assertEquals(p.includes('ZIMGZ'), true)
})
Deno.test('buildImagePrompt is unchanged when art is null', () => {
  const withNull = buildImagePrompt('logo_option_1', inputs, palette, null)
  const without = buildImagePrompt('logo_option_1', inputs, palette)
  assertEquals(withNull, without)
})

// ── Highlight covers + discovery fields ──

Deno.test('STRUCTURED_SCHEMA requires keywords, instagram_page_name, highlight_covers', () => {
  const req = STRUCTURED_SCHEMA.schema.required as readonly string[]
  assertEquals(req.includes('keywords'), true)
  assertEquals(req.includes('instagram_page_name'), true)
  assertEquals(req.includes('highlight_covers'), true)
  const covers = (STRUCTURED_SCHEMA.schema.properties as any).highlight_covers
  assertEquals(covers.minItems, 5)
  assertEquals(covers.maxItems, 5)
})

Deno.test('buildHighlightCoverPrompt bakes in the title + keyword and forbids extra text', () => {
  const p = buildHighlightCoverPrompt({ title: 'Tours', keyword: 'florida tours' }, inputs, palette, null)
  assertEquals(p.includes('"Tours"'), true)
  assertEquals(p.includes('florida tours'), true)
  assertEquals(p.includes('#FF8800'), true)            // accent color present
  assertEquals(p.toLowerCase().includes('no other words'), true)
  assertEquals(p.toLowerCase().includes('circle'), true) // safe-area guidance
})

Deno.test('buildHighlightCoverPrompt is deterministic and injects typography from art', () => {
  const a = buildHighlightCoverPrompt({ title: 'About', keyword: 'coffee' }, inputs, palette, null)
  const b = buildHighlightCoverPrompt({ title: 'About', keyword: 'coffee' }, inputs, palette, null)
  assertEquals(a, b)
  const withArt = buildHighlightCoverPrompt({ title: 'About', keyword: 'coffee' }, inputs, palette, { ...EMPTY_ART_DIRECTION, typography: 'ZTYPEZ' })
  assertEquals(withArt.includes('ZTYPEZ'), true)
})

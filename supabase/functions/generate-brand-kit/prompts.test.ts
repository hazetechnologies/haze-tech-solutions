import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { resolveStylePreset, parseArtDirection, buildImagePrompt, buildHighlightCoverPrompt, buildCinematicCoverPrompt, buildCoverImg2ImgPrompt, normalizeUrlForDisplay, STRUCTURED_SCHEMA, EMPTY_ART_DIRECTION } from './prompts.ts'

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

Deno.test('STRUCTURED_SCHEMA requires keywords, instagram_page_name, highlight_covers, services', () => {
  const req = STRUCTURED_SCHEMA.schema.required as readonly string[]
  assertEquals(req.includes('keywords'), true)
  assertEquals(req.includes('instagram_page_name'), true)
  assertEquals(req.includes('highlight_covers'), true)
  assertEquals(req.includes('services'), true)
  const covers = (STRUCTURED_SCHEMA.schema.properties as any).highlight_covers
  assertEquals(covers.minItems, 5)
  assertEquals(covers.maxItems, 5)
  const svc = (STRUCTURED_SCHEMA.schema.properties as any).services
  assertEquals(svc.minItems, 3)
  assertEquals(svc.maxItems, 6)
})

Deno.test('buildCoverImg2ImgPrompt bakes exact text verbatim + icon strip + strict logo preserve', () => {
  const p = buildCoverImg2ImgPrompt('banner_fb', inputs, palette, null, { website: 'https://acme.io/' }, ['Yachts', 'Tours', 'Dining'])
  assertEquals(p.includes(`reads exactly "${inputs.business_name}"`), true) // wordmark verbatim
  assertEquals(p.includes('acme.io'), true)                                 // url badge, protocol stripped
  assertEquals(p.includes('"YACHTS"'), true)                                // icon-strip label, exact
  assertEquals(p.includes('SERVICE ICON STRIP'), true)
  assertEquals(p.toLowerCase().includes('do not redraw'), true)             // strict logo preserve
})

Deno.test('buildCoverImg2ImgPrompt omits the icon strip when fewer than 3 services', () => {
  const p = buildCoverImg2ImgPrompt('banner_fb', inputs, palette, null, {}, ['Yachts'])
  assertEquals(p.includes('SERVICE ICON STRIP'), false)
})

Deno.test('buildCoverImg2ImgPrompt confines the lockup to a central band for ultra-wide crops', () => {
  // LinkedIn cover keeps only ~30% of the height after the center-crop.
  const wide = buildCoverImg2ImgPrompt('banner_linkedin_cover', inputs, palette, null, { website: 'acme.io' }, ['Yachts', 'Tours', 'Dining'], 0.30)
  assertEquals(wide.includes('survives the crop'), true)
  assertEquals(wide.toLowerCase().includes('horizontal cluster') || wide.toLowerCase().includes('horizontal'), true)
  assertEquals(/central \d+% of the image HEIGHT/.test(wide), true)
  // With no safeHeightPct the crop-safe block is absent (backward compatible).
  const normal = buildCoverImg2ImgPrompt('banner_fb', inputs, palette, null, { website: 'acme.io' }, ['Yachts', 'Tours', 'Dining'])
  assertEquals(normal.includes('survives the crop'), false)
  // A near-full band (e.g. YouTube, 1.0) also skips the block.
  const yt = buildCoverImg2ImgPrompt('banner_yt', inputs, palette, null, { website: 'acme.io' }, ['Yachts', 'Tours', 'Dining'], 1)
  assertEquals(yt.includes('survives the crop'), false)
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

// ── Cinematic cover banners (12-part creative brief) ──

Deno.test('normalizeUrlForDisplay strips protocol + trailing slash', () => {
  assertEquals(normalizeUrlForDisplay('https://www.florvania.com/'), 'www.florvania.com')
  assertEquals(normalizeUrlForDisplay('http://acme.io'), 'acme.io')
  assertEquals(normalizeUrlForDisplay('acme.io'), 'acme.io')
  assertEquals(normalizeUrlForDisplay(''), '')
  assertEquals(normalizeUrlForDisplay(undefined), '')
})

Deno.test('buildCinematicCoverPrompt follows the 12-part brief with brand + website', () => {
  const p = buildCinematicCoverPrompt('banner_fb', inputs, palette, null, { website: 'https://acme.io/' })
  for (const part of ['MISSION:', 'AUDIENCE:', 'EMOTION:', 'STORY:', 'SCENE:', 'HERO ELEMENTS:', 'COMPOSITION:', 'BRANDING:', 'COLORS:', 'LIGHTING:', 'STYLE:', 'QUALITY:', 'FINAL DIRECTION:']) {
    assertEquals(p.includes(part), true, `missing ${part}`)
  }
  assertEquals(p.includes('Acme'), true)
  assertEquals(p.includes('acme.io'), true)          // protocol stripped, baked under logo
  assertEquals(p.includes('BLENDED'), true)          // logo blended, not pasted
})

Deno.test('buildCinematicCoverPrompt adds the YouTube safe zone only for banner_yt', () => {
  const yt = buildCinematicCoverPrompt('banner_yt', inputs, palette, null, { website: 'acme.io' })
  const fb = buildCinematicCoverPrompt('banner_fb', inputs, palette, null, { website: 'acme.io' })
  assertEquals(yt.includes('1546×423'), true)
  assertEquals(yt.includes('SAFE ZONE'), true)
  assertEquals(fb.includes('SAFE ZONE'), false)
})

Deno.test('buildCinematicCoverPrompt falls back to tagline, then nothing, for the under-logo text', () => {
  const withTag = buildCinematicCoverPrompt('banner_x', inputs, palette, null, { tagline: 'Sip The Difference' })
  assertEquals(withTag.includes('Sip The Difference'), true)
  const none = buildCinematicCoverPrompt('banner_x', inputs, palette, null, {})
  assertEquals(none.toLowerCase().includes('no other text'), true)
})

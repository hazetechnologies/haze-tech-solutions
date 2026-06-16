import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { validateBrandKitInputs } from './brand-kit-inputs.js'

const base = {
  path: 'cold_start',
  business_name: 'Acme', business_description: 'We do things',
  industry: 'Coffee', audience: 'Locals', vibe: ['warm'],
  inspirations: 'Blue Bottle', color_preference: 'earthy',
}

Deno.test('accepts a complete cold_start payload', () => {
  assertEquals(validateBrandKitInputs(base), { ok: true })
})

Deno.test('rejects a bad path', () => {
  const r = validateBrandKitInputs({ ...base, path: 'nope' })
  assertEquals(r.ok, false)
})

Deno.test('rejects a missing required field', () => {
  const { industry: _omit, ...rest } = base
  const r = validateBrandKitInputs(rest)
  assertEquals(r.ok, false)
  assertEquals(r.error.includes('industry'), true)
})

Deno.test('rejects empty vibe array', () => {
  assertEquals(validateBrandKitInputs({ ...base, vibe: [] }).ok, false)
})

Deno.test('requires color_preference OR brand_colors', () => {
  const { color_preference: _c, ...rest } = base
  assertEquals(validateBrandKitInputs(rest).ok, false)
  assertEquals(validateBrandKitInputs({ ...rest, brand_colors: [{ name: 'primary', hex: '#aabbcc' }] }).ok, true)
})

Deno.test('rejects bad hex and bad color name', () => {
  const { color_preference: _c, ...rest } = base
  assertEquals(validateBrandKitInputs({ ...rest, brand_colors: [{ name: 'primary', hex: 'red' }] }).ok, false)
  assertEquals(validateBrandKitInputs({ ...rest, brand_colors: [{ name: 'bogus', hex: '#aabbcc' }] }).ok, false)
})

Deno.test('rejects non-http logo url and enforces length caps', () => {
  assertEquals(validateBrandKitInputs({ ...base, existing_logo_url: 'ftp://x' }).ok, false)
  assertEquals(validateBrandKitInputs({ ...base, tagline_override: 'x'.repeat(81) }).ok, false)
  assertEquals(validateBrandKitInputs({ ...base, cta_override: 'x'.repeat(25) }).ok, false)
  assertEquals(validateBrandKitInputs({ ...base, imagery_direction: 'x'.repeat(501) }).ok, false)
})

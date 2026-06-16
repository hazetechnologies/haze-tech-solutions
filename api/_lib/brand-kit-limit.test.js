import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { evaluateBrandKitLimit } from './brand-kit-limit.js'

const periodStart = new Date('2026-06-01T00:00:00Z')
const inP = (s) => ({ status: s, created_at: '2026-06-10T00:00:00Z' })   // inside period
const old = (s) => ({ status: s, created_at: '2026-05-10T00:00:00Z' })   // before period

Deno.test('allows when under limit', () => {
  const r = evaluateBrandKitLimit({ kits: [inP('done')], limit: 2, periodStart })
  assertEquals(r, { allowed: true, used: 1, limit: 2, resetsAt: null })
})

Deno.test('blocks at the limit', () => {
  const r = evaluateBrandKitLimit({ kits: [inP('done'), inP('generating')], limit: 2, periodStart })
  assertEquals(r.allowed, false)
  assertEquals(r.used, 2)
})

Deno.test('failed kits do not count', () => {
  const r = evaluateBrandKitLimit({ kits: [inP('failed'), inP('failed'), inP('done')], limit: 2, periodStart })
  assertEquals(r.used, 1)
  assertEquals(r.allowed, true)
})

Deno.test('kits before the period start do not count', () => {
  const r = evaluateBrandKitLimit({ kits: [old('done'), old('done'), inP('done')], limit: 2, periodStart })
  assertEquals(r.used, 1)
})

Deno.test('empty list is allowed', () => {
  assertEquals(evaluateBrandKitLimit({ kits: [], limit: 2, periodStart }).allowed, true)
})

// supabase/functions/generate-brand-kit/kie.test.ts
import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { unwrapKieEnvelope, summarizeBannerErrors } from './kie.ts'

Deno.test('unwrapKieEnvelope: surfaces in-body 402 even on HTTP 200 (the credits bug)', () => {
  const err = assertThrows(
    () => unwrapKieEnvelope(200, {
      code: 402,
      msg: 'Credits insufficient : Your current balance isn’t enough to run this request. Please top up to continue.',
      data: null,
    }, 'createTask on banner_ig'),
    Error,
    'code 402',
  )
  // The real reason must be in the message, not swallowed.
  assertEquals((err as Error).message.includes('Credits insufficient'), true)
  assertEquals((err as Error).message.includes('banner_ig'), true)
})

Deno.test('unwrapKieEnvelope: returns data on success (code 200)', () => {
  const data = unwrapKieEnvelope<{ taskId?: string }>(200, {
    code: 200, msg: 'success', data: { taskId: 'abc123' },
  }, 'createTask on banner_fb')
  assertEquals(data.taskId, 'abc123')
})

Deno.test('unwrapKieEnvelope: treats non-2xx HTTP as failure', () => {
  assertThrows(
    () => unwrapKieEnvelope(401, { msg: 'Unauthorized' }, 'createTask on banner_x'),
    Error,
    'code 401',
  )
})

Deno.test('unwrapKieEnvelope: throws on empty/non-JSON body', () => {
  assertThrows(
    () => unwrapKieEnvelope(200, null, 'recordInfo on banner_yt'),
    Error,
    'empty or non-JSON',
  )
})

Deno.test('unwrapKieEnvelope: success code but no data is a failure', () => {
  assertThrows(
    () => unwrapKieEnvelope(200, { code: 200, data: null }, 'createTask on banner_tiktok'),
    Error,
    'no data',
  )
})

Deno.test('summarizeBannerErrors: dedupes identical messages', () => {
  const msg = 'KIE createTask on banner_ig failed (code 402): Credits insufficient'
  const out = summarizeBannerErrors([msg, msg, msg])
  assertEquals(out, msg)
})

Deno.test('summarizeBannerErrors: joins distinct messages and caps length', () => {
  const out = summarizeBannerErrors(['a-error', 'b-error', '  ', 'c-error', 'd-error'])
  assertEquals(out, 'a-error | b-error | c-error') // first 3 distinct, blanks dropped
  assertEquals(summarizeBannerErrors([]).length, 0)
})

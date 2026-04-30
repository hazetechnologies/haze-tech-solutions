// supabase/functions/generate-social-audit/lib/validate-inputs.test.ts
import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { validateInputs } from './validate-inputs.ts'

Deno.test('rejects when no self handles provided', () => {
  assertThrows(
    () => validateInputs({
      platforms: {},
      audience: 'x', goal: 'Leads', challenge: 'y'
    }),
    Error,
    'at least one'
  )
})

Deno.test('rejects when goal is invalid', () => {
  assertThrows(
    () => validateInputs({
      platforms: { instagram: { self: '@x', competitors: [] } },
      audience: 'x', goal: 'Bogus' as any, challenge: 'y'
    }),
    Error,
    'goal'
  )
})

Deno.test('rejects more than 2 competitors per platform', () => {
  assertThrows(
    () => validateInputs({
      platforms: { youtube: { self: 'UCx', competitors: ['a','b','c'] } },
      audience: 'x', goal: 'Leads', challenge: 'y'
    }),
    Error,
    'competitors'
  )
})

Deno.test('accepts valid IG-only input', () => {
  const result = validateInputs({
    platforms: { instagram: { self: '@biz', competitors: ['@a','@b'] } },
    audience: 'small biz', goal: 'Leads', challenge: 'low engagement'
  })
  assertEquals(result.platforms.instagram?.self, '@biz')
})

Deno.test('strips empty competitor strings', () => {
  const result = validateInputs({
    platforms: { instagram: { self: '@biz', competitors: ['@a', '', '  '] } },
    audience: 'x', goal: 'Leads', challenge: 'y'
  })
  assertEquals(result.platforms.instagram?.competitors, ['@a'])
})

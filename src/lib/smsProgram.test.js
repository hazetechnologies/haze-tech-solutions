// Deno test (bare `deno test src/lib/smsProgram.test.js`), like api/_lib/*.test.js.
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { normalizeUsPhone, validateSmsOptIn, CONSENT_VERSION, CONSENT_TEXT, NO_SHARING_SENTENCE } from './smsProgram.js'

Deno.test('normalizes common US formats to E.164', () => {
  for (const raw of ['3055550123', '(305) 555-0123', '305.555.0123', '+1 305 555 0123', '1-305-555-0123']) {
    assertEquals(normalizeUsPhone(raw), '+13055550123', raw)
  }
})

Deno.test('rejects numbers that are not 10-digit US numbers', () => {
  for (const raw of ['', '555-0123', '+44 20 7946 0958', '0305550123', '3051550123', '4115550123', '305555012a', '305555012345', null, 3055550123]) {
    assertEquals(normalizeUsPhone(raw), null, String(raw))
  }
})

const good = { name: '  Ana   Ruiz ', phone: '(305) 555-0123', consent: true, consentVersion: CONSENT_VERSION }

Deno.test('accepts a complete sign-up and tidies it', () => {
  assertEquals(validateSmsOptIn(good), { ok: true, value: { name: 'Ana Ruiz', phone: '+13055550123' } })
})

Deno.test('requires the box to be checked: true, not truthy', () => {
  for (const consent of [undefined, false, 'true', 'on', 1]) {
    assertEquals(validateSmsOptIn({ ...good, consent }).ok, false, String(consent))
  }
})

Deno.test('refuses a sign-up made against older wording', () => {
  assertEquals(validateSmsOptIn({ ...good, consentVersion: '2020-01-01' }).ok, false)
  assertEquals(validateSmsOptIn({ ...good, consentVersion: undefined }).ok, false)
})

Deno.test('requires a name and a valid number', () => {
  assertEquals(validateSmsOptIn({ ...good, name: '   ' }).ok, false)
  assertEquals(validateSmsOptIn({ ...good, name: 'x'.repeat(121) }).ok, false)
  assertEquals(validateSmsOptIn({ ...good, phone: '12345' }).ok, false)
  assertEquals(validateSmsOptIn(null).ok, false)
})

Deno.test('the disclosure carries everything carriers check for', () => {
  for (const part of ['Haze Tech Solutions LLC', 'Message frequency varies', 'Message and data rates may apply', 'HELP', 'STOP', 'not a condition of any purchase', '/sms-terms', '/privacy']) {
    assertEquals(CONSENT_TEXT.includes(part), true, part)
  }
  assertEquals(NO_SHARING_SENTENCE, 'Mobile opt-in data and consent will not be shared with third parties or affiliates for marketing or promotional purposes.')
})

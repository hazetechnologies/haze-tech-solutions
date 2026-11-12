// src/lib/smsProgram.js
// The ONE description of Haze Tech Solutions' text-message program. The sign-up
// page shows CONSENT_TEXT next to its checkbox, the Text Message Terms page and
// the Privacy Policy quote these facts, and api/website.js?action=sms-optin
// stores CONSENT_TEXT (the server's copy, never the browser's) with each
// sign-up. The 10DLC campaign registered with the carriers describes this same
// program, so a change here is a change to what was registered: keep them in
// step, and bump CONSENT_VERSION whenever CONSENT_TEXT changes.

export const SMS_BRAND = 'Haze Tech Solutions'
export const SMS_LEGAL_NAME = 'Haze Tech Solutions LLC'
// The number the texts come from (HAZECEO's Telnyx number).
export const SMS_FROM_DISPLAY = '(786) 798-7802'
export const SMS_SUPPORT_EMAIL = 'hello@hazetechsolutions.com'
export const SMS_TERMS_PATH = '/sms-terms'
export const SMS_PRIVACY_PATH = '/privacy'
export const SMS_SIGNUP_PATH = '/sms-signup'

export const SMS_PURPOSE =
  'replies to your questions, appointment confirmations and reminders, and updates about your projects and account'

export const CONSENT_VERSION = '2026-11-12'
export const CONSENT_TEXT =
  `I agree to receive text messages from ${SMS_LEGAL_NAME} at the mobile number above: ${SMS_PURPOSE}. ` +
  'Message frequency varies. Message and data rates may apply. Reply HELP for help or STOP to opt out at any time. ' +
  'Consent is not a condition of any purchase. ' +
  `Text Message Terms: hazetechsolutions.com${SMS_TERMS_PATH}. Privacy Policy: hazetechsolutions.com${SMS_PRIVACY_PATH}.`

// The sentence carriers look for in the privacy policy, word for word.
export const NO_SHARING_SENTENCE =
  'Mobile opt-in data and consent will not be shared with third parties or affiliates for marketing or promotional purposes.'

/**
 * A US mobile number in any common format -> E.164 (+1XXXXXXXXXX), or null.
 * Accepts 10 digits, or 11 starting with 1. Rejects area codes and exchanges
 * that can't exist (starting with 0 or 1), and N11 service codes.
 */
export function normalizeUsPhone(raw) {
  if (typeof raw !== 'string') return null
  if (/[^0-9+().\-\s]/.test(raw)) return null
  let d = raw.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1)
  if (d.length !== 10) return null
  const area = d.slice(0, 3), exchange = d.slice(3, 6)
  if (/^[01]/.test(area) || /^[01]/.test(exchange)) return null
  if (/^.11$/.test(area)) return null
  return `+1${d}`
}

/**
 * Validates a sign-up from the public form. Returns { ok: true, value } or
 * { ok: false, message } with a message fit to show the person.
 */
export function validateSmsOptIn(body) {
  const b = body && typeof body === 'object' ? body : {}
  const name = typeof b.name === 'string' ? b.name.replace(/\s+/g, ' ').trim() : ''
  if (!name) return { ok: false, message: 'Enter your name.' }
  if (name.length > 120) return { ok: false, message: 'That name is too long. Use 120 characters or fewer.' }
  const phone = normalizeUsPhone(b.phone)
  if (!phone) return { ok: false, message: 'Enter a 10-digit US mobile number, like 305 555 0123.' }
  if (b.consent !== true) return { ok: false, message: 'Check the box to agree to receive texts. Nothing is sent without it.' }
  if (b.consentVersion !== CONSENT_VERSION) {
    return { ok: false, message: 'This page has changed since you opened it. Reload it, read the updated wording, and try again.' }
  }
  return { ok: true, value: { name, phone } }
}

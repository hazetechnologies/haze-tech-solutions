// src/lib/affiliateRef.js
// Client-side referral attribution for the Vite SPA (no SSR/middleware).
// Captures ?ref=CODE (or /r/CODE), FIRST-TOUCH wins with a 30-day TTL, and
// persists to localStorage + a first-party cookie. The server re-validates the
// code against the affiliates table on every lead insert, so client tampering
// is harmless (worst case: an invalid code is dropped).
const KEY = 'hts_ref'
const TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

function readStore() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  // Cookie fallback (e.g. localStorage cleared but cookie survives)
  const m = document.cookie.match(/(?:^|;\s*)hts_ref=([^;]+)/)
  if (m) return { code: decodeURIComponent(m[1]), ts: Date.now() }
  return null
}

function isLive(entry) {
  return entry && entry.code && typeof entry.ts === 'number' && (Date.now() - entry.ts) < TTL_MS
}

function persist(code) {
  const entry = { code, ts: Date.now() }
  try { localStorage.setItem(KEY, JSON.stringify(entry)) } catch { /* ignore */ }
  document.cookie = `${KEY}=${encodeURIComponent(code)}; Max-Age=${Math.floor(TTL_MS / 1000)}; Path=/; SameSite=Lax`
}

// Normalize a raw ref string (uppercase, strip junk). Returns null if empty.
function normalize(raw) {
  if (!raw) return null
  const c = String(raw).trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16)
  return c || null
}

// Capture from the current URL (?ref=CODE). First-touch: do NOT overwrite a live
// stored code. Returns the captured code (or null).
export function captureRefFromUrl() {
  if (typeof window === 'undefined') return null
  let raw = null
  try { raw = new URLSearchParams(window.location.search).get('ref') } catch { /* ignore */ }
  return captureRef(raw)
}

// Capture an explicit code (used by the /r/:code route). First-touch wins.
export function captureRef(rawCode) {
  const code = normalize(rawCode)
  if (!code) return getRefCode()
  const existing = readStore()
  if (isLive(existing)) return existing.code // first-touch — keep the original
  persist(code)
  return code
}

// Return the live (non-expired) referral code, or null.
export function getRefCode() {
  const entry = readStore()
  if (isLive(entry)) return entry.code
  // expired → clean up
  if (entry) { try { localStorage.removeItem(KEY) } catch { /* ignore */ } }
  return null
}

// api/_lib/brand-autofill.js
// Pure helpers for the admin "autofill brand kit from website + logo" endpoint:
// an SSRF-safe URL check, an HTML→text stripper, the Claude prompt builder, and
// a tolerant parser for Claude's JSON. No network here — unit-testable.

export const EMPTY_AUTOFILL = {
  business_description: '', industry: '', audience: '', color_preference: '',
  brand_colors: { primary: '', secondary: '', accent: '' },
  imagery_direction: '', tagline_override: '', cta_override: '',
}

// Lightweight SSRF guard (defense-in-depth; the endpoint is admin-gated).
export function isSafePublicUrl(url) {
  let u
  try { u = new URL(url) } catch { return false }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
  let h = u.hostname.toLowerCase()
  // URL.hostname keeps brackets around IPv6 literals, e.g. "[::1]" — unwrap
  // before matching, otherwise loopback/link-local IPv6 hosts slip through.
  const isIpv6 = h.startsWith('[') && h.endsWith(']')
  if (isIpv6) h = h.slice(1, -1)
  if (isIpv6) {
    if (h === '::1' || h === '::') return false // loopback / unspecified
    if (/^fe[89ab][0-9a-f]:/.test(h)) return false // link-local fe80::/10
    if (/^f[cd][0-9a-f]{2}:/.test(h)) return false // unique local fc00::/7
    // IPv4-mapped IPv6 (::ffff:a.b.c.d or its hex form) — re-check as IPv4.
    const mapped = h.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
    if (mapped) return isSafePublicUrl(`http://${mapped[1]}`)
    const mappedHex = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
    if (mappedHex) {
      const hi = parseInt(mappedHex[1], 16), lo = parseInt(mappedHex[2], 16)
      const ip = [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff].join('.')
      return isSafePublicUrl(`http://${ip}`)
    }
    return true
  }
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return false
  if (h === '127.0.0.1' || h.startsWith('127.')) return false
  if (h === '0.0.0.0' || h.startsWith('169.254.') || h.startsWith('10.') || h.startsWith('192.168.')) return false
  const m = h.match(/^172\.(\d{1,3})\./)
  if (m) { const o = Number(m[1]); if (o >= 16 && o <= 31) return false }
  return true
}

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ' }

export function htmlToText(html, cap = 15000) {
  if (!html || typeof html !== 'string') return ''
  let s = html
  // Capture the <title> so it survives tag stripping.
  const titleMatch = s.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch ? titleMatch[1] : ''
  // Capture meta description / og:description.
  const descMatch = s.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']*)["']/i)
  const desc = descMatch ? descMatch[1] : ''
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ')
       .replace(/<style[\s\S]*?<\/style>/gi, ' ')
       .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
       .replace(/<!--[\s\S]*?-->/g, ' ')
       .replace(/<[^>]+>/g, ' ')
  s = [title, desc, s].join(' ')
  for (const [k, v] of Object.entries(ENTITIES)) s = s.split(k).join(v)
  s = s.replace(/&#\d+;/g, ' ').replace(/\s+/g, ' ').trim()
  return s.slice(0, cap)
}

export function buildAutofillPrompt({ siteText, hasLogo }) {
  const system = 'You are a brand strategist. From the provided website text' + (hasLogo ? ' and the brand logo image' : '') + ', infer a concise brand brief. Return ONLY a single JSON object — no prose, no code fences — with EXACTLY these keys: "business_description" (1-2 sentences on what the business does), "industry", "audience" (target audience), "color_preference" (a short description of the color mood), "brand_colors" (an object with "primary","secondary","accent" each a #RRGGBB hex — infer the palette' + (hasLogo ? ' PRIMARILY from the logo image' : ' from the site') + '), "imagery_direction" (a short scene/backdrop direction for banners), "tagline_override" (5-8 word tagline), "cta_override" (2-4 word call to action). Use an empty string for any field you genuinely cannot infer.'
  const user = siteText && siteText.trim()
    ? `Website content:\n${siteText}\n\nReturn the JSON object only.`
    : hasLogo
      ? 'No website text was available — infer the brief from the logo image alone. Return the JSON object only.'
      : 'No website text or logo was available. Return your best-guess JSON object, using an empty string for any field you cannot infer.'
  return { system, user }
}

const HEX = /^#[0-9a-fA-F]{6}$/

export function parseBrandAutofill(text) {
  const out = { ...EMPTY_AUTOFILL, brand_colors: { ...EMPTY_AUTOFILL.brand_colors } }
  if (!text || typeof text !== 'string') return out
  const s = text.indexOf('{'), e = text.lastIndexOf('}')
  if (s === -1 || e === -1 || e <= s) return out
  let obj
  try { obj = JSON.parse(text.slice(s, e + 1)) } catch { return out }
  for (const k of ['business_description', 'industry', 'audience', 'color_preference', 'imagery_direction', 'tagline_override', 'cta_override']) {
    if (typeof obj?.[k] === 'string') out[k] = obj[k].trim()
  }
  const bc = obj?.brand_colors
  if (bc && typeof bc === 'object') {
    for (const role of ['primary', 'secondary', 'accent']) {
      const v = typeof bc[role] === 'string' ? bc[role].trim() : ''
      out.brand_colors[role] = HEX.test(v) ? v : ''
    }
  }
  return out
}

// api/_lib/brand-kit-inputs.js
// Pure validator for brand-kit generation inputs, shared by the admin trigger
// (api/start-brand-kit.js) and the client self-serve action
// (api/website.js ?action=start-brand-kit-self). Returns { ok: true } or
// { ok: false, error }.

const REQUIRED_COLD_START = ['business_name', 'business_description', 'industry', 'audience', 'vibe', 'inspirations']
const REQUIRED_AUDIT_PREFILL = ['business_name', 'industry', 'audience', 'vibe', 'inspirations']

export function validateBrandKitInputs(inputs) {
  if (!inputs || typeof inputs !== 'object') return { ok: false, error: 'inputs required' }
  const path = inputs.path
  if (path !== 'audit_prefill' && path !== 'cold_start') {
    return { ok: false, error: `inputs.path must be 'audit_prefill' or 'cold_start'` }
  }
  const required = path === 'cold_start' ? REQUIRED_COLD_START : REQUIRED_AUDIT_PREFILL
  for (const f of required) {
    const v = inputs[f]
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) {
      return { ok: false, error: `inputs.${f} is required for path '${path}'` }
    }
  }
  const hasColorText = typeof inputs.color_preference === 'string' && inputs.color_preference.trim().length > 0
  const hasBrandColors = Array.isArray(inputs.brand_colors) && inputs.brand_colors.length > 0
  if (!hasColorText && !hasBrandColors) {
    return { ok: false, error: 'Provide either color_preference (text) or brand_colors[] (explicit hex)' }
  }
  if (hasBrandColors) {
    for (const c of inputs.brand_colors) {
      if (!c?.hex || !/^#[0-9a-fA-F]{6}$/.test(c.hex)) {
        return { ok: false, error: `brand_colors[].hex must be a #RRGGBB value (got "${c?.hex}")` }
      }
      if (!['primary', 'secondary', 'accent'].includes(c.name)) {
        return { ok: false, error: `brand_colors[].name must be 'primary', 'secondary', or 'accent' (got "${c?.name}")` }
      }
    }
  }
  if (inputs.existing_logo_url && !/^https?:\/\//.test(inputs.existing_logo_url)) {
    return { ok: false, error: 'existing_logo_url must be a full http(s):// URL' }
  }
  if (inputs.imagery_direction !== undefined) {
    if (typeof inputs.imagery_direction !== 'string') return { ok: false, error: 'imagery_direction must be a string' }
    if (inputs.imagery_direction.length > 500) return { ok: false, error: 'imagery_direction must be 500 characters or fewer' }
  }
  if (inputs.tagline_override !== undefined) {
    if (typeof inputs.tagline_override !== 'string') return { ok: false, error: 'tagline_override must be a string' }
    if (inputs.tagline_override.length > 80) return { ok: false, error: 'tagline_override must be 80 characters or fewer' }
  }
  if (inputs.cta_override !== undefined) {
    if (typeof inputs.cta_override !== 'string') return { ok: false, error: 'cta_override must be a string' }
    if (inputs.cta_override.length > 24) return { ok: false, error: 'cta_override must be 24 characters or fewer' }
  }
  return { ok: true }
}

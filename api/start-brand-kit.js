// api/start-brand-kit.js
import { requireAdmin } from './_lib/require-admin.js'

const REQUIRED_PATH3_FIELDS = [
  'business_name', 'business_description', 'industry', 'audience',
  'vibe', 'inspirations',
]
const REQUIRED_PATH1_FIELDS = [
  'business_name', 'industry', 'audience',
  'vibe', 'inspirations',
]
// color_preference is required UNLESS brand_colors[] is supplied (the explicit
// hex codes replace the text description). Validated separately below.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed', message: 'POST only' })
  }

  const ctx = await requireAdmin(req, res)
  if (!ctx) return
  const supabase = ctx.adminClient

  const { client_id, source_audit_id, inputs } = req.body || {}
  if (!client_id) return res.status(400).json({ error: 'client_id required' })
  if (!inputs || typeof inputs !== 'object') return res.status(400).json({ error: 'inputs required' })

  const path = inputs.path
  if (path !== 'audit_prefill' && path !== 'cold_start') {
    return res.status(400).json({ error: `inputs.path must be 'audit_prefill' or 'cold_start'` })
  }

  const required = path === 'cold_start' ? REQUIRED_PATH3_FIELDS : REQUIRED_PATH1_FIELDS
  for (const f of required) {
    const v = inputs[f]
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) {
      return res.status(400).json({ error: `inputs.${f} is required for path '${path}'` })
    }
  }

  // Either color_preference (free text) OR brand_colors[] (explicit hex) must be set.
  const hasColorText = typeof inputs.color_preference === 'string' && inputs.color_preference.trim().length > 0
  const hasBrandColors = Array.isArray(inputs.brand_colors) && inputs.brand_colors.length > 0
  if (!hasColorText && !hasBrandColors) {
    return res.status(400).json({ error: 'Provide either color_preference (text) or brand_colors[] (explicit hex)' })
  }
  if (hasBrandColors) {
    for (const c of inputs.brand_colors) {
      if (!c?.hex || !/^#[0-9a-fA-F]{6}$/.test(c.hex)) {
        return res.status(400).json({ error: `brand_colors[].hex must be a #RRGGBB value (got "${c?.hex}")` })
      }
      if (!['primary', 'secondary', 'accent'].includes(c.name)) {
        return res.status(400).json({ error: `brand_colors[].name must be 'primary', 'secondary', or 'accent' (got "${c?.name}")` })
      }
    }
  }
  if (inputs.existing_logo_url && !/^https?:\/\//.test(inputs.existing_logo_url)) {
    return res.status(400).json({ error: 'existing_logo_url must be a full http(s):// URL' })
  }
  // Cap imagery_direction at 500 chars — anything longer is almost certainly a
  // paste accident and inflates the gpt-image-2 token budget per banner.
  if (inputs.imagery_direction !== undefined) {
    if (typeof inputs.imagery_direction !== 'string') {
      return res.status(400).json({ error: 'imagery_direction must be a string' })
    }
    if (inputs.imagery_direction.length > 500) {
      return res.status(400).json({ error: 'imagery_direction must be 500 characters or fewer' })
    }
  }
  // Tagline + CTA caps match the schema constraints we pass to gpt-image-2;
  // longer values aren't reliably rendered.
  if (inputs.tagline_override !== undefined) {
    if (typeof inputs.tagline_override !== 'string') {
      return res.status(400).json({ error: 'tagline_override must be a string' })
    }
    if (inputs.tagline_override.length > 80) {
      return res.status(400).json({ error: 'tagline_override must be 80 characters or fewer' })
    }
  }
  if (inputs.cta_override !== undefined) {
    if (typeof inputs.cta_override !== 'string') {
      return res.status(400).json({ error: 'cta_override must be a string' })
    }
    if (inputs.cta_override.length > 24) {
      return res.status(400).json({ error: 'cta_override must be 24 characters or fewer' })
    }
  }

  // Verify client exists
  const { data: client, error: clientErr } =
    await supabase.from('clients').select('id').eq('id', client_id).single()
  if (clientErr || !client) return res.status(404).json({ error: 'client not found' })

  // Insert brand_kits row
  const { data, error } = await supabase
    .from('brand_kits')
    .insert({
      client_id,
      source_audit_id: source_audit_id || null,
      inputs,
      status: 'pending',
      progress_message: 'Queued…',
    })
    .select('id')
    .single()
  if (error) return res.status(500).json({ error: `db insert failed: ${error.message}` })

  // Invoke Edge Function asynchronously (it returns 200 immediately via EdgeRuntime.waitUntil)
  const edgeUrl = `${process.env.SUPABASE_EDGE_FUNCTION_URL}/generate-brand-kit`
  try {
    const edgeRes = await fetch(edgeUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ kit_id: data.id }),
    })
    if (!edgeRes.ok) {
      console.error('Edge Function invoke non-ok:', edgeRes.status, await edgeRes.text())
    }
  } catch (err) {
    console.error('Edge Function invoke failed:', err)
  }

  return res.status(200).json({ kit_id: data.id })
}

// api/start-brand-kit.js
import { requireAdmin } from './_lib/require-admin'

const REQUIRED_PATH3_FIELDS = [
  'business_name', 'business_description', 'industry', 'audience',
  'vibe', 'color_preference', 'inspirations',
]
const REQUIRED_PATH1_FIELDS = [
  'business_name', 'industry', 'audience',
  'vibe', 'color_preference', 'inspirations',
]

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

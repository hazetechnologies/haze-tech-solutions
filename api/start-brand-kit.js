// api/start-brand-kit.js
import { requireAdmin } from './_lib/require-admin.js'
import { validateBrandKitInputs } from './_lib/brand-kit-inputs.js'

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

  const v = validateBrandKitInputs(inputs)
  if (!v.ok) return res.status(400).json({ error: v.error })

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

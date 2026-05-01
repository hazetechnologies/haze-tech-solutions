// api/start-social-audit.js
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { lead_id, inputs } = req.body || {}
  if (!inputs || typeof inputs !== 'object') {
    return res.status(400).json({ error: 'inputs required' })
  }
  // Light validation — Edge Function does authoritative check
  const platforms = inputs.platforms || {}
  const hasSelf = ['instagram', 'youtube'].some(p => platforms[p]?.self)
  if (!hasSelf) {
    return res.status(400).json({ error: 'at least one platform with a self handle is required' })
  }

  const { data, error } = await supabase
    .from('social_audits')
    .insert({ lead_id: lead_id || null, inputs, status: 'pending', progress_message: 'Queued…' })
    .select('id')
    .single()

  if (error) {
    return res.status(500).json({ error: `db insert failed: ${error.message}` })
  }

  // Invoke the Edge Function. It uses EdgeRuntime.waitUntil to do the long work
  // in the background and returns {ok:true} immediately, so awaiting here is safe (~1s).
  const edgeUrl = `${process.env.SUPABASE_EDGE_FUNCTION_URL}/generate-social-audit`
  try {
    const edgeRes = await fetch(edgeUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ audit_id: data.id }),
    })
    if (!edgeRes.ok) {
      console.error('Edge Function invoke non-ok:', edgeRes.status, await edgeRes.text())
    }
  } catch (err) {
    console.error('Edge Function invoke failed:', err)
  }

  return res.status(200).json({ audit_id: data.id })
}

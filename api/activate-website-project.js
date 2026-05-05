// api/activate-website-project.js
import { requireAdmin } from './_lib/require-admin'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed', message: 'POST only' })
  }

  const ctx = await requireAdmin(req, res)
  if (!ctx) return
  const { adminClient } = ctx

  const { client_id } = req.body || {}
  if (!client_id) {
    return res.status(400).json({ error: 'bad_request', message: 'client_id required' })
  }

  // Verify client exists
  const { data: client, error: clientErr } = await adminClient
    .from('clients').select('id').eq('id', client_id).maybeSingle()
  if (clientErr) return res.status(500).json({ error: 'db_error', message: clientErr.message })
  if (!client) return res.status(404).json({ error: 'not_found', message: 'Client not found' })

  // Reject duplicates: one website project per client
  const { data: existing } = await adminClient
    .from('website_projects').select('id').eq('client_id', client_id).maybeSingle()
  if (existing) {
    return res.status(409).json({ error: 'already_exists', message: 'Website project already activated', project_id: existing.id })
  }

  const { data: created, error: insertErr } = await adminClient
    .from('website_projects')
    .insert({ client_id, status: 'intake_pending' })
    .select('id')
    .single()
  if (insertErr) return res.status(500).json({ error: 'insert_failed', message: insertErr.message })

  return res.status(200).json({ project_id: created.id })
}

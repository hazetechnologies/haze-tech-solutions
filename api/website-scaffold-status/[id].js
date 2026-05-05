// api/website-scaffold-status/[id].js
import { requireAdmin } from '../_lib/require-admin'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'method_not_allowed', message: 'GET only' })
  }

  const ctx = await requireAdmin(req, res)
  if (!ctx) return
  const { adminClient } = ctx

  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'bad_request', message: 'id required' })

  const { data, error } = await adminClient
    .from('website_projects')
    .select('id, status, progress_message, repo_url, repo_name, error, ai_content, inputs, template_id, updated_at')
    .eq('id', id)
    .maybeSingle()
  if (error) return res.status(500).json({ error: 'db_error', message: error.message })
  if (!data) return res.status(404).json({ error: 'not_found', message: 'Project not found' })

  return res.status(200).json(data)
}

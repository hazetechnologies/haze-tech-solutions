// api/brand-kit-status/[id].js
import { requireAdmin } from '../_lib/require-admin'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'method_not_allowed', message: 'GET only' })
  }

  const ctx = await requireAdmin(req, res)
  if (!ctx) return
  const supabase = ctx.adminClient

  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'id required' })

  const { data, error } = await supabase
    .from('brand_kits')
    .select('id, client_id, status, progress_message, error, assets, source_audit_id, created_at, updated_at')
    .eq('id', id)
    .single()

  if (error) return res.status(404).json({ error: error.message })

  // No-cache so polling sees fresh state
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  return res.status(200).json(data)
}

// api/brand-kit-status/[id].js
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Auth: bearer token from admin session (same as start endpoint)
  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ error: 'Missing authorization header' })
  const userClient = createClient(
    process.env.SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY,
  )
  const { data: { user: caller }, error: authError } =
    await userClient.auth.getUser(authHeader.replace('Bearer ', ''))
  if (authError || !caller) return res.status(401).json({ error: 'Invalid token' })
  const { data: callerClient } = await supabase
    .from('clients').select('id').eq('user_id', caller.id).maybeSingle()
  if (callerClient) return res.status(403).json({ error: 'Only admins can read brand kits' })

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

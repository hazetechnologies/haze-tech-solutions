// api/social-audit-status/[id].js
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

  const { id } = req.query
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'id required' })
  }

  const { data, error } = await supabase
    .from('social_audits')
    .select('status,progress_message,report_markdown,error,updated_at')
    .eq('id', id)
    .single()

  if (error) {
    return res.status(404).json({ error: 'not found' })
  }

  // Sanitized — never return raw_data, inputs, or full report JSON to lead
  return res.status(200).json({
    status: data.status,
    progress_message: data.progress_message,
    report_markdown: data.status === 'completed' ? data.report_markdown : null,
    error: data.status === 'failed' ? data.error : null,
    updated_at: data.updated_at,
  })
}

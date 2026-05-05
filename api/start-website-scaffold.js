// api/start-website-scaffold.js
import { requireAdmin } from './_lib/require-admin'

const EDGE_FN = process.env.SUPABASE_EDGE_FUNCTION_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed', message: 'POST only' })
  }

  const ctx = await requireAdmin(req, res)
  if (!ctx) return
  const { adminClient } = ctx

  const { project_id } = req.body || {}
  if (!project_id) return res.status(400).json({ error: 'bad_request', message: 'project_id required' })

  const { data: project, error: readErr } = await adminClient
    .from('website_projects').select('id, status').eq('id', project_id).maybeSingle()
  if (readErr) return res.status(500).json({ error: 'db_error', message: readErr.message })
  if (!project) return res.status(404).json({ error: 'not_found', message: 'Project not found' })
  if (!['intake_submitted','failed'].includes(project.status)) {
    return res.status(409).json({ error: 'wrong_status', message: `Cannot start scaffold; status is: ${project.status}` })
  }

  await adminClient
    .from('website_projects')
    .update({ status: 'generating', progress_message: 'Starting…', error: null, updated_at: new Date().toISOString() })
    .eq('id', project_id)

  // Fire-and-forget invoke edge function
  const invoke = await fetch(`${EDGE_FN}/generate-website-scaffold`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ project_id }),
  })
  if (!invoke.ok) {
    const txt = await invoke.text().catch(() => '')
    await adminClient.from('website_projects').update({
      status: 'failed',
      error: `edge invoke failed: ${invoke.status}: ${txt.slice(0, 200)}`,
    }).eq('id', project_id)
    return res.status(500).json({ error: 'invoke_failed', message: 'Edge function invocation failed' })
  }

  return res.status(200).json({ project_id })
}

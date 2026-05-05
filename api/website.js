// api/website.js
// Consolidated router for the website-funnel feature, dispatched by ?action=
// Reduces serverless-function count (Hobby plan caps at 12).
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from './_lib/require-admin'

const EDGE_FN = process.env.SUPABASE_EDGE_FUNCTION_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const VALID_TEMPLATES = ['service-business','local-business','creative-portfolio','saas-landing','travel-agency']

export default async function handler(req, res) {
  const action = (req.query?.action || '').toString()
  switch (action) {
    case 'activate': return req.method === 'POST' ? activate(req, res) : methodNotAllowed(res, 'POST')
    case 'intake':   return req.method === 'POST' ? intake(req, res)   : methodNotAllowed(res, 'POST')
    case 'start':    return req.method === 'POST' ? start(req, res)    : methodNotAllowed(res, 'POST')
    case 'status':   return req.method === 'GET'  ? status(req, res)   : methodNotAllowed(res, 'GET')
    default:         return res.status(400).json({ error: 'bad_request', message: 'Unknown or missing action' })
  }
}

function methodNotAllowed(res, allow) {
  res.setHeader('Allow', allow)
  return res.status(405).json({ error: 'method_not_allowed', message: `${allow} only` })
}

// POST ?action=activate — admin creates a website_projects row
async function activate(req, res) {
  const ctx = await requireAdmin(req, res)
  if (!ctx) return
  const { adminClient } = ctx

  const { client_id } = req.body || {}
  if (!client_id) return res.status(400).json({ error: 'bad_request', message: 'client_id required' })

  const { data: client, error: clientErr } = await adminClient
    .from('clients').select('id').eq('id', client_id).maybeSingle()
  if (clientErr) return res.status(500).json({ error: 'db_error', message: clientErr.message })
  if (!client) return res.status(404).json({ error: 'not_found', message: 'Client not found' })

  const { data: existing } = await adminClient
    .from('website_projects').select('id').eq('client_id', client_id).maybeSingle()
  if (existing) {
    return res.status(409).json({ error: 'already_exists', message: 'Website project already activated', project_id: existing.id })
  }

  const { data: created, error: insertErr } = await adminClient
    .from('website_projects').insert({ client_id, status: 'intake_pending' }).select('id').single()
  if (insertErr) return res.status(500).json({ error: 'insert_failed', message: insertErr.message })

  return res.status(200).json({ project_id: created.id })
}

// POST ?action=intake — client submits intake form
async function intake(req, res) {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (!SERVICE_ROLE_KEY) return res.status(500).json({ error: 'config_error', message: 'Service role key not configured' })

  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ error: 'unauthorized', message: 'Missing authorization header' })
  const m = /^Bearer\s+(.+)$/i.exec(authHeader)
  if (!m) return res.status(401).json({ error: 'unauthorized', message: 'Bearer token required' })

  const userClient = createClient(url, anonKey)
  const { data: { user: caller }, error: authErr } = await userClient.auth.getUser(m[1].trim())
  if (authErr || !caller) return res.status(401).json({ error: 'unauthorized', message: 'Invalid token' })

  const adminClient = createClient(url, SERVICE_ROLE_KEY)
  const body = req.body || {}
  const { project_id, template_id, domain, business_description, services, pages, color_style_prefs, use_brand_kit } = body
  if (!project_id) return res.status(400).json({ error: 'bad_request', message: 'project_id required' })
  if (!VALID_TEMPLATES.includes(template_id)) {
    return res.status(400).json({ error: 'bad_request', message: 'Invalid template_id' })
  }
  if (!domain || !business_description) {
    return res.status(400).json({ error: 'bad_request', message: 'domain and business_description required' })
  }
  if (!Array.isArray(services) || services.length === 0) {
    return res.status(400).json({ error: 'bad_request', message: 'services must be a non-empty array' })
  }
  if (!Array.isArray(pages) || pages.length === 0) {
    return res.status(400).json({ error: 'bad_request', message: 'pages must be a non-empty array' })
  }

  const { data: project } = await adminClient
    .from('website_projects')
    .select('id, status, client_id, clients!inner(user_id)')
    .eq('id', project_id).maybeSingle()
  if (!project) return res.status(404).json({ error: 'not_found', message: 'Project not found' })
  if (project.clients.user_id !== caller.id) {
    return res.status(403).json({ error: 'forbidden', message: 'Not your project' })
  }
  if (project.status !== 'intake_pending') {
    return res.status(409).json({ error: 'wrong_status', message: `Project is in status: ${project.status}` })
  }

  const inputs = {
    template_id,
    domain: String(domain).trim(),
    business_description: String(business_description).trim(),
    services: services.map(String),
    pages: pages.map(String),
    color_style_prefs: String(color_style_prefs || '').trim(),
    use_brand_kit: Boolean(use_brand_kit),
  }

  const { error: updErr } = await adminClient
    .from('website_projects')
    .update({ status: 'intake_submitted', template_id, inputs, updated_at: new Date().toISOString() })
    .eq('id', project_id)
  if (updErr) return res.status(500).json({ error: 'update_failed', message: updErr.message })

  return res.status(200).json({ ok: true })
}

// POST ?action=start — admin triggers the edge-function scaffold
async function start(req, res) {
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

  const invoke = await fetch(`${EDGE_FN}/generate-website-scaffold`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
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

// GET ?action=status&id=<project_id> — admin polls scaffold progress
async function status(req, res) {
  const ctx = await requireAdmin(req, res)
  if (!ctx) return
  const { adminClient } = ctx

  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'bad_request', message: 'id required' })

  const { data, error } = await adminClient
    .from('website_projects')
    .select('id, status, progress_message, repo_url, repo_name, error, ai_content, inputs, template_id, updated_at')
    .eq('id', id).maybeSingle()
  if (error) return res.status(500).json({ error: 'db_error', message: error.message })
  if (!data) return res.status(404).json({ error: 'not_found', message: 'Project not found' })

  return res.status(200).json(data)
}

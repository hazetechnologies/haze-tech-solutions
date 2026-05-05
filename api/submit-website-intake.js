// api/submit-website-intake.js
import { createClient } from '@supabase/supabase-js'

const VALID_TEMPLATES = ['service-business','local-business','creative-portfolio','saas-landing','travel-agency']

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed', message: 'POST only' })
  }

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (!serviceKey) return res.status(500).json({ error: 'config_error', message: 'Service role key not configured' })

  // Authenticate the caller (any authenticated user — RLS check enforces ownership)
  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ error: 'unauthorized', message: 'Missing authorization header' })
  const m = /^Bearer\s+(.+)$/i.exec(authHeader)
  if (!m) return res.status(401).json({ error: 'unauthorized', message: 'Bearer token required' })

  const userClient = createClient(url, anonKey)
  const { data: { user: caller }, error: authErr } = await userClient.auth.getUser(m[1].trim())
  if (authErr || !caller) return res.status(401).json({ error: 'unauthorized', message: 'Invalid token' })

  const adminClient = createClient(url, serviceKey)

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

  // Verify caller owns the project (project's client.user_id == caller.id)
  const { data: project } = await adminClient
    .from('website_projects')
    .select('id, status, client_id, clients!inner(user_id)')
    .eq('id', project_id)
    .maybeSingle()
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
    .update({
      status: 'intake_submitted',
      template_id,
      inputs,
      updated_at: new Date().toISOString(),
    })
    .eq('id', project_id)
  if (updErr) return res.status(500).json({ error: 'update_failed', message: updErr.message })

  return res.status(200).json({ ok: true })
}

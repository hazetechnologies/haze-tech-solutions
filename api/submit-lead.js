// api/submit-lead.js — public lead capture for the contact form + audit page.
// Inserts via the service role so the `leads` table no longer needs an anon
// INSERT/SELECT RLS policy (which had leaked read access to all leads). Only
// whitelisted columns are accepted, and `source` is constrained.
import { createClient } from '@supabase/supabase-js'

const ALLOWED = [
  'name', 'email', 'business_name', 'service_interest', 'message',
  'website', 'goals', 'industry', 'repetitive_task', 'payment_process', 'vendor_process',
  'url', 'perf_score', 'seo_score', 'mobile_score', 'security_score', 'cro_score', 'overall_score',
]
const ALLOWED_SOURCES = ['contact', 'audit']

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed', message: 'POST only' })
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) return res.status(500).json({ error: 'config_error', message: 'Service key not configured' })

  const body = req.body || {}
  if (!body.name || !body.email) {
    return res.status(400).json({ error: 'bad_request', message: 'name and email are required' })
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(body.email))) {
    return res.status(400).json({ error: 'bad_request', message: 'a valid email is required' })
  }

  const row = { source: ALLOWED_SOURCES.includes(body.source) ? body.source : 'contact' }
  for (const k of ALLOWED) if (body[k] !== undefined) row[k] = body[k]

  const sb = createClient(url, key)
  const { data, error } = await sb.from('leads').insert(row).select('id').single()
  if (error) {
    console.error('submit-lead insert error:', error.message)
    return res.status(500).json({ error: 'insert_failed', message: 'Could not save your submission' })
  }
  return res.status(200).json({ lead: { id: data.id } })
}

// api/submit-lead.js — public lead capture for the contact form + audit page.
// Inserts via the service role so the `leads` table no longer needs an anon
// INSERT/SELECT RLS policy (which had leaked read access to all leads). Only
// whitelisted columns are accepted, and `source` is constrained.
import { createClient } from '@supabase/supabase-js'
import { sendLeadConfirmation } from './_lib/lead-confirm.js'

// Whitelisted string columns + max lengths (trim + cap so a public caller can't
// stuff huge values into the table).
const STR_LIMITS = {
  name: 120, email: 254, business_name: 200, service_interest: 100, message: 5000,
  website: 500, goals: 2000, industry: 120, repetitive_task: 2000, payment_process: 2000, vendor_process: 2000, url: 500,
}
const NUM_FIELDS = ['perf_score', 'seo_score', 'mobile_score', 'security_score', 'cro_score', 'overall_score']
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
  const name = String(body.name || '').trim().slice(0, STR_LIMITS.name)
  const email = String(body.email || '').trim().slice(0, STR_LIMITS.email)
  if (!name || !email) {
    return res.status(400).json({ error: 'bad_request', message: 'name and email are required' })
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'bad_request', message: 'a valid email is required' })
  }

  const row = { name, email, source: ALLOWED_SOURCES.includes(body.source) ? body.source : 'contact' }
  for (const [k, max] of Object.entries(STR_LIMITS)) {
    if (k === 'name' || k === 'email') continue
    if (body[k] != null && body[k] !== '') row[k] = String(body[k]).trim().slice(0, max)
  }
  for (const k of NUM_FIELDS) {
    if (body[k] != null && body[k] !== '') {
      const n = Number(body[k])
      if (Number.isFinite(n)) row[k] = n
    }
  }

  const sb = createClient(url, key)

  // Referral attribution: validate any ref code against an active affiliate.
  // Invalid codes are recorded raw but never block the lead.
  const refRaw = String(body.ref || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16)
  if (refRaw) {
    row.ref_code_raw = refRaw
    const { data: aff } = await sb.from('affiliates').select('id').ilike('code', refRaw).eq('status', 'active').maybeSingle()
    if (aff) row.referred_by_affiliate_id = aff.id
  }

  const { data, error } = await sb.from('leads').insert(row).select('id').single()
  if (error) {
    console.error('submit-lead insert error:', error.message)
    return res.status(500).json({ error: 'insert_failed', message: 'Could not save your submission' })
  }
  // Branded "thanks, we'll be in touch" email to the prospect. Best-effort.
  try { await sendLeadConfirmation(email, name) } catch (e) { console.error('lead confirmation email failed:', e?.message || e) }
  return res.status(200).json({ lead: { id: data.id } })
}

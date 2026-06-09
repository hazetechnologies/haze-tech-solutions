// api/website.js
// Consolidated router for cross-feature endpoints, dispatched by ?action=.
// Reduces serverless-function count (Hobby plan caps at 12).
// Currently hosts: website-funnel (activate/get-project/intake/start/status),
// brand-kit logo approval (approve-logo), and Stripe billing
// (stripe-checkout/stripe-portal/stripe-send-invoice/public-checkout/portal-checkout).
// The Stripe webhook lives separately (api/stripe-webhook.js) because it
// needs raw body for signature verification.
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from './_lib/require-admin.js'
import { getStripe, getSetting, siteUrl } from './_lib/stripe.js'
import { emitNotification } from './_lib/notifications.js'
import { REGISTRY } from './_lib/notification-registry.js'
import { sendEmail, wrapHtml } from './_lib/email.js'
import { runOnce as runEmailResponder } from './_lib/email-responder.js'
import { mintResetToken, sendResetEmail } from './_lib/portal-reset.js'

const EDGE_FN = process.env.SUPABASE_EDGE_FUNCTION_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const VALID_TEMPLATES = ['service-business','local-business','creative-portfolio','saas-landing','travel-agency']
const APPROVABLE_LOGO_KEYS = ['logo_primary', 'logo_icon', 'logo_monochrome']

export default async function handler(req, res) {
  const action = (req.query?.action || '').toString()
  switch (action) {
    case 'activate':            return req.method === 'POST' ? activate(req, res)         : methodNotAllowed(res, 'POST')
    case 'get-project':         return req.method === 'GET'  ? getProject(req, res)       : methodNotAllowed(res, 'GET')
    case 'intake':              return req.method === 'POST' ? intake(req, res)           : methodNotAllowed(res, 'POST')
    case 'start':               return req.method === 'POST' ? start(req, res)            : methodNotAllowed(res, 'POST')
    case 'status':              return req.method === 'GET'  ? status(req, res)           : methodNotAllowed(res, 'GET')
    case 'approve-logo':        return req.method === 'POST' ? approveLogo(req, res)      : methodNotAllowed(res, 'POST')
    case 'download-asset':      return req.method === 'GET'  ? downloadAsset(req, res)    : methodNotAllowed(res, 'GET')
    case 'hsp-proxy':           return req.method === 'POST' ? hspProxy(req, res)         : methodNotAllowed(res, 'POST')
    case 'activate-social':     return req.method === 'POST' ? activateSocial(req, res)   : methodNotAllowed(res, 'POST')
    case 'stripe-checkout':     return req.method === 'POST' ? stripeCheckout(req, res)   : methodNotAllowed(res, 'POST')
    case 'stripe-portal':       return req.method === 'POST' ? stripePortal(req, res)     : methodNotAllowed(res, 'POST')
    case 'stripe-send-invoice': return req.method === 'POST' ? stripeSendInvoice(req, res): methodNotAllowed(res, 'POST')
    case 'stripe-test':         return req.method === 'POST' ? stripeTest(req, res)       : methodNotAllowed(res, 'POST')
    case 'public-checkout':     return req.method === 'POST' ? publicCheckout(req, res)   : methodNotAllowed(res, 'POST')
    case 'portal-checkout':     return req.method === 'POST' ? portalCheckout(req, res)   : methodNotAllowed(res, 'POST')
    case 'public-cart-checkout':return req.method === 'POST' ? publicCartCheckout(req, res): methodNotAllowed(res, 'POST')
    case 'portal-cart-checkout':return req.method === 'POST' ? portalCartCheckout(req, res): methodNotAllowed(res, 'POST')
    case 'portal-social':       return req.method === 'POST' ? portalSocial(req, res)     : methodNotAllowed(res, 'POST')
    case 'workflow-preview':    return req.method === 'GET'  ? workflowPreview(req, res)  : methodNotAllowed(res, 'GET')
    case 'send-test-email':     return req.method === 'POST' ? sendTestEmail(req, res)    : methodNotAllowed(res, 'POST')
    case 'cron-notify-status':  return req.method === 'GET'  ? cronNotifyStatus(req, res) : methodNotAllowed(res, 'GET')
    case 'cron-admin-digest':   return req.method === 'GET'  ? cronAdminDigest(req, res)  : methodNotAllowed(res, 'GET')
    case 'cron-email-autoresponder': return req.method === 'GET'  ? cronEmailAutoresponder(req, res) : methodNotAllowed(res, 'GET')
    case 'cron-brand-kit-resume':    return req.method === 'GET'  ? cronBrandKitResume(req, res)    : methodNotAllowed(res, 'GET')
    case 'email-responder-run-now':  return req.method === 'POST' ? emailResponderRunNow(req, res)   : methodNotAllowed(res, 'POST')
    case 'request-portal-link': return req.method === 'POST' ? requestPortalLink(req, res) : methodNotAllowed(res, 'POST')
    case 'portal-reset':        return req.method === 'POST' ? portalReset(req, res)       : methodNotAllowed(res, 'POST')
    default:                    return res.status(400).json({ error: 'bad_request', message: 'Unknown or missing action' })
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
    .from('clients').select('id, name, email').eq('id', client_id).maybeSingle()
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

  // Ask the client to complete their intake form (email + portal). Best-effort.
  await emitNotification(adminClient, 'website.intake_requested', {
    clientId: client_id,
    clientName: client.name,
    clientEmail: client.email,
  })

  return res.status(200).json({ project_id: created.id })
}

// GET ?action=get-project&client_id=<id> — admin loads a client's website
// project. Reads via the service-role client so it is NOT subject to the
// website_projects RLS (whose only SELECT policy scopes reads to the client
// that OWNS the row). The admin browser owns no client row, so a direct
// browser read returns zero rows — which previously made "Activate" appear to
// do nothing (insert succeeded via service role, re-read via browser RLS came
// back empty). 404 = no project yet (an expected state, not an error).
async function getProject(req, res) {
  const ctx = await requireAdmin(req, res)
  if (!ctx) return
  const { adminClient } = ctx

  const client_id = (req.query?.client_id || '').toString()
  if (!client_id) return res.status(400).json({ error: 'bad_request', message: 'client_id required' })

  const { data, error } = await adminClient
    .from('website_projects')
    .select('id, client_id, status, progress_message, repo_url, repo_name, error, ai_content, inputs, template_id, updated_at')
    .eq('client_id', client_id).maybeSingle()
  if (error) return res.status(500).json({ error: 'db_error', message: error.message })
  if (!data) return res.status(404).json({ error: 'not_found', message: 'No website project for this client' })

  return res.status(200).json(data)
}

// GET ?action=workflow-preview&type=<eventType> — admin previews a notification
// workflow: renders the registry templates with sample data so the admin can
// see exactly what each recipient (client/admin) gets, including the email HTML.
const PREVIEW_SAMPLE = {
  client: { id: 'sample-client', name: 'Jane Doe', email: 'jane@example.com', company: 'Acme Co', product: 'Growth Plan', price: 499 },
  clientId: 'sample-client',
  clientName: 'Jane Doe',
  clientEmail: 'jane@example.com',
  source: 'admin',
  setPasswordUrl: 'https://www.hazetechsolutions.com/portal/accept-invite#sample-token',
  amount: '499.00',
  planName: 'Growth Plan',
  error: 'Example: scaffold step timed out',
}

async function workflowPreview(req, res) {
  const ctx = await requireAdmin(req, res)
  if (!ctx) return

  const type = (req.query?.type || '').toString()
  if (!type || !REGISTRY[type]) {
    return res.status(400).json({ error: 'bad_request', message: 'unknown or missing workflow type' })
  }
  const recipients = REGISTRY[type].map((r) => {
    let c = {}
    try { c = r.render(PREVIEW_SAMPLE) } catch (e) { c = { title: '(render error)', body: e?.message || '' } }
    return {
      audience: r.audience,
      title: c.title || '',
      body: c.body || '',
      link: c.link || null,
      emailSubject: c.emailSubject || null,
      emailHtml: c.emailHtml || null, // null = in-app only (no email for this recipient)
    }
  })
  return res.status(200).json({ type, recipients })
}

// POST ?action=send-test-email — admin sends a test email to verify SMTP and
// preview templates in a real inbox. Body: { to?, type? }. With a workflow
// `type`, sends that workflow's rendered email(s); otherwise a generic SMTP test.
async function sendTestEmail(req, res) {
  const ctx = await requireAdmin(req, res)
  if (!ctx) return

  const { to, type } = req.body || {}
  const recipient = (to || '').toString().trim()
    || (await getSetting('ADMIN_NOTIFY_EMAIL', 'ADMIN_NOTIFY_EMAIL'))
    || 'info@hazetechsolutions.com'
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) {
    return res.status(400).json({ error: 'bad_request', message: 'A valid "to" email is required' })
  }

  // Specific workflow template → send each recipient variant that has an email.
  if (type) {
    if (!REGISTRY[type]) return res.status(400).json({ error: 'bad_request', message: 'unknown workflow type' })
    const results = []
    for (const r of REGISTRY[type]) {
      let c
      try { c = r.render(PREVIEW_SAMPLE) } catch { continue }
      if (!c.emailHtml) continue
      const status = await sendEmail({ to: recipient, subject: `[TEST] ${c.emailSubject || c.title}`, html: c.emailHtml, text: c.body })
      results.push({ audience: r.audience, status })
    }
    if (results.length === 0) {
      return res.status(200).json({ ok: true, sent: false, to: recipient, message: 'This workflow is in-app only (no email to test).' })
    }
    return res.status(200).json({ ok: true, sent: results.some((r) => r.status === 'sent'), to: recipient, results })
  }

  // Generic SMTP connectivity test.
  const status = await sendEmail({
    to: recipient,
    subject: '[TEST] Haze Tech Solutions email is working ✅',
    html: wrapHtml('SMTP test successful ✅', `<p>If you're reading this, your Haze Tech Solutions email (SMTP) is configured correctly — notification emails will send.</p>`),
    text: 'SMTP test successful — your Haze Tech email is configured correctly.',
  })
  // status: 'sent' | 'failed' | 'skipped' (skipped = SMTP not configured)
  return res.status(200).json({ ok: true, sent: status === 'sent', status, to: recipient })
}

// ─── Cron: notification status-watcher + daily admin digest ──────────────────

function requireCron(req, res) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.authorization || ''
  if (!secret || auth !== `Bearer ${secret}`) { res.status(401).json({ error: 'unauthorized' }); return false }
  return true
}

// status value -> event type, per table. Terminal statuses are set by Supabase
// edge functions (which can't call this code), so a cron watches for the
// transition. notified_status guarantees each transition emits at most once.
const STATUS_EVENTS = {
  website_projects: { done: 'website.done', failed: 'website.failed' },
  brand_kits:       { awaiting_logo_approval: 'brandkit.logos_ready', done: 'brandkit.done' },
}

// GET ?action=cron-notify-status — emit for rows whose status advanced past the
// last-notified value. PostgREST can't compare two columns server-side, so we
// fetch and filter status !== notified_status in JS.
//
// Known v1 limitation: only the CURRENT status is observed, so if a row advances
// through two mapped statuses between 5-min polls (e.g. awaiting_logo_approval
// -> done) only the latest emits. In practice awaiting_logo_approval pauses for
// client approval (hours), so it is reliably caught by a poll.
async function cronNotifyStatus(req, res) {
  if (!requireCron(req, res)) return
  const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, SERVICE_ROLE_KEY)
  let emitted = 0
  for (const [table, map] of Object.entries(STATUS_EVENTS)) {
    const { data: rows } = await sb.from(table)
      .select('id, client_id, status, notified_status, clients(name, email)')
      .limit(500)
    for (const row of rows || []) {
      if (!row.status || row.status === row.notified_status) continue
      // Claim the transition atomically before emitting (optimistic CAS on the
      // value we just read) so two overlapping cron runs can't both emit for
      // the same change. This is at-most-once: claim then emit.
      let claim = sb.from(table).update({ notified_status: row.status }).eq('id', row.id)
      claim = row.notified_status == null ? claim.is('notified_status', null) : claim.eq('notified_status', row.notified_status)
      const { data: won } = await claim.select('id')
      if (!won || won.length === 0) continue // another run claimed it first
      const evt = map[row.status]
      if (evt) {
        await emitNotification(sb, evt, {
          clientId: row.client_id,
          clientName: row.clients?.name,
          clientEmail: row.clients?.email,
        })
        emitted++
      }
    }
  }
  return res.status(200).json({ ok: true, emitted })
}

// GET ?action=cron-admin-digest — once-daily rollup email of admin events.
async function cronAdminDigest(req, res) {
  if (!requireCron(req, res)) return
  const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, SERVICE_ROLE_KEY)
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { data: rows } = await sb.from('notifications')
    .select('type, title, created_at')
    .eq('audience', 'admin').gte('created_at', since)
    .order('created_at', { ascending: false }).limit(100)
  if (!rows || rows.length === 0) return res.status(200).json({ ok: true, sent: false })
  const { sendEmail, wrapHtml } = await import('./_lib/email.js')
  const list = rows.map(r => `<li>${new Date(r.created_at).toLocaleString()} — ${r.title}</li>`).join('')
  const adminTo = (await getSetting('ADMIN_NOTIFY_EMAIL', 'ADMIN_NOTIFY_EMAIL')) || 'info@hazetechsolutions.com'
  const status = await sendEmail({ to: adminTo, subject: `Haze Tech daily digest — ${rows.length} events`, html: wrapHtml('Daily digest', `<ul>${list}</ul>`) })
  return res.status(200).json({ ok: true, sent: status === 'sent', count: rows.length })
}

// GET ?action=cron-email-autoresponder — poll the mailbox (IMAP) + new leads and
// send FAQ-aware auto-replies. CRON_SECRET-gated. Spam/notifications/automated
// mail is filtered out and left unread (see api/_lib/email-responder.js).
async function cronEmailAutoresponder(req, res) {
  if (!requireCron(req, res)) return
  const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, SERVICE_ROLE_KEY)
  try {
    const result = await runEmailResponder(sb)
    return res.status(200).json({ ok: true, ...result })
  } catch (e) {
    console.error('[cron-email-autoresponder] failed:', e?.message || e)
    return res.status(500).json({ error: 'responder_failed', message: e?.message || String(e) })
  }
}

// POST ?action=email-responder-run-now — admin triggers one responder pass from
// the admin UI (no CRON_SECRET needed). Same logic as the cron.
async function emailResponderRunNow(req, res) {
  const ctx = await requireAdmin(req, res)
  if (!ctx) return
  try {
    // fresh: true bypasses the 60s settings cache so a just-saved enable/prompt
    // takes effect on this manual run (the cron path stays cached).
    const result = await runEmailResponder(ctx.adminClient, { fresh: true })
    return res.status(200).json({ ok: true, ...result })
  } catch (e) {
    console.error('[email-responder-run-now] failed:', e?.message || e)
    return res.status(500).json({ error: 'responder_failed', message: e?.message || String(e) })
  }
}

// GET ?action=cron-brand-kit-resume — watchdog. The brand-kit edge function
// generates banners ~2 at a time and self-invokes to continue, but a Supabase
// function invoking ITSELF is unreliable (the parent is killed before the child
// reliably starts), so a kit can stall mid-banners. An EXTERNAL nudge always
// works, so this cron re-fires phase='banners' for any kit that's been
// 'generating' (post logo-approval) with no progress for >2 min. Resume-safe:
// the edge fn skips banners already in the row. Bounded to recent kits so a
// permanently-broken kit isn't nudged forever. CRON_SECRET-gated.
async function cronBrandKitResume(req, res) {
  if (!requireCron(req, res)) return
  const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, SERVICE_ROLE_KEY)
  const staleBefore = new Date(Date.now() - 2 * 60 * 1000).toISOString()
  const giveUpBefore = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  const { data: stuck } = await sb.from('brand_kits')
    .select('id')
    .eq('status', 'generating')
    .not('approved_logo_asset_id', 'is', null) // banner phase (logo already approved)
    .lt('updated_at', staleBefore)             // no progress recently → chain died
    .gt('created_at', giveUpBefore)            // don't nudge ancient/dead kits forever
    .limit(5)
  const nudged = []
  for (const k of stuck || []) {
    try {
      await fetch(`${EDGE_FN}/generate-brand-kit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ kit_id: k.id, phase: 'banners' }),
      })
      nudged.push(k.id)
    } catch (e) {
      console.error('[cron-brand-kit-resume] nudge failed for', k.id, e?.message || e)
    }
  }
  return res.status(200).json({ ok: true, nudged })
}

// POST ?action=request-portal-link — public. Body: { email }. If a client with
// that email exists, mint a SafeLinks-safe reset token and email it (Hostinger
// SMTP). Always returns 200 with no detail (no account enumeration).
async function requestPortalLink(req, res) {
  const email = (req.body?.email || '').toString().trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'bad_request', message: 'A valid email is required' })
  }
  try {
    const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, SERVICE_ROLE_KEY)
    // Case-insensitive exact match; escape LIKE wildcards so the email can't be a pattern.
    const escaped = email.replace(/[\\%_]/g, '\\$&')
    const { data: clients } = await sb.from('clients').select('user_id, name, email').ilike('email', escaped).limit(5)
    const client = (clients || []).find((c) => (c.email || '').toLowerCase() === email)
    if (client) {
      const url = await mintResetToken(sb, client.user_id, client.email)
      await sendResetEmail(client.email, client.name, url, { invite: false })
    }
  } catch (e) {
    console.error('[request-portal-link] failed:', e?.message || e)
    // fall through to the same generic response — never reveal account state
  }
  return res.status(200).json({ ok: true })
}

// POST ?action=portal-reset — public. Body: { token, password }. Validates the
// single-use token and sets the user's password via the service role.
async function portalReset(req, res) {
  const token = (req.body?.token || '').toString()
  const password = (req.body?.password || '').toString()
  if (!token || password.length < 8) {
    return res.status(400).json({ error: 'bad_request', message: 'A token and a password of at least 8 characters are required' })
  }
  try {
    const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: row } = await sb.from('portal_reset_tokens').select('token, user_id, used_at, expires_at').eq('token', token).maybeSingle()
    if (!row || row.used_at || new Date(row.expires_at) < new Date()) {
      return res.status(400).json({ error: 'invalid_or_expired', message: 'This link is invalid or has expired. Please request a new one.' })
    }
    const { error: upErr } = await sb.auth.admin.updateUserById(row.user_id, { password, email_confirm: true })
    if (upErr) return res.status(400).json({ error: 'update_failed', message: upErr.message })
    // Burn the token (idempotent: only the row we just used).
    await sb.from('portal_reset_tokens').update({ used_at: new Date().toISOString() }).eq('token', token).is('used_at', null)
    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error('[portal-reset] failed:', e?.message || e)
    return res.status(500).json({ error: 'internal_error', message: 'Could not set your password. Please try again.' })
  }
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
    .select('id, status, client_id, clients!inner(user_id, name)')
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

  // Notify admin that intake is in and the scaffold can be generated. Best-effort.
  await emitNotification(adminClient, 'website.intake_submitted', {
    clientId: project.client_id,
    clientName: project.clients?.name,
  })

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

// POST ?action=approve-logo — picks one of the 3 logo variants and triggers
// the banner-generation phase. Callable by:
//   • the client that owns the kit (via /portal/brand-kit), or
//   • any admin in ADMIN_EMAILS (via /admin/clients/<id> → Brand Kit), so the
//     admin can move the flow forward on the client's behalf when needed.
async function approveLogo(req, res) {
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
  const { kit_id, approved_logo_key } = req.body || {}
  if (!kit_id) return res.status(400).json({ error: 'bad_request', message: 'kit_id required' })
  if (!APPROVABLE_LOGO_KEYS.includes(approved_logo_key)) {
    return res.status(400).json({ error: 'bad_request', message: `approved_logo_key must be one of ${APPROVABLE_LOGO_KEYS.join(', ')}` })
  }

  // Verify caller is either an admin OR the client that owns this kit.
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  const callerEmail = (caller.email || '').trim().toLowerCase()
  const isAdmin = callerEmail && adminEmails.includes(callerEmail)

  const { data: kit } = await adminClient
    .from('brand_kits')
    .select('id, status, client_id, assets, clients!inner(user_id)')
    .eq('id', kit_id).maybeSingle()
  if (!kit) return res.status(404).json({ error: 'not_found', message: 'Brand kit not found' })
  if (!isAdmin && kit.clients.user_id !== caller.id) {
    return res.status(403).json({ error: 'forbidden', message: 'Not your brand kit' })
  }
  if (kit.status !== 'awaiting_logo_approval') {
    return res.status(409).json({ error: 'wrong_status', message: `Kit is in status: ${kit.status}` })
  }
  const approvedRef = (kit.assets?.images || {})[approved_logo_key]
  if (!approvedRef?.public_url) {
    return res.status(409).json({ error: 'logo_missing', message: `Logo asset ${approved_logo_key} is not present in this kit` })
  }

  // Mark approval and flip status
  const { error: updErr } = await adminClient
    .from('brand_kits')
    .update({
      approved_logo_asset_id: approved_logo_key,
      status: 'generating',
      progress_message: 'Logo approved — generating banners…',
      error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', kit_id)
  if (updErr) return res.status(500).json({ error: 'update_failed', message: updErr.message })

  // Fire-and-forget invoke edge function in banners-only mode
  const invoke = await fetch(`${EDGE_FN}/generate-brand-kit`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ kit_id, phase: 'banners' }),
  })
  if (!invoke.ok) {
    const txt = await invoke.text().catch(() => '')
    await adminClient.from('brand_kits').update({
      status: 'failed',
      error: `edge invoke failed: ${invoke.status}: ${txt.slice(0, 200)}`,
    }).eq('id', kit_id)
    return res.status(500).json({ error: 'invoke_failed', message: 'Banner-phase invocation failed' })
  }

  return res.status(200).json({ kit_id, approved_logo_key })
}

// GET ?action=download-asset&kit_id=…&asset_id=… — proxies a brand-kit asset
// and streams it back with Content-Disposition: attachment. We look up the
// URL from brand_kits.assets.images[asset_id] in the DB rather than accepting
// a raw URL, so:
//   1. There's no open-proxy risk regardless of which R2 bucket the asset
//      lives in (e.g. an admin-supplied existing_logo_url on a different bucket).
//   2. We don't need a hostname allowlist that goes stale as we add buckets.
// Needed because R2's pub-*.r2.dev URLs don't serve CORS and don't include
// Content-Disposition, so the browser ignores the <a download> attribute on
// cross-origin hrefs.
async function downloadAsset(req, res) {
  const kitId = (req.query?.kit_id || '').toString()
  const assetId = (req.query?.asset_id || '').toString()
  if (!kitId || !assetId) {
    return res.status(400).json({ error: 'bad_request', message: 'kit_id and asset_id required' })
  }

  const supabase = createClient(process.env.SUPABASE_URL, SERVICE_ROLE_KEY)
  const { data: row, error } = await supabase
    .from('brand_kits')
    .select('assets')
    .eq('id', kitId)
    .maybeSingle()
  if (error) return res.status(500).json({ error: 'db', message: error.message })
  if (!row)  return res.status(404).json({ error: 'not_found', message: 'kit not found' })

  const ref = row.assets?.images?.[assetId]
  const url = ref?.public_url
  if (!url) return res.status(404).json({ error: 'not_found', message: `asset ${assetId} not on this kit` })

  // Sanitize filename for Content-Disposition.
  const extMatch = url.match(/\.(png|jpe?g|webp|svg)(?:\?|$)/i)
  const ext = extMatch ? extMatch[1].toLowerCase() : 'png'
  const safeAssetId = assetId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'asset'
  const filename = `${safeAssetId}.${ext}`

  let upstream
  try { upstream = await fetch(url) }
  catch (err) { return res.status(502).json({ error: 'bad_gateway', message: `fetch failed: ${err.message}` }) }

  if (!upstream.ok) {
    return res.status(upstream.status).json({ error: 'upstream', message: `source returned ${upstream.status}` })
  }

  // 25 MB guard — brand-kit images shouldn't approach this. Prevents a misconfigured
  // existing_logo_url pointing at a giant file from blowing memory or bandwidth.
  const MAX_BYTES = 25 * 1024 * 1024
  const upstreamLen = parseInt(upstream.headers.get('content-length') || '0', 10)
  if (upstreamLen && upstreamLen > MAX_BYTES) {
    return res.status(413).json({ error: 'too_large', message: `asset is ${upstreamLen} bytes (max ${MAX_BYTES})` })
  }
  const ab = await upstream.arrayBuffer()
  if (ab.byteLength > MAX_BYTES) {
    return res.status(413).json({ error: 'too_large', message: `asset is ${ab.byteLength} bytes (max ${MAX_BYTES})` })
  }

  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream')
  res.setHeader('Content-Length', ab.byteLength)
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.setHeader('Cache-Control', 'private, max-age=0, no-store')
  return res.status(200).end(Buffer.from(ab))
}

// ─── Haze Social Post external-API integration ───────────────────────────

const HSP_BASE = 'https://hazesocialpost.com/api/v1/external'

// POST ?action=hsp-proxy — admin-only proxy for the haze-social-post external
// API. The browser never sees the bearer key. requireAdmin gates every call.
// Body: { path: '/tenants/abc', method: 'GET'|'POST'|..., body?: any }
async function hspProxy(req, res) {
  const ctx = await requireAdmin(req, res)
  if (!ctx) return
  const { path, method, body } = req.body || {}
  if (typeof path !== 'string' || !path.startsWith('/')) {
    return res.status(400).json({ error: 'bad_request', message: 'path must start with /' })
  }
  const m = (method || 'GET').toUpperCase()
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(m)) {
    return res.status(400).json({ error: 'bad_request', message: `method ${m} not allowed` })
  }
  const apiKey = await getSetting('HSP_EXTERNAL_API_KEY', 'HSP_EXTERNAL_API_KEY')
  if (!apiKey) {
    return res.status(500).json({ error: 'not_configured', message: 'HSP_EXTERNAL_API_KEY not set; paste it in /admin/secrets' })
  }
  const upstream = await fetch(`${HSP_BASE}${path}`, {
    method: m,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: m === 'GET' || m === 'DELETE' ? undefined : JSON.stringify(body ?? {}),
  })
  const text = await upstream.text()
  res.status(upstream.status)
  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
  return res.send(text)
}

// POST ?action=activate-social — one-shot wrapper that creates a sub-tenant
// User on haze-social-post for a client and pushes the latest brand kit.
// Idempotent: a re-activate just re-pushes the brand to the existing sub-tenant.
// Body: { client_id }
async function activateSocial(req, res) {
  const ctx = await requireAdmin(req, res)
  if (!ctx) return
  const { adminClient } = ctx
  const { client_id } = req.body || {}
  if (!client_id) return res.status(400).json({ error: 'bad_request', message: 'client_id required' })

  const { data: client, error: clientErr } = await adminClient
    .from('clients').select('id, name, email, company, hsp_user_id').eq('id', client_id).single()
  if (clientErr || !client) return res.status(404).json({ error: 'not_found', message: 'client not found' })

  const apiKey = await getSetting('HSP_EXTERNAL_API_KEY', 'HSP_EXTERNAL_API_KEY')
  if (!apiKey) {
    return res.status(500).json({ error: 'not_configured', message: 'HSP_EXTERNAL_API_KEY not set; paste it in /admin/secrets' })
  }

  // 1. Create sub-tenant (or reuse if already activated). The external-API is
  //    idempotent on contact_email but we also short-circuit locally if
  //    hsp_user_id is already set on the client row.
  let tenantId = client.hsp_user_id
  if (!tenantId) {
    const createRes = await fetch(`${HSP_BASE}/tenants`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: client.company || client.name,
        contact_email: client.email,
        hts_client_id: client.id,
      }),
    })
    const createJson = await createRes.json().catch(() => ({}))
    if (!createRes.ok) {
      return res.status(createRes.status).json({ error: 'tenant_create_failed', message: createJson.message || `upstream ${createRes.status}` })
    }
    tenantId = createJson.id
    await adminClient.from('clients').update({ hsp_user_id: tenantId }).eq('id', client.id)
  }

  // 2. Push the latest brand kit (if one exists).
  const { data: kit } = await adminClient
    .from('brand_kits')
    .select('assets, inputs')
    .eq('client_id', client.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (kit?.assets) {
    const a = kit.assets || {}
    const i = kit.inputs || {}
    const brandBody = {
      business_name: i.business_name || client.company || client.name,
      business_description: i.business_description,
      industry: i.industry,
      audience: i.audience,
      vibe: i.vibe,
      voice_tone: a.voice_tone,
      inspirations: i.inspirations,
      color_palette: a.color_palette,
      logo_url: a?.images?.logo_primary?.public_url,
      tagline: a.tagline,
      cta: a.cta,
      bios: a.bios,
      hashtags: a.hashtags,
      content_pillars: a.content_pillars,
      imagery_direction: i.imagery_direction,
    }
    const brandRes = await fetch(`${HSP_BASE}/tenants/${tenantId}/brand`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(brandBody),
    })
    if (!brandRes.ok) {
      const brandErr = await brandRes.json().catch(() => ({}))
      return res.status(brandRes.status).json({ error: 'brand_push_failed', message: brandErr.message || `upstream ${brandRes.status}`, tenant_id: tenantId })
    }

    // Sync the kit's image assets into the sub-tenant's library (idempotent).
    // Dedupe by URL — multiple logo variants often share one public_url.
    const images = a?.images || {}
    const seen = new Set()
    const libraryAssets = []
    for (const [key, val] of Object.entries(images)) {
      const url = val?.public_url || val?.url
      if (!url || seen.has(url)) continue
      seen.add(url)
      const isBanner = key.startsWith('banner')
      libraryAssets.push({
        url,
        type: 'image',
        description: isBanner ? `Brand banner (${key.replace('banner_', '')})` : `Brand logo (${key.replace('logo_', '').replace(/_/g, ' ')})`,
        tags: ['brand-kit', key],
      })
    }
    if (libraryAssets.length > 0) {
      // Best-effort: a library-sync failure must not fail activation/brand push.
      try {
        await fetch(`${HSP_BASE}/tenants/${tenantId}/assets`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ assets: libraryAssets }),
        })
      } catch (e) {
        console.error('[activate-social] library asset sync failed:', e?.message || e)
      }
    }
  }

  return res.status(200).json({ tenant_id: tenantId, brand_pushed: !!kit?.assets })
}

// POST ?action=portal-social — client-facing, read-mostly bridge to the
// client's OWN haze-social-post sub-tenant. Auth = the logged-in portal client;
// the tenant id is resolved server-side from their clients.hsp_user_id, never
// supplied by the caller. Body: { op, ...args }.
async function portalSocial(req, res) {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (!SERVICE_ROLE_KEY) return res.status(500).json({ error: 'config_error', message: 'Service role key not configured' })

  // 1. Authenticate the portal client from their Supabase session.
  const authHeader = req.headers.authorization || ''
  const m = /^Bearer\s+(.+)$/.exec(authHeader)
  if (!m) return res.status(401).json({ error: 'unauthorized' })
  const userClient = createClient(url, anonKey)
  const { data: { user: caller }, error: authErr } = await userClient.auth.getUser(m[1].trim())
  if (authErr || !caller) return res.status(401).json({ error: 'unauthorized' })

  // 2. Resolve THIS caller's client row + its sub-tenant id.
  const admin = createClient(url, SERVICE_ROLE_KEY)
  const { data: client } = await admin
    .from('clients').select('id, hsp_user_id').eq('user_id', caller.id).maybeSingle()
  if (!client) return res.status(403).json({ error: 'forbidden', message: 'no client for this user' })
  if (!client.hsp_user_id) return res.status(409).json({ error: 'not_activated', message: 'social media is not set up for your account yet' })
  const tid = client.hsp_user_id

  // 3. Resolve the integrator key and dispatch a fixed op against the OWN tenant.
  const apiKey = await getSetting('HSP_EXTERNAL_API_KEY', 'HSP_EXTERNAL_API_KEY')
  if (!apiKey) return res.status(500).json({ error: 'not_configured' })

  const { op, query } = req.body || {}
  const q = typeof query === 'string' && query.startsWith('?') ? query : ''
  let path, method
  switch (op) {
    case 'channels':     path = `/tenants/${tid}/connected-platforms`; method = 'GET'; break
    case 'engagement':   path = `/tenants/${tid}/engagement`;          method = 'GET'; break
    case 'plans':        path = `/tenants/${tid}/content-plans`;       method = 'GET'; break
    case 'posts':        path = `/tenants/${tid}/posts${q}`;           method = 'GET'; break
    case 'connect-link': path = `/tenants/${tid}/connect-links`;       method = 'POST'; break
    default: return res.status(400).json({ error: 'bad_request', message: `unknown op ${op}` })
  }

  const upstream = await fetch(`${HSP_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify({}),
  })
  const text = await upstream.text()
  res.status(upstream.status)
  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
  return res.send(text)
}

// ─── Stripe ──────────────────────────────────────────────────────────────

// POST ?action=stripe-checkout — admin generates a Checkout Session URL for
// a client + plan. Lazily creates a Stripe Customer if missing, writes
// stripe_customer_id back to clients. Returns the Checkout URL for the
// admin to send to the client.
// Body: { client_id, subscription_plan_id }
async function stripeCheckout(req, res) {
  const ctx = await requireAdmin(req, res)
  if (!ctx) return
  const { adminClient } = ctx

  const { client_id, subscription_plan_id } = req.body || {}
  if (!client_id || !subscription_plan_id) {
    return res.status(400).json({ error: 'bad_request', message: 'client_id and subscription_plan_id required' })
  }

  const { data: client, error: clientErr } = await adminClient
    .from('clients').select('id, name, email, stripe_customer_id').eq('id', client_id).maybeSingle()
  if (clientErr || !client) return res.status(404).json({ error: 'not_found', message: 'Client not found' })

  const { data: plan } = await adminClient
    .from('subscription_plans').select('stripe_price_id, name, billing_cycle').eq('id', subscription_plan_id).maybeSingle()
  if (!plan?.stripe_price_id) {
    return res.status(409).json({ error: 'price_not_synced', message: `Plan "${plan?.name ?? subscription_plan_id}" has no stripe_price_id. Run scripts/sync-stripe-catalog.mjs.` })
  }

  let stripe
  try { stripe = await getStripe() }
  catch (e) { return res.status(500).json({ error: 'stripe_config', message: e.message }) }

  const result = await createCheckoutSession({ adminClient, stripe, client, plan, planId: subscription_plan_id })
  return res.status(200).json(result)
}

// Shared between stripe-checkout (admin), public-checkout (anonymous post-signup),
// and portal-checkout (logged-in client). Lazy-creates the Stripe Customer and
// returns the Checkout Session URL.
async function createCheckoutSession({ adminClient, stripe, client, plan, planId, cancelUrl }) {
  let customerId = client.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: client.email, name: client.name, metadata: { client_id: client.id },
    })
    customerId = customer.id
    await adminClient.from('clients').update({ stripe_customer_id: customerId }).eq('id', client.id)
  }

  // Stripe idempotency key buckets concurrent requests for the same
  // (client, price) into a single Checkout Session. 5-minute window catches
  // double-clicks / multi-tab races (sub-second) without breaking a genuine
  // cancel-and-retry, which typically takes longer than 5 minutes between
  // the user canceling in Stripe Customer Portal and clicking buy again.
  // Stripe Checkout Sessions and idempotency-cache entries both expire at 24h
  // so cross-day retries naturally get fresh sessions.
  const bucket = Math.floor(Date.now() / 300000)
  const idempotencyKey = `checkout-${client.id}-${plan.stripe_price_id}-${bucket}`

  const isOneTime = plan.billing_cycle === 'one-time'
  const session = await stripe.checkout.sessions.create({
    mode: isOneTime ? 'payment' : 'subscription',
    customer: customerId,
    line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
    success_url: `${siteUrl()}/portal/dashboard?checkout=success`,
    cancel_url: cancelUrl || `${siteUrl()}/portal/dashboard?checkout=canceled`,
    metadata: { client_id: client.id, subscription_plan_id: planId },
  }, { idempotencyKey })

  return { url: session.url, customer_id: customerId }
}

// POST ?action=public-checkout — anonymous visitor on /pricing fills a quick
// form (name + email + password + chosen plan). We create the auth user +
// clients row first (so the lead is captured even if they abandon Stripe),
// then return a Stripe Checkout URL. The client can also log into /portal
// immediately with the password they just set.
// Body: { subscription_plan_id, name, email, password, company?, phone? }
async function publicCheckout(req, res) {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  if (!SERVICE_ROLE_KEY) return res.status(500).json({ error: 'config_error', message: 'Service role key not configured' })

  const { subscription_plan_id, name, email, password, company, phone } = req.body || {}
  if (!subscription_plan_id || !name || !email || !password) {
    return res.status(400).json({ error: 'bad_request', message: 'subscription_plan_id, name, email, and password are required' })
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'weak_password', message: 'Password must be at least 8 characters' })
  }

  const adminClient = createClient(url, SERVICE_ROLE_KEY)

  // Validate the plan + pull product. Service role bypasses RLS, so we have to
  // enforce active=true on both the plan AND its product ourselves.
  const { data: plan } = await adminClient
    .from('subscription_plans')
    .select('id, name, billing_cycle, discount_percent, price, stripe_price_id, product_id, active, products:product_id(id, name, base_price, active)')
    .eq('id', subscription_plan_id).maybeSingle()
  if (!plan || !plan.active || !plan.products?.active) {
    return res.status(404).json({ error: 'plan_not_found', message: 'Subscription plan not found or inactive' })
  }
  if (!plan.stripe_price_id) {
    return res.status(409).json({ error: 'price_not_synced', message: `Plan "${plan.name}" has no stripe_price_id yet. Try again later.` })
  }

  // Reject if a client with that email already exists — surface a login prompt instead of duplicating.
  const { data: existing } = await adminClient
    .from('clients').select('id').eq('email', email).maybeSingle()
  if (existing) {
    return res.status(409).json({
      error: 'client_exists',
      message: 'An account with that email already exists. Sign in to add this product to your plan.',
      login_url: '/portal/login',
    })
  }

  // Create the Supabase auth user.
  const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
    email, password, email_confirm: true,
  })
  if (authErr) {
    return res.status(400).json({ error: 'auth_create_failed', message: authErr.message })
  }

  // Insert clients row (denormalized product/terms for back-compat with legacy reads).
  // Plan-level price (set per-plan in /admin/products) wins over the legacy
  // product.base_price × discount fallback.
  const productName = plan.products?.name ?? null
  let computedPrice
  if (plan.price != null) {
    computedPrice = Number(plan.price)
  } else {
    const basePrice = Number(plan.products?.base_price ?? 0)
    const discount = Number(plan.discount_percent ?? 0)
    computedPrice = basePrice ? Number((basePrice * (1 - discount / 100)).toFixed(2)) : null
  }

  const { data: client, error: clientErr } = await adminClient
    .from('clients')
    .insert({
      user_id: authData.user.id,
      name, email,
      company: company || null,
      phone: phone || null,
      product_id: plan.product_id,
      subscription_plan_id: plan.id,
      product: productName,
      price: computedPrice,
      subscription_terms: plan.billing_cycle,
    })
    .select('id, name, email, stripe_customer_id')
    .single()

  if (clientErr) {
    // Roll back the auth user so re-submission isn't blocked by client_exists.
    await adminClient.auth.admin.deleteUser(authData.user.id).catch(e => console.error('rollback delete failed:', e))
    return res.status(500).json({ error: 'client_insert_failed', message: clientErr.message })
  }

  // From this point on any failure must roll back the auth user + client row,
  // otherwise a Stripe outage leaves a dead client_exists collision behind.
  async function rollback() {
    await adminClient.from('clients').delete().eq('id', client.id).catch(e => console.error('rollback client delete failed:', e))
    await adminClient.auth.admin.deleteUser(authData.user.id).catch(e => console.error('rollback auth delete failed:', e))
  }

  let stripe
  try { stripe = await getStripe() }
  catch (e) {
    await rollback()
    return res.status(500).json({ error: 'stripe_config', message: e.message })
  }

  let result
  try {
    result = await createCheckoutSession({
      adminClient, stripe, client, plan, planId: plan.id,
      cancelUrl: `${siteUrl()}/pricing?checkout=canceled`,
    })
  } catch (e) {
    console.error('public-checkout: createCheckoutSession failed:', e)
    await rollback()
    return res.status(502).json({ error: 'stripe_failed', message: 'Could not start checkout — please try again.' })
  }
  // Notify: welcome the new self-signup client + alert admin. Best-effort.
  await emitNotification(adminClient, 'client.created', {
    client: { id: client.id, name: client.name, email: client.email, company: company || null },
    source: 'self-signup',
  })
  return res.status(200).json({ ...result, client_id: client.id })
}

// POST ?action=portal-checkout — logged-in client clicks "Add to plan" on a
// product they don't yet have. Uses the session's user → client mapping (no
// client_id in body) and goes straight to a Stripe Checkout Session.
// Body: { subscription_plan_id }
async function portalCheckout(req, res) {
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

  const { subscription_plan_id } = req.body || {}
  if (!subscription_plan_id) return res.status(400).json({ error: 'bad_request', message: 'subscription_plan_id required' })

  const adminClient = createClient(url, SERVICE_ROLE_KEY)

  const { data: client } = await adminClient
    .from('clients').select('id, name, email, stripe_customer_id').eq('user_id', caller.id).maybeSingle()
  if (!client) return res.status(404).json({ error: 'no_client', message: 'No client record for this user' })

  // Service role bypasses RLS — enforce active=true on plan + product ourselves
  // so a stale UUID for an archived plan can't be purchased.
  const { data: plan } = await adminClient
    .from('subscription_plans')
    .select('id, name, billing_cycle, stripe_price_id, active, products:product_id(active)')
    .eq('id', subscription_plan_id).maybeSingle()
  if (!plan || !plan.active || !plan.products?.active) {
    return res.status(404).json({ error: 'plan_not_found', message: 'Subscription plan not found or inactive' })
  }
  if (!plan.stripe_price_id) {
    return res.status(409).json({ error: 'price_not_synced', message: `Plan "${plan.name}" has no stripe_price_id yet.` })
  }

  // Block duplicate purchases for the same plan. The UI hides Active products,
  // but a retry / stale tab / direct POST could still land here.
  const { data: existingSub } = await adminClient
    .from('subscriptions')
    .select('id, status')
    .eq('client_id', client.id)
    .eq('stripe_price_id', plan.stripe_price_id)
    .in('status', ['active', 'trialing', 'past_due'])
    .maybeSingle()
  if (existingSub) {
    return res.status(409).json({
      error: 'already_subscribed',
      message: `You already have an active subscription for "${plan.name}".`,
      subscription_id: existingSub.id,
      status: existingSub.status,
    })
  }

  let stripe
  try { stripe = await getStripe() }
  catch (e) { return res.status(500).json({ error: 'stripe_config', message: e.message }) }

  let result
  try {
    result = await createCheckoutSession({
      adminClient, stripe, client, plan, planId: plan.id,
      cancelUrl: `${siteUrl()}/portal/services?checkout=canceled`,
    })
  } catch (e) {
    console.error('portal-checkout: createCheckoutSession failed:', e)
    return res.status(502).json({ error: 'stripe_failed', message: 'Could not start checkout — please try again.' })
  }
  return res.status(200).json(result)
}

// Multi-item Stripe Checkout Session — used by *-cart-checkout endpoints.
// Plans are validated by the caller; this helper assumes they're all active,
// have a stripe_price_id, and share a billing cycle.
async function createCartCheckoutSession({ adminClient, stripe, client, plans, cancelUrl }) {
  let customerId = client.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: client.email, name: client.name, metadata: { client_id: client.id },
    })
    customerId = customer.id
    await adminClient.from('clients').update({ stripe_customer_id: customerId }).eq('id', client.id)
  }

  // Idempotency key: scoped to (client, sorted plan id set, 5-minute bucket).
  // Same as single-item createCheckoutSession but extended for the cart contents.
  const sortedIds = [...plans.map(p => p.id)].sort().join('+')
  const bucket = Math.floor(Date.now() / 300000)
  const idempotencyKey = `cart-${client.id}-${sortedIds}-${bucket}`

  const isOneTime = plans[0].billing_cycle === 'one-time'
  const session = await stripe.checkout.sessions.create({
    mode: isOneTime ? 'payment' : 'subscription',
    customer: customerId,
    line_items: plans.map(p => ({ price: p.stripe_price_id, quantity: 1 })),
    success_url: `${siteUrl()}/portal/dashboard?checkout=success`,
    cancel_url: cancelUrl || `${siteUrl()}/cart?checkout=canceled`,
    metadata: {
      client_id: client.id,
      subscription_plan_ids: sortedIds,
      cart_size: String(plans.length),
    },
  }, { idempotencyKey })

  return { url: session.url, customer_id: customerId }
}

// Load + validate a cart's plans from a list of plan ids. Returns either
// { plans } (valid, same billing cycle, all have stripe_price_id) or
// { error, status, ...details }.
async function loadAndValidateCart(adminClient, items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { error: 'bad_request', status: 400, message: 'Cart is empty' }
  }
  const planIds = items.map(i => i?.plan_id).filter(Boolean)
  if (planIds.length === 0) {
    return { error: 'bad_request', status: 400, message: 'Cart contains no valid plan ids' }
  }

  const { data: plans } = await adminClient
    .from('subscription_plans')
    .select('id, name, billing_cycle, discount_percent, price, stripe_price_id, product_id, active, products:product_id(id, name, base_price, active)')
    .in('id', planIds)

  if (!plans || plans.length === 0) {
    return { error: 'plans_not_found', status: 404, message: 'No matching plans found' }
  }

  // Reject if any plan is inactive or its product is inactive.
  const inactive = plans.find(p => !p.active || !p.products?.active)
  if (inactive) {
    return { error: 'plan_inactive', status: 404, message: `Plan "${inactive.name}" is no longer available.` }
  }
  // Reject if any plan lacks a Stripe price.
  const noPrice = plans.find(p => !p.stripe_price_id)
  if (noPrice) {
    return { error: 'price_not_synced', status: 409, message: `Plan "${noPrice.name}" is not yet configured for checkout.` }
  }
  // Reject mixed billing cycles (Stripe Checkout can't mix mode='payment' and 'subscription').
  const cycles = Array.from(new Set(plans.map(p => p.billing_cycle)))
  if (cycles.length > 1) {
    return { error: 'mixed_cycles', status: 400, message: 'Cart contains a mix of one-time and recurring items. Check those out separately.' }
  }

  return { plans }
}

// POST ?action=public-cart-checkout — anonymous visitor checks out a cart of
// items. Mirrors publicCheckout but with multiple line_items. The first plan
// (by display_order) is denormalized into clients.product/price/subscription_terms
// for legacy compatibility; the rest are tracked via subscription rows.
// Body: { items: [{plan_id}, ...], name, email, password, company?, phone? }
async function publicCartCheckout(req, res) {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  if (!SERVICE_ROLE_KEY) return res.status(500).json({ error: 'config_error', message: 'Service role key not configured' })

  const { items, name, email, password, company, phone } = req.body || {}
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'bad_request', message: 'name, email, and password are required' })
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'weak_password', message: 'Password must be at least 8 characters' })
  }

  const adminClient = createClient(url, SERVICE_ROLE_KEY)

  const cartResult = await loadAndValidateCart(adminClient, items)
  if (cartResult.error) {
    return res.status(cartResult.status).json({ error: cartResult.error, message: cartResult.message })
  }
  // Sort by display_order so the "primary" denorm pick is deterministic.
  const plans = cartResult.plans.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
  const primary = plans[0]

  // Reject existing-client emails — surface login prompt.
  const { data: existing } = await adminClient
    .from('clients').select('id').eq('email', email).maybeSingle()
  if (existing) {
    return res.status(409).json({
      error: 'client_exists',
      message: 'An account with that email already exists. Sign in to complete checkout.',
      login_url: '/portal/login',
    })
  }

  const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
    email, password, email_confirm: true,
  })
  if (authErr) return res.status(400).json({ error: 'auth_create_failed', message: authErr.message })

  // Denormalize the primary (cheapest-ranked-first) plan into legacy columns.
  let computedPrice
  if (primary.price != null) {
    computedPrice = Number(primary.price)
  } else {
    const basePrice = Number(primary.products?.base_price ?? 0)
    const discount = Number(primary.discount_percent ?? 0)
    computedPrice = basePrice ? Number((basePrice * (1 - discount / 100)).toFixed(2)) : null
  }

  const { data: client, error: clientErr } = await adminClient
    .from('clients')
    .insert({
      user_id: authData.user.id,
      name, email,
      company: company || null,
      phone: phone || null,
      product_id: primary.product_id,
      subscription_plan_id: primary.id,
      product: primary.products?.name ?? null,
      price: computedPrice,
      subscription_terms: primary.billing_cycle,
    })
    .select('id, name, email, stripe_customer_id')
    .single()

  if (clientErr) {
    await adminClient.auth.admin.deleteUser(authData.user.id).catch(e => console.error('rollback delete failed:', e))
    return res.status(500).json({ error: 'client_insert_failed', message: clientErr.message })
  }

  async function rollback() {
    await adminClient.from('clients').delete().eq('id', client.id).catch(e => console.error('rollback client delete failed:', e))
    await adminClient.auth.admin.deleteUser(authData.user.id).catch(e => console.error('rollback auth delete failed:', e))
  }

  let stripe
  try { stripe = await getStripe() }
  catch (e) {
    await rollback()
    return res.status(500).json({ error: 'stripe_config', message: e.message })
  }

  let result
  try {
    result = await createCartCheckoutSession({
      adminClient, stripe, client, plans,
      cancelUrl: `${siteUrl()}/cart?checkout=canceled`,
    })
  } catch (e) {
    console.error('public-cart-checkout: createCartCheckoutSession failed:', e)
    await rollback()
    return res.status(502).json({ error: 'stripe_failed', message: 'Could not start checkout — please try again.' })
  }
  // Notify: welcome the new self-signup client + alert admin. Best-effort.
  await emitNotification(adminClient, 'client.created', {
    client: { id: client.id, name: client.name, email: client.email, company: company || null },
    source: 'self-signup',
  })
  return res.status(200).json({ ...result, client_id: client.id })
}

// POST ?action=portal-cart-checkout — logged-in client checks out a cart of
// items. Validates all plans, blocks any plan they already have an active
// sub for, then creates a single multi-item Stripe Checkout Session.
// Body: { items: [{plan_id}, ...] }
async function portalCartCheckout(req, res) {
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

  const { items } = req.body || {}
  const adminClient = createClient(url, SERVICE_ROLE_KEY)

  const { data: client } = await adminClient
    .from('clients').select('id, name, email, stripe_customer_id').eq('user_id', caller.id).maybeSingle()
  if (!client) return res.status(404).json({ error: 'no_client', message: 'No client record for this user' })

  const cartResult = await loadAndValidateCart(adminClient, items)
  if (cartResult.error) {
    return res.status(cartResult.status).json({ error: cartResult.error, message: cartResult.message })
  }
  const plans = cartResult.plans

  // Block if the client already has an active sub matching any cart plan.
  const priceIds = plans.map(p => p.stripe_price_id)
  const { data: existingSubs } = await adminClient
    .from('subscriptions')
    .select('id, status, stripe_price_id')
    .eq('client_id', client.id)
    .in('stripe_price_id', priceIds)
    .in('status', ['active', 'trialing', 'past_due'])
  if (existingSubs && existingSubs.length > 0) {
    const conflict = plans.find(p => existingSubs.some(s => s.stripe_price_id === p.stripe_price_id))
    return res.status(409).json({
      error: 'already_subscribed',
      message: `You already have an active subscription for "${conflict?.name}". Remove it from your cart.`,
      conflict_plan_id: conflict?.id,
    })
  }

  let stripe
  try { stripe = await getStripe() }
  catch (e) { return res.status(500).json({ error: 'stripe_config', message: e.message }) }

  let result
  try {
    result = await createCartCheckoutSession({
      adminClient, stripe, client, plans,
      cancelUrl: `${siteUrl()}/cart?checkout=canceled`,
    })
  } catch (e) {
    console.error('portal-cart-checkout: createCartCheckoutSession failed:', e)
    return res.status(502).json({ error: 'stripe_failed', message: 'Could not start checkout — please try again.' })
  }
  return res.status(200).json(result)
}

// POST ?action=stripe-portal — client clicks "Manage subscription" in their
// portal; we generate a Stripe Billing Portal session and return the URL.
// Body: {} — caller is identified by their JWT.
async function stripePortal(req, res) {
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
  const { data: client } = await adminClient
    .from('clients').select('id, stripe_customer_id').eq('user_id', caller.id).maybeSingle()
  if (!client?.stripe_customer_id) {
    return res.status(409).json({ error: 'no_customer', message: 'No Stripe customer linked. Complete checkout first.' })
  }

  let stripe
  try { stripe = await getStripe() }
  catch (e) { return res.status(500).json({ error: 'stripe_config', message: e.message }) }

  const session = await stripe.billingPortal.sessions.create({
    customer: client.stripe_customer_id,
    return_url: `${siteUrl()}/portal/dashboard`,
  })
  return res.status(200).json({ url: session.url })
}

// POST ?action=stripe-send-invoice — admin clicks "Send via Stripe" on a
// pending invoice row. Creates a Stripe Invoice + Item from our DB row,
// finalizes, sends (Stripe emails the hosted payment link).
// Body: { invoice_id }
async function stripeSendInvoice(req, res) {
  const ctx = await requireAdmin(req, res)
  if (!ctx) return
  const { adminClient } = ctx

  const { invoice_id } = req.body || {}
  if (!invoice_id) return res.status(400).json({ error: 'bad_request', message: 'invoice_id required' })

  const { data: inv, error: invErr } = await adminClient
    .from('invoices').select('*').eq('id', invoice_id).maybeSingle()
  if (invErr || !inv) return res.status(404).json({ error: 'not_found', message: 'Invoice not found' })
  if (inv.status === 'paid') return res.status(409).json({ error: 'already_paid' })
  if (inv.stripe_invoice_id) return res.status(409).json({ error: 'already_sent', stripe_invoice_id: inv.stripe_invoice_id })

  const { data: client } = await adminClient
    .from('clients').select('id, name, email, stripe_customer_id').eq('id', inv.client_id).maybeSingle()
  if (!client) return res.status(404).json({ error: 'client_not_found' })

  let stripe
  try { stripe = await getStripe() }
  catch (e) { return res.status(500).json({ error: 'stripe_config', message: e.message }) }

  // Lazy-create customer
  let customerId = client.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: client.email, name: client.name, metadata: { client_id: client.id },
    })
    customerId = customer.id
    await adminClient.from('clients').update({ stripe_customer_id: customerId }).eq('id', client.id)
  }

  // Create draft invoice → add item → finalize → send (Stripe emails payment link)
  const stripeInvoice = await stripe.invoices.create({
    customer: customerId,
    collection_method: 'send_invoice',
    days_until_due: 14,
    description: inv.description || inv.invoice_number || `Invoice ${inv.id}`,
    metadata: { invoice_id: inv.id, client_id: client.id },
  })
  await stripe.invoiceItems.create({
    customer: customerId,
    invoice: stripeInvoice.id,
    amount: Math.round(Number(inv.amount) * 100), // cents
    currency: 'usd',
    description: inv.description || inv.invoice_number || `Invoice ${inv.id}`,
  })
  const finalized = await stripe.invoices.finalizeInvoice(stripeInvoice.id)
  await stripe.invoices.sendInvoice(finalized.id)

  await adminClient.from('invoices').update({
    stripe_invoice_id: finalized.id,
    stripe_payment_link: finalized.hosted_invoice_url,
  }).eq('id', inv.id)

  return res.status(200).json({
    stripe_invoice_id: finalized.id,
    payment_link: finalized.hosted_invoice_url,
  })
}

// POST ?action=stripe-test — admin clicks "Test connection" in Settings.
// Hits Stripe with the saved key + reports back what it resolves to so
// the user knows the creds are good and which mode (test vs live) they are
// using before they wire up checkout. Doesn't write anything.
async function stripeTest(req, res) {
  const ctx = await requireAdmin(req, res)
  if (!ctx) return

  let stripe
  try { stripe = await getStripe() }
  catch (e) { return res.status(400).json({ ok: false, error: 'no_secret', message: e.message }) }

  const secret = await getSetting('stripe_secret_key', 'STRIPE_SECRET_KEY')
  const isTestKey = !!secret && secret.startsWith('sk_test_')

  try {
    const [account, products] = await Promise.all([
      stripe.accounts.retrieve(),
      stripe.products.list({ limit: 1, active: true }),
    ])
    return res.status(200).json({
      ok: true,
      account_name:  account.business_profile?.name || account.settings?.dashboard?.display_name || account.id,
      account_email: account.email,
      account_id:    account.id,
      key_mode:      isTestKey ? 'test' : 'live',
      products_in_stripe: products.data.length, // 0 = none yet, sample only
    })
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'stripe_call_failed', message: e.message })
  }
}

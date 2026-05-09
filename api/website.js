// api/website.js
// Consolidated router for cross-feature endpoints, dispatched by ?action=.
// Reduces serverless-function count (Hobby plan caps at 12).
// Currently hosts: website-funnel (activate/intake/start/status),
// brand-kit logo approval (approve-logo), and Stripe billing
// (stripe-checkout/stripe-portal/stripe-send-invoice/public-checkout/portal-checkout).
// The Stripe webhook lives separately (api/stripe-webhook.js) because it
// needs raw body for signature verification.
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from './_lib/require-admin.js'
import { getStripe, getSetting, siteUrl } from './_lib/stripe.js'

const EDGE_FN = process.env.SUPABASE_EDGE_FUNCTION_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const VALID_TEMPLATES = ['service-business','local-business','creative-portfolio','saas-landing','travel-agency']
const APPROVABLE_LOGO_KEYS = ['logo_primary', 'logo_icon', 'logo_monochrome']

export default async function handler(req, res) {
  const action = (req.query?.action || '').toString()
  switch (action) {
    case 'activate':            return req.method === 'POST' ? activate(req, res)         : methodNotAllowed(res, 'POST')
    case 'intake':              return req.method === 'POST' ? intake(req, res)           : methodNotAllowed(res, 'POST')
    case 'start':               return req.method === 'POST' ? start(req, res)            : methodNotAllowed(res, 'POST')
    case 'status':              return req.method === 'GET'  ? status(req, res)           : methodNotAllowed(res, 'GET')
    case 'approve-logo':        return req.method === 'POST' ? approveLogo(req, res)      : methodNotAllowed(res, 'POST')
    case 'stripe-checkout':     return req.method === 'POST' ? stripeCheckout(req, res)   : methodNotAllowed(res, 'POST')
    case 'stripe-portal':       return req.method === 'POST' ? stripePortal(req, res)     : methodNotAllowed(res, 'POST')
    case 'stripe-send-invoice': return req.method === 'POST' ? stripeSendInvoice(req, res): methodNotAllowed(res, 'POST')
    case 'stripe-test':         return req.method === 'POST' ? stripeTest(req, res)       : methodNotAllowed(res, 'POST')
    case 'public-checkout':     return req.method === 'POST' ? publicCheckout(req, res)   : methodNotAllowed(res, 'POST')
    case 'portal-checkout':     return req.method === 'POST' ? portalCheckout(req, res)   : methodNotAllowed(res, 'POST')
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

// POST ?action=approve-logo — client picks one of the 3 logo variants and
// triggers the banner-generation phase of the brand-kit edge function.
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

  // Verify caller owns this kit (kit's client.user_id == caller.id)
  const { data: kit } = await adminClient
    .from('brand_kits')
    .select('id, status, client_id, assets, clients!inner(user_id)')
    .eq('id', kit_id).maybeSingle()
  if (!kit) return res.status(404).json({ error: 'not_found', message: 'Brand kit not found' })
  if (kit.clients.user_id !== caller.id) return res.status(403).json({ error: 'forbidden', message: 'Not your brand kit' })
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

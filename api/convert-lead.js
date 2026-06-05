import { requireAdmin } from './_lib/require-admin.js'
import { emitNotification } from './_lib/notifications.js'
import { mintResetToken } from './_lib/portal-reset.js'

function err(res, status, code, message, extras = {}) {
  return res.status(status).json({ error: code, message, ...extras })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return err(res, 405, 'method_not_allowed', 'POST only')
  }

  try {
    return await runHandler(req, res)
  } catch (e) {
    console.error('convert-lead unexpected error:', e)
    return err(res, 500, 'internal_error', e?.message || 'Unexpected error')
  }
}

async function runHandler(req, res) {
  const ctx = await requireAdmin(req, res)
  if (!ctx) return
  const { adminClient } = ctx

  const body = req.body || {}
  const { lead_id, link_only, existing_client_id } = body
  if (!lead_id) return err(res, 400, 'bad_request', 'lead_id required')

  // Load lead
  const { data: lead, error: leadErr } = await adminClient
    .from('leads').select('id, name, email, business_name, converted_to_client_id').eq('id', lead_id).single()
  if (leadErr || !lead) return err(res, 404, 'lead_not_found', 'Lead not found')

  if (lead.converted_to_client_id) {
    return err(res, 409, 'already_converted', 'Lead has already been converted',
      { existing_client_id: lead.converted_to_client_id })
  }

  if (!lead.email) return err(res, 400, 'bad_request', 'Lead has no email')

  // ─── Link-only mode ──────────────────────────────────────────────
  if (link_only) {
    if (!existing_client_id) return err(res, 400, 'bad_request', 'existing_client_id required for link_only')

    const { data: existing, error: exErr } = await adminClient
      .from('clients').select('id, email, name').eq('id', existing_client_id).single()
    if (exErr || !existing) return err(res, 404, 'client_not_found', 'Existing client not found')

    const normEmail = (s) => (s || '').trim().toLowerCase()
    if (normEmail(existing.email) !== normEmail(lead.email)) {
      return err(res, 400, 'email_mismatch', 'Existing client email does not match lead email')
    }

    const { error: linkErr } = await adminClient
      .from('leads').update({ status: 'closed', converted_to_client_id: existing.id }).eq('id', lead.id)
    if (linkErr) return err(res, 500, 'lead_update_failed', linkErr.message)

    return res.status(200).json({
      client_id: existing.id,
      lead_id: lead.id,
      invite_sent: false,
      mode: 'link_only',
    })
  }

  // ─── Full convert mode ──────────────────────────────────────────
  const { name, company, phone, product_id, subscription_plan_id, price } = body
  if (!name) return err(res, 400, 'bad_request', 'name required')

  // Resolve product + plan and denormalize names into the legacy text columns
  // so existing reports/portal queries continue to render without joins.
  let productName = null, planName = null, planTerms = null
  if (product_id) {
    const { data: prod } = await adminClient
      .from('products').select('name, base_price').eq('id', product_id).maybeSingle()
    if (!prod) return err(res, 400, 'bad_request', 'product_id not found')
    productName = prod.name
  }
  if (subscription_plan_id) {
    const { data: plan } = await adminClient
      .from('subscription_plans').select('name, billing_cycle').eq('id', subscription_plan_id).maybeSingle()
    if (!plan) return err(res, 400, 'bad_request', 'subscription_plan_id not found')
    planName = plan.name
    planTerms = plan.billing_cycle
  }

  // Pre-flight email collision check
  const { data: existingByEmail } = await adminClient
    .from('clients').select('id, name, email').eq('email', lead.email).maybeSingle()
  if (existingByEmail) {
    return err(res, 409, 'client_exists', 'A client with this email already exists', {
      existing_client_id: existingByEmail.id,
      existing_client_name: existingByEmail.name,
    })
  }

  // Create the auth user WITHOUT sending a Supabase email. We deliver our own
  // SafeLinks-safe set-password link via the branded welcome email below (over
  // Hostinger SMTP) instead of Supabase's one-time invite link — which email
  // scanners (Outlook SafeLinks) pre-burn, and which is rate-limited (2/hr).
  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email: lead.email,
    email_confirm: true,
  })
  if (createErr) {
    const msg = (createErr.message || '').toLowerCase()
    if (createErr.status === 422 || msg.includes('already') || msg.includes('exists') || msg.includes('registered')) {
      return err(res, 409, 'client_exists', 'An account with this email already exists')
    }
    return err(res, 500, 'invite_failed', createErr.message)
  }

  const newUserId = created?.user?.id
  if (!newUserId) return err(res, 500, 'invite_failed', 'User creation returned no id')

  // Insert client row
  const { data: client, error: clientErr } = await adminClient
    .from('clients')
    .insert({
      user_id: newUserId,
      name,
      email: lead.email,
      company: company || null,
      phone: phone || null,
      product_id: product_id || null,
      subscription_plan_id: subscription_plan_id || null,
      product: productName,                     // denormalized from products.name
      price: price != null && price !== '' ? Number(price) : null,
      subscription_terms: planTerms,            // denormalized from subscription_plans.billing_cycle
    })
    .select('id')
    .single()

  if (clientErr) {
    // Rollback: delete the invited auth user
    await adminClient.auth.admin.deleteUser(newUserId).catch(e => console.error('rollback delete failed:', e))

    // Postgres unique-violation on clients_email_unique_idx — a concurrent
    // request beat the pre-flight check. Re-resolve and return the same 409
    // client_exists shape the frontend already handles.
    if (clientErr.code === '23505') {
      const { data: raced } = await adminClient
        .from('clients').select('id, name').eq('email', lead.email).maybeSingle()
      if (raced) {
        return err(res, 409, 'client_exists', 'A client with this email already exists', {
          existing_client_id: raced.id,
          existing_client_name: raced.name,
        })
      }
    }
    return err(res, 500, 'client_insert_failed', clientErr.message)
  }

  // Update lead — log warning if it fails but don't fail the whole request
  const { error: leadUpdateErr } = await adminClient
    .from('leads').update({ status: 'closed', converted_to_client_id: client.id }).eq('id', lead.id)
  if (leadUpdateErr) {
    console.warn(`convert-lead: client ${client.id} created but lead ${lead.id} update failed:`, leadUpdateErr.message)
  }

  // Mint a SafeLinks-safe set-password link for the welcome email. Best-effort.
  let setPasswordUrl = null
  try {
    setPasswordUrl = await mintResetToken(adminClient, newUserId, lead.email)
  } catch (e) {
    console.error('convert-lead: mintResetToken failed:', e?.message || e)
  }

  // Notify: welcome the client (with the set-password link) + alert admin of the
  // new client. Best-effort.
  await emitNotification(adminClient, 'client.created', {
    client: { id: client.id, name, email: lead.email, company: company || null, product: productName, price: price != null && price !== '' ? Number(price) : null },
    setPasswordUrl,
    source: 'lead-convert',
  })

  return res.status(200).json({
    client_id: client.id,
    lead_id: lead.id,
    invite_sent: true,
    mode: 'full',
    lead_update_warning: leadUpdateErr ? leadUpdateErr.message : null,
  })
}

import { createClient } from '@supabase/supabase-js'

const SITE_URL = process.env.VITE_SITE_URL || 'https://www.hazetechsolutions.com'

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
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

  if (!serviceKey) return err(res, 500, 'config_error', 'Service role key not configured')

  const authHeader = req.headers.authorization
  if (!authHeader) return err(res, 401, 'unauthorized', 'Missing authorization header')

  const userClient = createClient(supabaseUrl, anonKey)
  const { data: { user: caller }, error: authError } =
    await userClient.auth.getUser(authHeader.replace('Bearer ', ''))
  if (authError || !caller) return err(res, 401, 'unauthorized', 'Invalid token')

  const adminClient = createClient(supabaseUrl, serviceKey)

  // Admin gate: caller must NOT be a row in clients
  const { data: callerClient } = await adminClient
    .from('clients').select('id').eq('user_id', caller.id).maybeSingle()
  if (callerClient) return err(res, 403, 'forbidden', 'Only admins can convert leads')

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
  const { name, company, phone, product, price, subscription_terms } = body
  if (!name) return err(res, 400, 'bad_request', 'name required')

  // Pre-flight email collision check
  const { data: existingByEmail } = await adminClient
    .from('clients').select('id, name, email').eq('email', lead.email).maybeSingle()
  if (existingByEmail) {
    return err(res, 409, 'client_exists', 'A client with this email already exists', {
      existing_client_id: existingByEmail.id,
      existing_client_name: existingByEmail.name,
    })
  }

  // Send invite
  const { data: inviteData, error: inviteErr } = await adminClient.auth.admin.inviteUserByEmail(
    lead.email,
    { redirectTo: `${SITE_URL}/portal/accept-invite` }
  )
  if (inviteErr) {
    const msg = (inviteErr.message || '').toLowerCase()
    if (msg.includes('rate limit') || inviteErr.status === 429) {
      return err(res, 429, 'invite_rate_limited',
        'Email rate limit reached. Try again in an hour or set up custom SMTP at /admin/secrets.')
    }
    return err(res, 500, 'invite_failed', inviteErr.message)
  }

  const newUserId = inviteData?.user?.id
  if (!newUserId) return err(res, 500, 'invite_failed', 'Invite returned no user id')

  // Insert client row
  const { data: client, error: clientErr } = await adminClient
    .from('clients')
    .insert({
      user_id: newUserId,
      name,
      email: lead.email,
      company: company || null,
      phone: phone || null,
      product: product || null,
      price: price != null && price !== '' ? Number(price) : null,
      subscription_terms: subscription_terms || null,
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

  return res.status(200).json({
    client_id: client.id,
    lead_id: lead.id,
    invite_sent: true,
    mode: 'full',
    lead_update_warning: leadUpdateErr ? leadUpdateErr.message : null,
  })
}

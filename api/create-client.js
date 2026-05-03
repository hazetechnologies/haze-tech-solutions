import { requireAdmin } from './_lib/require-admin'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed', message: 'POST only' })
  }

  const ctx = await requireAdmin(req, res)
  if (!ctx) return
  const { adminClient } = ctx

  const { name, email, password, company, phone, product, price, subscription_terms } = req.body || {}

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'bad_request', message: 'Name, email, and password are required' })
  }

  try {
    // Create auth user
    const { data: authData, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (createError) {
      return res.status(400).json({ error: 'auth_create_failed', message: createError.message })
    }

    // Insert client record
    const { data: client, error: insertError } = await adminClient
      .from('clients')
      .insert({
        user_id: authData.user.id,
        name,
        email,
        company: company || null,
        phone: phone || null,
        product: product || null,
        price: price ? Number(price) : null,
        subscription_terms: subscription_terms || null,
      })
      .select()
      .single()

    if (insertError) {
      // Rollback: delete the auth user
      await adminClient.auth.admin.deleteUser(authData.user.id).catch(e => console.error('rollback delete failed:', e))
      return res.status(400).json({ error: 'client_insert_failed', message: insertError.message })
    }

    return res.status(200).json({ client })
  } catch (err) {
    console.error('create-client unexpected error:', err)
    return res.status(500).json({ error: 'internal_error', message: err?.message || 'Unexpected error' })
  }
}

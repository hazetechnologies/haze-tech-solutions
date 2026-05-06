import { requireAdmin } from './_lib/require-admin'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed', message: 'POST only' })
  }

  const ctx = await requireAdmin(req, res)
  if (!ctx) return
  const { adminClient } = ctx

  const { name, email, password, company, phone, product_id, subscription_plan_id, price } = req.body || {}

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'bad_request', message: 'Name, email, and password are required' })
  }

  try {
    // Resolve product + plan to denormalize their names into legacy text columns
    let productName = null, planTerms = null
    if (product_id) {
      const { data: prod } = await adminClient.from('products').select('name').eq('id', product_id).maybeSingle()
      if (!prod) return res.status(400).json({ error: 'bad_request', message: 'product_id not found' })
      productName = prod.name
    }
    if (subscription_plan_id) {
      const { data: plan } = await adminClient.from('subscription_plans').select('billing_cycle').eq('id', subscription_plan_id).maybeSingle()
      if (!plan) return res.status(400).json({ error: 'bad_request', message: 'subscription_plan_id not found' })
      planTerms = plan.billing_cycle
    }

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
        product_id: product_id || null,
        subscription_plan_id: subscription_plan_id || null,
        product: productName,
        price: price ? Number(price) : null,
        subscription_terms: planTerms,
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

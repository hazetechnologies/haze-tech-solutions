import { requireAdmin } from './_lib/require-admin.js'
import { emitNotification } from './_lib/notifications.js'

const SITE_URL = process.env.VITE_SITE_URL || 'https://www.hazetechsolutions.com'

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
      const { data: plan } = await adminClient.from('subscription_plans').select('billing_cycle, product_id').eq('id', subscription_plan_id).maybeSingle()
      if (!plan) return res.status(400).json({ error: 'bad_request', message: 'subscription_plan_id not found' })
      // If the plan is product-scoped, it must match the submitted product_id.
      // Legacy global plans (product_id IS NULL) are allowed against any product or no product.
      if (plan.product_id && plan.product_id !== product_id) {
        return res.status(400).json({ error: 'plan_product_mismatch', message: 'Selected plan does not belong to the selected product' })
      }
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

    // Generate a set/reset-password action link so the new client can set their
    // own password from the branded welcome email (no email is sent by this
    // call — we deliver it ourselves via emitNotification). Best-effort.
    let setPasswordUrl = null
    try {
      const { data: linkData } = await adminClient.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: `${SITE_URL}/portal/accept-invite` },
      })
      setPasswordUrl = linkData?.properties?.action_link || null
    } catch (e) {
      console.error('create-client: generateLink failed:', e?.message || e)
    }

    // Welcome the client (with the set-password link) + alert admin. Best-effort.
    await emitNotification(adminClient, 'client.created', {
      client: { id: client.id, name, email, company: company || null, product: productName, price: price ? Number(price) : null },
      setPasswordUrl,
      source: 'admin',
    })

    return res.status(200).json({ client })
  } catch (err) {
    console.error('create-client unexpected error:', err)
    return res.status(500).json({ error: 'internal_error', message: err?.message || 'Unexpected error' })
  }
}

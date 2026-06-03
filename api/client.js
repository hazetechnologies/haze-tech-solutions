// api/client.js — admin update/delete for a client profile. requireAdmin-gated.
// ?action=update  POST { id, name, company, phone, product_id, subscription_plan_id, price }
// ?action=delete  POST { id }
// Email is intentionally NOT editable here: it is the auth login identity, and
// changing only the clients-row copy would desync it from the auth user.
import { requireAdmin } from './_lib/require-admin.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed', message: 'POST only' })
  }
  const ctx = await requireAdmin(req, res)
  if (!ctx) return
  const { adminClient } = ctx
  const action = (req.query?.action || '').toString()
  if (action === 'update') return updateClient(req, res, adminClient)
  if (action === 'delete') return deleteClient(req, res, adminClient)
  return res.status(400).json({ error: 'bad_request', message: 'Unknown or missing action' })
}

async function updateClient(req, res, adminClient) {
  const { id, name, company, phone, product_id, subscription_plan_id, price } = req.body || {}
  if (!id) return res.status(400).json({ error: 'bad_request', message: 'id required' })

  const patch = {}
  if (name !== undefined) patch.name = name
  if (company !== undefined) patch.company = company || null
  if (phone !== undefined) patch.phone = phone || null
  if (price !== undefined) patch.price = price === '' || price == null ? null : Number(price)

  // Re-denormalize product/plan names when the linkage changes.
  if (product_id !== undefined) {
    patch.product_id = product_id || null
    let productName = null
    if (product_id) {
      const { data: prod } = await adminClient.from('products').select('name').eq('id', product_id).maybeSingle()
      if (!prod) return res.status(400).json({ error: 'bad_request', message: 'product_id not found' })
      productName = prod.name
    }
    patch.product = productName
  }
  if (subscription_plan_id !== undefined) {
    patch.subscription_plan_id = subscription_plan_id || null
    let planTerms = null
    if (subscription_plan_id) {
      const { data: plan } = await adminClient.from('subscription_plans').select('billing_cycle').eq('id', subscription_plan_id).maybeSingle()
      if (!plan) return res.status(400).json({ error: 'bad_request', message: 'subscription_plan_id not found' })
      planTerms = plan.billing_cycle
    }
    patch.subscription_terms = planTerms
  }

  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'bad_request', message: 'no fields to update' })
  }

  const { data, error } = await adminClient.from('clients').update(patch).eq('id', id).select().single()
  if (error) return res.status(400).json({ error: 'update_failed', message: error.message })
  return res.status(200).json({ client: data })
}

async function deleteClient(req, res, adminClient) {
  const { id } = req.body || {}
  if (!id) return res.status(400).json({ error: 'bad_request', message: 'id required' })

  const { data: client } = await adminClient.from('clients').select('id, user_id').eq('id', id).maybeSingle()
  if (!client) return res.status(404).json({ error: 'not_found', message: 'Client not found' })

  // Deleting the client row cascades to website_projects / brand_kits / invoices /
  // subscriptions / projects / notifications and nulls leads / automation_reports
  // (verified FK rules), so no dependent row blocks the delete.
  const { error: delErr } = await adminClient.from('clients').delete().eq('id', id)
  if (delErr) return res.status(400).json({ error: 'delete_failed', message: delErr.message })

  // Best-effort: remove the backing auth user so the email can be reused.
  if (client.user_id) {
    await adminClient.auth.admin.deleteUser(client.user_id).catch((e) => console.error('delete auth user failed:', e?.message || e))
  }
  return res.status(200).json({ ok: true })
}

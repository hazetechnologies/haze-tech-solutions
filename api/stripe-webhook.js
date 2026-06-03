// api/stripe-webhook.js
// Stripe sends signed events here. Body must be the raw bytes for signature
// verification, so we disable Vercel's bodyParser at the file level — the
// reason this lives in its own file rather than under api/website.js.
import { createClient } from '@supabase/supabase-js'
import { getStripe, getWebhookSecret } from './_lib/stripe.js'
import { emitNotification } from './_lib/notifications.js'

export const config = { api: { bodyParser: false } }

async function readRawBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  return Buffer.concat(chunks)
}

function adminClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const sig = req.headers['stripe-signature']
  if (!sig) return res.status(400).json({ error: 'missing_signature' })

  let stripe, secret, raw
  try {
    [stripe, secret, raw] = await Promise.all([getStripe(), getWebhookSecret(), readRawBody(req)])
  } catch (e) {
    console.error('webhook setup failed:', e)
    // 500 → Stripe retries
    return res.status(500).json({ error: 'config_error', message: e.message })
  }
  if (!secret) {
    console.error('webhook: STRIPE_WEBHOOK_SECRET not configured')
    return res.status(500).json({ error: 'webhook_secret_missing' })
  }

  let event
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret)
  } catch (e) {
    return res.status(400).json({ error: 'bad_signature', message: e.message })
  }

  const sb = adminClient()
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        // Subscription mode: link the new sub to the client via metadata
        const clientId = session.metadata?.client_id
        if (session.mode === 'subscription' && session.subscription && clientId) {
          const sub = await stripe.subscriptions.retrieve(session.subscription)
          await sb.from('subscriptions').upsert({
            client_id: clientId,
            stripe_customer_id: sub.customer,
            stripe_subscription_id: sub.id,
            stripe_price_id: sub.items.data[0]?.price?.id ?? null,
            status: sub.status,
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
            cancel_at_period_end: sub.cancel_at_period_end,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'stripe_subscription_id' })
          // Also stamp the customer id back onto the client if missing
          await sb.from('clients').update({ stripe_customer_id: sub.customer })
            .eq('id', clientId).is('stripe_customer_id', null)
          // Notify: confirm to client + alert admin of the new subscription.
          const { data: subClient } = await sb.from('clients').select('id, name, email').eq('id', clientId).maybeSingle()
          await emitNotification(sb, 'subscription.created', {
            clientId,
            clientName: subClient?.name,
            clientEmail: subClient?.email,
            planName: sub.items.data[0]?.price?.nickname || undefined,
          })
        }
        break
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object
        await sb.from('subscriptions').update({
          status: sub.status,
          stripe_price_id: sub.items.data[0]?.price?.id ?? null,
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          cancel_at_period_end: sub.cancel_at_period_end,
          updated_at: new Date().toISOString(),
        }).eq('stripe_subscription_id', sub.id)
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object
        await sb.from('subscriptions').update({
          status: 'canceled',
          cancel_at_period_end: true,
          updated_at: new Date().toISOString(),
        }).eq('stripe_subscription_id', sub.id)
        break
      }

      case 'invoice.paid': {
        const inv = event.data.object
        // One-off invoices we sent: link by stripe_invoice_id
        await sb.from('invoices').update({
          status: 'paid',
          paid_date: new Date((inv.status_transitions?.paid_at ?? inv.created) * 1000).toISOString().slice(0, 10),
        }).eq('stripe_invoice_id', inv.id)
        // Notify: receipt to client + alert admin of the payment. Best-effort.
        const { data: payer } = await sb.from('clients').select('id, name, email').eq('stripe_customer_id', inv.customer).maybeSingle()
        await emitNotification(sb, 'invoice.paid', {
          clientId: payer?.id,
          clientName: payer?.name,
          clientEmail: payer?.email,
          amount: inv.amount_paid != null ? (inv.amount_paid / 100).toFixed(2) : undefined,
        })
        break
      }

      case 'invoice.payment_failed': {
        const inv = event.data.object
        await sb.from('invoices').update({
          status: 'overdue',
        }).eq('stripe_invoice_id', inv.id)
        // Optional: log to audit_log here
        break
      }

      default:
        // Unhandled event types — ack with 200 so Stripe doesn't retry
        break
    }
    return res.status(200).json({ received: true })
  } catch (e) {
    console.error(`webhook handler ${event.type} failed:`, e)
    // Return 500 so Stripe retries
    return res.status(500).json({ error: 'handler_error', message: e.message })
  }
}

// api/_lib/stripe.js
// Singleton Stripe client + admin_settings reader. Credentials are read from
// the admin_settings table first (so they can be rotated without a redeploy)
// and fall back to env vars. Cached for 60s in-memory per cold-start.
import Stripe from 'stripe'

// getSetting moved to _lib/settings.js so that reading a credential no longer
// drags the Stripe SDK in with it. Re-exported here because a dozen call sites
// import it from this module.
import { getSetting } from './settings.js'
export { getSetting }

let _stripe = null
let _stripeKey = null

/** Get a Stripe client. Re-instantiates if the secret key has rotated. */
export async function getStripe() {
  const key = await getSetting('stripe_secret_key', 'STRIPE_SECRET_KEY')
  if (!key) throw new Error('Stripe secret key not configured. Set in /admin/settings.')
  if (_stripe && _stripeKey === key) return _stripe
  _stripe = new Stripe(key, { apiVersion: '2024-12-18.acacia' })
  _stripeKey = key
  return _stripe
}

/** Stripe webhook secret (DB or env). */
export async function getWebhookSecret() {
  return getSetting('stripe_webhook_secret', 'STRIPE_WEBHOOK_SECRET')
}

/** Public site URL for redirect URLs (Checkout success/cancel, Portal return). */
export function siteUrl() {
  return process.env.VITE_SITE_URL || 'https://www.hazetechsolutions.com'
}

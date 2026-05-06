// api/_lib/stripe.js
// Singleton Stripe client + admin_settings reader. Credentials are read from
// the admin_settings table first (so they can be rotated without a redeploy)
// and fall back to env vars. Cached for 60s in-memory per cold-start.
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const SETTING_TTL_MS = 60_000
const settingCache = new Map() // key -> { value, expiresAt }
let _stripe = null
let _stripeKey = null

function adminClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
}

/** Read a value from admin_settings (DB) with env-var fallback. Cached 60s. */
export async function getSetting(key, envFallbackName) {
  const cached = settingCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  const { data } = await adminClient()
    .from('admin_settings').select('value').eq('key', key).maybeSingle()
  const value = data?.value || (envFallbackName ? process.env[envFallbackName] : null) || null
  settingCache.set(key, { value, expiresAt: Date.now() + SETTING_TTL_MS })
  return value
}

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

// api/_lib/settings.js
// Reader for the admin_settings table: DB first so credentials can be rotated
// from /admin/settings without a redeploy, env var as fallback, cached 60s per
// cold start.
//
// This lived in _lib/stripe.js, which meant anything wanting to read a setting
// imported the Stripe SDK with it. That pulled Stripe into bundles with no
// billing in them, and it broke outright under Deno — Stripe's module-level
// runtime detection throws there, so a `deno test` of any consumer failed
// before a single assertion ran. stripe.js now re-exports from here, so every
// existing `import { getSetting } from './stripe.js'` keeps working.
import { createClient } from '@supabase/supabase-js'

const SETTING_TTL_MS = 60_000
const settingCache = new Map() // key -> { value, expiresAt }

function adminClient() {
  return createClient(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
}

/**
 * Read a value from admin_settings (DB) with env-var fallback. Cached 60s.
 * Pass { fresh: true } to bypass the read cache (e.g. an admin action that runs
 * immediately after saving a setting); it still refreshes the cache afterwards.
 */
export async function getSetting(key, envFallbackName, opts = {}) {
  if (!opts.fresh) {
    const cached = settingCache.get(key)
    if (cached && cached.expiresAt > Date.now()) return cached.value
  }

  const { data } = await adminClient()
    .from('admin_settings').select('value').eq('key', key).maybeSingle()
  const value = data?.value || (envFallbackName ? process.env[envFallbackName] : null) || null
  settingCache.set(key, { value, expiresAt: Date.now() + SETTING_TTL_MS })
  return value
}

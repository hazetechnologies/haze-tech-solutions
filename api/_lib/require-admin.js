import { createClient } from '@supabase/supabase-js'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)

/**
 * Verify the caller is an admin. On success returns { caller, adminClient }.
 * On failure, writes an error response and returns null. Caller should `return`
 * immediately after a null result.
 *
 *   const ctx = await requireAdmin(req, res)
 *   if (!ctx) return
 *   const { caller, adminClient } = ctx
 *
 * Status codes:
 *   500 config_error            — service role key missing
 *   500 admin_allowlist_empty   — ADMIN_EMAILS env var unset (fail-closed)
 *   401 unauthorized            — missing or invalid bearer token
 *   403 forbidden               — token valid but caller email not in allow-list
 */
export async function requireAdmin(req, res) {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

  if (!serviceKey) {
    res.status(500).json({ error: 'config_error', message: 'Service role key not configured' })
    return null
  }
  if (ADMIN_EMAILS.length === 0) {
    res.status(500).json({ error: 'admin_allowlist_empty', message: 'ADMIN_EMAILS env var is not set' })
    return null
  }

  const authHeader = req.headers.authorization
  if (!authHeader) {
    res.status(401).json({ error: 'unauthorized', message: 'Missing authorization header' })
    return null
  }

  const m = /^Bearer\s+(.+)$/i.exec(authHeader)
  if (!m) {
    res.status(401).json({ error: 'unauthorized', message: 'Authorization header must be "Bearer <token>"' })
    return null
  }
  const token = m[1].trim()

  const userClient = createClient(url, anonKey)
  let caller, authErr
  try {
    ;({ data: { user: caller }, error: authErr } = await userClient.auth.getUser(token))
  } catch (e) {
    console.error('require-admin: getUser threw:', e)
    res.status(401).json({ error: 'unauthorized', message: 'Token verification failed' })
    return null
  }
  if (authErr || !caller) {
    res.status(401).json({ error: 'unauthorized', message: 'Invalid token' })
    return null
  }

  const callerEmail = (caller.email || '').trim().toLowerCase()
  if (!ADMIN_EMAILS.includes(callerEmail)) {
    res.status(403).json({ error: 'forbidden', message: 'Admin access required' })
    return null
  }

  return { caller, adminClient: createClient(url, serviceKey) }
}

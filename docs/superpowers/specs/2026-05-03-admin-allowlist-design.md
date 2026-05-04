# Admin Allow-List — Design Spec

**Date:** 2026-05-03
**Status:** Approved, ready for implementation plan

## Problem

Four Vercel API routes currently gate admin access with the heuristic *"caller is authenticated AND has no row in `clients`."*

```javascript
const { data: callerClient } = await adminClient
  .from('clients').select('id').eq('user_id', caller.id).maybeSingle()
if (callerClient) return res.status(403).json({ error: 'Only admins can ...' })
```

Affected routes:

- `api/create-client.js`
- `api/convert-lead.js`
- `api/start-brand-kit.js`
- `api/brand-kit-status/[id].js`

This is a security weakness that compounds with every new admin route:

- *Any* authenticated Supabase user who isn't a row in `clients` is treated as admin.
- That includes leftover test accounts, anyone who signed up but wasn't onboarded, and (in the future) any user created via a path that doesn't insert into `clients` (e.g., a marketing newsletter signup, an OAuth login).
- The convert-lead flow shipped in PR #4 mitigates one path (every converted lead is now in `clients`), but it doesn't fix the underlying gate.

Today the risk is theoretical (1 auth user exists, 0 clients), but it becomes real the moment any user-creating path bypasses the `clients` insert.

## Goals

- Replace the "not-in-clients = admin" heuristic with an explicit allow-list.
- Single source of truth for admin membership.
- Single helper used by all 4 routes.
- Fail-closed if the allow-list is misconfigured.
- No DB migration, no UI, no new schema.

## Non-goals

- Admin management UI (the workflow is `vercel env add` — fine for ≤3 admins).
- Per-route capability roles (we have one role: admin).
- Audit logging of admin actions (separate concern, defer).
- Migration to a database-backed model. If admin headcount grows past ~5, revisit with a `profiles.is_admin` column. For now, env var is sufficient and explicitly chosen.

## Constraints driving the design

- **Admin headcount cap: 3.** Confirmed during brainstorming. This is what makes a hardcoded env var the right tool — at 3 max, the operational cost (one redeploy when adding) is negligible.
- **Vercel deploys are gated changes.** An admin grant requires editing an env var which requires a deploy — this is a feature, not a bug. The deploy history *is* the audit log for admin grants.
- **No database changes.** The brainstorm rejected `app_metadata.role` (extra latency per request) and a new `admins` table (overengineering at this scale).

## Architecture

### New file: `api/_lib/require-admin.js`

A single function `requireAdmin(req, res)` that encapsulates the entire auth + admin gate. It:

1. Reads `process.env.ADMIN_EMAILS` (comma-separated, case-insensitive, whitespace-tolerant).
2. Returns 500 `admin_allowlist_empty` if the env var is unset or empty (fail-closed).
3. Reads the bearer token from `req.headers.authorization`. Returns 401 `unauthorized` on any failure.
4. Verifies the token via Supabase anon-key client. Returns 401 `unauthorized` if invalid.
5. Compares the caller's email (lowercased, trimmed) against the allow-list. Returns 403 `forbidden` if not in list.
6. On success, returns `{ caller, adminClient }` — the verified user and a service-role Supabase client ready for DB operations.

Error responses follow the established shape: `{ error: '<code>', message: '<human-readable>' }`. The function writes the response itself and returns `null`, so callers just do `if (!ctx) return`.

### Module exports

```javascript
export async function requireAdmin(req, res): Promise<{ caller, adminClient } | null>
```

That's it. One export.

### Implementation

```javascript
import { createClient } from '@supabase/supabase-js'

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean)

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

  const userClient = createClient(url, anonKey)
  const { data: { user: caller }, error: authErr } =
    await userClient.auth.getUser(authHeader.replace('Bearer ', ''))
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
```

## Env var

`ADMIN_EMAILS` — comma-separated list of admin email addresses.

- Set via `vercel env add ADMIN_EMAILS` for production, preview, and development.
- Initial value: `info@hazetechsolutions.com` (the current sole admin).
- Case-insensitive comparison: `Foo@Bar.com` and `foo@bar.com` match.
- Whitespace tolerant: `a@x.com, b@x.com , c@x.com` parses cleanly.
- Empty values filtered out: `a@x.com,,b@x.com` parses to two emails.

Adding a new admin (operational runbook):

1. Create their Supabase auth user via Supabase dashboard (Auth → Users → Add user → "Create new user" with their email + a temp password).
2. Append their email to `ADMIN_EMAILS` in Vercel: `vercel env rm ADMIN_EMAILS production && vercel env add ADMIN_EMAILS production` (or edit via Vercel dashboard).
3. Trigger a Vercel deploy (`vercel --prod`, or push any commit). The env var is read at module-load time, so the new value takes effect on the next cold-start.
4. Tell them to log in at `/admin/login` with their email + the temp password.

Removing an admin: same flow in reverse. They lose access on next cold-start.

## Routes to update

Each of the 4 routes currently has ~15 lines of inline auth + admin-gate boilerplate. After refactor, each starts with:

```javascript
import { requireAdmin } from './_lib/require-admin'

export default async function handler(req, res) {
  if (req.method !== 'POST') {  // or whatever method
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed', message: 'POST only' })
  }

  const ctx = await requireAdmin(req, res)
  if (!ctx) return
  const { caller, adminClient } = ctx

  // ... route-specific logic from here
}
```

Lines removed per route:

- `api/create-client.js` — drops 15 lines (auth gate + admin check)
- `api/convert-lead.js` — drops 19 lines (same pattern, plus the `try/catch runHandler` wrapper that becomes redundant since the helper handles its own errors before any mutation)
- `api/start-brand-kit.js` — drops ~12 lines
- `api/brand-kit-status/[id].js` — drops ~10 lines

The `convert-lead.js` `runHandler` indirection added during PR #4 review can stay (it still catches unexpected errors during the mutation flow); only the gate code at the top moves to the helper.

## Rollout order (matters)

The order matters because the helper fail-closes when `ADMIN_EMAILS` is unset. Deploying code before env var = every admin route returns 500.

1. **Set the env var first.** `vercel env add ADMIN_EMAILS production`, value `info@hazetechsolutions.com`. Repeat for preview and development. Verify with `vercel env ls`.
2. **Open the PR with the helper + 4 route changes.** When CI builds the preview deploy, it will pick up the env var (preview environment).
3. **Smoke-test the preview URL.** Log in as `info@hazetechsolutions.com` → hit any admin route (e.g., visit `/admin/leads`) → confirm 200. Optionally: hit a route directly with curl using a non-admin token, confirm 403.
4. **Merge → production deploy → re-smoke.**

## Edge cases & error handling

- **`ADMIN_EMAILS` unset on prod.** Fail-closed: every admin route returns 500 `admin_allowlist_empty`. Loud failure is correct — silently allowing access would be worse.
- **`ADMIN_EMAILS` has typos.** No syntactic validation in the helper (would be over-engineering); admin just sees 403 when they try to log in. Operationally easy to catch and fix.
- **Email case mismatch** (e.g., env var `Foo@Bar.com`, Supabase Auth normalizes to `foo@bar.com`). Both sides normalized to lowercase, trimmed.
- **Caller has no `email` field on `auth.user`** (shouldn't happen with Supabase but defensive). Treated as not-in-list → 403.
- **Caller's email is in allow-list AND in `clients` table.** Treated as admin. The "not-in-clients" check is gone — we use the allow-list as the single source of truth. Operationally this shouldn't happen (you wouldn't sign your own admin email up as a client), but if it does, allow-list wins.
- **Concurrent reads of `process.env.ADMIN_EMAILS`.** Read once at module-load time, cached for the lifetime of the function instance. Vercel cold-starts pick up new values; warm function instances do not. This is intentional — see Rollout step 1.

## Files

### New

- `api/_lib/require-admin.js` — the helper.

### Modified

- `api/create-client.js` — replace auth+admin gate with `requireAdmin(req, res)` call.
- `api/convert-lead.js` — same.
- `api/start-brand-kit.js` — same.
- `api/brand-kit-status/[id].js` — same.

### Configuration

- Vercel env var `ADMIN_EMAILS` set in production, preview, and development.

## Out of scope (will not be built in this iteration)

- Admin management UI (use `vercel env add`).
- Multi-role / capability-based access (we have one role: admin).
- Audit log of admin actions (separate concern).
- Migrating to a DB-backed admin model (revisit if headcount grows past ~5).
- Adding new admin-gated routes (the helper is reusable; just call it).

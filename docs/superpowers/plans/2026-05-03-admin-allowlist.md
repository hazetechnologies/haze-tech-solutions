# Admin Allow-List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "not-in-clients = admin" heuristic across 4 API routes with an explicit `ADMIN_EMAILS` env-var allow-list, gated by a shared `api/_lib/require-admin.js` helper.

**Architecture:** New helper module reads `process.env.ADMIN_EMAILS` (comma-separated, lowercased), verifies the bearer token via Supabase anon-key client, and confirms the caller's email is in the list. Returns `{ caller, adminClient }` on success or writes a 401/403/500 response and returns `null`. Fails closed if env var is unset. All 4 admin-gated routes call this helper instead of duplicating the gate.

**Tech Stack:** Vercel serverless (`api/`), Supabase JS SDK, Node 20+ ESM.

**Spec:** `docs/superpowers/specs/2026-05-03-admin-allowlist-design.md`

---

## File Structure

| File | Action | Purpose |
|---|---|---|
| `api/_lib/require-admin.js` | Create | The single source of truth for the admin gate |
| `api/create-client.js` | Modify | Replace inline gate with `requireAdmin(req, res)` |
| `api/convert-lead.js` | Modify | Replace inline gate with `requireAdmin(req, res)` |
| `api/start-brand-kit.js` | Modify | Replace inline gate with `requireAdmin(req, res)` |
| `api/brand-kit-status/[id].js` | Modify | Replace inline gate with `requireAdmin(req, res)` |

Vercel env var `ADMIN_EMAILS` set in production, preview, and development. No DB changes.

---

## Pre-flight

Working repo: `c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions/`. All git/npm/file paths in this plan are relative to that directory unless specified.

Vercel CLI is logged in to the `hazetechnologies` account (per project memory). The CLI can read/write env vars for the `haze-tech-solutions` project without interactive prompts.

Make a feature branch before starting:
```bash
git -C "<repo>" checkout -b feat/admin-allowlist
```

---

## Task 1: Set the ADMIN_EMAILS env var in Vercel (BEFORE any code)

**Critical:** the helper fail-closes if `ADMIN_EMAILS` is empty. If you deploy the new code before setting the env var, every admin route returns 500.

**Files:** none (Vercel configuration only)

- [ ] **Step 1: Confirm Vercel CLI is logged in and the project is linked**

```bash
cd "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions" && vercel whoami && vercel link --yes 2>&1 | tail -3
```

Expected: shows the logged-in user (`hazetechnologies`) and confirms the project is linked to `hazetechnologies/haze-tech-solutions`. If `vercel link` prompts interactively, the project is not yet linked — answer the prompts using existing project.

- [ ] **Step 2: Add `ADMIN_EMAILS` to production**

```bash
cd "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions" && printf 'info@hazetechsolutions.com' | vercel env add ADMIN_EMAILS production
```

Expected: `Success! Added Environment Variable ADMIN_EMAILS to Project haze-tech-solutions [...]`.

- [ ] **Step 3: Add `ADMIN_EMAILS` to preview**

```bash
cd "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions" && printf 'info@hazetechsolutions.com' | vercel env add ADMIN_EMAILS preview
```

- [ ] **Step 4: Add `ADMIN_EMAILS` to development**

```bash
cd "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions" && printf 'info@hazetechsolutions.com' | vercel env add ADMIN_EMAILS development
```

- [ ] **Step 5: Verify all three are set**

```bash
cd "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions" && vercel env ls | grep ADMIN_EMAILS
```

Expected: three rows showing `ADMIN_EMAILS` in `Production`, `Preview`, `Development` (any order). All three should have the same Encrypted value.

- [ ] **Step 6: No commit needed for this task** (it's pure configuration)

---

## Task 2: Create the `require-admin.js` helper

**Files:**
- Create: `api/_lib/require-admin.js`

- [ ] **Step 1: Create the helper file**

Create `api/_lib/require-admin.js` with this exact content:

```javascript
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

- [ ] **Step 2: Verify the file parses**

```bash
node --check "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions/api/_lib/require-admin.js"
```

Expected: silent success.

- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions" add api/_lib/require-admin.js
git -C "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions" commit -m "feat(api): add requireAdmin helper for env-var allow-list gate"
```

---

## Task 3: Refactor `api/create-client.js` to use `requireAdmin`

**Files:**
- Modify: `api/create-client.js`

- [ ] **Step 1: Replace the file content**

The current file (88 lines) inlines the auth gate. Replace its entire content with:

```javascript
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
```

Notes on what changed beyond the gate refactor:
- Error response shape upgraded to `{ error: '<code>', message: '...' }` (matches `convert-lead.js` shape; old route used bare `{ error: 'message string' }`)
- Added `.catch()` on rollback `deleteUser` call (matches `convert-lead.js` defensive pattern)
- Wrapped catch is now consistent
- The `req.body || {}` guard added for defensive parsing

- [ ] **Step 2: Verify the file parses**

```bash
node --check "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions/api/create-client.js"
```

Expected: silent success.

- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions" add api/create-client.js
git -C "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions" commit -m "refactor(create-client): use requireAdmin helper + standardize error shape"
```

---

## Task 4: Refactor `api/convert-lead.js` to use `requireAdmin`

**Files:**
- Modify: `api/convert-lead.js` (lines 1-44 currently, replace with helper call)

- [ ] **Step 1: Open the file and locate the gate block**

The current file structure is:
```
lines 1-7   : imports + SITE_URL + err helper
lines 9-13  : method check
lines 15-22 : try/catch wrapper around runHandler
lines 24-44 : runHandler() opening — env loading + auth gate + admin gate
lines 45+   : business logic (lead load, link-only branch, full convert branch)
```

Replace lines 1-44 (the imports, helpers, method check, try/catch wrapper, and the entire admin gate section at the top of `runHandler`) with this code:

```javascript
import { requireAdmin } from './_lib/require-admin'

const SITE_URL = process.env.VITE_SITE_URL || 'https://www.hazetechsolutions.com'

function err(res, status, code, message, extras = {}) {
  return res.status(status).json({ error: code, message, ...extras })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return err(res, 405, 'method_not_allowed', 'POST only')
  }

  try {
    return await runHandler(req, res)
  } catch (e) {
    console.error('convert-lead unexpected error:', e)
    return err(res, 500, 'internal_error', e?.message || 'Unexpected error')
  }
}

async function runHandler(req, res) {
  const ctx = await requireAdmin(req, res)
  if (!ctx) return
  const { adminClient } = ctx
```

Important: this REPLACES lines 1-44 only. Everything from the original line 45 onward (`const body = req.body || {}` and below) MUST stay exactly as it was. Do NOT touch the lead-loading, link-only branch, or full-convert branch.

To make sure the diff is correct, after the edit verify the file with:

```bash
grep -c "const body = req.body" "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions/api/convert-lead.js"
```

Expected: `1` (the body parse line is preserved exactly once).

```bash
grep -c "callerClient" "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions/api/convert-lead.js"
```

Expected: `0` (the old admin gate is gone).

- [ ] **Step 2: Verify the file parses**

```bash
node --check "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions/api/convert-lead.js"
```

Expected: silent success.

- [ ] **Step 3: Commit**

```bash
git -C "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions" add api/convert-lead.js
git -C "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions" commit -m "refactor(convert-lead): use requireAdmin helper"
```

---

## Task 5: Refactor `api/start-brand-kit.js` to use `requireAdmin`

**Files:**
- Modify: `api/start-brand-kit.js`

- [ ] **Step 1: Read the current file to find the gate block**

```bash
head -50 "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions/api/start-brand-kit.js"
```

You will see a structure roughly like:
```
import { createClient } ...
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ...)
const REQUIRED_PATH3_FIELDS = [...]
const REQUIRED_PATH1_FIELDS = [...]

export default async function handler(req, res) {
  if (req.method !== 'POST') { ... }

  // Auth: bearer token from admin session
  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ error: 'Missing authorization header' })

  const userClient = createClient(...)
  const { data: { user: caller }, error: authError } = ...
  if (authError || !caller) return res.status(401).json({ error: 'Invalid token' })

  // Confirm caller is admin (NOT a row in clients) — same gate as create-client.js
  const { data: callerClient } = await supabase
    .from('clients').select('id').eq('user_id', caller.id).maybeSingle()
  if (callerClient) return res.status(403).json({ error: 'Only admins can generate brand kits' })

  // ... business logic continues
}
```

- [ ] **Step 2: Apply the refactor**

The pre-existing `supabase` module-level constant uses the service role key. After the refactor, it should be replaced by the `adminClient` returned from `requireAdmin`.

Replace the imports + module-level Supabase client + the entire auth/admin gate block (everything from `import { createClient } ...` at the top through the `if (callerClient) return ...` line) with:

```javascript
import { requireAdmin } from './_lib/require-admin'

const REQUIRED_PATH3_FIELDS = [
  'business_name', 'business_description', 'industry', 'audience',
  'vibe', 'color_preference', 'inspirations',
]
const REQUIRED_PATH1_FIELDS = [
  'business_name', 'industry', 'audience',
  'vibe', 'color_preference', 'inspirations',
]

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed', message: 'POST only' })
  }

  const ctx = await requireAdmin(req, res)
  if (!ctx) return
  const supabase = ctx.adminClient
```

(Keeping the local variable name `supabase` so the rest of the file's references to `supabase.from(...)` and `supabase.functions.invoke(...)` still work without renaming.)

Everything from the original "// Verify client exists" comment / business logic onward MUST remain unchanged.

- [ ] **Step 3: Verify the file parses + the gate is gone**

```bash
node --check "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions/api/start-brand-kit.js"
grep -c "callerClient" "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions/api/start-brand-kit.js"
```

Expected: silent success from node, `0` from grep.

- [ ] **Step 4: Commit**

```bash
git -C "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions" add api/start-brand-kit.js
git -C "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions" commit -m "refactor(start-brand-kit): use requireAdmin helper"
```

---

## Task 6: Refactor `api/brand-kit-status/[id].js` to use `requireAdmin`

**Files:**
- Modify: `api/brand-kit-status/[id].js`

- [ ] **Step 1: Read the file**

```bash
cat "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions/api/brand-kit-status/[id].js"
```

It uses the same pattern as `start-brand-kit.js`: a module-level `supabase` const created with the service role key, an inline auth gate, then an admin gate.

- [ ] **Step 2: Apply the refactor**

Replace the module-level imports/client construction + the auth/admin gate (top of the handler, through the `if (callerClient) return ...` line) with:

```javascript
import { requireAdmin } from '../_lib/require-admin'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'method_not_allowed', message: 'GET only' })
  }

  const ctx = await requireAdmin(req, res)
  if (!ctx) return
  const supabase = ctx.adminClient
```

(Note the import path is `'../_lib/require-admin'` because this file is one directory deeper than the others.)

Everything below — the `req.query.id` extraction, the `supabase.from('brand_kits').select(...)` query, and the response — MUST remain unchanged.

- [ ] **Step 3: Verify the file parses + the gate is gone**

```bash
node --check "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions/api/brand-kit-status/[id].js"
grep -c "callerClient" "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions/api/brand-kit-status/[id].js"
```

Expected: silent success, `0`.

- [ ] **Step 4: Confirm no remaining "callerClient" anywhere in api/**

```bash
grep -rn "callerClient" "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions/api/" 2>/dev/null
```

Expected: no output (all 4 routes refactored, the old gate is dead).

- [ ] **Step 5: Commit**

```bash
git -C "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions" add "api/brand-kit-status/[id].js"
git -C "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions" commit -m "refactor(brand-kit-status): use requireAdmin helper"
```

---

## Task 7: Build verify + push + PR + smoke test

- [ ] **Step 1: Run the full build to confirm everything compiles**

```bash
cd "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions" && npm run build 2>&1 | tail -5
```

Expected: `built in X.XXs` with no errors. Chunk-size warnings are pre-existing and OK.

- [ ] **Step 2: Push the branch**

```bash
git -C "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions" push -u origin feat/admin-allowlist
```

- [ ] **Step 3: Open the PR**

```bash
cd "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions" && gh pr create --title "feat(security): replace 'not-in-clients' admin gate with ADMIN_EMAILS allow-list" --body "$(cat <<'EOF'
## Summary
Replace the implicit "any authenticated user with no clients row = admin" heuristic across 4 API routes with an explicit allow-list read from a Vercel env var.

## Files
- **New:** `api/_lib/require-admin.js` — single source of truth for the admin gate. Reads \`process.env.ADMIN_EMAILS\` (comma-separated), verifies bearer token, checks email membership.
- **Refactored:** \`api/create-client.js\`, \`api/convert-lead.js\`, \`api/start-brand-kit.js\`, \`api/brand-kit-status/[id].js\` — all four call \`requireAdmin(req, res)\` instead of inlining the gate.

## Why
The previous heuristic treated any authenticated Supabase user without a clients-table row as admin. With the convert-lead flow shipped in PR #4, every converted lead now lands in clients (good), but any future user-creating path that bypasses the clients insert (newsletter signup, OAuth, manual auth.users insert) would silently grant admin access. Replacing with an explicit allow-list closes this gap and consolidates 4 copies of the gate into 1.

## Configuration
Vercel env var \`ADMIN_EMAILS\` must be set in production, preview, AND development environments BEFORE this PR merges. Initial value: \`info@hazetechsolutions.com\`. (Already done in Task 1 of the plan.)

## Test plan
- [ ] Vercel preview build succeeds
- [ ] Log in to preview /admin/login as info@hazetechsolutions.com → /admin/leads loads → click Convert on any lead → modal works → success
- [ ] curl any admin endpoint with no Authorization header → 401 unauthorized
- [ ] curl any admin endpoint with a valid token whose email is NOT in ADMIN_EMAILS → 403 forbidden
- [ ] Confirm \`grep -rn callerClient api/\` returns nothing (old gate fully removed)

## Rollback
Single revert. The env var can stay in place — unused if the helper is gone.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Wait for Vercel preview to build, then smoke-test**

When the GitHub PR shows the Vercel preview URL in the comments, run through:

1. Open `<preview-url>/admin/login`. Log in as `info@hazetechsolutions.com`.
2. Visit `/admin/leads`. Page should load (this hits no admin API but proves the auth session is alive).
3. Find any lead. Click **Convert**. Fill name + (optional) other fields. Submit. Expect success state — proves `convert-lead` accepts your token.
4. Visit `/admin/clients/<some-id>`. Click the **Brand Kit** tab. If no kit exists, fill the form and submit. Expect "generating…" then success — proves `start-brand-kit` accepts your token.
5. With the brand kit in progress, the polling component is hitting `/api/brand-kit-status/<id>` — if you see the progress message updating in the UI, that route also accepts your token.
6. **Negative test**: open browser DevTools → Application → Local Storage → find the Supabase auth token, copy it. Then in a terminal:

```bash
TOKEN="<paste-the-jwt-here>"
curl -s -X POST "<preview-url>/api/convert-lead" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"lead_id":"00000000-0000-0000-0000-000000000000"}' | head -2
```

Expected: `{"error":"lead_not_found",...}` — your token works, the route accepts it.

7. **Negative test 2**: hit the route with no auth header:

```bash
curl -s -X POST "<preview-url>/api/convert-lead" -H "Content-Type: application/json" -d '{"lead_id":"00000000-0000-0000-0000-000000000000"}'
```

Expected: `{"error":"unauthorized","message":"Missing authorization header"}` — proves the gate is active.

- [ ] **Step 5: Merge once smoke tests pass**

```bash
cd "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions" && gh pr merge --squash --delete-branch
```

(Use the PR number from Step 3 output if needed: `gh pr merge <NUMBER> --squash --delete-branch`.)

- [ ] **Step 6: Sync local main**

```bash
git -C "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions" checkout main && git -C "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions" pull --ff-only
```

If local main has diverged (because the spec/plan commits got rolled into the squash), you may need `git reset --hard origin/main` — only safe if local commits ahead of origin/main are already part of the squash (verify with `git log origin/main..main --oneline`).

- [ ] **Step 7: Production smoke (after Vercel auto-deploys main)**

Repeat Step 4's positive test on www.hazetechsolutions.com itself. Negative test optional — the gate behavior is identical between preview and prod.

---

## Self-review checklist (engineer should verify before declaring done)

- [ ] `ADMIN_EMAILS` env var is set in production, preview, AND development (`vercel env ls | grep ADMIN_EMAILS` shows three rows)
- [ ] `api/_lib/require-admin.js` exists and exports `requireAdmin`
- [ ] All 4 routes import from `./_lib/require-admin` (or `../_lib/require-admin` for the nested route) and call `requireAdmin(req, res)`
- [ ] `grep -rn callerClient api/` returns no matches
- [ ] `npm run build` succeeds
- [ ] Vercel preview smoke test passes (Convert button works, brand-kit tab works)
- [ ] Negative tests confirm 401 (no header) and 403 (non-admin token) — only need to verify ONE of the four routes since they share the helper

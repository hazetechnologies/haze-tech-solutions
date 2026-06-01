# Phase 2 — Slice 5B: Channels (connect-link + connected-platforms) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an HTS operator issue a client a "connect your channels" link that grants a **connect-only** session (can reach the connect page + OAuth routes, nothing else), and show which platforms a client has connected — both from the HTS admin Social Media tab.

**Architecture:** Extend the 5A SSO token with a `purpose` field (`operate` | `connect`). A new `connect-links` external endpoint mints a `purpose=connect` SSO link landing on a new minimal `/connect-channels` page; `middleware.ts` confines `purpose=connect` sessions to that page + `/api/social/connect/*`. A `connected-platforms` external endpoint lists the client's `ConnectedSocialAccount` rows. HTS adds a Channels section that issues the link (copyable) and lists connected platforms via the existing `hsp-proxy`.

**Tech Stack:** Next.js 15 app-router, NextAuth (JWT, `getToken` in middleware), Prisma + Postgres, React.

**Builds on:** Slice 5A (SSO spine — `SsoToken`, `sso-token.ts`, `integrator-sso` provider, `/integrator-sso`). Merged + live in prod.

**Repos & working copies:**
- **haze-social-post** (Tasks 1–7): `C:\Users\wealt\AppData\Local\Temp\haze-social-post`, branched from `master`. `node_modules` current; `npm test`/`npm run build`/`npx tsc --noEmit` work; `.env` has DB + auth secrets.
- **haze-tech-solutions** (Task 8): `C:\Users\wealt\OneDrive\Documents\N8N Workflows\Website Builders\haze-tech-solutions`, branched from `main`.

**CRITICAL deploy gotcha (from 5A):** `prisma db push` from the Claude sandbox **silently no-ops** (sandbox can't reach the Supabase pooler on 5432; only HTTPS works). Schema changes MUST be applied + verified via the **VPS**: `ssh -i ~/.ssh/vps_segula root@srv934577.hstgr.cloud`, using `/root/haze-social-post/.env` DATABASE_URL with `psql`. Adding the `purpose` column is the only schema change and is additive.

**Verification:** vitest for pure `lib/` logic (Task 1); typecheck/build + curl/NextAuth-flow checks for routes/middleware (the 5A pattern). The connect-only restriction is verifiable end-to-end via curl by establishing a `purpose=connect` session (NextAuth callback) and asserting blocked vs allowed paths.

---

## File Structure

**haze-social-post:**
- Modify `prisma/schema.prisma` — add `purpose String @default("operate")` to `SsoToken`.
- Modify `lib/external-api/sso-token.ts` — `mintSsoToken` gains a `purpose` arg; payload carries it; `verifySsoToken` returns it. (+ test updates)
- Modify `lib/auth.ts` — `integrator-sso` provider returns `purpose`; jwt callback persists `token.purpose`.
- Create `app/api/v1/external/tenants/[id]/connect-links/route.ts` — mint a `purpose=connect` link.
- Create `app/api/v1/external/tenants/[id]/connected-platforms/route.ts` — list connections.
- Modify `middleware.ts` — confine `purpose=connect` tokens to `/connect-channels` + `/api/social/connect/*`.
- Create `app/connect-channels/page.tsx` + `app/connect-channels/connect-buttons.tsx` — minimal client connect page.

**haze-tech-solutions:**
- Modify `src/pages/admin/components/ClientSocialMediaTab.jsx` — Channels section (connected list + issue-link button).

---

## Task 1: Add `purpose` to the SSO token (model + helper, TDD)

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `lib/external-api/sso-token.ts`, `lib/external-api/sso-token.test.ts`

- [ ] **Step 1: Add the `purpose` column**

In `prisma/schema.prisma`, in the `SsoToken` model, add after `next`:
```prisma
  // 'operate' = full operate-as session (5A); 'connect' = restricted to the
  // channel-connect flow (5B). Drives the middleware route gate.
  purpose       String    @default("operate")
```

- [ ] **Step 2: Update the failing test first**

In `lib/external-api/sso-token.test.ts`, change the first test and add a purpose test:
```typescript
  it('mints a token that verifies with the same payload (default purpose=operate)', () => {
    const { token, expMs } = mintSsoToken('u1', 'i1', NOW)
    expect(expMs).toBe(NOW + 5 * 60 * 1000)
    const payload = verifySsoToken(token, NOW)
    expect(payload).not.toBeNull()
    expect(payload!.uid).toBe('u1')
    expect(payload!.iid).toBe('i1')
    expect(payload!.purpose).toBe('operate')
  })

  it('carries an explicit connect purpose', () => {
    const { token } = mintSsoToken('u1', 'i1', NOW, 'connect')
    expect(verifySsoToken(token, NOW)!.purpose).toBe('connect')
  })
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test -- sso-token`
Expected: FAIL — `purpose` is undefined / `mintSsoToken` takes 3 args.

- [ ] **Step 4: Update the helper**

In `lib/external-api/sso-token.ts`:
- Add `purpose` to the interface:
```typescript
export interface SsoPayload {
  uid: string
  iid: string
  exp: number
  nonce: string
  purpose: 'operate' | 'connect'
}
```
- Change `mintSsoToken` signature + payload:
```typescript
export function mintSsoToken(uid: string, iid: string, nowMs: number, purpose: 'operate' | 'connect' = 'operate'): { token: string; expMs: number } {
  if (!getSecret()) throw new Error('INTEGRATOR_SSO_SECRET/NEXTAUTH_SECRET not configured')
  const exp = nowMs + TTL_MS
  const nonce = crypto.randomBytes(18).toString('hex')
  const payload: SsoPayload = { uid, iid, exp, nonce, purpose }
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload)))
  const token = `${payloadB64}.${sign(payloadB64)}`
  return { token, expMs: exp }
}
```
- In `verifySsoToken`, after the existing string-type guards, add a purpose guard and normalize:
```typescript
    if (payload.purpose !== 'operate' && payload.purpose !== 'connect') return null
```
(Keep the existing `uid`/`iid`/`nonce` string checks and the `exp` check.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- sso-token`
Expected: PASS — all tests green including the two updated/added.

- [ ] **Step 6: Apply the schema to prod via VPS (NOT local db push)**

The `purpose` column must exist before the provider reads it. Apply via VPS psql:
```bash
ssh -i ~/.ssh/vps_segula root@srv934577.hstgr.cloud 'cd /root/haze-social-post; DBURL=$(grep -oE "^DATABASE_URL=.*" .env | head -1 | sed -E "s/^DATABASE_URL=//; s/^\"//; s/\"$//"); psql "$DBURL" -c "ALTER TABLE \"SsoToken\" ADD COLUMN IF NOT EXISTS \"purpose\" TEXT NOT NULL DEFAULT '"'"'operate'"'"';"; psql "$DBURL" -c "\d \"SsoToken\"" | grep purpose'
```
Expected: `ALTER TABLE` (or no-op) and the `\d` output shows `purpose | text | not null | 'operate'::text`.

- [ ] **Step 7: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.
```bash
git add prisma/schema.prisma lib/external-api/sso-token.ts lib/external-api/sso-token.test.ts
git commit -m "feat(sso): add purpose (operate|connect) to SSO token + model"
```

---

## Task 2: Provider + JWT carry `purpose`

**Files:**
- Modify: `lib/auth.ts` (the `integrator-sso` provider authorize + the `jwt` callback)

- [ ] **Step 1: Return `purpose` from the provider**

In `lib/auth.ts`, in the `integrator-sso` provider's `authorize`, the success `return { ... } as any` object currently returns id/name/email/image/role/plan. Add `purpose` sourced from the verified payload:
```typescript
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
          plan: user.plan,
          ssoPurpose: payload.purpose,
        } as any;
```
(`payload` is the result of `verifySsoToken` already in scope.)

- [ ] **Step 2: Persist `purpose` on the JWT**

In the `jwt` callback, in the `if (user) { ... }` block (where `token.id`, `token.role`, `token.plan` are set), add:
```typescript
        token.purpose = (user as any).ssoPurpose ?? "operate";
```
This makes `token.purpose` readable by `getToken` in middleware. Password/Google sign-ins never set `ssoPurpose`, so they default to `"operate"` (unrestricted) — correct.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add lib/auth.ts
git commit -m "feat(sso): thread connect purpose into the JWT for middleware gating"
```

---

## Task 3: connect-links endpoint

**Files:**
- Create: `app/api/v1/external/tenants/[id]/connect-links/route.ts`

- [ ] **Step 1: Write the route**

```typescript
// POST /api/v1/external/tenants/[id]/connect-links
// Mint a single-use, connect-ONLY SSO link for the client to authorize their
// own social accounts. The session it creates is confined by middleware to
// /connect-channels + /api/social/connect/* (see middleware.ts).
import { prisma } from '@/lib/prisma'
import { makeExternalHandler } from '@/lib/external-api/handler'
import { requireScope } from '@/lib/external-api/auth'
import { loadTenantInScope } from '@/lib/external-api/scope'
import { ExternalApiError } from '@/lib/external-api/errors'
import { mintSsoToken, sha256 } from '@/lib/external-api/sso-token'

function baseUrl(): string {
  return process.env.NEXTAUTH_URL || 'https://hazesocialpost.com'
}

export const POST = makeExternalHandler<{ id: string }>('default', async ({ auth, params }) => {
  requireScope(auth, 'tenants:write')
  const user = await loadTenantInScope(auth.integrator, params.id)
  if (user.disabledAt) throw new ExternalApiError(403, 'tenant_disabled', 'tenant is disabled')

  const now = Date.now()
  const { token, expMs } = mintSsoToken(user.id, auth.integrator.id, now, 'connect')
  await prisma.ssoToken.create({
    data: {
      token_hash: sha256(token),
      user_id: user.id,
      integrator_id: auth.integrator.id,
      next: '/connect-channels',
      purpose: 'connect',
      expires_at: new Date(expMs),
    },
  })
  const url = `${baseUrl()}/integrator-sso?token=${encodeURIComponent(token)}`
  return Response.json({ url, expires_at: new Date(expMs).toISOString() })
})
```

- [ ] **Step 2: Typecheck + build**

Run: `npm run build`
Expected: succeeds; lists `ƒ /api/v1/external/tenants/[id]/connect-links`.

- [ ] **Step 3: Commit**

```bash
git add app/api/v1/external/tenants/[id]/connect-links/route.ts
git commit -m "feat(channels): POST /tenants/:id/connect-links mints connect-only link"
```

---

## Task 4: connected-platforms endpoint

**Files:**
- Create: `app/api/v1/external/tenants/[id]/connected-platforms/route.ts`

- [ ] **Step 1: Write the route**

```typescript
// GET /api/v1/external/tenants/[id]/connected-platforms
// List the social accounts a sub-tenant has connected.
import { prisma } from '@/lib/prisma'
import { makeExternalHandler } from '@/lib/external-api/handler'
import { requireScope } from '@/lib/external-api/auth'
import { loadTenantInScope } from '@/lib/external-api/scope'

export const GET = makeExternalHandler<{ id: string }>('poll', async ({ auth, params }) => {
  requireScope(auth, 'tenants:read')
  const user = await loadTenantInScope(auth.integrator, params.id)
  const accounts = await prisma.connectedSocialAccount.findMany({
    where: { userId: user.id },
    select: { platform: true, handle: true, displayName: true, profileImage: true, enabled: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  return Response.json({
    platforms: accounts.map((a) => ({
      platform: a.platform,
      handle: a.handle,
      display_name: a.displayName,
      profile_image: a.profileImage,
      enabled: a.enabled,
      connected_at: a.createdAt.toISOString(),
    })),
  })
})
```

- [ ] **Step 2: Typecheck + build**

Run: `npm run build`
Expected: succeeds; lists `ƒ /api/v1/external/tenants/[id]/connected-platforms`.

- [ ] **Step 3: Commit**

```bash
git add app/api/v1/external/tenants/[id]/connected-platforms/route.ts
git commit -m "feat(channels): GET /tenants/:id/connected-platforms"
```

---

## Task 5: Middleware confines connect-only sessions

**Files:**
- Modify: `middleware.ts`

- [ ] **Step 1: Add `/connect-channels` to protected routes + the connect-purpose gate**

In `middleware.ts`, in the `isCustomerProtected` expression, add `/connect-channels`:
```typescript
  const isCustomerProtected =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/create") ||
    pathname.startsWith("/haze-creator") ||
    pathname.startsWith("/library") ||
    pathname.startsWith("/connect-channels");
```

Then, immediately AFTER the `if (isCustomerProtected && !token) { ... }` redirect block (so the user is known-authenticated), add the connect-purpose confinement:
```typescript
  // Connect-only sessions (issued via connect-links) may reach ONLY the
  // channel-connect page and the OAuth connect routes. Everything else (the
  // dashboard, content tools, settings) is off-limits — they're handed to the
  // CLIENT, not the operator.
  if (token && (token as any).purpose === "connect") {
    const allowed =
      pathname === "/connect-channels" ||
      pathname.startsWith("/connect-channels/") ||
      pathname.startsWith("/api/social/connect/") ||
      pathname.startsWith("/api/auth/");
    if (!allowed && isCustomerProtected) {
      return NextResponse.redirect(new URL("/connect-channels", req.url));
    }
  }
```

NOTE on the matcher: confirm `middleware.ts`'s exported `config.matcher` already covers `/connect-channels` and the customer routes (it gates `/dashboard` etc., so the matcher is broad). If `/connect-channels` is not matched, add it to the matcher array. Check the `export const config = { matcher: [...] }` at the bottom of the file and ensure `/connect-channels/:path*` is included; add it if missing.

- [ ] **Step 2: Typecheck + build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat(channels): confine connect-purpose sessions to the connect flow"
```

---

## Task 6: The `/connect-channels` client page

**Files:**
- Create: `app/connect-channels/page.tsx`
- Create: `app/connect-channels/connect-buttons.tsx`

- [ ] **Step 1: Write the connect-buttons client component**

```tsx
// app/connect-channels/connect-buttons.tsx
"use client";
// Each button is a plain link to the existing OAuth initiation route, which
// reads the (connect-purpose) session to know which sub-tenant is connecting.
const PLATFORMS: { key: string; label: string; href: string }[] = [
  { key: "meta", label: "Instagram & Facebook", href: "/api/social/connect/meta" },
  { key: "youtube", label: "YouTube", href: "/api/social/connect/youtube" },
  { key: "tiktok", label: "TikTok", href: "/api/social/connect/tiktok" },
  { key: "twitter", label: "X (Twitter)", href: "/api/social/connect/twitter" },
  { key: "linkedin", label: "LinkedIn", href: "/api/social/connect/linkedin" },
  { key: "pinterest", label: "Pinterest", href: "/api/social/connect/pinterest" },
];

export default function ConnectButtons() {
  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 420, margin: "0 auto" }}>
      {PLATFORMS.map((p) => (
        <a
          key={p.key}
          href={p.href}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 18px", borderRadius: 12, border: "1px solid #e2e8f0",
            background: "#fff", color: "#0f172a", fontWeight: 600, fontSize: 15,
            textDecoration: "none",
          }}
        >
          <span>{p.label}</span>
          <span style={{ color: "#0099CC", fontWeight: 700 }}>Connect →</span>
        </a>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Write the page (gated to a logged-in session)**

```tsx
// app/connect-channels/page.tsx
// Minimal client-facing page for authorizing social accounts. Reachable only
// with a session (middleware enforces); connect-purpose sessions are confined
// here. The OAuth routes redirect back to /dashboard on success, which the
// middleware bounces back to /connect-channels for connect-purpose sessions.
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import ConnectButtons from "./connect-buttons";

export const dynamic = "force-dynamic";

export default async function ConnectChannelsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const name = (session.user as any).name || "your brand";
  return (
    <main style={{ minHeight: "100vh", background: "#f8fafc", padding: "48px 20px", fontFamily: "system-ui" }}>
      <div style={{ maxWidth: 520, margin: "0 auto", textAlign: "center" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>
          Connect your social channels
        </h1>
        <p style={{ color: "#475569", fontSize: 15, marginBottom: 28 }}>
          Link the accounts for <strong>{name}</strong>. You can connect more than one — each opens a
          secure authorization window with that platform.
        </p>
        <ConnectButtons />
        <p style={{ color: "#94a3b8", fontSize: 12, marginTop: 24 }}>
          You're only granting permission to post on your behalf. You can disconnect anytime.
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds; lists `ƒ /connect-channels`.

- [ ] **Step 4: Commit**

```bash
git add app/connect-channels/page.tsx app/connect-channels/connect-buttons.tsx
git commit -m "feat(channels): minimal /connect-channels client page"
```

---

## Task 7: Deploy haze-social-post + verify connect-only confinement

**Files:** none (deploy + verify)

- [ ] **Step 1: PR, green preview + codex, merge**

```bash
git push -u origin phase2-5b-channels
gh pr create -R hazetechnologies/haze-social-post --title "Phase 2 5B: Channels (connect-only links + connected-platforms)" --body "connect-links + connected-platforms endpoints, purpose=connect SSO token, middleware confinement, /connect-channels page. Builds on 5A. Plan: docs plan 2026-06-01-phase2-5b-channels (HTS repo)."
```
Wait for `Vercel`=SUCCESS and `codex/adversarial` resolved (address findings if any), then `gh pr merge --squash --delete-branch`. The `purpose` column was already added in Task 1 Step 6, so prod is schema-ready.

- [ ] **Step 2: Verify endpoints live + connect-only confinement (curl, against prod)**

```bash
KEY="<HSP_EXTERNAL_API_KEY from HTS admin_settings>"; BASE="https://hazesocialpost.com"
TID=$(curl -sS -X POST "$BASE/api/v1/external/tenants" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"name":"ch-probe","contact_email":"ch-probe@hazetechsolutions.com","hts_client_id":"ch"}' | grep -oE '"id":"[^"]+"' | head -1 | sed -E 's/"id":"([^"]+)"/\1/')
# connected-platforms (expect empty list, HTTP 200)
curl -sS -w "\n[platforms %{http_code}]\n" "$BASE/api/v1/external/tenants/$TID/connected-platforms" -H "Authorization: Bearer $KEY"
# mint a connect link
TOKEN=$(curl -sS -X POST "$BASE/api/v1/external/tenants/$TID/connect-links" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" | python -c "import sys,json,urllib.parse as u; print(u.parse_qs(u.urlparse(json.load(sys.stdin)['url']).query)['token'][0])")
# establish the connect-purpose session via NextAuth
JAR=$(mktemp); CSRF=$(curl -sS -c "$JAR" "$BASE/api/auth/csrf" | python -c "import sys,json;print(json.load(sys.stdin)['csrfToken'])")
curl -sS -b "$JAR" -c "$JAR" -o /dev/null -w "[consume %{http_code}]\n" -X POST "$BASE/api/auth/callback/integrator-sso" -H "Content-Type: application/x-www-form-urlencoded" --data-urlencode "csrfToken=$CSRF" --data-urlencode "token=$TOKEN" --data-urlencode "json=true"
# ALLOWED: /connect-channels should be 200
curl -sS -b "$JAR" -o /dev/null -w "[/connect-channels %{http_code} expect 200]\n" "$BASE/connect-channels"
# BLOCKED: /dashboard should 307/302 redirect to /connect-channels
curl -sS -b "$JAR" -o /dev/null -w "[/dashboard %{http_code} expect 30x]\n" "$BASE/dashboard"
curl -sS -o /dev/null -w "[archive %{http_code}]\n" -X DELETE "$BASE/api/v1/external/tenants/$TID" -H "Authorization: Bearer $KEY"; rm -f "$JAR"
```
Expected: platforms `{"platforms":[]}` 200; consume 200; `/connect-channels` 200; `/dashboard` a 30x redirect (confinement working).

---

## Task 8: HTS Channels section

**Files:**
- Modify: `src/pages/admin/components/ClientSocialMediaTab.jsx` (add a Channels block inside the `activated` section, below the buttons row)

- [ ] **Step 1: Add channels state + loaders**

Near the top of the component (with the other `useState` calls), add:
```jsx
  const [platforms, setPlatforms] = useState(null)
  const [connectLink, setConnectLink] = useState(null)
  const [copied, setCopied] = useState(false)
```

Add a proxy helper + two actions inside the component:
```jsx
  const hspProxy = async (path, method = 'GET', body) => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/website?action=hsp-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify({ path, method, body }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || data.error || `Server error (${res.status})`)
    return data
  }

  const loadPlatforms = async () => {
    try { const d = await hspProxy(`/tenants/${client.hsp_user_id}/connected-platforms`); setPlatforms(d.platforms || []) }
    catch (err) { setError(err.message) }
  }

  const issueConnectLink = async () => {
    setBusy(true); setError(null); setConnectLink(null); setCopied(false)
    try { const d = await hspProxy(`/tenants/${client.hsp_user_id}/connect-links`, 'POST', {}); setConnectLink(d.url) }
    catch (err) { setError(err.message || 'Could not issue link') }
    finally { setBusy(false) }
  }
```

- [ ] **Step 2: Load platforms when activated**

Add a `useEffect` (import `useEffect` from React at the top alongside `useState`):
```jsx
  useEffect(() => { if (activated) loadPlatforms() }, [activated, client?.hsp_user_id])
```

- [ ] **Step 3: Render the Channels block**

Inside the `{activated && (...)}` block, AFTER the buttons row `</div>` (and before the closing of the activated block), add:
```jsx
          <div style={{ marginTop: 18, borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 16 }}>
            <div style={{ color: '#F1F5F9', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Channels</div>
            {platforms === null && <div style={{ color: '#64748B', fontSize: 12 }}>Loading…</div>}
            {platforms && platforms.length === 0 && (
              <div style={{ color: '#94A3B8', fontSize: 13, marginBottom: 12 }}>No channels connected yet. Send the client a connect link below.</div>
            )}
            {platforms && platforms.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {platforms.map((p, i) => (
                  <span key={i} style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#86EFAC', borderRadius: 999, padding: '4px 12px', fontSize: 12 }}>
                    {p.platform}{p.handle ? ` · @${p.handle}` : ''}
                  </span>
                ))}
              </div>
            )}
            <button onClick={issueConnectLink} disabled={busy} style={{
              background: 'transparent', border: '1px solid rgba(0,212,255,0.4)', color: '#7DD3FC',
              borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: busy ? 'not-allowed' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit',
            }}>
              <Share2 size={13} /> {busy ? 'Issuing…' : 'Issue connect link for client'}
            </button>
            {connectLink && (
              <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                <input readOnly value={connectLink} onFocus={(e) => e.target.select()} style={{
                  flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 6, padding: '6px 10px', color: '#CBD5E1', fontSize: 11, fontFamily: 'ui-monospace, monospace',
                }} />
                <button onClick={() => { navigator.clipboard.writeText(connectLink); setCopied(true) }} style={{
                  background: '#00D4FF', color: '#020817', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}>{copied ? 'Copied' : 'Copy'}</button>
              </div>
            )}
            {connectLink && <div style={{ color: '#64748B', fontSize: 11, marginTop: 6 }}>Send this to the client — it expires in 5 minutes and only lets them connect their channels.</div>}
          </div>
```

- [ ] **Step 4: Lint + commit**

Run: `npm run lint 2>&1 | tail -20` (confirm no NEW errors mention ClientSocialMediaTab.jsx).
```bash
git add src/pages/admin/components/ClientSocialMediaTab.jsx
git commit -m "feat(social): Channels section — connected list + issue connect link"
```

- [ ] **Step 5: PR, green, merge**

```bash
git push -u origin hts-5b-channels
gh pr create -R hazetechnologies/haze-tech-solutions --title "Phase 2 5B: Channels section" --body "Connected-platforms list + issue-connect-link button on the client Social Media tab. Pairs with haze-social-post 5B."
```
Wait for Vercel SUCCESS + codex; squash-merge.

---

## Self-Review (completed)

- **Spec coverage:** 5B spec items — `POST /tenants/:id/connect-links` (Task 3), `GET /tenants/:id/connected-platforms` (Task 4), connect-link "restricted to OAuth-flow endpoints" (the connect-only purpose: Tasks 1/2/5), Channels UI (Task 8). The 5-min single-use TTL is inherited from the 5A token. The `return_url` open question is resolved by landing on `/connect-channels` and letting middleware bounce post-OAuth `/dashboard` redirects back — documented in Task 6.
- **Placeholder scan:** none — full code in every step; `<HSP_EXTERNAL_API_KEY>` is a deploy-time secret.
- **Type consistency:** `purpose: 'operate' | 'connect'` consistent across `SsoPayload` (Task 1), `mintSsoToken` 4th arg (Tasks 1/3), provider `ssoPurpose` → `token.purpose` (Task 2) → middleware `(token as any).purpose === "connect"` (Task 5). `mintSsoToken(uid,iid,now,'connect')` call in Task 3 matches the Task 1 signature. SsoToken `purpose` column (Task 1) matches the `purpose: 'connect'` write in Task 3.
- **Gotcha guarded:** schema change applied via VPS (Task 1 Step 6), not local db push — the 5A failure mode.

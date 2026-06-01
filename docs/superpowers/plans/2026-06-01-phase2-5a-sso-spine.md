# Phase 2 — Slice 5A: SSO Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an HTS operator click "Open Social Workspace" on an activated client and land, authenticated, in the real haze-social-post UI as that client's sub-tenant — via a single-use, 5-minute, HMAC-signed SSO link.

**Architecture:** A new external endpoint mints a single-use token (persisted as an `SsoToken` nonce row, HMAC-signed). The operator's browser opens a haze-social-post landing page that calls NextAuth `signIn` with a new token-validating `integrator-sso` Credentials provider; that provider verifies + consumes the token and starts a JWT session as the sub-tenant `User`. Sub-tenants are marked `onboardedAt` at create time so SSO lands on `/dashboard`, not the onboarding wizard. HTS surfaces the button, fetching a fresh link per click through the existing admin-only `hsp-proxy`.

**Tech Stack:** Next.js 15 app-router, NextAuth (JWT strategy), Prisma + Postgres, Node `crypto` HMAC, React (HTS admin is Vite/React via `api/website.js` proxy).

**Repos & working copies:**
- **haze-social-post** (Tasks 1–7): clone fresh — `git clone https://github.com/hazetechnologies/haze-social-post` into `C:\repos\haze-social-post` (the OneDrive copy's `.git` is corrupted; do NOT use it for commits). Deploys to Vercel (web) on push to `main` via PR.
- **haze-tech-solutions** (Tasks 8–9): `C:\Users\wealt\OneDrive\Documents\N8N Workflows\Website Builders\haze-tech-solutions` (git works here; PRs #38/#39 merged from it).

**Verification approach:** The app now has **vitest** wired for `lib/**/*.test.ts` (`npm test` → `vitest run`, config at `vitest.config.ts`, `environment: node`). Pure `lib/` modules get real TDD unit tests (Task 2's HMAC helper). App-router routes, the NextAuth provider, and the landing page aren't unit-testable without a harness the repo doesn't have, so those follow the Phase 1 pattern: typecheck/lint/build + curl or browser check with expected output, then commit. Schema changes use `prisma db push` (the repo has no migration files; `db:push` script exists). Run `npm install` first — vitest and other post-Phase-1 deps may not be in `node_modules` yet.

**Secrets:**
- haze-social-post needs a new env var `INTEGRATOR_SSO_SECRET` (HMAC key). Generate once: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Add to Vercel (Production + Preview) and to the local `.env`. If unset, the mint helper falls back to `NEXTAUTH_SECRET` so dev never crashes.
- HTS already has `HSP_EXTERNAL_API_KEY` in `admin_settings`. No new HTS secret.

---

## File Structure

**haze-social-post:**
- Create `lib/external-api/sso-token.ts` — mint + verify HMAC tokens (pure, no DB). One responsibility: token crypto.
- Create `app/api/v1/external/tenants/[id]/sso-link/route.ts` — POST endpoint: mint token, persist nonce, return URL.
- Create `app/integrator-sso/page.tsx` — server component reading `?token&next`, renders the auto-signin client component.
- Create `app/integrator-sso/auto-signin.tsx` — client component that calls `signIn('integrator-sso', …)`.
- Modify `prisma/schema.prisma` — add `SsoToken` model + `User.ssoTokens` back-relation.
- Modify `lib/auth.ts` — add the `integrator-sso` CredentialsProvider.
- Modify `app/api/v1/external/tenants/route.ts` — set `onboardedAt` at sub-tenant create.
- Create `scripts/backfill-integrator-onboarded.ts` — one-shot backfill for already-created sub-tenants.

**haze-tech-solutions:**
- Modify `src/pages/admin/components/ClientSocialMediaTab.jsx` — add "Open Social Workspace" button.

---

## Task 1: SsoToken model + onboarding backfill schema

**Files:**
- Modify: `prisma/schema.prisma` (User model back-relation + new SsoToken model)

- [ ] **Step 1: Add the `SsoToken` model and back-relation**

In `prisma/schema.prisma`, add `ssoTokens SsoToken[]` to the `User` model's relation list (near `contentPlans`, `mediaAssets`):

```prisma
  ssoTokens          SsoToken[]
```

Then add this model after the `ExternalApiKey` model:

```prisma
// One-time SSO nonce minted by POST /tenants/:id/sso-link. The plaintext token
// is HMAC-signed (so we can reject forgeries without a DB hit) AND row-tracked
// here (so it can be single-use + expiring). consumed_at flips on first use.
model SsoToken {
  id            String    @id @default(cuid())
  // sha256 of the plaintext token; plaintext is never stored.
  token_hash    String    @unique
  user_id       String
  integrator_id String
  // Same-origin path to redirect to after sign-in (e.g. "/dashboard").
  next          String    @default("/dashboard")
  expires_at    DateTime
  consumed_at   DateTime?
  createdAt     DateTime  @default(now())
  user          User      @relation(fields: [user_id], references: [id], onDelete: Cascade)

  @@index([user_id])
  @@index([expires_at])
}
```

- [ ] **Step 2: Push the schema to the dev database**

Run: `npx prisma db push`
Expected: `Your database is now in sync with your Prisma schema.` and `✔ Generated Prisma Client`.

- [ ] **Step 3: Verify the client typings exist**

Run: `node -e "const {PrismaClient}=require('@prisma/client'); const p=new PrismaClient(); console.log(typeof p.ssoToken.create)"`
Expected: `function`

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(sso): add SsoToken nonce model for integrator SSO links"
```

---

## Task 2: HMAC token mint + verify helper (TDD)

**Files:**
- Create: `lib/external-api/sso-token.test.ts` (vitest — matches `lib/**/*.test.ts`)
- Create: `lib/external-api/sso-token.ts`

- [ ] **Step 1: Write the failing test first**

```typescript
// lib/external-api/sso-token.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { mintSsoToken, verifySsoToken, sha256 } from './sso-token'

beforeAll(() => { process.env.INTEGRATOR_SSO_SECRET = 'test-secret-for-vitest' })
const NOW = 1_700_000_000_000

describe('sso-token', () => {
  it('mints a token that verifies with the same payload', () => {
    const { token, expMs } = mintSsoToken('u1', 'i1', NOW)
    expect(expMs).toBe(NOW + 5 * 60 * 1000)
    const payload = verifySsoToken(token, NOW)
    expect(payload).not.toBeNull()
    expect(payload!.uid).toBe('u1')
    expect(payload!.iid).toBe('i1')
  })

  it('rejects an expired token', () => {
    const { token } = mintSsoToken('u1', 'i1', NOW)
    expect(verifySsoToken(token, NOW + 6 * 60 * 1000)).toBeNull()
  })

  it('rejects a tampered token', () => {
    const { token } = mintSsoToken('u1', 'i1', NOW)
    expect(verifySsoToken(token.slice(0, -2) + '00', NOW)).toBeNull()
  })

  it('rejects a malformed token', () => {
    expect(verifySsoToken('not-a-token', NOW)).toBeNull()
  })

  it('sha256 is stable and hex', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('two mints of the same uid produce different tokens (nonce)', () => {
    const a = mintSsoToken('u1', 'i1', NOW).token
    const b = mintSsoToken('u1', 'i1', NOW).token
    expect(a).not.toBe(b)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails (module not yet created)**

Run: `npm test -- sso-token`
Expected: FAIL — `Cannot find module './sso-token'` (or similar resolution error).

- [ ] **Step 3: Write the helper**

```typescript
// lib/external-api/sso-token.ts
//
// SSO token crypto. A token is `<payloadB64>.<hmacHex>` where payload is
// { uid, iid, exp, nonce }. HMAC lets us reject forgeries before any DB hit;
// the DB nonce row (SsoToken) enforces single-use + expiry. Pure module —
// no DB, no Prisma — so it's trivially correct and reusable.
import * as crypto from 'node:crypto'

const SECRET = process.env.INTEGRATOR_SSO_SECRET || process.env.NEXTAUTH_SECRET || ''
const TTL_MS = 5 * 60 * 1000

export interface SsoPayload {
  uid: string   // sub-tenant User id
  iid: string   // integrator id
  exp: number   // epoch ms
  nonce: string // random; also the DB lookup key (we store sha256 of full token)
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function sign(payloadB64: string): string {
  return crypto.createHmac('sha256', SECRET).update(payloadB64).digest('hex')
}

export function sha256(plaintext: string): string {
  return crypto.createHash('sha256').update(plaintext).digest('hex')
}

// nowMs is injectable so the verify path (which can't use Date.now in some
// runtimes) and tests stay deterministic; callers pass Date.now().
export function mintSsoToken(uid: string, iid: string, nowMs: number): { token: string; expMs: number } {
  if (!SECRET) throw new Error('INTEGRATOR_SSO_SECRET/NEXTAUTH_SECRET not configured')
  const exp = nowMs + TTL_MS
  const nonce = crypto.randomBytes(18).toString('hex')
  const payload: SsoPayload = { uid, iid, exp, nonce }
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload)))
  const token = `${payloadB64}.${sign(payloadB64)}`
  return { token, expMs: exp }
}

// Returns the decoded payload if the HMAC is valid AND not expired. Does NOT
// check the DB nonce — the caller does that to enforce single-use.
export function verifySsoToken(token: string, nowMs: number): SsoPayload | null {
  if (!SECRET) return null
  const dot = token.lastIndexOf('.')
  if (dot < 0) return null
  const payloadB64 = token.slice(0, dot)
  const mac = token.slice(dot + 1)
  const expected = sign(payloadB64)
  // constant-time compare; lengths must match first or timingSafeEqual throws.
  if (mac.length !== expected.length) return null
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null
  let payload: SsoPayload
  try {
    payload = JSON.parse(Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString())
  } catch {
    return null
  }
  if (typeof payload.exp !== 'number' || payload.exp < nowMs) return null
  return payload
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- sso-token`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors referencing `lib/external-api/sso-token.ts`.

- [ ] **Step 6: Commit**

```bash
git add lib/external-api/sso-token.ts lib/external-api/sso-token.test.ts
git commit -m "feat(sso): HMAC mint/verify helper for integrator SSO tokens"
```

---

## Task 3: POST /tenants/:id/sso-link endpoint

**Files:**
- Create: `app/api/v1/external/tenants/[id]/sso-link/route.ts`

- [ ] **Step 1: Write the route**

```typescript
// POST /api/v1/external/tenants/[id]/sso-link
// Mint a single-use SSO link that logs the caller into haze-social-post as the
// sub-tenant. Body (optional): { next?: string } — same-origin path to land on.
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { makeExternalHandler } from '@/lib/external-api/handler'
import { requireScope } from '@/lib/external-api/auth'
import { loadTenantInScope } from '@/lib/external-api/scope'
import { ExternalApiError } from '@/lib/external-api/errors'
import { mintSsoToken, sha256 } from '@/lib/external-api/sso-token'

// Allowlist of same-origin paths the SSO redirect may target. Prevents the
// `next` param from becoming an open redirect.
const ALLOWED_NEXT = ['/dashboard', '/haze-creator', '/create', '/calendar', '/settings']

const Body = z.object({ next: z.string().optional() })

function baseUrl(): string {
  return process.env.NEXTAUTH_URL || 'https://hazesocialpost.com'
}

export const POST = makeExternalHandler<{ id: string }>('default', async ({ auth, params, json }) => {
  requireScope(auth, 'tenants:write')
  const user = await loadTenantInScope(auth.integrator, params.id)
  if (user.disabledAt) throw new ExternalApiError(403, 'tenant_disabled', 'tenant is disabled')

  const parsed = Body.safeParse(await json().catch(() => ({})))
  if (!parsed.success) throw new ExternalApiError(400, 'invalid_body', parsed.error.message)
  let next = parsed.data.next || '/dashboard'
  if (!next.startsWith('/') || !ALLOWED_NEXT.some((p) => next === p || next.startsWith(p + '/'))) {
    next = '/dashboard'
  }

  const now = Date.now()
  const { token, expMs } = mintSsoToken(user.id, auth.integrator.id, now)
  await prisma.ssoToken.create({
    data: {
      token_hash: sha256(token),
      user_id: user.id,
      integrator_id: auth.integrator.id,
      next,
      expires_at: new Date(expMs),
    },
  })

  const url = `${baseUrl()}/integrator-sso?token=${encodeURIComponent(token)}`
  return Response.json({ url, expires_at: new Date(expMs).toISOString() })
})
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build to confirm the route is valid (catches app-router export mistakes tsc misses)**

Run: `npm run build`
Expected: build succeeds; output lists `ƒ /api/v1/external/tenants/[id]/sso-link`.

- [ ] **Step 4: Commit**

```bash
git add app/api/v1/external/tenants/[id]/sso-link/route.ts
git commit -m "feat(sso): POST /tenants/:id/sso-link mints single-use SSO link"
```

---

## Task 4: integrator-sso NextAuth provider

**Files:**
- Modify: `lib/auth.ts` (add a provider to the `providers` array; line ~16 is where Credentials starts)

- [ ] **Step 1: Add imports + the provider**

At the top of `lib/auth.ts`, alongside the existing imports, add:

```typescript
import { verifySsoToken, sha256 } from "./external-api/sso-token";
```

Inside `providers: [ ... ]`, after the existing `CredentialsProvider({...})` block, add a second provider:

```typescript
    CredentialsProvider({
      id: "integrator-sso",
      name: "Integrator SSO",
      credentials: { token: { label: "Token", type: "text" } },
      async authorize(credentials) {
        const token = credentials?.token;
        if (!token) return null;
        const payload = verifySsoToken(token, Date.now());
        if (!payload) return null;
        // Single-use + ownership enforced via the DB nonce row.
        const row = await prisma.ssoToken.findUnique({ where: { token_hash: sha256(token) } });
        if (!row || row.consumed_at) return null;
        if (row.user_id !== payload.uid || row.integrator_id !== payload.iid) return null;
        if (row.expires_at.getTime() < Date.now()) return null;
        const user = await prisma.user.findUnique({ where: { id: payload.uid } });
        if (!user || user.disabledAt) return null;
        if (user.integrator_id !== payload.iid) return null;
        // Consume the nonce — atomically guard against double-spend by gating
        // the update on consumed_at still being null.
        const consumed = await prisma.ssoToken.updateMany({
          where: { id: row.id, consumed_at: null },
          data: { consumed_at: new Date() },
        });
        if (consumed.count !== 1) return null;
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
          plan: user.plan,
        } as any;
      },
    }),
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Confirm the provider is registered**

Run: `npx tsx -e "import { authOptions } from './lib/auth'; console.log(authOptions.providers.map(p => (p as any).id))"`
Expected: array includes `"credentials"` and `"integrator-sso"` (and `"google"`).

- [ ] **Step 4: Commit**

```bash
git add lib/auth.ts
git commit -m "feat(sso): integrator-sso provider validates+consumes one-time token"
```

---

## Task 5: SSO landing page

**Files:**
- Create: `app/integrator-sso/page.tsx`
- Create: `app/integrator-sso/auto-signin.tsx`

- [ ] **Step 1: Write the client auto-signin component**

```tsx
// app/integrator-sso/auto-signin.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";

export default function AutoSignin({ token, next }: { token: string; next: string }) {
  const fired = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    signIn("integrator-sso", { token, redirect: false }).then((res) => {
      if (res?.ok && !res.error) {
        window.location.href = next;
      } else {
        setFailed(true);
      }
    });
  }, [token, next]);

  return (
    <div style={{ display: "flex", minHeight: "60vh", alignItems: "center", justifyContent: "center", color: "#475569", fontFamily: "system-ui" }}>
      {failed
        ? "This sign-in link has expired or was already used. Generate a new one from HTS admin."
        : "Signing you in…"}
    </div>
  );
}
```

- [ ] **Step 2: Write the server page that reads the query params**

```tsx
// app/integrator-sso/page.tsx
// Landing page for an integrator SSO link. Reads ?token & ?next, then defers
// to a client component that calls NextAuth signIn (CSRF handled by NextAuth).
import AutoSignin from "./auto-signin";

export const dynamic = "force-dynamic";

export default async function IntegratorSsoPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; next?: string }>;
}) {
  const sp = await searchParams;
  const token = sp.token || "";
  const next = sp.next && sp.next.startsWith("/") ? sp.next : "/dashboard";
  if (!token) {
    return (
      <div style={{ display: "flex", minHeight: "60vh", alignItems: "center", justifyContent: "center", color: "#475569", fontFamily: "system-ui" }}>
        Missing sign-in token.
      </div>
    );
  }
  return <AutoSignin token={token} next={next} />;
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npm run build`
Expected: build succeeds; output lists `ƒ /integrator-sso`.

- [ ] **Step 4: Commit**

```bash
git add app/integrator-sso/page.tsx app/integrator-sso/auto-signin.tsx
git commit -m "feat(sso): /integrator-sso landing page auto-signs-in via provider"
```

---

## Task 6: Gate sweep — onboard sub-tenants at create + backfill

**Files:**
- Modify: `app/api/v1/external/tenants/route.ts` (the `prisma.user.create` data block, ~line 38)
- Create: `scripts/backfill-integrator-onboarded.ts`

- [ ] **Step 1: Set `onboardedAt` at create time**

In `app/api/v1/external/tenants/route.ts`, the `prisma.user.create({ data: { ... } })` block currently sets `name, email, plan, integrator_id, emailVerified`. Add `onboardedAt`:

```typescript
  const user = await prisma.user.create({
    data: {
      name,
      email: contact_email,
      plan: 'PRO',
      integrator_id: auth.integrator.id,
      emailVerified: new Date(), // integrator-managed users skip the verify flow
      onboardedAt: new Date(),   // skip the onboarding wizard — operator-driven
    },
    select: { id: true },
  })
```

- [ ] **Step 2: Write the backfill script for already-created sub-tenants**

```typescript
// scripts/backfill-integrator-onboarded.ts
// One-shot: mark every integrator-owned User as onboarded so SSO lands on
// /dashboard instead of /onboarding. Idempotent — only touches null rows.
import { prisma } from "../lib/prisma";

async function main() {
  const res = await prisma.user.updateMany({
    where: { integrator_id: { not: null }, onboardedAt: null },
    data: { onboardedAt: new Date() },
  });
  console.log(`backfilled onboardedAt for ${res.count} integrator user(s)`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit (run the backfill at deploy, Task 7)**

```bash
git add app/api/v1/external/tenants/route.ts scripts/backfill-integrator-onboarded.ts
git commit -m "feat(sso): onboard integrator sub-tenants at create + backfill script"
```

---

## Task 7: Deploy haze-social-post + end-to-end SSO verification

**Files:** none (deploy + verify)

- [ ] **Step 1: Add the SSO secret to Vercel (Production + Preview) and local .env**

Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
Add to Vercel project `haze-social-post` as `INTEGRATOR_SSO_SECRET` for Production and Preview, and to the VPS worker `.env` if the worker imports `lib/auth` (it does not, but mirror it for safety). Add to local `.env` too.

- [ ] **Step 2: Open a PR and merge after the adversarial review + green Vercel preview**

```bash
git push -u origin phase2-5a-sso-spine
gh pr create -R hazetechnologies/haze-social-post --title "Phase 2 5A: SSO spine" --body "Single-use HMAC SSO links so HTS operators land in haze-social-post as a sub-tenant. See docs plan 2026-06-01-phase2-5a-sso-spine."
```
Wait for the Vercel preview SUCCESS + codex adversarial review. Address findings, then squash-merge.

- [ ] **Step 3: Push schema to the production DB**

The build does NOT run migrations. Against the production DB (`paicltgcitspvtyjhlhy`), run `npx prisma db push` with the production `DATABASE_URL`, then run the backfill:
```bash
DATABASE_URL="<prod url>" npx prisma db push
DATABASE_URL="<prod url>" npx tsx scripts/backfill-integrator-onboarded.ts
```
Expected: schema in sync; backfill prints a count (≥ the number of existing sub-tenants).

- [ ] **Step 4: Curl the new endpoint against production**

```bash
KEY="<HSP_EXTERNAL_API_KEY from HTS admin_settings>"
# create a throwaway tenant
TID=$(curl -sS -X POST "https://hazesocialpost.com/api/v1/external/tenants" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"name":"sso-probe","contact_email":"sso-probe@hazetechsolutions.com","hts_client_id":"sso-probe"}' \
  | grep -oE '"id":"[^"]+"' | head -1 | sed -E 's/"id":"([^"]+)"/\1/')
echo "tenant: $TID"
curl -sS -w "\n[HTTP %{http_code}]\n" -X POST "https://hazesocialpost.com/api/v1/external/tenants/$TID/sso-link" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"next":"/dashboard"}'
```
Expected: HTTP 200 with `{"url":"https://hazesocialpost.com/integrator-sso?token=...","expires_at":"..."}`.

- [ ] **Step 5: Browser-verify the SSO round-trip**

Open the returned `url` in a fresh private window. Expected: brief "Signing you in…" → lands on `https://hazesocialpost.com/dashboard` authenticated as `sso-probe` (NOT redirected to `/onboarding`, NOT the login page). Re-opening the same `url` a second time → "link has expired or was already used" (single-use proven). Then archive the probe: `curl -X DELETE ".../tenants/$TID" -H "Authorization: Bearer $KEY"`.

---

## Task 8: HTS "Open Social Workspace" button

**Files:**
- Modify: `src/pages/admin/components/ClientSocialMediaTab.jsx` (add inside the `activated` block, after the Re-push brand kit button)

- [ ] **Step 1: Add an SSO open handler**

In `ClientSocialMediaTab.jsx`, add this handler next to `callActivate`:

```jsx
  const openWorkspace = async () => {
    setBusy(true); setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/website?action=hsp-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ path: `/tenants/${client.hsp_user_id}/sso-link`, method: 'POST', body: { next: '/dashboard' } }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.url) throw new Error(data.message || data.error || `Server error (${res.status})`)
      window.open(data.url, '_blank', 'noopener')
    } catch (err) {
      setError(err.message || 'Could not open workspace')
    } finally {
      setBusy(false)
    }
  }
```

- [ ] **Step 2: Add the button in the `activated` block**

Inside the `{activated && (...)}` block, in the `<div style={{ marginTop: 14, display: 'flex', gap: 10 ... }}>` row that holds the Re-push button, add a second button after it:

```jsx
            <button onClick={openWorkspace} disabled={busy} style={{
              background: 'linear-gradient(135deg, #00D4FF, #0099CC)', color: '#020817',
              border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 700,
              cursor: busy ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit',
            }}>
              <Share2 size={13} /> Open Social Workspace
            </button>
```

(`Share2` is already imported at the top of the file.)

- [ ] **Step 3: Lint the changed file (Vercel build fails on ESLint errors tsc misses)**

Run: `npx next lint --file src/pages/admin/components/ClientSocialMediaTab.jsx` (from the HTS repo root)
Expected: no error-level findings. (If the project uses Vite eslint instead, run `npm run lint` and confirm no new errors.)

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/components/ClientSocialMediaTab.jsx
git commit -m "feat(social): Open Social Workspace SSO button on client Social Media tab"
```

---

## Task 9: HTS deploy + final round-trip

**Files:** none (deploy + verify)

- [ ] **Step 1: PR, green preview, merge**

```bash
git push -u origin hts-5a-open-workspace
gh pr create -R hazetechnologies/haze-tech-solutions --title "Phase 2 5A: Open Social Workspace button" --body "Adds SSO button to the client Social Media tab. Pairs with haze-social-post 5A SSO spine."
```
Wait for Vercel preview SUCCESS + codex review; squash-merge.

- [ ] **Step 2: Production round-trip**

Open `https://www.hazetechsolutions.com/admin/clients/059e1757-0ad5-4c1a-8710-7be5b4f3d2e6` (Haze SEO). If not yet activated, click **Activate social media** first. Then click **Open Social Workspace**.
Expected: a new tab opens, briefly shows "Signing you in…", and lands on `hazesocialpost.com/dashboard` authenticated as the Haze SEO sub-tenant — confirming an HTS operator can now operate a client inside the real app. The client never logged in.

---

## Self-Review (completed)

- **Spec coverage:** 5A's spec items — `sso-link` endpoint (Task 3), `SsoToken` model (Task 1), `integrator-sso` provider (Task 4), `/integrator-sso` consume route (Task 5), gate sweep `onboardedAt` (Task 6), "Open Social Workspace" button (Task 8), single-use/5-min/HMAC (Tasks 2–4), disabled-tenant 403 (Task 3) — all covered. The broader gate sweep (quota/analytics/nurture-email exclusion) is exercised in 5C where content gen runs; 5A handles the onboarding gate that blocks SSO landing, which is the only gate on the SSO path itself.
- **Placeholder scan:** none — every code step has full code; the two `<prod url>` / `<HSP_EXTERNAL_API_KEY>` tokens are deploy-time secrets, not code placeholders.
- **Type consistency:** `mintSsoToken`/`verifySsoToken`/`sha256` signatures match across Tasks 2/3/4; `SsoToken` fields (`token_hash`, `user_id`, `integrator_id`, `next`, `expires_at`, `consumed_at`) consistent across Tasks 1/3/4; provider id `"integrator-sso"` matches between Task 4 (define) and Task 5 (`signIn` call).

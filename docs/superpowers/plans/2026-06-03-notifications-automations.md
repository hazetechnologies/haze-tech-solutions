# HTS Notifications & Automations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Event-driven client + admin notifications across email (Hostinger SMTP) and in-app (portal feed + admin center), covering welcome / status / payment events.

**Architecture:** A code-defined registry maps event types → recipients; `emitNotification()` inserts a row into one `notifications` table (which doubles as the event log) and best-effort sends email. Vercel/Node call sites emit inline; edge-function-driven terminal statuses are picked up by a status-watcher cron. Two read-only UI surfaces (client bell, `/admin/notifications`).

**Tech Stack:** Vite + React (frontend), Vercel serverless `api/*.js` (ESM, `.js` import extensions required), Supabase Postgres + RLS, nodemailer over Hostinger SMTP.

**Spec:** `docs/superpowers/specs/2026-06-03-notifications-automations-design.md`

**Verification note:** HTS has no automated test framework (matches brand-kit / lead-convert). Per-task verification is `npm run build` (clean) + a targeted smoke check + commit. Work on a branch `feat/notifications-automations`; open ONE PR at the end.

---

## File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/2026_06_03_notifications.sql` | `notifications` table + RLS + `notified_status` columns |
| `api/_lib/email.js` | Hostinger SMTP sender (`sendEmail`) + branded HTML wrapper |
| `api/_lib/notification-registry.js` | event type → recipients (audience, resolveTo, render) |
| `api/_lib/notifications.js` | `emitNotification()` engine |
| `api/website.js` (modify) | emit `website.intake_submitted`; add `cron-notify-status` + `cron-admin-digest` actions; emit `client.created` in public checkouts |
| `api/convert-lead.js` (modify) | emit `client.created` |
| `api/stripe-webhook.js` (modify) | emit `invoice.paid`, `subscription.created` |
| `vercel.json` (modify) | register the two crons |
| `src/components/NotificationBell.jsx` | client portal bell + dropdown feed |
| `src/pages/portal/PortalLayout.jsx` (modify) | mount the bell in the header |
| `src/pages/admin/AdminNotifications.jsx` | admin notification center page |
| `src/App.jsx` (modify) | route + nav entry for `/admin/notifications` |

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/2026_06_03_notifications.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/2026_06_03_notifications.sql
-- Unified notifications table: client portal feed + admin center + event log.

create table notifications (
  id           uuid primary key default gen_random_uuid(),
  audience     text not null check (audience in ('client','admin')),
  client_id    uuid references clients(id) on delete cascade,  -- null for admin-only events
  type         text not null,                                  -- e.g. 'invoice.paid'
  title        text not null,
  body         text not null,
  link         text,                                           -- in-app deep-link path
  payload      jsonb,
  email_status text check (email_status in ('sent','failed','skipped')),
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index notifications_client_unread_idx on notifications (client_id, read_at) where audience = 'client';
create index notifications_admin_unread_idx  on notifications (read_at)            where audience = 'admin';
create index notifications_created_idx        on notifications (created_at desc);

alter table notifications enable row level security;

-- Client reads its own client-audience rows.
create policy notifications_client_read on notifications
  for select to authenticated using (
    audience = 'client' and client_id in (select id from clients where user_id = auth.uid())
  );
-- Client marks its own rows read.
create policy notifications_client_update on notifications
  for update to authenticated using (
    audience = 'client' and client_id in (select id from clients where user_id = auth.uid())
  );
-- Admin allowlist reads/updates everything (HTS is_admin() pattern, cf. automation_reports).
create policy notifications_admin_all on notifications
  for all using (is_admin()) with check (is_admin());

-- Track which status we've already notified on, so the watcher cron emits once.
alter table website_projects add column if not exists notified_status text;
alter table brand_kits       add column if not exists notified_status text;
```

- [ ] **Step 2: Apply via Supabase**

Use the Supabase mgmt token in `.env.local` (`SUPABASE_TOKEN`) or run through the VPS psql (see memory `reference_supabase`). Confirm: `select count(*) from notifications;` returns 0 and `\d notifications` shows the policies.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/2026_06_03_notifications.sql
git commit -m "feat(notifications): notifications table + RLS + notified_status columns"
```

---

## Task 2: Email sender

**Files:**
- Create: `api/_lib/email.js`
- Modify: `package.json` (add nodemailer)

- [ ] **Step 1: Add nodemailer**

Run: `npm install nodemailer`
Expected: `nodemailer` appears in `package.json` dependencies.

- [ ] **Step 2: Write `api/_lib/email.js`**

```js
// api/_lib/email.js
// First-party transactional email over Hostinger SMTP. Credentials are read
// DB-first (admin_settings) with env fallback, matching api/_lib/stripe.js.
// IMPORTANT: From MUST equal the authenticated SMTP_USER exactly — Hostinger
// returns 553 at RCPT for alias From addresses (memory: hostinger_smtp_from).
import nodemailer from 'nodemailer'
import { getSetting } from './stripe.js'

let cached = null  // { transporter, from } — reused across invocations in a warm lambda

async function getTransport() {
  if (cached) return cached
  const host = await getSetting('SMTP_HOST', 'SMTP_HOST')
  const port = parseInt((await getSetting('SMTP_PORT', 'SMTP_PORT')) || '465', 10)
  const user = await getSetting('SMTP_USER', 'SMTP_USER')
  const pass = await getSetting('SMTP_PASS', 'SMTP_PASS')
  if (!host || !user || !pass) {
    return null  // not configured — caller treats as skip
  }
  const transporter = nodemailer.createTransport({
    host, port, secure: port === 465,
    auth: { user, pass },
  })
  cached = { transporter, from: user }
  return cached
}

// Branded HTML wrapper. Keep inline styles — many clients strip <style>.
export function wrapHtml(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;background:#0b1120;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="font-weight:700;font-size:18px;color:#00CFFF;letter-spacing:.06em">HAZE TECH SOLUTIONS</div>
    <div style="margin-top:16px;background:#0f172a;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:24px;color:#e2e8f0;font-size:14px;line-height:1.6">
      <h1 style="margin:0 0 12px;font-size:18px;color:#f1f5f9">${title}</h1>
      ${bodyHtml}
    </div>
    <div style="margin-top:16px;color:#475569;font-size:11px">Haze Tech Solutions · info@hazetechsolutions.com</div>
  </div></body></html>`
}

// Best-effort send. Never throws; returns a status string the caller records.
// Returns 'sent' | 'failed' | 'skipped'.
export async function sendEmail({ to, subject, html, text }) {
  if (!to) return 'skipped'
  let t
  try { t = await getTransport() } catch { return 'failed' }
  if (!t) return 'skipped'  // SMTP not configured
  try {
    await t.transporter.sendMail({
      from: t.from, to, subject,
      text: text || subject,
      html: html || wrapHtml(subject, `<p>${subject}</p>`),
    })
    return 'sent'
  } catch (e) {
    console.error('[email] send failed:', e?.message || e)
    return 'failed'
  }
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: clean (no import errors).

- [ ] **Step 4: Commit**

```bash
git add api/_lib/email.js package.json package-lock.json
git commit -m "feat(notifications): Hostinger SMTP sender (DB-first creds, From=SMTP_USER)"
```

---

## Task 3: Notification registry

**Files:**
- Create: `api/_lib/notification-registry.js`

Each event maps to an array of recipients. A recipient has `audience`, an async
`resolveTo(adminClient, payload)` returning the email address (or null → skip
email), and `render(payload)` returning `{ title, body, link, emailSubject, emailHtml }`.

- [ ] **Step 1: Write `api/_lib/notification-registry.js`**

```js
// api/_lib/notification-registry.js
import { wrapHtml } from './email.js'

const ADMIN_FALLBACK = 'info@hazetechsolutions.com'

// Resolve the admin recipient (overridable via admin_settings / env).
async function adminEmail() {
  try {
    const { getSetting } = await import('./stripe.js')
    return (await getSetting('ADMIN_NOTIFY_EMAIL', 'ADMIN_NOTIFY_EMAIL')) || ADMIN_FALLBACK
  } catch { return ADMIN_FALLBACK }
}

// payload shapes are documented per-event below. All renders return strings.
export const REGISTRY = {
  'client.created': [
    {
      audience: 'client',
      resolveTo: async (_sb, p) => p.client?.email || null,
      render: (p) => ({
        title: `Welcome to Haze Tech, ${p.client?.name || 'there'}!`,
        body: 'Your account is set up. Log in to your portal to track your projects, brand kit, and invoices.',
        link: '/portal/dashboard',
        emailSubject: 'Welcome to Haze Tech Solutions',
        emailHtml: wrapHtml('Welcome aboard 🎉', `<p>Hi ${p.client?.name || 'there'}, your Haze Tech portal is ready.</p><p>Sign in to track your projects, brand kit, and invoices.</p>`),
      }),
    },
    {
      audience: 'admin',
      resolveTo: async () => adminEmail(),
      render: (p) => ({
        title: `New client: ${p.client?.name || p.client?.email || 'unknown'}`,
        body: `${p.client?.company || ''} (${p.client?.email || ''}) was added${p.source ? ` via ${p.source}` : ''}.`,
        link: p.client?.id ? `/admin/clients/${p.client.id}` : '/admin/clients',
        emailSubject: `New client: ${p.client?.name || p.client?.email}`,
        emailHtml: wrapHtml('New client', `<p><b>${p.client?.name || ''}</b> (${p.client?.email || ''})${p.client?.company ? ` — ${p.client.company}` : ''} was added${p.source ? ` via ${p.source}` : ''}.</p>`),
      }),
    },
  ],

  'website.intake_submitted': [
    {
      audience: 'admin',
      resolveTo: async () => adminEmail(),
      render: (p) => ({
        title: 'Website intake submitted — ready to generate',
        body: `${p.clientName || 'A client'} submitted their website intake.`,
        link: p.clientId ? `/admin/clients/${p.clientId}` : '/admin/clients',
        emailSubject: 'Website intake submitted',
        emailHtml: wrapHtml('Intake submitted', `<p>${p.clientName || 'A client'} submitted their website intake. Generate the scaffold when ready.</p>`),
      }),
    },
  ],

  'website.done': [
    {
      audience: 'client',
      resolveTo: async (_sb, p) => p.clientEmail || null,
      render: (p) => ({
        title: 'Your website is ready 🎉',
        body: 'Your website project has finished generating. Reach out to your team for next steps.',
        link: '/portal/dashboard',
        emailSubject: 'Your website is ready',
        emailHtml: wrapHtml('Your website is ready 🎉', `<p>Good news — your website project has finished generating.</p>`),
      }),
    },
    {
      audience: 'admin',
      resolveTo: async () => null,  // in-app only
      render: (p) => ({
        title: `Website done: ${p.clientName || p.clientId}`,
        body: 'Scaffold generation completed.',
        link: p.clientId ? `/admin/clients/${p.clientId}` : '/admin/clients',
      }),
    },
  ],

  'website.failed': [
    {
      audience: 'admin',
      resolveTo: async () => adminEmail(),
      render: (p) => ({
        title: `Website generation FAILED: ${p.clientName || p.clientId}`,
        body: p.error || 'Scaffold generation failed.',
        link: p.clientId ? `/admin/clients/${p.clientId}` : '/admin/clients',
        emailSubject: 'Website generation failed',
        emailHtml: wrapHtml('Website generation failed', `<p>Scaffold generation failed for ${p.clientName || p.clientId}.</p><p>${p.error || ''}</p>`),
      }),
    },
  ],

  'brandkit.logos_ready': [
    {
      audience: 'client',
      resolveTo: async (_sb, p) => p.clientEmail || null,
      render: (p) => ({
        title: 'Your logos are ready to approve',
        body: 'Pick your favorite logo in the portal to kick off banner generation.',
        link: '/portal/brand-kit',
        emailSubject: 'Approve your logo',
        emailHtml: wrapHtml('Your logos are ready', `<p>Your logo options are ready. Pick your favorite in the portal to start banners.</p>`),
      }),
    },
    {
      audience: 'admin',
      resolveTo: async () => null,
      render: (p) => ({
        title: `Logos ready: ${p.clientName || p.clientId}`,
        body: 'Awaiting client logo approval.',
        link: p.clientId ? `/admin/clients/${p.clientId}` : '/admin/clients',
      }),
    },
  ],

  'brandkit.done': [
    {
      audience: 'client',
      resolveTo: async (_sb, p) => p.clientEmail || null,
      render: (p) => ({
        title: 'Your brand kit is ready 🎨',
        body: 'Your full brand kit has been generated. View and download it in the portal.',
        link: '/portal/brand-kit',
        emailSubject: 'Your brand kit is ready',
        emailHtml: wrapHtml('Your brand kit is ready 🎨', `<p>Your full brand kit is done — view and download it in the portal.</p>`),
      }),
    },
    {
      audience: 'admin',
      resolveTo: async () => null,
      render: (p) => ({
        title: `Brand kit done: ${p.clientName || p.clientId}`,
        body: 'Brand kit generation completed.',
        link: p.clientId ? `/admin/clients/${p.clientId}` : '/admin/clients',
      }),
    },
  ],

  'invoice.paid': [
    {
      audience: 'client',
      resolveTo: async (_sb, p) => p.clientEmail || null,
      render: (p) => ({
        title: 'Payment received — thank you',
        body: `We received your payment${p.amount ? ` of $${p.amount}` : ''}.`,
        link: '/portal/invoices',
        emailSubject: 'Payment received',
        emailHtml: wrapHtml('Payment received', `<p>Thanks! We received your payment${p.amount ? ` of <b>$${p.amount}</b>` : ''}.</p>`),
      }),
    },
    {
      audience: 'admin',
      resolveTo: async () => adminEmail(),
      render: (p) => ({
        title: `Payment received: ${p.clientName || p.clientEmail || ''}`,
        body: `Invoice paid${p.amount ? ` — $${p.amount}` : ''}.`,
        link: '/admin/invoices',
        emailSubject: `Payment received${p.amount ? ` — $${p.amount}` : ''}`,
        emailHtml: wrapHtml('Payment received', `<p>${p.clientName || p.clientEmail || 'A client'} paid an invoice${p.amount ? ` of <b>$${p.amount}</b>` : ''}.</p>`),
      }),
    },
  ],

  'subscription.created': [
    {
      audience: 'client',
      resolveTo: async () => null,  // in-app confirmation only
      render: (p) => ({
        title: 'Subscription active',
        body: `Your ${p.planName || 'subscription'} is now active.`,
        link: '/portal/services',
      }),
    },
    {
      audience: 'admin',
      resolveTo: async () => adminEmail(),
      render: (p) => ({
        title: `New subscription: ${p.clientName || p.clientEmail || ''}`,
        body: `${p.planName || 'A plan'} subscription started.`,
        link: '/admin/clients',
        emailSubject: 'New subscription',
        emailHtml: wrapHtml('New subscription', `<p>${p.clientName || p.clientEmail || 'A client'} started a ${p.planName || ''} subscription.</p>`),
      }),
    },
  ],
}
```

- [ ] **Step 2: Build + commit**

Run: `npm run build` → clean.
```bash
git add api/_lib/notification-registry.js
git commit -m "feat(notifications): event registry (8 events, client+admin recipients)"
```

---

## Task 4: Notification engine

**Files:**
- Create: `api/_lib/notifications.js`

- [ ] **Step 1: Write `api/_lib/notifications.js`**

```js
// api/_lib/notifications.js
// emitNotification: registry lookup -> insert a notifications row per recipient
// + best-effort email. Safe to call from any request path; never throws.
import { REGISTRY } from './notification-registry.js'
import { sendEmail } from './email.js'

// adminClient: a service-role Supabase client (bypasses RLS for the insert).
export async function emitNotification(adminClient, eventType, payload = {}) {
  const recipients = REGISTRY[eventType]
  if (!recipients) {
    console.warn(`[notifications] unknown event type: ${eventType}`)
    return
  }
  for (const r of recipients) {
    try {
      const c = r.render(payload)
      const to = typeof r.resolveTo === 'function' ? await r.resolveTo(adminClient, payload) : null

      let email_status = null
      if (to) {
        email_status = await sendEmail({
          to,
          subject: c.emailSubject || c.title,
          html: c.emailHtml,
          text: c.body,
        })
      } else if (r.audience === 'admin' || r.audience === 'client') {
        // Recipient intentionally in-app only (resolveTo -> null) => skipped.
        email_status = c.emailSubject ? 'skipped' : null
      }

      await adminClient.from('notifications').insert({
        audience: r.audience,
        client_id: payload.clientId || payload.client?.id || null,
        type: eventType,
        title: c.title,
        body: c.body,
        link: c.link || null,
        payload,
        email_status,
      })
    } catch (e) {
      // Isolate per-recipient failures — one bad send/insert never blocks others.
      console.error(`[notifications] ${eventType} recipient failed:`, e?.message || e)
    }
  }
}
```

- [ ] **Step 2: Build + commit**

Run: `npm run build` → clean.
```bash
git add api/_lib/notifications.js
git commit -m "feat(notifications): emitNotification engine"
```

---

## Task 5: Inline emit points (welcome + payment + intake)

**Files:**
- Modify: `api/convert-lead.js` (emit `client.created` after the client row is created)
- Modify: `api/website.js` (`intake()` → emit `website.intake_submitted`; `publicCheckout`/`publicCartCheckout` → emit `client.created`)
- Modify: `api/stripe-webhook.js` (`invoice.paid`, `checkout.session.completed` subscription)

- [ ] **Step 1: convert-lead.js** — after the client insert succeeds, before responding, add:

```js
import { emitNotification } from './_lib/notifications.js'
// ...after the new client row exists (variable holding it, e.g. `clientRow`/insert result):
await emitNotification(adminClient, 'client.created', {
  client: { id: clientRow.id, name: clientRow.name, email: clientRow.email, company: clientRow.company },
  source: 'lead-convert',
})
```
(Read the file to bind the exact client variable name and the adminClient in scope.)

- [ ] **Step 2: website.js `intake()`** — after the status flips to `intake_submitted` (after the successful update), add:

```js
import { emitNotification } from './_lib/notifications.js'  // top of file
// ...after the update succeeds, `project` holds client_id:
await emitNotification(adminClient, 'website.intake_submitted', {
  clientId: project.client_id,
  clientName: project.clients?.name,  // project select already joins clients(user_id); extend select to include clients(name) if needed
})
```
Note: the existing `intake()` selects `clients!inner(user_id)`. Extend that select to `clients!inner(user_id, name)` so `clientName` is available. `intake()` builds its own `adminClient` — reuse it.

- [ ] **Step 3: website.js public checkouts** — in `publicCheckout` and `publicCartCheckout`, after the `clients` insert succeeds (variable `client`), add:

```js
await emitNotification(adminClient, 'client.created', {
  client: { id: client.id, name: client.name, email: client.email, company: company || null },
  source: 'self-signup',
})
```

- [ ] **Step 4: stripe-webhook.js** — add `import { emitNotification } from './_lib/notifications.js'`. In `case 'invoice.paid'`, after the invoices update, resolve the client (by `inv.customer` → clients.stripe_customer_id) and emit:

```js
const { data: payer } = await sb.from('clients').select('id, name, email').eq('stripe_customer_id', inv.customer).maybeSingle()
await emitNotification(sb, 'invoice.paid', {
  clientId: payer?.id, clientName: payer?.name, clientEmail: payer?.email,
  amount: inv.amount_paid != null ? (inv.amount_paid / 100).toFixed(2) : undefined,
})
```
In `case 'checkout.session.completed'`, inside the `mode === 'subscription'` branch (after the subscriptions upsert), emit:

```js
const { data: subClient } = await sb.from('clients').select('id, name, email').eq('id', clientId).maybeSingle()
await emitNotification(sb, 'subscription.created', {
  clientId, clientName: subClient?.name, clientEmail: subClient?.email,
  planName: sub.items?.data?.[0]?.price?.nickname || undefined,
})
```

- [ ] **Step 5: Build, smoke, commit**

Run: `npm run build` → clean.
Smoke (optional, with SMTP set): temporarily call `emitNotification(adminClient,'client.created',{client:{...test}})` from a scratch handler or replay; confirm a `notifications` row lands.
```bash
git add api/convert-lead.js api/website.js api/stripe-webhook.js
git commit -m "feat(notifications): emit client.created / intake_submitted / invoice.paid / subscription.created"
```

---

## Task 6: Crons (status watcher + admin digest)

**Files:**
- Modify: `api/website.js` (two new `?action=` routes + handlers)
- Modify: `vercel.json` (crons array)

- [ ] **Step 1: Router cases** — in the `switch (action)` add:

```js
case 'cron-notify-status':  return req.method === 'GET' ? cronNotifyStatus(req, res)  : methodNotAllowed(res, 'GET')
case 'cron-admin-digest':   return req.method === 'GET' ? cronAdminDigest(req, res)   : methodNotAllowed(res, 'GET')
```

- [ ] **Step 2: CRON_SECRET guard + handlers** — add near the top:

```js
import { emitNotification } from './_lib/notifications.js'

function requireCron(req, res) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.authorization || ''
  if (!secret || auth !== `Bearer ${secret}`) { res.status(401).json({ error: 'unauthorized' }); return false }
  return true
}

const STATUS_EVENTS = {
  website_projects: {
    done: 'website.done',
    failed: 'website.failed',
  },
  brand_kits: {
    awaiting_logo_approval: 'brandkit.logos_ready',
    done: 'brandkit.done',
  },
}

async function cronNotifyStatus(req, res) {
  if (!requireCron(req, res)) return
  const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, SERVICE_ROLE_KEY)
  let emitted = 0
  for (const [table, map] of Object.entries(STATUS_EVENTS)) {
    const { data: rows } = await sb.from(table)
      .select('id, client_id, status, notified_status, clients(name, email)')
      .neq('status', null)
      .or('notified_status.is.null,notified_status.neq.status')  // see note below
      .limit(200)
    for (const row of rows || []) {
      if (row.status === row.notified_status) continue
      const evt = map[row.status]
      if (evt) {
        await emitNotification(sb, evt, {
          clientId: row.client_id,
          clientName: row.clients?.name,
          clientEmail: row.clients?.email,
        })
        emitted++
      }
      await sb.from(table).update({ notified_status: row.status }).eq('id', row.id)
    }
  }
  return res.status(200).json({ ok: true, emitted })
}

async function cronAdminDigest(req, res) {
  if (!requireCron(req, res)) return
  const sb = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, SERVICE_ROLE_KEY)
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { data: rows } = await sb.from('notifications')
    .select('type, title, created_at')
    .eq('audience', 'admin').gte('created_at', since)
    .order('created_at', { ascending: false }).limit(100)
  if (!rows || rows.length === 0) return res.status(200).json({ ok: true, sent: false })
  const { sendEmail, wrapHtml } = await import('./_lib/email.js')
  const list = rows.map(r => `<li>${new Date(r.created_at).toLocaleString()} — ${r.title}</li>`).join('')
  const adminTo = (await getSetting('ADMIN_NOTIFY_EMAIL', 'ADMIN_NOTIFY_EMAIL')) || 'info@hazetechsolutions.com'
  const status = await sendEmail({ to: adminTo, subject: `Haze Tech daily digest — ${rows.length} events`, html: wrapHtml('Daily digest', `<ul>${list}</ul>`) })
  return res.status(200).json({ ok: true, sent: status === 'sent', count: rows.length })
}
```

> **Note on the `.or()` filter:** PostgREST can't compare two columns in `.or()`. Drop the `.or(...)` and instead select rows and filter `row.status !== row.notified_status` in JS (the handler already does the JS guard `if (row.status === row.notified_status) continue`). Replace the `.or(...)` line with nothing, keeping `.limit(200)`. Keep `notified_status` updated regardless so processed rows don't re-emit.

- [ ] **Step 3: vercel.json crons**

```json
{
  "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }],
  "crons": [
    { "path": "/api/website?action=cron-notify-status", "schedule": "*/5 * * * *" },
    { "path": "/api/website?action=cron-admin-digest", "schedule": "0 13 * * *" }
  ]
}
```

Set `CRON_SECRET` in Vercel env (and locally). Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` to cron paths when the env var is set.

- [ ] **Step 4: Build + commit**

Run: `npm run build` → clean.
```bash
git add api/website.js vercel.json
git commit -m "feat(notifications): status-watcher + daily admin digest crons (CRON_SECRET-gated)"
```

---

## Task 7: Client portal notification bell

**Files:**
- Create: `src/components/NotificationBell.jsx`
- Modify: `src/pages/portal/PortalLayout.jsx`

- [ ] **Step 1: Write `src/components/NotificationBell.jsx`**

```jsx
import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function NotificationBell() {
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()
  const unread = items.filter(i => !i.read_at).length

  const load = async () => {
    const { data } = await supabase
      .from('notifications')
      .select('id, title, body, link, read_at, created_at')
      .eq('audience', 'client')
      .order('created_at', { ascending: false })
      .limit(30)
    setItems(data || [])
  }

  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t) }, [])
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const openItem = async (it) => {
    if (!it.read_at) {
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', it.id)
      setItems(prev => prev.map(p => p.id === it.id ? { ...p, read_at: new Date().toISOString() } : p))
    }
    setOpen(false)
    if (it.link) navigate(it.link)
  }

  const markAll = async () => {
    const ids = items.filter(i => !i.read_at).map(i => i.id)
    if (!ids.length) return
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids)
    load()
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{ position: 'relative', background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8' }}>
        <Bell size={20} />
        {unread > 0 && <span style={{ position: 'absolute', top: -4, right: -4, background: '#00D4FF', color: '#020817', borderRadius: 999, fontSize: 10, fontWeight: 700, minWidth: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{unread}</span>}
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 30, width: 320, maxHeight: 400, overflowY: 'auto', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, boxShadow: '0 16px 48px rgba(0,0,0,0.5)', zIndex: 1000, padding: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px' }}>
            <span style={{ color: '#F1F5F9', fontSize: 13, fontWeight: 700 }}>Notifications</span>
            {unread > 0 && <button onClick={markAll} style={{ background: 'none', border: 'none', color: '#00CFFF', fontSize: 11, cursor: 'pointer' }}>Mark all read</button>}
          </div>
          {items.length === 0 && <div style={{ color: '#64748B', fontSize: 12, padding: 12, textAlign: 'center' }}>No notifications</div>}
          {items.map(it => (
            <button key={it.id} onClick={() => openItem(it)} style={{ display: 'block', width: '100%', textAlign: 'left', background: it.read_at ? 'transparent' : 'rgba(0,212,255,0.06)', border: 'none', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', marginBottom: 2 }}>
              <div style={{ color: '#E2E8F0', fontSize: 12.5, fontWeight: it.read_at ? 400 : 600 }}>{it.title}</div>
              <div style={{ color: '#94A3B8', fontSize: 11, lineHeight: 1.4 }}>{it.body}</div>
              <div style={{ color: '#475569', fontSize: 10, marginTop: 2 }}>{new Date(it.created_at).toLocaleString()}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Mount in `PortalLayout.jsx`** — import it (`import NotificationBell from '../../components/NotificationBell'`) and render `<NotificationBell />` in the layout's top header/breadcrumb row (read the file to find the header bar; place it right-aligned next to the breadcrumbs).

- [ ] **Step 3: Build + commit**

Run: `npm run build` → clean.
```bash
git add src/components/NotificationBell.jsx src/pages/portal/PortalLayout.jsx
git commit -m "feat(notifications): client portal notification bell + feed"
```

---

## Task 8: Admin notifications page

**Files:**
- Create: `src/pages/admin/AdminNotifications.jsx`
- Modify: `src/App.jsx` (import + route + nav link)

- [ ] **Step 1: Write `src/pages/admin/AdminNotifications.jsx`**

```jsx
import { useEffect, useState, useCallback } from 'react'
import { Bell, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function AdminNotifications() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('notifications')
      .select('id, type, title, body, link, payload, read_at, created_at')
      .eq('audience', 'admin')
      .order('created_at', { ascending: false })
      .limit(200)
    setItems(data || []); setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const markRead = async (id) => {
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
    setItems(prev => prev.map(p => p.id === id ? { ...p, read_at: new Date().toISOString() } : p))
  }
  const markAll = async () => {
    const ids = items.filter(i => !i.read_at).map(i => i.id)
    if (!ids.length) return
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids)
    load()
  }

  const unread = items.filter(i => !i.read_at).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ color: '#F1F5F9', fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bell size={18} color="#00CFFF" /> Notifications {unread > 0 && <span style={{ fontSize: 12, color: '#00CFFF' }}>({unread} unread)</span>}
        </h2>
        {unread > 0 && <button onClick={markAll} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#CBD5E1', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>Mark all read</button>}
      </div>
      {loading && <div style={{ color: '#64748B', fontSize: 13 }}>Loading…</div>}
      {!loading && items.length === 0 && <div style={{ color: '#64748B', fontSize: 13 }}>No notifications yet.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(it => (
          <div key={it.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: it.read_at ? 'rgba(255,255,255,0.02)' : 'rgba(0,212,255,0.06)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#F1F5F9', fontSize: 14, fontWeight: it.read_at ? 500 : 700 }}>{it.title}</div>
              <div style={{ color: '#94A3B8', fontSize: 12.5, marginTop: 2 }}>{it.body}</div>
              <div style={{ color: '#475569', fontSize: 11, marginTop: 4 }}>{it.type} · {new Date(it.created_at).toLocaleString()}{it.link ? <> · <a href={it.link} style={{ color: '#7DD3FC' }}>{it.link}</a></> : null}</div>
            </div>
            {!it.read_at && <button onClick={() => markRead(it.id)} title="Mark read" style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: 6, cursor: 'pointer', color: '#22C55E' }}><Check size={14} /></button>}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Wire into `src/App.jsx`** — add `import AdminNotifications from './pages/admin/AdminNotifications'`, add a route under the admin layout (mirror how `AutomationTriggers` is routed, e.g. `<Route path="notifications" element={<AdminNotifications />} />`), and add a nav link in the admin sidebar list (read App.jsx / AdminLayout to find the nav array; add `{ to: 'notifications', label: 'Notifications', icon: Bell }` matching the existing shape).

- [ ] **Step 3: Build + commit**

Run: `npm run build` → clean.
```bash
git add src/pages/admin/AdminNotifications.jsx src/App.jsx
git commit -m "feat(notifications): admin notifications center + route/nav"
```

---

## Task 9: Final verification + PR

- [ ] **Step 1:** `npm run build` → clean.
- [ ] **Step 2:** Grep for leftover unused imports / dangling refs in modified files.
- [ ] **Step 3:** Smoke (with SMTP + CRON_SECRET set in preview): trigger a lead-convert → confirm a `client` welcome row + admin "new client" row land in `notifications`; hit `/api/website?action=cron-notify-status` with the Bearer secret against a project row flipped to `done`.
- [ ] **Step 4:** Open ONE PR `feat: notifications & automations (welcome/status/payment, email + in-app)`. Because the codex diff-reviewer is billing-blocked (see memory `reference_codex_reviewer_apikey_auth`), run a manual `codex:rescue` pass; merge once Vercel preview is green (admin-merge past the failed `codex/adversarial` check if needed).

---

## Self-review notes

- **Spec coverage:** all 8 events (Task 3), email transport (Task 2), engine (Task 4), inline emits (Task 5), edge-driven status via cron (Task 6), digest (Task 6), client feed (Task 7), admin center (Task 8), migration + `notified_status` (Task 1). ✓
- **Env to set before email works:** `SMTP_HOST/PORT/USER/PASS` (or admin_settings), `CRON_SECRET`, optional `ADMIN_NOTIFY_EMAIL`. Until set, in-app notifications still work; `email_status` records `skipped`/`failed`.
- **PostgREST gotcha:** two-column comparison can't go in `.or()` — filter `status !== notified_status` in JS (Task 6 note).
- **ESM:** every new relative import in `api/*` uses `.js` (memory `feedback_esm_extension_required`).

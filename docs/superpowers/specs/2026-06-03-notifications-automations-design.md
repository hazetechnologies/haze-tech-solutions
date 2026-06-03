# HTS Notifications & Automations — v1 Design

**Date:** 2026-06-03
**Status:** Approved (pending spec review)
**Repo:** hazetechnologies/haze-tech-solutions

## Problem

Haze Tech Solutions has no client-facing or admin-facing notification system.
Lifecycle moments (a client signs up, a website project finishes, an invoice is
paid) happen silently: the client is never emailed or notified in their portal,
and the admin (info@hazetechsolutions.com) finds out only by checking the
dashboard. We want event-driven notifications across two audiences (client,
admin) and two channels (email, in-app), covering three categories: **welcome**,
**status updates**, and **payment updates**.

### What HTS already has vs. needs

- **`AutomationTriggers`** (`src/pages/admin/AutomationTriggers.jsx`,
  `automation_triggers` table): admin-configured **n8n webhooks** fired on events
  (chatbot phrase, form submit). This is outbound-to-n8n, a *separate* concern —
  left untouched.
- **No first-party email transport.** HTS relies on Supabase
  `inviteUserByEmail`, Stripe's hosted invoice email, and routes connect-link
  emails through haze-social-post. There is no branded transactional sender.
- **No client portal notification feed** and **no admin notification center**.

## Decisions (locked during brainstorming)

1. **Email transport:** first-party Hostinger SMTP (nodemailer), matching
   hazefunding and haze-social-post.
2. **Configurability:** code-defined registry + read-only admin log/feed (the
   hazefunding `emitWorkflow` pattern). Adding/changing an event is a code
   change. No per-event admin toggle UI in v1.
3. **Sizing:** ship the whole subsystem in one PR.

## Event matrix (v1)

📧 = email, 🔔 = in-app (portal for client / admin center for admin)

| Category | Event type | Client | Admin |
|---|---|---|---|
| Welcome | `client.created` | 📧 + 🔔 welcome | 📧 + 🔔 "new client" |
| Status  | `website.intake_submitted` | — | 📧 + 🔔 "ready to generate" |
| Status  | `website.done` | 📧 + 🔔 "your site is ready" | 🔔 |
| Status  | `website.failed` | — | 📧 + 🔔 "scaffold failed" |
| Status  | `brandkit.logos_ready` | 📧 + 🔔 "approve your logo" | 🔔 |
| Status  | `brandkit.done` | 📧 + 🔔 "your brand kit is ready" | 🔔 |
| Payment | `invoice.paid` | 📧 + 🔔 receipt | 📧 + 🔔 "payment received" |
| Payment | `subscription.created` | 🔔 confirmation | 📧 + 🔔 "new subscription" |

## Architecture

### 1. Data model — one `notifications` table

Serves the client feed, the admin center, **and** the event log (every emit
writes a row).

```sql
create table notifications (
  id           uuid primary key default gen_random_uuid(),
  audience     text not null check (audience in ('client','admin')),
  client_id    uuid references clients(id) on delete cascade,   -- null for admin-only events
  type         text not null,                                   -- e.g. 'invoice.paid'
  title        text not null,
  body         text not null,
  link         text,                                            -- in-app deep-link path, e.g. '/portal/invoices'
  payload      jsonb,                                           -- raw event context for audit
  email_status text check (email_status in ('sent','failed','skipped')),
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index notifications_client_unread_idx on notifications (client_id, read_at) where audience = 'client';
create index notifications_admin_unread_idx  on notifications (read_at) where audience = 'admin';

alter table notifications enable row level security;

-- Client reads its OWN client-audience rows.
create policy notifications_client_read on notifications
  for select to authenticated using (
    audience = 'client'
    and client_id in (select id from clients where user_id = auth.uid())
  );
-- Client can mark its own rows read (read_at only — enforced in app code).
create policy notifications_client_update on notifications
  for update to authenticated using (
    audience = 'client'
    and client_id in (select id from clients where user_id = auth.uid())
  );
-- Admin (allowlist) reads/updates everything — HTS's existing is_admin() pattern.
create policy notifications_admin_all on notifications
  for all using (is_admin()) with check (is_admin());
-- service_role bypasses RLS automatically (server emits run with service role).
```

Note: admin reads in the React app go through the browser client; the
`is_admin()` SQL function is HTS's established admin-RLS pattern (see
`automation_reports`). Server-side emits use the service-role client.

### 2. Email sender — `api/_lib/email.js`

- nodemailer transport over Hostinger SMTP.
- Credentials via `getSetting()` (DB-first from `admin_settings`, env fallback) —
  reuse the helper already imported in `api/_lib/stripe.js`. Keys:
  `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`.
- **`From` MUST equal `SMTP_USER` exactly** — Hostinger returns 553 at RCPT for
  alias From addresses; a verify-only handshake won't catch it.
- Exposes `sendEmail({ to, subject, html, text })`. Returns `{ ok, error }`;
  never throws into the caller (best-effort).
- Shared branded HTML wrapper (HTS logo, dark theme, footer with
  info@hazetechsolutions.com).

### 3. Engine — `api/_lib/notifications.js` + `api/_lib/notification-registry.js`

- `notification-registry.js`: maps `eventType → recipients[]`. Each recipient
  declares `audience`, a `resolveTo(payload)` for the email address, and a
  `render(payload)` returning `{ title, body, link, emailSubject, emailHtml }`.
  Admin recipient address is always `info@hazetechsolutions.com` (overridable via
  `ADMIN_NOTIFY_EMAIL` setting).
- `emitNotification(adminClient, eventType, payload)`:
  1. Look up `registry[eventType]` (unknown type → log + no-op, never throw).
  2. For each recipient: render content, insert a `notifications` row.
  3. If the recipient has an email target, call `sendEmail()` best-effort and
     update `email_status` to `sent`/`failed` (`skipped` when no address).
  4. Failures are isolated per recipient — one bad send never blocks the others
     or the originating request.

### 4. Emit points

**Inline (event already passes through the Vercel/Node layer):**
- `client.created` — `api/convert-lead.js` (after client insert) and the
  `publicCheckout` / `publicCartCheckout` paths in `api/website.js` (after client
  insert).
- `invoice.paid`, `subscription.created` — `api/stripe-webhook.js` (after the DB
  write that records payment/subscription).
- `website.intake_submitted` — `api/website.js` `intake()` (after status flips to
  `intake_submitted`).

**Cron-watched (terminal status is set by Supabase edge functions, which can't
call HTS code):**
- Add a `notified_status` column to `website_projects` and `brand_kits`.
- A **status-watcher cron** (`?action=cron-notify-status`, every 5 min) selects
  rows where `status <> notified_status` and the new status maps to an event,
  emits, then sets `notified_status = status`. This decouples us from the edge
  functions entirely (no Deno edits/redeploys) and naturally batches.
- Events covered: `website.done`, `website.failed`, `brandkit.logos_ready`
  (status `awaiting_logo_approval`), `brandkit.done`.

**Daily admin digest cron** (`?action=cron-admin-digest`, once daily): rolls up
the day's admin-audience notifications into one summary email to
info@hazetechsolutions.com.

Both cron endpoints are `?action=` routes on the existing `api/website.js`
router (keeps the serverless-function count flat) and are `CRON_SECRET`-gated
(`Authorization: Bearer ${CRON_SECRET}`). Cron schedules are declared in
`vercel.json`.

### 5. Surfaces

- **Client portal** — a notification **bell** in `src/pages/portal/PortalLayout.jsx`
  with an unread badge and a dropdown listing the client's `audience='client'`
  rows (title, body, relative time, optional deep-link). Mark-one / mark-all
  read. Reads via the browser Supabase client (RLS-scoped).
- **Admin** — a `/admin/notifications` page listing `audience='admin'` rows with
  unread state, mark-read, and the raw `payload` available for audit. Reads via
  the browser Supabase client (`is_admin()` policy). A small unread badge in the
  admin nav.

### 6. Out of scope (v1)

- Per-event admin on/off toggles or recipient editing (code registry instead).
- SMS / web push.
- Editing the `generate-website-scaffold` / `generate-brand-kit` edge functions.
- Retag/backfill of historical events (the log starts at deploy).

## Error handling

- Email is **best-effort**: a send failure records `email_status='failed'` on the
  row but never fails the originating request or the cron tick. Failed admin
  emails still appear in the admin center, so nothing is silently lost.
- `emitNotification` swallows and logs unknown event types and per-recipient
  render/insert errors; it must be safe to call from any request path.
- The status-watcher cron is idempotent: `notified_status` guarantees each
  terminal transition emits at most once even if the cron overlaps or retries.

## Testing / verification

HTS has no automated test framework (matches the brand-kit / lead-convert
features). Verification is:
- `npm run build` clean.
- A throwaway script (or `?action=` dev hook) that calls `emitNotification` for
  each event type against a test client, asserting a row lands in `notifications`
  and (with SMTP configured) an email arrives at info@hazetechsolutions.com.
- Manual UI smoke: trigger `client.created` via lead-convert → client sees a bell
  notification + welcome email; admin sees the "new client" entry.
- `cron-notify-status` dry-run against a project flipped to `done` in the DB.

## Migration / rollout

1. Migration: create `notifications` + indexes + RLS; add `notified_status` to
   `website_projects` and `brand_kits`.
2. Set SMTP creds (env or `admin_settings`) before enabling email; until then
   sends record `email_status='failed'` but in-app notifications still work.
3. Register the two crons in `vercel.json`.
4. Ship the engine, emit points, and both UI surfaces in one PR.

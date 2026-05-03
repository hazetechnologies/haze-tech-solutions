# Lead → Client Conversion — Design Spec

**Date:** 2026-05-03
**Status:** Approved, ready for implementation plan

## Problem

Admins currently manage leads in `/admin/leads` (status: new / contacted / closed) and clients in `/admin/clients` (with auth user, deal terms, brand kit, etc.) as completely separate systems. When a lead becomes a paying customer, the admin must:

1. Manually copy name / email / business name out of the lead row
2. Open the Create Client form
3. Re-type everything plus password, product, price, terms
4. Mentally remember the lead is now "closed"
5. Lose the audit scores / report context that was attached to the lead

There is no link between the resulting client and the originating lead, no way to know from the leads list which leads have been converted, and no protection against accidentally creating a duplicate client when the same person submitted both a contact form and an audit.

## Goals

- One-click "Convert" button in the leads table that creates a `clients` row with the auth user invited via email.
- Forward link from `leads` to `clients` so the leads list shows "✓ Converted" badges that navigate to the resulting client.
- Email-collision detection — if a client already exists with the lead's email, offer to link the lead to that existing client instead of creating a duplicate.
- Branded password-set landing page for the invited user (no Supabase-hosted page).

## Non-goals

- Custom SMTP setup. The Supabase built-in email provider is sufficient (rate-limited to ~3 emails/hour on free tier — acceptable for single-admin manual conversion).
- Bulk convert (multiple leads at once).
- Auto-convert on audit submission.
- Editing the lead's stored fields during convert. The lead remains an immutable historical snapshot; convert reads from the lead and writes to the client.
- Unlinking / re-converting an already-converted lead. (If needed later, the admin can manually update `converted_to_client_id` to NULL via SQL.)

## User flow

### Convert path (happy)

1. Admin opens `/admin/leads` and locates the lead row.
2. The action cell on the right shows the existing Audit / AI Plan buttons plus a new **Convert** button. Convert is hidden when `converted_to_client_id IS NOT NULL` (a green "✓ Converted" badge with a link to `/admin/clients/<that-id>` shows in its place).
3. Admin clicks **Convert** → modal opens. Modal fields:
   - **Locked**: `email` (from lead — it is the auth identity, cannot be changed without re-issuing the invite).
   - **Prefilled, editable**: `name` (from `lead.name`), `company` (from `lead.business_name`).
   - **Empty, optional**: `phone`, `product`, `price`, `subscription_terms`.
4. Admin reviews / fills, clicks **Convert**.
5. Frontend POSTs to `/api/convert-lead` with `{ lead_id, name, company, phone, product, price, subscription_terms }`.
6. API performs the orchestration described in [API design](#api-design).
7. On 200 the modal flips to a success state: *"Invite sent to {email} ✓ Client created"* with two buttons: **Open client** (navigates to `/admin/clients/<new-id>`) and **Close**.
8. Leads list refreshes — the converted lead's row now shows the "✓ Converted" badge.

### Email-collision path

1. Same as steps 1-5 above.
2. API detects `clients.email = lead.email` already exists. Returns `409` with `{ error: 'client_exists', existing_client_id, existing_client_name }`.
3. Modal swaps to a confirmation sub-state:
   > *"A client named **{existing_client_name}** with email **{email}** already exists. Link this lead to them instead? (No new client will be created.)"*
   Buttons: **Link to existing client** and **Cancel**.
4. Admin clicks **Link to existing client** → frontend reposts to `/api/convert-lead` with `{ lead_id, link_only: true, existing_client_id }`.
5. API verifies the existing_client_id matches the email collision, then updates the lead's `converted_to_client_id` and `status='closed'`. No auth/client work.
6. Modal shows success: *"Lead linked to existing client ✓"* with **Open client** and **Close** buttons.

### Accept-invite path (the user clicks the email link)

1. Supabase email contains a link of the form `https://www.hazetechsolutions.com/portal/accept-invite#access_token=...&type=invite&...`.
2. User clicks → lands on the new `/portal/accept-invite` page.
3. Supabase JS client (`detectSessionInUrl: true`, the default) parses the URL hash automatically and fires `onAuthStateChange` with event `SIGNED_IN`. The page reads the URL hash for `type=invite` to confirm the session came from an invite (not a normal login) before showing the password form.
4. Page shows: *"Welcome to Haze Tech Solutions. Set your password to access your client portal."* + a single password input + confirm input + submit button.
5. Submit calls `supabase.auth.updateUser({ password })`.
6. On success, redirect to `/portal` (PortalDashboard).
7. If the page is loaded without `type=invite` in the URL hash and no active session, show a friendly error: *"This invite link has expired or is invalid. Please contact your account manager."*

## API design

### `POST /api/convert-lead`

**Auth gate** (mirrors `api/create-client.js`):
- Bearer token in `Authorization` header → verified via Supabase anon-key client → must be a real user.
- Caller must NOT have a row in `clients` (i.e. caller is admin, not a portal client). Same gate as create-client.

**Two modes selected via `link_only` flag:**

#### Mode 1: Full convert (default)

Request body:
```json
{
  "lead_id": "uuid",
  "name": "string (required)",
  "company": "string|null",
  "phone": "string|null",
  "product": "string|null",
  "price": "number|null",
  "subscription_terms": "string|null"
}
```

Steps:
1. Load the lead. If not found → `404 lead_not_found`.
2. If `lead.converted_to_client_id IS NOT NULL` → `409 already_converted` with `{ existing_client_id: lead.converted_to_client_id }`.
3. Check `clients` for `email = lead.email`. If found → `409 client_exists` with `{ existing_client_id, existing_client_name }`. (Frontend will offer the link-only path.)
4. Call `supabase.auth.admin.inviteUserByEmail(lead.email, { redirectTo: '<SITE_URL>/portal/accept-invite' })`. If error is rate limit → `429 invite_rate_limited`. Other errors → `500 invite_failed`.
5. Insert into `clients` with `{ user_id: invited.user.id, name, email: lead.email, company, phone, product, price, subscription_terms }`. If insert fails → rollback by `auth.admin.deleteUser(invited.user.id)`, return `500 client_insert_failed`.
6. Update the lead: `UPDATE leads SET status='closed', converted_to_client_id=<new-client-id> WHERE id=<lead_id>`. If this update fails, log a warning but return success — the client was created and invite sent. Admin can re-run convert later (the email-collision path will catch it and offer link-to-existing).
7. Return `200 { client_id, lead_id, invite_sent: true }`.

#### Mode 2: Link-only

Request body:
```json
{
  "lead_id": "uuid",
  "link_only": true,
  "existing_client_id": "uuid"
}
```

Steps:
1. Load the lead. If not found → `404 lead_not_found`.
2. If `lead.converted_to_client_id IS NOT NULL` → `409 already_converted`.
3. Load the existing client. If not found → `404 client_not_found`.
4. Verify `existing_client.email == lead.email`. If mismatch → `400 email_mismatch` (defensive — frontend should never send a mismatched id, but guard against tampering).
5. `UPDATE leads SET status='closed', converted_to_client_id=<existing_client_id> WHERE id=<lead_id>`.
6. Return `200 { client_id: existing_client_id, lead_id, invite_sent: false }`.

### Error response shape

All errors return:
```json
{ "error": "<error_code>", "message": "<human-readable>", ...optional_extras }
```

Error codes used: `unauthorized`, `forbidden`, `lead_not_found`, `already_converted`, `client_exists`, `invite_rate_limited`, `invite_failed`, `client_insert_failed`, `client_not_found`, `email_mismatch`, `bad_request`.

## Schema migration

```sql
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS converted_to_client_id uuid
  REFERENCES clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS leads_converted_to_client_id_idx
  ON leads(converted_to_client_id) WHERE converted_to_client_id IS NOT NULL;
```

`ON DELETE SET NULL`: if a client is deleted, the lead's link clears (the lead remains as historical record). Partial index keeps the index small (most leads will not be converted).

Run via Supabase Mgmt API `POST /v1/projects/{ref}/database/query` (same pattern used to create the `brand_kits` table). Also append the migration to `supabase-schema.sql` so the canonical schema file stays accurate.

## Files

### New

- `api/convert-lead.js` — Vercel serverless route. Auth + admin gate, both modes (full convert and link-only), rollback on partial failure.
- `src/pages/admin/components/ConvertLeadModal.jsx` — modal component. Three sub-states: form, email-collision-confirmation, success. Calls `/api/convert-lead` and exposes `onConverted(client_id)` callback.
- `src/pages/portal/AcceptInvite.jsx` — the password-set landing page. Listens for `SIGNED_IN` auth event (with `type=invite` in URL hash for invite verification); shows password form; submits via `supabase.auth.updateUser`; redirects to `/portal`.

### Modified

- `src/pages/admin/Leads.jsx`:
  - Add `converted_to_client_id` to the `select(...)` in `fetchLeads`.
  - Add Convert button in the action cell (visible only when `!lead.converted_to_client_id`).
  - Add ✓ Converted badge linking to `/admin/clients/<id>` (visible only when `lead.converted_to_client_id`).
  - Render `<ConvertLeadModal>` and manage open state.
  - On modal `onConverted`, optimistically update the local lead row so the badge appears without a refetch.
- `src/App.jsx` — register the new route `/portal/accept-invite` → `AcceptInvite` (alongside the other public routes near the existing `/audit` / `/blog` routes; not under the protected `/admin` block).
- `supabase-schema.sql` — append the migration block.

## Telemetry

Use the existing `trackEvent` helper from `src/lib/telemetry.js`. Events:

| Event | Properties | When |
|---|---|---|
| `lead_convert_started` | `lead_id`, `lead_source` (audit/contact) | Modal opened |
| `lead_convert_completed` | `lead_id`, `client_id`, `mode` ('full' / 'link_only'), `duration_ms` | API returned 200 |
| `lead_convert_failed` | `lead_id`, `error_code`, `mode` | API returned non-200 (other than 409 client_exists, which is part of the normal flow) |
| `lead_convert_email_collision` | `lead_id`, `existing_client_id` | API returned 409 client_exists |

PostHog will pick these up via the existing capture setup.

## Edge cases & error handling

- **Supabase invite rate limit (429)**: Built-in email provider caps at 3 invites/hour on free tier. API surfaces this as `429 invite_rate_limited`. Modal shows: *"Email rate limit reached (~3/hour). Try again in an hour, or set up custom SMTP under Settings."*
- **Auth user creation succeeds but client insert fails**: Rollback by deleting the auth user. No partial state. Same pattern as `api/create-client.js:79`.
- **Auth user + client insert both succeed but lead update fails**: Log a warning, return success anyway. The client exists and the invite has been sent — partial failure here is recoverable (the admin can re-run convert; the email-collision path will catch the existing client and offer to link).
- **Admin clicks Convert twice rapidly**: Frontend disables the button while `submitting === true`. Backend has the `already_converted` 409 as a defensive backstop.
- **Lead has no email** (shouldn't happen — `email` is `NOT NULL` in schema, but defensive): API returns `400 bad_request` with message "lead has no email."
- **Invite link expired**: `AcceptInvite.jsx` shows a friendly "expired or invalid" error rather than crashing or silently doing nothing.
- **User already exists in auth.users but not in clients table** (shouldn't happen normally — would mean orphaned auth user): `inviteUserByEmail` will fail. API returns `500 invite_failed` with the Supabase error message. Admin can clean up via Supabase dashboard.

## Open question (acknowledged, not blocking)

The Supabase free-tier email rate limit (3/hour) is workable for now since lead conversion is currently a manual, low-volume operation by a single admin. If volume grows or this rate limit becomes a real blocker, the path forward is the deferred admin-secrets-management feature (custom SMTP credentials in DB with admin UI). This spec assumes the built-in provider is sufficient.

## Out of scope (will not be built in this iteration)

- Bulk convert (multi-select in leads list).
- Custom SMTP setup.
- Auto-convert on audit submission.
- Re-convert / unlink workflows.
- Editing the lead during convert.
- Migrating the historical "closed" leads that were manually copied to clients before this feature existed (no link back will be inferred).

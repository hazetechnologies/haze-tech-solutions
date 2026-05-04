# Website Dev Funnel — Design Spec

**Date:** 2026-05-04  
**Status:** Approved

## Problem

Website development leads arrive via the contact form and are handled entirely manually — no structured intake, no defined handoff, no automated delivery. This spec defines a full funnel from lead capture through scaffold delivery.

## Outcome

A structured flow: public lead → converted client → portal intake form → admin scaffold trigger → AI-generated copy committed to a private GitHub repo, created from a branded template.

---

## Architecture

```
Public lead form (existing, service_interest = "website_development")
  └─ /admin/leads → convert to client (existing)
       └─ /admin/clients/:id → Website tab → "Activate Website Project"
            └─ Client portal: /portal/website-intake (intake form)
                 └─ Admin sees submitted intake + "Generate Scaffold" button
                      └─ Edge function: Claude copy gen → GitHub repo from template → content.json commit
                           └─ Admin: repo URL | Client: "Ready — your dev team has your files"
```

---

## Database

### `website_projects` table

```sql
create table website_projects (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references clients(id) on delete cascade,
  status           text not null default 'intake_pending',
  template_id      text,
  inputs           jsonb,
  ai_content       jsonb,
  repo_name        text,
  repo_url         text,
  error            text,
  progress_message text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);
```

**Status values:** `intake_pending` → `intake_submitted` → `generating` → `done` | `failed`

**`inputs` shape:**
```json
{
  "domain": "example.com",
  "business_description": "...",
  "services": ["Service A", "Service B"],
  "pages": ["Home", "About", "Services", "Contact"],
  "color_style_prefs": "navy and gold, clean, like Apple.com",
  "use_brand_kit": true,
  "template_id": "service-business"
}
```

**RLS:** clients can `SELECT` their own row; service role has full access.

---

## Template Repos (one-time manual setup)

Five private template repos under the `hazetechnologies` GitHub org, each marked as a "template repository." Each must contain a `content.json` at root with empty placeholder structure:

```json
{ "hero": {}, "about": {}, "services": [], "contact_cta": {}, "meta": {}, "footer_tagline": "" }
```

Templates:
- `hazetechnologies/template-service-business`
- `hazetechnologies/template-local-business`
- `hazetechnologies/template-creative-portfolio`
- `hazetechnologies/template-saas-landing`
- `hazetechnologies/template-travel-agency`

---

## API Endpoints

### Admin endpoints (all use `api/_lib/require-admin.js`)

| Endpoint | Method | Body | Action |
|----------|--------|------|--------|
| `/api/activate-website-project` | POST | `{ client_id }` | Creates `website_projects` row (status=intake_pending) |
| `/api/start-website-scaffold` | POST | `{ project_id }` | Sets status=generating, invokes edge fn |
| `/api/website-scaffold-status/[id]` | GET | — | Returns `{ status, progress_message, repo_url, error }` |

### Client endpoint

| Endpoint | Method | Body | Action |
|----------|--------|------|--------|
| `/api/submit-website-intake` | POST | `{ project_id, template_id, domain, business_description, services, pages, color_style_prefs, use_brand_kit }` | Validates caller owns project, sets status=intake_submitted |

---

## Edge Function: `generate-website-scaffold`

**Runtime:** Supabase Edge Function (Deno), `waitUntil` pattern (same as `generate-brand-kit`)

### Steps
1. Read `website_projects` row (inputs, template_id, client_id)
2. If `use_brand_kit = true` → read latest `brand_kits` row for client (palette, voice_tone)
3. Update status → `generating`, progress = "Generating copy…"
4. Call `claude-sonnet-4-6` via `tracked-claude.ts` to produce structured `ai_content` JSON
5. Update progress = "Creating GitHub repository…"
6. `POST https://api.github.com/repos/hazetechnologies/{template_id}/generate` with `{ owner, name: "{slug}-website", private: true }`
7. Wait 3s for repo initialization
8. `PUT /repos/hazetechnologies/{repo-name}/contents/content.json` — commit AI content
9. Update DB: status=done, repo_url, repo_name, ai_content

### `ai_content` schema
```json
{
  "hero":        { "headline": "", "subheadline": "", "cta": "" },
  "about":       { "heading": "", "body": "" },
  "services":    [{ "name": "", "description": "" }],
  "contact_cta": { "heading": "", "body": "" },
  "meta":        { "title": "", "description": "" },
  "footer_tagline": ""
}
```

### Brand kit injection
When `use_brand_kit = true`, the Claude system prompt includes:
- Color palette (primary/secondary/accent hex values)
- Voice & tone guide excerpt
- Brand name and one-line descriptor from the bio

---

## Admin UI

### `ClientDetail.jsx` — add "Website" tab (6th tab)

### `WebsiteProjectTab.jsx` (new, mirrors `BrandKitTab.jsx` state machine)

| State | UI |
|-------|----|
| No project | "Activate Website Project" button |
| `intake_pending` | "Awaiting client intake" badge + timestamp |
| `intake_submitted` | Intake data summary accordion + "Generate Scaffold" button |
| `generating` | Spinner + progress message |
| `done` | Repo URL + "View on GitHub" link + AI content preview accordion |
| `failed` | Error message + "Retry" button |

---

## Portal UI

### `PortalDashboard.jsx` — add Website Project card
- Shows status badge
- Links to `/portal/website-intake` when status = `intake_pending`
- Shows "In Progress" when generating
- Shows "Ready" message when done

### `PortalWebsiteIntake.jsx` (new, route: `/portal/website-intake`)
Fields (in order):
1. Template selector — 5 cards with name + 1-line description
2. Domain name — text input
3. Business description — textarea
4. Services — dynamic add/remove list
5. Pages needed — checkboxes (Home, About, Services, Contact, Blog, Portfolio, FAQ, Pricing)
6. Color & style preferences — textarea
7. Use brand kit — toggle (only shown if brand kit exists; defaults on)

---

## Environment Variables

| Var | Where | Purpose |
|-----|-------|---------|
| `GITHUB_PAT` | Vercel (all envs) + `.env` | GitHub API auth for repo creation |

---

## Patterns Reused

- `api/_lib/require-admin.js` — admin gate
- `BrandKitTab.jsx` + `BrandKitIntakeForm.jsx` — UI state machine + form patterns
- `supabase/functions/generate-brand-kit/index.ts` — `waitUntil` + EdgeRuntime pattern
- `supabase/functions/_shared/tracked-claude.ts` — telemetry-wrapped Claude calls

---

## Verification

1. Admin → `/admin/clients/:id` → Website tab → "Activate" → confirm portal shows intake form
2. Portal → fill all fields → submit → confirm status = `intake_submitted` in admin
3. Admin → "Generate Scaffold" → confirm progress messages appear (~30–60s)
4. Confirm GitHub repo exists at `github.com/hazetechnologies/{slug}-website`
5. Confirm `content.json` in repo contains AI-generated copy
6. Repeat with `use_brand_kit = true` for a client with an existing kit; confirm brand palette/voice appears in copy
7. Confirm portal shows "Ready" state after completion

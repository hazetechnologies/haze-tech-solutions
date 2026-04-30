# Social Media Audit — Design Spec

**Date:** 2026-04-30
**Author:** brainstorming session with user

## Context

Leads who select **Social Media Marketing** (or *All Three*) on the Contact form currently fall through with no automated follow-up — only the *AI Automation* path triggers a generated report. We're closing that gap with a competitive-gap-analysis audit that fetches real data from the lead's social handles + their competitors and produces a tailored report.

The audit must be compelling enough to convert: it serves both as a lead magnet and as proof-of-capability. Lead sees the report immediately on a live page after submitting; admin keeps a copy for follow-up.

**Out of scope for v1:** Facebook (deferred to Phase 2 once Meta's Page Public Content Access permission is approved), TikTok, X, LinkedIn (all gated behind paid or partner-only APIs).

## Decisions locked in

| Question | Answer |
|---|---|
| Which platforms? | YouTube + Instagram (FB → Phase 2) |
| Audit angle | Competitive gap analysis + content improvement recommendations |
| Delivery | Live `/audit/:id` page (lead-facing) **and** admin-visible row in `social_audits` |
| Content analysis | Text + vision on top 5 posts by engagement + 5 most recent per handle (10 images per handle) |
| Competitors per platform | Up to 2 |
| Form gating | Same Contact form, conditional on `service ∈ {"Social Media Marketing","All Three"}` |
| Worker runtime | Supabase Edge Function (150s timeout) — Vercel Hobby's 60s ceiling is too tight |
| AI model | `gpt-4o` (vision-enabled, single call with `response_format: json_schema`) |
| Cost estimate | ~$0.30 per audit (≤60 vision calls × ~$0.005) |
| IG Business anchor | "Haze Social Post" Page (ID `1132977853231597`, IG Business `17841423632446994`) — Haze Tech FB Page has no IG Business connected |

## Architecture

```
Contact form
   │ submit
   ▼
Supabase: leads row inserted
   │
   ▼ POST /api/start-social-audit
Vercel function (thin, ~1s)
   │
   ├─ insert social_audits (status='pending')
   └─ fire-and-forget invoke Edge Function
                                          │
                                          ▼
                  Supabase Edge Function (Deno)
                    a. fetch IG via Business Discovery
                    b. fetch YT via Data API v3
                    c. select 10 posts per handle (5 top + 5 recent)
                    d. one GPT-4o vision call → JSON report
                    e. render markdown
                    f. write report + status='completed'
                                          │
                                          ▼
                            social_audits updated
                                          ▲
       polls every 2s                     │
              ┌───────────────────────────┘
              │ Vercel /api/social-audit-status/:id (sanitized read)
              │
              ▼
     /audit/:id  (lead-facing, public, UUID-guarded)
     /admin/social-audits + /admin/social-audits/:id  (admin-gated)
```

## Six new components

1. **[Contact.jsx](../../../src/components/Contact.jsx)** — add conditional Social Media Audit block + post-submit redirect to `/audit/:id`
2. **[api/start-social-audit.js](../../../api/start-social-audit.js)** — validates body, inserts `social_audits` row, fires Edge Function, returns `{audit_id}`
3. **[api/social-audit-status/[id].js](../../../api/social-audit-status/[id].js)** — read-only sanitized status fetch for the polling page
4. **[supabase/functions/generate-social-audit/index.ts](../../../supabase/functions/generate-social-audit/index.ts)** — orchestrator + `lib/` helpers (see file decomposition below)
5. **[src/pages/AuditResults.jsx](../../../src/pages/AuditResults.jsx)** — lead-facing public audit page
6. **[src/pages/admin/SocialAudits.jsx](../../../src/pages/admin/SocialAudits.jsx)** + **[SocialAuditDetail.jsx](../../../src/pages/admin/SocialAuditDetail.jsx)** — admin list + detail

Plus: `social_audits` table, secrets in Supabase Edge Function env, one new Vercel env var.

## Data shapes

### `social_audits` table

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK default `gen_random_uuid()` | non-guessable; goes in `/audit/:id` URL |
| `lead_id` | uuid FK → leads.id (nullable) | lets admin manually trigger without a lead |
| `status` | text NOT NULL | `pending` → `fetching` → `analyzing` → `completed` \| `failed` |
| `progress_message` | text | shown on the live polling page |
| `inputs` | jsonb NOT NULL | exactly what the lead submitted |
| `raw_data` | jsonb | platform API responses, kept for debugging + admin inspection |
| `report` | jsonb | structured AI output |
| `report_markdown` | text | rendered for live page + email |
| `error` | text nullable | populated only if `status='failed'` |
| `created_at` / `updated_at` / `completed_at` | timestamptz | auto-managed |

RLS: **service_role only.** Lead-facing reads route through `/api/social-audit-status/:id` (uses service role and sanitizes the response).

### `inputs` jsonb shape

```jsonc
{
  "platforms": {
    "instagram": { "self": "@biz", "competitors": ["@compA", "@compB"] },
    "youtube":   { "self": "UCxxx", "competitors": [] }
  },
  "audience": "Small-business owners in real estate",
  "goal": "Lead generation",
  "challenge": "Inconsistent posting and low engagement"
}
```
Platforms without a `self` handle are skipped. Competitors capped at 2 per platform. Server rejects submissions with no `self` handles across all platforms.

### `report` jsonb shape (what GPT-4o returns)

```jsonc
{
  "headline": "Your Social Media Audit",
  "summary": "Executive summary, 1–2 paragraphs.",
  "platforms": {
    "instagram": {
      "current_state": { "followers": 1200, "weekly_posts": 2.3, "engagement_rate": 0.034 },
      "competitor_comparison": [
        { "handle": "@compA", "followers": 5400, "weekly_posts": 5.0, "engagement_rate": 0.052 }
      ],
      "content_analysis": {
        "strengths": ["..."],
        "weaknesses": ["..."],
        "visual_consistency_score": 6
      },
      "recommendations": ["..."]
    },
    "youtube": { /* same shape */ }
  },
  "top_recommendations": ["1. ...", "2. ..."],
  "next_steps_cta": "Want Haze Tech to execute this plan? Reply to this audit or book a call."
}
```

Stored as JSON for typed admin views + computed to markdown for easy lead rendering and email.

## Form changes

New conditional block in [`Contact.jsx`](../../../src/components/Contact.jsx) when `service ∈ {"Social Media Marketing","All Three"}`, mirroring the existing AI Automation block:

```
SOCIAL MEDIA AUDIT DETAILS
  Instagram
    Your handle (e.g. @yourbiz)        [_________________]
    Competitor 1 (optional)            [_________________]
    Competitor 2 (optional)            [_________________]
  YouTube
    Your channel URL or @handle        [_________________]
    Competitor 1 (optional)            [_________________]
    Competitor 2 (optional)            [_________________]

  Who's your target audience?          [textarea, 2 rows]
  Primary goal                         [dropdown: Engagement / Leads / Awareness / Sales]
  Biggest challenge right now          [textarea, 2 rows]
```

Post-submit, instead of the existing "Message sent!" success card, redirect to `/audit/:audit_id` (only for these service types).

## Worker — Supabase Edge Function

### Per-platform fetches (parallel)

**YouTube Data API v3** — server-side API key, no OAuth.
- Channel resolve → `/youtube/v3/channels?forHandle=@xxx&part=snippet,statistics`
- Recent videos → `/youtube/v3/search?channelId=...&order=date&maxResults=20&type=video`
- Video details → `/videos?id=A,B,...&part=snippet,statistics`
- Quota cost ≈ 110 units per handle. Audit-wide ≈ 660 units of 10,000/day.

**Instagram Business Discovery** — single call per handle:
```
GET /v21.0/{META_IG_BUSINESS_ACCOUNT_ID}
  ?fields=business_discovery.username({target}){followers_count,media_count,
    media.limit(20){caption,like_count,comments_count,media_type,timestamp,
      permalink,thumbnail_url,media_url}}
  &access_token={META_PAGE_ACCESS_TOKEN}
```
Constraint: target must be IG Business or Creator account. Personal accounts return OAuthException 100 — handled as graceful degradation.

### Post selection

For each handle, pick **5 posts by highest engagement (`like_count + comments_count`) + 5 most recent** (deduped by post id, max 10 per handle). Covers both their best work and their current style. If a handle has fewer than 10 posts, take all of them.

### Single GPT-4o call

```
POST https://api.openai.com/v1/chat/completions
{
  "model": "gpt-4o",
  "response_format": { "type": "json_schema", "json_schema": { ... } },
  "messages": [
    { "role": "system", "content": "<strategist prompt with {audience} {goal} {challenge}>" },
    { "role": "user", "content": [
        { "type": "text", "text": "<JSON-stringified raw data>" },
        { "type": "image_url", "image_url": { "url": "<thumb1>" } },
        ...
      ]
    }
  ]
}
```

System prompt must:
- State the strategist role + lead's audience/goal/challenge
- Require specific references to actual posts (not generic advice)
- Require gap-style framing ("competitor X does Y, you don't")
- Demand JSON output matching the `report` schema

### File decomposition

| File | Approx LOC | Responsibility |
|---|---|---|
| `supabase/functions/generate-social-audit/index.ts` | ~80 | Orchestrator entry — read inputs, dispatch fetches, call AI, write result |
| `supabase/functions/generate-social-audit/lib/fetch-instagram.ts` | ~100 | All IG Graph API calls + degradation logic |
| `supabase/functions/generate-social-audit/lib/fetch-youtube.ts` | ~90 | All YT Data API calls |
| `supabase/functions/generate-social-audit/lib/select-posts.ts` | ~40 | "5 top + 5 recent" dedup logic |
| `supabase/functions/generate-social-audit/lib/build-prompt.ts` | ~80 | System prompt + user content + image_url array assembly |
| `supabase/functions/generate-social-audit/lib/render-markdown.ts` | ~60 | JSON report → markdown |
| `supabase/functions/generate-social-audit/lib/validate-inputs.ts` (+ test) | ~40 + ~30 | Input shape guard |
| `api/start-social-audit.js` | ~50 | Validate body, insert row, fire-and-forget invoke |
| `api/social-audit-status/[id].js` | ~30 | Read-only fetch from `social_audits` (sanitized) |
| `src/pages/AuditResults.jsx` | ~150 | Polling page with three render states |
| `src/pages/admin/SocialAudits.jsx` | ~100 | List + filters |
| `src/pages/admin/SocialAuditDetail.jsx` | ~120 | Three-tab detail view |

## Live audit page (`/audit/:id`)

Public route, no auth required (UUID is the security guard). Polls `/api/social-audit-status/:id` every 2 seconds.

Three render states:

- **pending / fetching / analyzing** — progress checklist + skeleton blocks. Stops polling and falls back to "we'll email you when ready" after 5 minutes without completion.
- **completed** — `react-markdown` renders `report_markdown`. Top: lead's brand name + audit headline. Bottom: CTA to `/#contact` or mailto.
- **failed** — friendly error + "our team will follow up directly" message.

Status endpoint returns sanitized payload — never `raw_data`:
```js
{ status, progress_message, report_markdown, error }
```

## Admin views

- `/admin/social-audits` — table of recent rows; filter by status; sort by `created_at DESC`.
- `/admin/social-audits/:id` — three tabs: **Report** (markdown), **Inputs** (handles, audience, goal, challenge), **Raw data** (collapsible JSON viewer).
- "Re-run audit" button → `/api/admin/rerun-audit/:id` (admin-auth, resets to `pending`, re-invokes Edge Function).
- "Email to lead" button → sends `report_markdown` via existing EmailJS or Hostinger SMTP.
- New sidebar menu item in [`AdminLayout.jsx`](../../../src/pages/admin/AdminLayout.jsx).

## Routing additions in [`App.jsx`](../../../src/App.jsx)
```jsx
<Route path="/audit/:id" element={<AuditResults />} />            // public
<Route path="/admin/social-audits" element={<SocialAudits />} />  // admin-gated
<Route path="/admin/social-audits/:id" element={<SocialAuditDetail />} />
```

## Error handling

Platforms processed independently. A failure on one doesn't kill the audit:

| Failure | Behavior |
|---|---|
| IG handle is personal (not Business) | OAuthException 100 → mark `unavailable: 'personal_account'`, audit continues with note in report |
| IG handle doesn't exist | OAuthException 100 with different message → mark `unavailable: 'not_found'` |
| YouTube handle doesn't resolve | `items: []` → mark `unavailable: 'not_found'` |
| YouTube quota exhausted | 403 + `quotaExceeded` → status='failed' |
| OpenAI rate limit (429) | Retry once with 5s backoff, then fail |
| OpenAI returns invalid JSON despite `response_format` | Parse error → retry once with stricter prompt, then fail |
| Image URL inaccessible to GPT-4o | Logged to `raw_data.warnings`, audit continues |
| Edge Function timeout (>150s) | Row stays at last status; status endpoint surfaces "audit appears stalled" after 120s of no updates; admin notified |

**Aggregation rule:** A platform is considered "succeeded" if at least the lead's own (`self`) handle was fetched (competitor failures alone don't fail the platform). If every platform that was submitted fails its `self` fetch → `status='failed'` with a combined error string. Otherwise call GPT-4o with whatever data was gathered; the system prompt instructs it to note unavailable platforms or handles in the report.

## Configuration / secrets

### Supabase Edge Function secrets (dashboard or CLI)
- `OPENAI_API_KEY`
- `YOUTUBE_API_KEY`
- `META_APP_ID` = `2224722164676416`
- `META_APP_SECRET`
- `META_PAGE_ACCESS_TOKEN` (Page token derived from long-lived User token; ~60-day expiry, document rotation)
- `META_IG_BUSINESS_ACCOUNT_ID` = `17841423632446994`
- `META_GRAPH_VERSION` = `v21.0`

Auto-injected by Supabase: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`.

### Vercel env vars
- `SUPABASE_EDGE_FUNCTION_URL` = `https://ioxpfvxcsclgmwyslxjj.supabase.co/functions/v1`
- `SUPABASE_SERVICE_ROLE_KEY` (likely already set from prior work)

### `.env` (local dev only) — keep ONLY
- `VITE_EMAILJS_*`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

Do **not** put `META_*`, `YOUTUBE_API_KEY`, `OPENAI_API_KEY`, or `Vercel_Access_Token` in `.env` — none of those are read by Vite or `vercel dev` for the audit feature.

## Migration SQL

`supabase/migrations/2026_04_30_create_social_audits.sql`:

```sql
CREATE TABLE IF NOT EXISTS social_audits (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           uuid REFERENCES leads(id) ON DELETE SET NULL,
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','fetching','analyzing','completed','failed')),
  progress_message  text,
  inputs            jsonb NOT NULL,
  raw_data          jsonb,
  report            jsonb,
  report_markdown   text,
  error             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  completed_at      timestamptz
);

CREATE INDEX IF NOT EXISTS social_audits_lead_id_idx    ON social_audits(lead_id);
CREATE INDEX IF NOT EXISTS social_audits_status_idx     ON social_audits(status);
CREATE INDEX IF NOT EXISTS social_audits_created_at_idx ON social_audits(created_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS social_audits_updated_at ON social_audits;
CREATE TRIGGER social_audits_updated_at
  BEFORE UPDATE ON social_audits
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE social_audits ENABLE ROW LEVEL SECURITY;
-- No policies → no access for anon/authenticated. service_role bypasses RLS.
```

## Deployment steps

1. **DB:** apply migration via `psql` against the Supabase project.
2. **Secrets:** add the seven Edge Function secrets via Supabase dashboard.
3. **Edge Function:** `supabase functions deploy generate-social-audit --project-ref ioxpfvxcsclgmwyslxjj` from repo root.
4. **Vercel env:** add `SUPABASE_EDGE_FUNCTION_URL` to the Vercel project; verify `SUPABASE_SERVICE_ROLE_KEY` exists.
5. **Frontend + serverless:** push to `main`; Vercel auto-builds. New routes (`/audit/:id`, `/admin/social-audits*`, `/api/start-social-audit`, `/api/social-audit-status/[id]`) ship together.
6. **Smoke test:** run the manual checklist below.

## Verification — manual smoke checklist (no formal test suite in repo)

```
□ 1. POST /api/start-social-audit with valid IG-only inputs → 200 {audit_id}, social_audits row created with status='pending'
□ 2. Within 5s, social_audits row updates to status='fetching'
□ 3. Within 30s, status='analyzing', raw_data.instagram populated
□ 4. Within 120s, status='completed', report + report_markdown populated
□ 5. /audit/:id polling shows progressive states then renders the report
□ 6. /admin/social-audits lists the audit; detail view shows Report/Inputs/Raw data tabs
□ 7. Submit with a personal IG handle → audit completes; report mentions the handle was unavailable
□ 8. Submit with a non-existent YouTube channel → audit completes; YouTube section omitted
□ 9. Submit with no platforms (only audience/goal/challenge) → /api/start-social-audit returns 400
```

Plus one isolated unit test: `supabase/functions/generate-social-audit/lib/validate-inputs.test.ts` (Deno's built-in test runner) covering input-shape rejection paths from item 9.

## Phase 2 — deferred

- **Facebook Pages** — re-enable once Meta's Page Public Content Access is approved. Architecture supports it as an additive change (new `fetch-facebook.ts`, extend `report` JSON schema, unhide FB form section).
- **TikTok / X / LinkedIn** — likely require switching to scraping (browser-agent on VPS) since official APIs are paid/gated/partner-only.
- **Email delivery** — currently the lead sees the audit on `/audit/:id` only. Phase 2 can email a copy via existing EmailJS pattern.
- **Page-token rotation automation** — currently manual every ~60 days. Phase 2 can add a Vercel cron that refreshes via `/oauth/access_token` exchange.

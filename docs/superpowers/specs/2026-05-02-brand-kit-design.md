# Brand Kit Generator — Design Spec

**Date:** 2026-05-02
**Status:** Design approved, pending implementation plan
**Estimated effort:** ~26-28 dev hours (3-4 days focused)

## Goal

When a new social-media client is onboarded, the team clicks one button and gets an AI-generated "first draft" brand kit they can refine in Figma/Canva before delivering. Saves an estimated 3-4 hours of strategist time per onboarding by removing the blank-page problem.

The output is **internal-only** — your team uses it as a starting point, never delivered raw to the client.

## Out of scope (deferred to v2+)

- Per-asset regeneration (v1 is single-shot — re-rolling re-rolls everything)
- Versioning / history of prior kits
- ZIP download bundle
- Client-portal visibility (clients never see the raw kit)
- In-product editing of generated assets
- Logo refinement loops ("make the logo more X")
- Path 2 intake (existing accounts, no audit) — most clients arrive via the audit funnel; defer until proven necessary

## Architecture

```
┌─ Admin opens "Brand Kit" tab on /admin/clients/:id ────┐
│                                                         │
│  Empty state: intake form                               │
│  - Path 1: auto-detected if social_audits.inputs.email  │
│            matches client.email → prefill 4 fields,     │
│            ask for vibe/colors/refs                     │
│  - Path 3: no audit found → 7-question form             │
│                                                         │
│  Submit button: "Generate Brand Kit"                    │
└──────────────────┬──────────────────────────────────────┘
                   ↓ POST /api/start-brand-kit
                   ↓ Creates row in brand_kits, status='pending'
                   ↓ Invokes Edge Function (EdgeRuntime.waitUntil)
                   ↓ Returns { kit_id } immediately
                   ↓
┌─ Edge Function: generate-brand-kit (Deno) ─────────────┐
│  1. Update status='generating'                          │
│  2. Generate text assets in parallel (~10 sec):         │
│     - mini: bios, hashtags, handles, platform priority  │
│     - opus: voice/tone, content pillars, calendar,      │
│       color palette                                     │
│  3. Generate 9 image assets via gpt-image-2 (~90 sec):  │
│     logo primary, logo icon, logo monochrome,           │
│     profile pic, 5 banners                              │
│  4. Post-process banners with sharp                     │
│     (resize/crop to exact platform dimensions)          │
│  5. Upload images to R2:                                │
│     brand-kits/{client_id}/{timestamp}/{asset_id}.png   │
│  6. Save assets back to brand_kits row, status='done'   │
└─────────────────────────────────────────────────────────┘
                   ↓
┌─ Admin sees Brand Kit tab populate (2-sec polling) ────┐
│  - Status indicator with progress message               │
│  - Once 'done': 9 images with per-image download        │
│  - Text assets with copy-to-clipboard buttons           │
│  - "Regenerate Kit" button at top (re-runs full flow)   │
└─────────────────────────────────────────────────────────┘
```

## Components

### 1. Database — new table `brand_kits`

```sql
create table brand_kits (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  source_audit_id uuid references social_audits(id),
  status text not null default 'pending',
  -- 'pending' | 'generating' | 'done' | 'failed'
  inputs jsonb not null,
  assets jsonb,
  error text,
  progress_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index on brand_kits (client_id, created_at desc);

create trigger set_updated_at_brand_kits
  before update on brand_kits
  for each row execute function set_updated_at();

alter table brand_kits enable row level security;

-- Admin (service-role) reads all; client portal cannot read brand_kits.
create policy brand_kits_authenticated_select on brand_kits
  for select to authenticated using (true);
```

**`inputs` shape (Path 3 — cold-start):**

```jsonc
{
  "path": "cold_start",
  "business_name": "Acme Coffee Co.",
  "business_description": "small-batch artisan coffee roaster, retail + wholesale",
  "industry": "specialty coffee",
  "audience": "urban professionals 25-45 who care about ethical sourcing",
  "vibe": ["minimalist", "warm", "premium"],
  "color_preference": "earthy with one bold accent",
  "inspirations": "Blue Bottle, Stumptown, Onyx",
  "voice_tone_preference": "knowledgeable but unpretentious, occasionally playful"
}
```

**`inputs` shape (Path 1 — audit prefill):**

```jsonc
{
  "path": "audit_prefill",
  "business_name": "Acme Coffee Co.",        // from client record
  "industry": "specialty coffee",             // from audit inputs
  "audience": "urban professionals 25-45...", // from audit inputs
  "goal": "Leads",                            // from audit inputs
  "challenge": "Low engagement on IG",        // from audit inputs
  "vibe": ["minimalist", "warm", "premium"], // newly collected
  "color_preference": "earthy with one bold accent",  // newly collected
  "inspirations": "Blue Bottle, Stumptown"     // newly collected
}
```

**`assets` shape (after generation):**

```jsonc
{
  "bios": {
    "instagram": "...",
    "tiktok": "...",
    "youtube": "...",
    "x": "...",
    "facebook": "..."
  },
  "voice_tone": "## Voice & Tone\n\nThe brand sounds like a knowledgeable friend...",
  "hashtags": ["#specialtycoffee", "#smallbatch", "..."],
  "content_pillars": [
    { "name": "Origin Stories", "description": "..." },
    { "name": "Brewing Tutorials", "description": "..." }
  ],
  "handles": ["@acmecoffee", "@acme_coffee_co", "..."],
  "platform_priority": "Start with Instagram. Reasoning: ...",
  "content_calendar": [
    { "day": 1, "platform": "instagram", "pillar": "Origin Stories", "hook": "..." }
  ],
  "color_palette": [
    { "name": "primary",   "hex": "#3B2F1E", "use": "Headlines, logo" },
    { "name": "secondary", "hex": "#D4A574", "use": "Backgrounds" },
    { "name": "accent",    "hex": "#C84B31", "use": "CTAs, highlights" },
    { "name": "dark",      "hex": "#1A1410", "use": "Text on light" },
    { "name": "light",     "hex": "#F5EFE6", "use": "Backgrounds" }
  ],
  "images": {
    "logo_primary":    { "r2_key": "brand-kits/abc-123/2026-05-02-1430/logo_primary.png", "public_url": "https://r2-public-url/..." },
    "logo_icon":       { "r2_key": "...", "public_url": "..." },
    "logo_monochrome": { "r2_key": "...", "public_url": "..." },
    "profile_picture": { "r2_key": "...", "public_url": "..." },
    "banner_ig":       { "r2_key": "...", "public_url": "..." },  // 1080x1920
    "banner_fb":       { "r2_key": "...", "public_url": "..." },  // 820x312
    "banner_yt":       { "r2_key": "...", "public_url": "..." },  // 2560x1440
    "banner_x":        { "r2_key": "...", "public_url": "..." },  // 1500x500
    "banner_tiktok":   { "r2_key": "...", "public_url": "..." }   // 200x200
  }
}
```

### 2. Vercel API route — `POST /api/start-brand-kit`

Creates a `brand_kits` row, invokes the Edge Function asynchronously, returns `{ kit_id }` immediately. Mirrors the existing `/api/start-social-audit` pattern.

**Request body:**

```ts
{
  client_id: string,           // required
  source_audit_id?: string,     // optional, used in Path 1
  inputs: { /* see shapes above */ }
}
```

**Behavior:**

1. Verify caller is admin (not in `clients` table) — same pattern as `create-client.js`.
2. Insert into `brand_kits` with `status='pending'` and the request's inputs.
3. POST to the Edge Function URL with the new `kit_id`. Don't await the response.
4. Return `{ kit_id }` to the caller.

### 3. Edge Function — `generate-brand-kit`

Lives at `supabase/functions/generate-brand-kit/index.ts`. Uses `EdgeRuntime.waitUntil()` to process asynchronously after returning 200.

**Pipeline:**

```ts
async function processBrandKit(kit_id: string) {
  // 1. Load brand_kits row
  const kit = await supabase.from('brand_kits').select('*, clients(*)').eq('id', kit_id).single()
  await updateKit({ status: 'generating', progress_message: 'Drafting copy...' })

  // 2. Text assets (parallel)
  const [
    biosHashtagsHandlesPriority,
    voiceTone,
    contentPillars,
    contentCalendar,
    colorPalette,
  ] = await Promise.all([
    callMini('bios_hashtags_handles_priority', kit.inputs),
    callOpus('voice_tone', kit.inputs),
    callOpus('content_pillars', kit.inputs),
    callOpus('content_calendar', kit.inputs),
    callOpus('color_palette', kit.inputs),
  ])

  await updateKit({ progress_message: 'Generating images...' })

  // 3. Image assets (serial with retry-on-rate-limit)
  const imagePrompts = buildImagePrompts(kit.inputs, colorPalette)  // 9 prompts
  const images: Record<string, ImageAsset> = {}
  for (const [assetId, prompt, sizeHint] of imagePrompts) {
    const image = await generateImage(prompt, sizeHint)
    const resized = await resizeIfNeeded(image, EXACT_DIMENSIONS[assetId])
    const r2Key = await uploadToR2(resized, kit.client_id, assetId)
    images[assetId] = { r2_key: r2Key, public_url: r2PublicUrl(r2Key) }
  }

  // 4. Save final assets
  await updateKit({
    status: 'done',
    assets: { ...biosHashtagsHandlesPriority, voice_tone: voiceTone, content_pillars: contentPillars, content_calendar: contentCalendar, color_palette: colorPalette, images },
    progress_message: null,
  })
}
```

**Image prompt construction** uses the color palette generated in step 2 to anchor visual style across all 9 images, ensuring the logo / banners / profile picture all feel like the same brand.

**Rate-limit handling:** each `generateImage` call is wrapped in retry-with-exponential-backoff (3 attempts, 30/60/120 sec). If all fail, set `status='failed'` with a useful error message.

**Edge Function secrets needed:**
- `OPENAI_API_KEY` (already set)
- `ANTHROPIC_API_KEY` (new — set via Supabase Management API in implementation plan)
- `POSTHOG_PROJECT_API_KEY`, `POSTHOG_HOST` (already set in observability work)
- `R2_*` (need to set — see Storage section)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (already set)

### 4. Image generation — gpt-image-2

Pattern lifted from `haze-clips/web/app/api/broll/ai-generate/route.ts`:

```ts
const res = await fetch('https://api.openai.com/v1/images/generations', {
  method: 'POST',
  headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'gpt-image-2',
    prompt,
    size,        // '1024x1024' | '1024x1536' | '1536x1024'
    n: 1,
  }),
})
const json = await res.json()
const item = json.data?.[0]
const buffer = item.b64_json
  ? Buffer.from(item.b64_json, 'base64')
  : Buffer.from(await (await fetch(item.url!)).arrayBuffer())
```

**Asset → size mapping:**

| Asset | Final dimensions | gpt-image-2 size | Post-process |
|---|---|---|---|
| `logo_primary` | 1024×1024 | `1024x1024` | None |
| `logo_icon` | 1024×1024 | `1024x1024` | None |
| `logo_monochrome` | 1024×1024 | `1024x1024` | None |
| `profile_picture` | 1024×1024 | `1024x1024` | None |
| `banner_ig` | 1080×1920 (9:16) | `1024x1536` | Resize to 1080×1920 |
| `banner_fb` | 820×312 (~16:6) | `1536x1024` | Resize+crop to 820×312 |
| `banner_yt` | 2560×1440 (16:9) | `1536x1024` | Upscale to 2560×1440 |
| `banner_x` | 1500×500 (3:1) | `1536x1024` | Crop+resize to 1500×500 |
| `banner_tiktok` | 200×200 (1:1) | `1024x1024` | Resize to 200×200 |

**Post-processing** uses `sharp` (npm). For the Edge Function (Deno), use `npm:sharp@^0.33.0` import — Deno supports npm specifiers directly.

### 5. Text generation

**`callMini` (gpt-4o-mini)** for structured/repetitive output: bios per platform, hashtag list, handle suggestions, platform priority. Single call generates all four blocks via JSON-schema response format.

**`callOpus` (Claude Opus 4.7)** for nuanced output: voice/tone guide (markdown), content pillars (structured but creative), content calendar (14 hooks), color palette (5 colors with rationale).

Both call sites wrap with their tracked-* helpers:
- `trackedOpenAi` (already exists from observability work) — emits `$ai_generation` events
- `trackedClaude` (new — to be created) — Anthropic equivalent. Same shape as `trackedOpenAi`, calls Anthropic Messages API, emits same `$ai_generation` event with `$ai_provider: 'anthropic'`.

**Prompts** are stored in `supabase/functions/generate-brand-kit/prompts.ts` as exported template functions:

```ts
export function buildBiosPrompt(inputs: BrandKitInputs): string { ... }
export function buildVoiceTonePrompt(inputs: BrandKitInputs): string { ... }
// etc.
```

This keeps the Edge Function's `index.ts` focused on orchestration, with prompt iteration happening in a single dedicated file.

### 6. Storage — Cloudflare R2

Asset key structure:

```
brand-kits/
  {client_id}/
    {timestamp_iso}/
      logo_primary.png
      logo_icon.png
      logo_monochrome.png
      profile_picture.png
      banner_ig.png
      banner_fb.png
      banner_yt.png
      banner_x.png
      banner_tiktok.png
```

Timestamp segment ensures regenerations don't overwrite — old assets remain in R2 until manually pruned (deferred to v2).

**Bucket config:** uses an existing R2 bucket if one's already provisioned for haze-tech-solutions assets; otherwise create a new bucket `haze-tech-brand-kits` per the cloudflare skill's guidance. Public-read access for the `brand-kits/` prefix so admin UI can render images directly.

**Edge Function secrets needed for R2:** `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`. Implementation plan includes provisioning these.

### 7. Admin UI — new "Brand Kit" tab on `/admin/clients/:id`

**Tab placement:** add `{ key: 'brandkit', label: 'Brand Kit', icon: Sparkles }` to the existing `tabList` array in `src/pages/admin/ClientDetail.jsx`. Becomes the 5th tab alongside Projects/Milestones/Deliverables/Invoices.

**Empty state (no kit yet):**

- Render the intake form
- Auto-detect Path 1 vs Path 3 by querying `social_audits` for matching client email on tab mount
- If audit found, banner appears: "Linked to audit from {date}" + prefill the 4 audit-derived fields (industry, audience, goal, challenge), make them read-only with a "change" link
- If no audit, show the full Path 3 form
- "Generate Brand Kit" submit button calls `POST /api/start-brand-kit`, gets back `kit_id`, switches to the loading state

**Loading state (status='pending' or 'generating'):**

- Show progress message from `brand_kits.progress_message` ("Drafting copy..." → "Generating images...")
- Spinner + estimated time remaining (~100 sec total)
- Poll `GET /api/brand-kit-status/:id` every 2 seconds (mirrors social-audit polling)

**Done state (status='done'):**

- Top: "Brand Kit generated 2 min ago" + "Regenerate Kit" button (re-runs the entire pipeline)
- Section 1 — **Visual identity**: 9 image assets in a grid. Each has a preview, asset name, dimensions, and download button.
- Section 2 — **Color palette**: 5 swatches with hex codes + usage notes. Click-to-copy hex.
- Section 3 — **Profile bios**: 5 cards, one per platform. Each has the bio text + character count + copy button.
- Section 4 — **Voice & tone guide**: rendered markdown.
- Section 5 — **Content strategy**: hashtags, content pillars, platform priority, handle suggestions (Path 3 only) — each with copy buttons.
- Section 6 — **First 2-week content calendar**: 14 rows in a table (day, platform, pillar, hook).

**Failed state (status='failed'):**

- Error message from `brand_kits.error`
- "Try again" button (creates a new `brand_kits` row, doesn't retry the failed one)

### 8. Telemetry

Inherits from observability work shipped 2026-05-01. Events fired:

- `brand_kit_started` (frontend) when intake form submitted — properties: `client_id`, `path: 'audit_prefill' | 'cold_start'`
- `brand_kit_completed` (frontend, on poll → done) — properties: `kit_id`, `duration_ms`, `client_id`
- `brand_kit_failed` (frontend, on poll → failed) — properties: `kit_id`, `error`, `client_id`
- `$ai_generation` (Edge Function) — auto-emitted by `trackedOpenAi` (image gen, mini calls) and `trackedClaude` (Opus calls). Each carries `audit_id` analog: `kit_id`, plus `surface: 'brand-kit'`.

PostHog LLM-observability dashboard will show per-kit cost breakdown automatically.

## Effort estimate

| Component | Hours |
|---|---|
| Schema + migration + RLS | 1 |
| Intake form UI (auto-detect Path 1 vs 3, 7 fields) | 3 |
| Brand Kit tab + polling + render states | 4 |
| `/api/start-brand-kit` endpoint + auth check | 1 |
| Edge Function — text generation pipeline | 4 |
| Edge Function — image generation pipeline + sharp resize | 6 |
| R2 upload + key structure + bucket provisioning | 1 |
| Anthropic SDK install + `trackedClaude` helper | 2 |
| Prompt iteration on real test clients | 4-6 |
| **Total** | **~26-28 hours** |

## Risks

- **Image quality variance** — gpt-image-2 logo output will be inconsistent across clients. *Mitigation: matches "internal first-draft" framing — your team refines in Figma before the kit ships to clients.*
- **OpenAI image rate limits** — 9 images in ~90 sec is right at the tier-2 limit (7 req/min). *Mitigation: retry-with-backoff on 429s; if all retries fail, surface "rate limited, try again in 60s" to admin.*
- **Aspect-ratio post-processing edge cases** — banners need cropping to 5 non-standard dimensions. *Mitigation: sharp's resize/crop API is well-tested; manual QA on first few real kits will catch surprises.*
- **Color palette JSON inconsistency** — Opus may return color palettes in slightly different shapes despite the prompt asking for structured output. *Mitigation: validate with a Zod schema before saving; on shape mismatch, retry the call once, then fail the whole kit if still bad.*
- **Cost runaway via excessive regeneration** — admin clicks regenerate 5× for one kit because logo isn't right. ~$5 burned. *Mitigation: per-kit cost is so low (~$0.95) that even 5× regens are noise. Real cost guard is the per-asset regen feature in v2.*

## Testing strategy

No unit tests for the Edge Function — same approach as the social-audit Edge Function. The pipeline is integration glue with no business logic worth isolating.

**Manual smoke after deploy:**

1. Create a test client manually in `/admin/clients` with an email that doesn't match any `social_audits` row → confirm Path 3 form appears
2. Submit Path 3 with realistic test inputs → kit completes within 2 min, all 9 images present, all text fields populated
3. Spot-check banner dimensions (download `banner_ig.png` → verify 1080×1920)
4. Spot-check `$ai_generation` events in PostHog → confirm 3-4 mini calls + 4 opus calls + 9 image calls per kit
5. Create a test client whose email matches an existing audit → confirm Path 1 banner appears with prefill
6. Click Regenerate Kit on a completed kit → new generation runs, old assets remain in R2, `brand_kits` row updates in place

## Implementation order

The implementation plan will sequence:

1. Schema + migration
2. `trackedClaude` helper + Anthropic SDK install
3. R2 bucket + secrets setup
4. Edge Function scaffolding (status update flow, no AI yet)
5. Edge Function text pipeline (mini + opus calls)
6. Edge Function image pipeline (gpt-image-2 + sharp)
7. Vercel API route `/api/start-brand-kit`
8. Frontend: intake form (Path 1 + Path 3)
9. Frontend: Brand Kit tab + polling + render states
10. End-to-end smoke + prompt iteration

## Open questions

None remaining.

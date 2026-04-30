# Social Media Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a competitive-gap-analysis social audit (Instagram + YouTube) triggered when a lead picks "Social Media Marketing" or "All Three" on the Contact form. Lead sees a live results page; admin sees a row in a new `social_audits` table.

**Architecture:** Vercel `/api/start-social-audit` inserts a `social_audits` row and fires a Supabase Edge Function (Deno, 150s timeout) that fetches IG via Business Discovery + YouTube via Data API v3, runs vision-enabled `gpt-4o` on top-engagement+recent posts, and writes a JSON report + rendered markdown back to the row. Frontend polls Vercel `/api/social-audit-status/:id` every 2s.

**Tech Stack:** Vite + React 18 + react-router (frontend), Vercel Node.js serverless (`/api/*`), Supabase Postgres + Edge Functions (Deno), OpenAI `gpt-4o`, Meta Graph API v21.0, YouTube Data API v3.

**Spec:** [docs/superpowers/specs/2026-04-30-social-audit-design.md](../specs/2026-04-30-social-audit-design.md)

---

## Pre-requisites

Before starting tasks, the user must complete these (cannot be automated due to permission guards):

1. **Supabase Edge Function secrets set** via https://supabase.com/dashboard/project/ioxpfvxcsclgmwyslxjj/functions/secrets:
   - `OPENAI_API_KEY`, `YOUTUBE_API_KEY`, `META_APP_ID=2224722164676416`, `META_APP_SECRET`, `META_PAGE_ACCESS_TOKEN` (Page token for Page id `1132977853231597` — retrieved via curl in spec), `META_IG_BUSINESS_ACCOUNT_ID=17841423632446994`, `META_GRAPH_VERSION=v21.0`

2. **Vercel env vars** set via project Settings → Environment Variables:
   - `SUPABASE_EDGE_FUNCTION_URL=https://ioxpfvxcsclgmwyslxjj.supabase.co/functions/v1`
   - Confirm `SUPABASE_SERVICE_ROLE_KEY` already exists (used by `/api/chat.js` and `/api/generate-report.js`).

3. **`.env` cleanup** — strip everything except `VITE_*` vars. The audit feature does not read `.env` for credentials.

4. **Supabase CLI installed** locally for Edge Function deploy:
   - Windows: `scoop install supabase` or download from https://github.com/supabase/cli/releases
   - Then: `supabase login` → `supabase link --project-ref ioxpfvxcsclgmwyslxjj`

---

## File structure

**Created:**
- `supabase/migrations/2026_04_30_create_social_audits.sql`
- `supabase/functions/generate-social-audit/index.ts`
- `supabase/functions/generate-social-audit/lib/validate-inputs.ts`
- `supabase/functions/generate-social-audit/lib/validate-inputs.test.ts`
- `supabase/functions/generate-social-audit/lib/select-posts.ts`
- `supabase/functions/generate-social-audit/lib/select-posts.test.ts`
- `supabase/functions/generate-social-audit/lib/render-markdown.ts`
- `supabase/functions/generate-social-audit/lib/fetch-instagram.ts`
- `supabase/functions/generate-social-audit/lib/fetch-youtube.ts`
- `supabase/functions/generate-social-audit/lib/build-prompt.ts`
- `supabase/functions/generate-social-audit/lib/types.ts`
- `api/start-social-audit.js`
- `api/social-audit-status/[id].js`
- `src/pages/AuditResults.jsx`
- `src/pages/admin/SocialAudits.jsx`
- `src/pages/admin/SocialAuditDetail.jsx`

**Modified:**
- `src/components/Contact.jsx` — add Social Media conditional fields + post-submit redirect
- `src/App.jsx` — register 3 new routes
- `src/pages/admin/AdminLayout.jsx` — add Social Audits sidebar menu item
- `package.json` — add `react-markdown` dependency

---

## Task 1: Apply DB migration for `social_audits` table

**Files:**
- Create: `supabase/migrations/2026_04_30_create_social_audits.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/2026_04_30_create_social_audits.sql
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

- [ ] **Step 2: Apply the migration via Supabase Management API or psql**

Option A — psql via Supabase pooler (using user's existing access pattern):
```bash
PGPASSWORD='<password>' psql -h aws-0-us-west-2.pooler.supabase.com -p 5432 \
  -U postgres.ioxpfvxcsclgmwyslxjj -d postgres \
  -f supabase/migrations/2026_04_30_create_social_audits.sql
```

Option B — paste contents into Supabase Dashboard → SQL Editor → Run.

- [ ] **Step 3: Verify table exists**

```bash
PGPASSWORD='<password>' psql -h aws-0-us-west-2.pooler.supabase.com -p 5432 \
  -U postgres.ioxpfvxcsclgmwyslxjj -d postgres \
  -c "\d social_audits"
```
Expected: table description showing all columns + indexes + trigger.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026_04_30_create_social_audits.sql
git commit -m "feat(db): add social_audits table for social media audit feature"
```

---

## Task 2: Edge Function scaffolding + shared types

**Files:**
- Create: `supabase/functions/generate-social-audit/index.ts`
- Create: `supabase/functions/generate-social-audit/lib/types.ts`

- [ ] **Step 1: Create `lib/types.ts` with shared TypeScript types**

```typescript
// supabase/functions/generate-social-audit/lib/types.ts
export type Platform = 'instagram' | 'youtube'

export interface PlatformInput {
  self: string
  competitors: string[]  // 0-2 entries
}

export interface AuditInputs {
  platforms: Partial<Record<Platform, PlatformInput>>
  audience: string
  goal: 'Engagement' | 'Leads' | 'Awareness' | 'Sales'
  challenge: string
}

export interface FetchedPost {
  id: string
  caption: string
  like_count: number
  comments_count: number
  media_type: string
  timestamp: string         // ISO 8601
  permalink: string
  thumbnail_url?: string
  media_url?: string
}

export interface FetchedHandle {
  handle: string
  available: boolean
  unavailable_reason?: 'personal_account' | 'not_found' | 'api_error'
  followers_count?: number
  media_count?: number
  posts: FetchedPost[]
}

export interface FetchedPlatform {
  self?: FetchedHandle
  competitors: FetchedHandle[]
  error?: string
}

export interface RawData {
  instagram?: FetchedPlatform
  youtube?: FetchedPlatform
  warnings: string[]
}

export interface PlatformReport {
  current_state: {
    followers: number
    weekly_posts: number
    engagement_rate: number
  }
  competitor_comparison: Array<{
    handle: string
    followers: number
    weekly_posts: number
    engagement_rate: number
  }>
  content_analysis: {
    strengths: string[]
    weaknesses: string[]
    visual_consistency_score: number  // 1-10
  }
  recommendations: string[]
}

export interface AuditReport {
  headline: string
  summary: string
  platforms: Partial<Record<Platform, PlatformReport>>
  top_recommendations: string[]
  next_steps_cta: string
}
```

- [ ] **Step 2: Create stub `index.ts` Edge Function entry**

```typescript
// supabase/functions/generate-social-audit/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const { audit_id } = await req.json().catch(() => ({}))
  if (!audit_id) {
    return new Response(JSON.stringify({ error: 'audit_id required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // TODO: replaced in Task 9 with real orchestration
  await supabase.from('social_audits')
    .update({ status: 'completed', progress_message: 'stub' })
    .eq('id', audit_id)

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
```

- [ ] **Step 3: Deploy the stub to confirm tooling works**

```bash
supabase functions deploy generate-social-audit --project-ref ioxpfvxcsclgmwyslxjj
```
Expected: "Deployed Function generate-social-audit on project ioxpfvxcsclgmwyslxjj".

- [ ] **Step 4: Smoke test the deployed stub**

Insert a test row and invoke:
```bash
curl -X POST "https://ioxpfvxcsclgmwyslxjj.supabase.co/functions/v1/generate-social-audit" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"audit_id":"<uuid-of-pending-row>"}'
```
Expected: `{"ok":true}` and the row's `status` updated to `completed`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/generate-social-audit/
git commit -m "feat(edge): scaffold generate-social-audit Edge Function with stub handler"
```

---

## Task 3: `validate-inputs.ts` (TDD)

**Files:**
- Create: `supabase/functions/generate-social-audit/lib/validate-inputs.test.ts`
- Create: `supabase/functions/generate-social-audit/lib/validate-inputs.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// supabase/functions/generate-social-audit/lib/validate-inputs.test.ts
import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { validateInputs } from './validate-inputs.ts'

Deno.test('rejects when no self handles provided', () => {
  assertThrows(
    () => validateInputs({
      platforms: {},
      audience: 'x', goal: 'Leads', challenge: 'y'
    }),
    Error,
    'at least one'
  )
})

Deno.test('rejects when goal is invalid', () => {
  assertThrows(
    () => validateInputs({
      platforms: { instagram: { self: '@x', competitors: [] } },
      audience: 'x', goal: 'Bogus' as any, challenge: 'y'
    }),
    Error,
    'goal'
  )
})

Deno.test('rejects more than 2 competitors per platform', () => {
  assertThrows(
    () => validateInputs({
      platforms: { youtube: { self: 'UCx', competitors: ['a','b','c'] } },
      audience: 'x', goal: 'Leads', challenge: 'y'
    }),
    Error,
    'competitors'
  )
})

Deno.test('accepts valid IG-only input', () => {
  const result = validateInputs({
    platforms: { instagram: { self: '@biz', competitors: ['@a','@b'] } },
    audience: 'small biz', goal: 'Leads', challenge: 'low engagement'
  })
  assertEquals(result.platforms.instagram?.self, '@biz')
})

Deno.test('strips empty competitor strings', () => {
  const result = validateInputs({
    platforms: { instagram: { self: '@biz', competitors: ['@a', '', '  '] } },
    audience: 'x', goal: 'Leads', challenge: 'y'
  })
  assertEquals(result.platforms.instagram?.competitors, ['@a'])
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd supabase/functions/generate-social-audit
deno test --allow-all lib/validate-inputs.test.ts
```
Expected: FAIL with "module not found" — `validate-inputs.ts` does not exist yet.

- [ ] **Step 3: Implement `validate-inputs.ts`**

```typescript
// supabase/functions/generate-social-audit/lib/validate-inputs.ts
import type { AuditInputs, Platform } from './types.ts'

const VALID_GOALS = ['Engagement', 'Leads', 'Awareness', 'Sales'] as const
const VALID_PLATFORMS: Platform[] = ['instagram', 'youtube']

export function validateInputs(raw: unknown): AuditInputs {
  if (!raw || typeof raw !== 'object') throw new Error('inputs must be an object')
  const r = raw as Record<string, unknown>

  if (!VALID_GOALS.includes(r.goal as any)) {
    throw new Error(`goal must be one of ${VALID_GOALS.join(', ')}`)
  }
  if (typeof r.audience !== 'string') throw new Error('audience required')
  if (typeof r.challenge !== 'string') throw new Error('challenge required')

  const platforms: AuditInputs['platforms'] = {}
  const platformsRaw = (r.platforms ?? {}) as Record<string, any>

  for (const p of VALID_PLATFORMS) {
    const v = platformsRaw[p]
    if (!v || typeof v !== 'object') continue
    const self = typeof v.self === 'string' ? v.self.trim() : ''
    if (!self) continue
    const competitors = Array.isArray(v.competitors)
      ? v.competitors.map((c: any) => String(c ?? '').trim()).filter(Boolean)
      : []
    if (competitors.length > 2) {
      throw new Error(`too many competitors for ${p} (max 2)`)
    }
    platforms[p] = { self, competitors }
  }

  if (Object.keys(platforms).length === 0) {
    throw new Error('at least one platform with a self handle is required')
  }

  return {
    platforms,
    audience: r.audience,
    goal: r.goal as AuditInputs['goal'],
    challenge: r.challenge
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
deno test --allow-all lib/validate-inputs.test.ts
```
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/generate-social-audit/lib/validate-inputs.ts supabase/functions/generate-social-audit/lib/validate-inputs.test.ts
git commit -m "feat(edge): add validateInputs guard with deno tests"
```

---

## Task 4: `select-posts.ts` (TDD)

**Files:**
- Create: `supabase/functions/generate-social-audit/lib/select-posts.test.ts`
- Create: `supabase/functions/generate-social-audit/lib/select-posts.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// supabase/functions/generate-social-audit/lib/select-posts.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { selectPosts } from './select-posts.ts'
import type { FetchedPost } from './types.ts'

const post = (id: string, likes: number, comments: number, ts: string): FetchedPost => ({
  id, like_count: likes, comments_count: comments, timestamp: ts,
  caption: '', media_type: 'IMAGE', permalink: ''
})

Deno.test('returns at most 10 posts deduped', () => {
  const posts: FetchedPost[] = Array.from({ length: 20 }, (_, i) =>
    post(`p${i}`, i * 10, i, `2026-04-${String(i + 1).padStart(2, '0')}T00:00:00Z`)
  )
  const result = selectPosts(posts)
  assertEquals(result.length, 10)
  assertEquals(new Set(result.map(p => p.id)).size, 10)
})

Deno.test('top-engagement and most-recent overlap is deduped', () => {
  // p0 is both top-engagement (likes=100, comments=50) and most-recent
  const posts: FetchedPost[] = [
    post('p0', 100, 50, '2026-04-30T00:00:00Z'),
    post('p1', 50,  10, '2026-04-29T00:00:00Z'),
    post('p2', 30,   5, '2026-04-28T00:00:00Z'),
    post('p3', 10,   1, '2026-04-27T00:00:00Z'),
  ]
  const result = selectPosts(posts)
  assertEquals(result.length, 4)  // not 5+5=10 because of dedup
})

Deno.test('returns all posts if fewer than 10', () => {
  const posts: FetchedPost[] = [
    post('p0', 1, 1, '2026-04-30T00:00:00Z'),
    post('p1', 2, 2, '2026-04-29T00:00:00Z'),
  ]
  const result = selectPosts(posts)
  assertEquals(result.length, 2)
})

Deno.test('engagement is likes + comments', () => {
  const posts: FetchedPost[] = [
    post('high-likes',    100, 0,   '2026-01-01T00:00:00Z'),  // engagement 100
    post('high-comments', 0,   200, '2026-01-02T00:00:00Z'),  // engagement 200
    post('balanced',      50,  50,  '2026-01-03T00:00:00Z'),  // engagement 100
  ]
  const result = selectPosts(posts)
  // top-3 by engagement = high-comments, high-likes/balanced (tied)
  // top-3 by recency = balanced, high-comments, high-likes
  // so first by engagement is high-comments
  assertEquals(result[0].id, 'high-comments')
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
deno test --allow-all lib/select-posts.test.ts
```
Expected: FAIL with "module not found".

- [ ] **Step 3: Implement `select-posts.ts`**

```typescript
// supabase/functions/generate-social-audit/lib/select-posts.ts
import type { FetchedPost } from './types.ts'

const TOP_BY_ENGAGEMENT = 5
const TOP_BY_RECENCY = 5

export function selectPosts(posts: FetchedPost[]): FetchedPost[] {
  if (posts.length <= TOP_BY_ENGAGEMENT + TOP_BY_RECENCY) {
    return [...posts]
  }

  const engagementSorted = [...posts].sort((a, b) =>
    (b.like_count + b.comments_count) - (a.like_count + a.comments_count)
  )
  const recencySorted = [...posts].sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )

  const selected = new Map<string, FetchedPost>()
  for (const p of engagementSorted.slice(0, TOP_BY_ENGAGEMENT)) selected.set(p.id, p)
  for (const p of recencySorted.slice(0, TOP_BY_RECENCY))      selected.set(p.id, p)
  return Array.from(selected.values())
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
deno test --allow-all lib/select-posts.test.ts
```
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/generate-social-audit/lib/select-posts.ts supabase/functions/generate-social-audit/lib/select-posts.test.ts
git commit -m "feat(edge): add selectPosts (top-5 engagement + top-5 recent, deduped)"
```

---

## Task 5: `fetch-instagram.ts`

**Files:**
- Create: `supabase/functions/generate-social-audit/lib/fetch-instagram.ts`

- [ ] **Step 1: Implement `fetch-instagram.ts`**

```typescript
// supabase/functions/generate-social-audit/lib/fetch-instagram.ts
import type { FetchedHandle, FetchedPlatform, FetchedPost } from './types.ts'

const GRAPH_VERSION = Deno.env.get('META_GRAPH_VERSION') ?? 'v21.0'
const IG_BIZ_ID = Deno.env.get('META_IG_BUSINESS_ACCOUNT_ID')!
const PAGE_TOKEN = Deno.env.get('META_PAGE_ACCESS_TOKEN')!

const FIELDS = `business_discovery.username({u}){followers_count,media_count,media.limit(20){id,caption,like_count,comments_count,media_type,timestamp,permalink,thumbnail_url,media_url}}`

function normalize(h: string): string {
  return h.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/$/, '').trim()
}

async function fetchOne(handle: string): Promise<FetchedHandle> {
  const username = normalize(handle)
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${IG_BIZ_ID}?fields=${encodeURIComponent(FIELDS.replace('{u}', username))}&access_token=${PAGE_TOKEN}`

  const res = await fetch(url)
  const data = await res.json()

  if (data.error) {
    const code = data.error.code
    const msg = String(data.error.message || '')
    let reason: FetchedHandle['unavailable_reason'] = 'api_error'
    if (code === 100) {
      reason = msg.toLowerCase().includes('does not exist') ? 'not_found' : 'personal_account'
    }
    return { handle: '@' + username, available: false, unavailable_reason: reason, posts: [] }
  }

  const bd = data.business_discovery
  if (!bd) {
    return { handle: '@' + username, available: false, unavailable_reason: 'not_found', posts: [] }
  }

  const posts: FetchedPost[] = (bd.media?.data ?? []).map((m: any) => ({
    id: m.id,
    caption: m.caption ?? '',
    like_count: m.like_count ?? 0,
    comments_count: m.comments_count ?? 0,
    media_type: m.media_type ?? 'IMAGE',
    timestamp: m.timestamp,
    permalink: m.permalink,
    thumbnail_url: m.thumbnail_url,
    media_url: m.media_url,
  }))

  return {
    handle: '@' + username,
    available: true,
    followers_count: bd.followers_count,
    media_count: bd.media_count,
    posts,
  }
}

export async function fetchInstagram(self: string, competitors: string[]): Promise<FetchedPlatform> {
  try {
    const [selfRes, ...compRes] = await Promise.all([
      fetchOne(self),
      ...competitors.map(c => fetchOne(c)),
    ])
    return { self: selfRes, competitors: compRes }
  } catch (err) {
    return { self: undefined, competitors: [], error: err instanceof Error ? err.message : String(err) }
  }
}
```

- [ ] **Step 2: Smoke test against a known IG Business handle**

Add a temporary test invocation in `index.ts` (revert in Task 9), then:
```bash
supabase functions deploy generate-social-audit --project-ref ioxpfvxcsclgmwyslxjj
```
Manually invoke with `{"audit_id":"<uuid>"}` after inserting a row whose `inputs.platforms.instagram.self = "@nasa"`. Inspect the row's `raw_data.instagram`.

Expected: `self.followers_count` is non-zero, `posts.length > 0`.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/generate-social-audit/lib/fetch-instagram.ts
git commit -m "feat(edge): add Instagram Business Discovery fetcher with graceful error handling"
```

---

## Task 6: `fetch-youtube.ts`

**Files:**
- Create: `supabase/functions/generate-social-audit/lib/fetch-youtube.ts`

- [ ] **Step 1: Implement `fetch-youtube.ts`**

```typescript
// supabase/functions/generate-social-audit/lib/fetch-youtube.ts
import type { FetchedHandle, FetchedPlatform, FetchedPost } from './types.ts'

const YT_KEY = Deno.env.get('YOUTUBE_API_KEY')!

function parseHandle(input: string): { handle?: string; channelId?: string } {
  const trimmed = input.trim()
  // Channel ID: starts with UC, 24 chars
  if (/^UC[\w-]{22}$/.test(trimmed)) return { channelId: trimmed }
  // URL forms: youtube.com/@handle, youtube.com/channel/UC...
  const urlMatch = trimmed.match(/youtube\.com\/(@[\w.-]+|channel\/(UC[\w-]{22}))/i)
  if (urlMatch) {
    if (urlMatch[2]) return { channelId: urlMatch[2] }
    return { handle: urlMatch[1] }
  }
  // @handle bare
  if (trimmed.startsWith('@')) return { handle: trimmed }
  // bare custom name
  return { handle: '@' + trimmed }
}

async function resolveChannel(input: string): Promise<{ id: string; snippet: any; statistics: any } | null> {
  const parsed = parseHandle(input)
  const param = parsed.channelId ? `id=${parsed.channelId}` : `forHandle=${encodeURIComponent(parsed.handle!)}`
  const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&${param}&key=${YT_KEY}`
  const res = await fetch(url)
  const data = await res.json()
  if (!data.items?.length) return null
  return data.items[0]
}

async function fetchRecentVideos(channelId: string): Promise<FetchedPost[]> {
  // 1. Search for recent video IDs
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?channelId=${channelId}&part=snippet&order=date&maxResults=20&type=video&key=${YT_KEY}`
  const searchRes = await fetch(searchUrl)
  const searchData = await searchRes.json()
  const videoIds: string[] = (searchData.items ?? []).map((x: any) => x.id.videoId).filter(Boolean)
  if (videoIds.length === 0) return []

  // 2. Get full video details
  const videosUrl = `https://www.googleapis.com/youtube/v3/videos?id=${videoIds.join(',')}&part=snippet,statistics&key=${YT_KEY}`
  const videosRes = await fetch(videosUrl)
  const videosData = await videosRes.json()

  return (videosData.items ?? []).map((v: any) => ({
    id: v.id,
    caption: `${v.snippet.title}\n\n${v.snippet.description ?? ''}`,
    like_count: parseInt(v.statistics?.likeCount ?? '0', 10),
    comments_count: parseInt(v.statistics?.commentCount ?? '0', 10),
    media_type: 'VIDEO',
    timestamp: v.snippet.publishedAt,
    permalink: `https://www.youtube.com/watch?v=${v.id}`,
    thumbnail_url: v.snippet.thumbnails?.high?.url ?? v.snippet.thumbnails?.default?.url,
  }))
}

async function fetchOne(input: string): Promise<FetchedHandle> {
  try {
    const channel = await resolveChannel(input)
    if (!channel) {
      return { handle: input, available: false, unavailable_reason: 'not_found', posts: [] }
    }
    const posts = await fetchRecentVideos(channel.id)
    return {
      handle: '@' + (channel.snippet.customUrl ?? channel.snippet.title),
      available: true,
      followers_count: parseInt(channel.statistics?.subscriberCount ?? '0', 10),
      media_count: parseInt(channel.statistics?.videoCount ?? '0', 10),
      posts,
    }
  } catch (err) {
    return {
      handle: input, available: false, unavailable_reason: 'api_error', posts: []
    }
  }
}

export async function fetchYouTube(self: string, competitors: string[]): Promise<FetchedPlatform> {
  try {
    const [selfRes, ...compRes] = await Promise.all([
      fetchOne(self),
      ...competitors.map(c => fetchOne(c)),
    ])
    return { self: selfRes, competitors: compRes }
  } catch (err) {
    return { self: undefined, competitors: [], error: err instanceof Error ? err.message : String(err) }
  }
}
```

- [ ] **Step 2: Smoke test against `@MrBeast`**

Same pattern as Task 5 — temporary call in index.ts, deploy, invoke with `inputs.platforms.youtube.self = "@MrBeast"`. Expected: subscriber count near 200M+, 20 posts returned.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/generate-social-audit/lib/fetch-youtube.ts
git commit -m "feat(edge): add YouTube Data API v3 fetcher with handle/URL/channel-id parsing"
```

---

## Task 7: `build-prompt.ts`

**Files:**
- Create: `supabase/functions/generate-social-audit/lib/build-prompt.ts`

- [ ] **Step 1: Implement `build-prompt.ts`**

```typescript
// supabase/functions/generate-social-audit/lib/build-prompt.ts
import type { AuditInputs, RawData, FetchedPost } from './types.ts'
import { selectPosts } from './select-posts.ts'

export const REPORT_JSON_SCHEMA = {
  name: 'audit_report',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['headline', 'summary', 'platforms', 'top_recommendations', 'next_steps_cta'],
    properties: {
      headline: { type: 'string' },
      summary: { type: 'string' },
      platforms: {
        type: 'object',
        additionalProperties: false,
        properties: {
          instagram: { $ref: '#/$defs/platformReport' },
          youtube:   { $ref: '#/$defs/platformReport' },
        }
      },
      top_recommendations: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 10 },
      next_steps_cta: { type: 'string' },
    },
    $defs: {
      platformReport: {
        type: 'object',
        additionalProperties: false,
        required: ['current_state', 'competitor_comparison', 'content_analysis', 'recommendations'],
        properties: {
          current_state: {
            type: 'object', additionalProperties: false,
            required: ['followers', 'weekly_posts', 'engagement_rate'],
            properties: {
              followers: { type: 'integer' },
              weekly_posts: { type: 'number' },
              engagement_rate: { type: 'number' },
            }
          },
          competitor_comparison: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false,
              required: ['handle', 'followers', 'weekly_posts', 'engagement_rate'],
              properties: {
                handle: { type: 'string' },
                followers: { type: 'integer' },
                weekly_posts: { type: 'number' },
                engagement_rate: { type: 'number' },
              }
            }
          },
          content_analysis: {
            type: 'object', additionalProperties: false,
            required: ['strengths', 'weaknesses', 'visual_consistency_score'],
            properties: {
              strengths: { type: 'array', items: { type: 'string' } },
              weaknesses: { type: 'array', items: { type: 'string' } },
              visual_consistency_score: { type: 'integer', minimum: 1, maximum: 10 },
            }
          },
          recommendations: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  }
}

const SYSTEM_PROMPT = (inputs: AuditInputs) => `You are a senior social media strategist conducting an audit.
The brand's audience: ${inputs.audience}
Their primary goal: ${inputs.goal}
Their biggest challenge right now: ${inputs.challenge}

You will be given:
- Their current stats and recent posts on Instagram and/or YouTube
- Up to 2 competitor handles per platform with the same data
- Thumbnails of their (and competitors') top-performing and most-recent posts

Your job:
1. Compute current_state metrics:
   - followers = followers_count
   - weekly_posts = posts in last 90 days / 12.86 (rounded to 1 decimal)
   - engagement_rate = avg((likes + comments) / followers) over last 20 posts (decimal, e.g. 0.034 = 3.4%)
2. Build competitor_comparison entries with the same metrics for each competitor handle.
3. Analyze content quality based on the images you see and the captions provided. Score visual_consistency 1-10 where 10 = highly cohesive brand aesthetic.
4. Reference SPECIFIC posts when listing strengths/weaknesses. Don't be generic.
5. For recommendations, identify gaps where competitors do something the brand doesn't (e.g. "Competitor @x posts Reels 4x/week, you post 0").
6. Compile 5-7 prioritized top_recommendations across all platforms.
7. End with a compelling next_steps_cta urging the reader to engage Haze Tech to execute the plan.

Output JSON only, matching the provided schema.

If a platform has unavailable handles (personal account, not found, API error), note it in the report and skip that platform's section if no data was retrieved.`

export function buildPrompt(inputs: AuditInputs, raw: RawData): {
  systemPrompt: string
  userContent: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>
} {
  const userText = JSON.stringify({ inputs, raw_data: raw }, null, 2)
  const imageUrls: string[] = []

  for (const platformKey of ['instagram', 'youtube'] as const) {
    const platform = raw[platformKey]
    if (!platform) continue
    for (const handle of [platform.self, ...platform.competitors].filter(Boolean) as Array<NonNullable<typeof platform.self>>) {
      if (!handle.available) continue
      const top10 = selectPosts(handle.posts)
      for (const p of top10) {
        const url = p.thumbnail_url ?? p.media_url
        if (url) imageUrls.push(url)
      }
    }
  }

  const userContent: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [
    { type: 'text', text: userText }
  ]
  for (const url of imageUrls) {
    userContent.push({ type: 'image_url', image_url: { url } })
  }

  return { systemPrompt: SYSTEM_PROMPT(inputs), userContent }
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/generate-social-audit/lib/build-prompt.ts
git commit -m "feat(edge): add buildPrompt with strict JSON schema for audit report"
```

---

## Task 8: `render-markdown.ts`

**Files:**
- Create: `supabase/functions/generate-social-audit/lib/render-markdown.ts`

- [ ] **Step 1: Implement `render-markdown.ts`**

```typescript
// supabase/functions/generate-social-audit/lib/render-markdown.ts
import type { AuditReport, PlatformReport } from './types.ts'

function pct(n: number): string {
  return (n * 100).toFixed(1) + '%'
}

function fmtNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

function renderPlatform(name: string, report: PlatformReport): string {
  const lines: string[] = []
  lines.push(`## ${name}\n`)
  lines.push(`**Current state**`)
  lines.push(`- ${fmtNumber(report.current_state.followers)} followers`)
  lines.push(`- ${report.current_state.weekly_posts.toFixed(1)} posts per week`)
  lines.push(`- ${pct(report.current_state.engagement_rate)} engagement rate\n`)

  if (report.competitor_comparison.length > 0) {
    lines.push(`**Competitors**`)
    lines.push(`| Handle | Followers | Weekly posts | Engagement |`)
    lines.push(`|---|---|---|---|`)
    for (const c of report.competitor_comparison) {
      lines.push(`| ${c.handle} | ${fmtNumber(c.followers)} | ${c.weekly_posts.toFixed(1)} | ${pct(c.engagement_rate)} |`)
    }
    lines.push('')
  }

  lines.push(`**What's working**`)
  for (const s of report.content_analysis.strengths) lines.push(`- ${s}`)
  lines.push('')

  lines.push(`**What's not**`)
  for (const w of report.content_analysis.weaknesses) lines.push(`- ${w}`)
  lines.push('')

  lines.push(`**Visual consistency:** ${report.content_analysis.visual_consistency_score}/10\n`)

  lines.push(`**Recommendations**`)
  for (const r of report.recommendations) lines.push(`- ${r}`)
  lines.push('')

  return lines.join('\n')
}

export function renderMarkdown(report: AuditReport): string {
  const lines: string[] = []
  lines.push(`# ${report.headline}\n`)
  lines.push(`${report.summary}\n`)

  if (report.platforms.instagram) lines.push(renderPlatform('Instagram', report.platforms.instagram))
  if (report.platforms.youtube) lines.push(renderPlatform('YouTube', report.platforms.youtube))

  lines.push(`## Top recommendations\n`)
  for (const r of report.top_recommendations) lines.push(`- ${r}`)
  lines.push('')

  lines.push(`---\n${report.next_steps_cta}\n`)

  return lines.join('\n')
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/generate-social-audit/lib/render-markdown.ts
git commit -m "feat(edge): add renderMarkdown to convert AuditReport JSON to readable markdown"
```

---

## Task 9: Edge Function orchestrator (`index.ts`)

**Files:**
- Modify: `supabase/functions/generate-social-audit/index.ts`

- [ ] **Step 1: Replace stub with full orchestrator**

```typescript
// supabase/functions/generate-social-audit/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { validateInputs } from './lib/validate-inputs.ts'
import { fetchInstagram } from './lib/fetch-instagram.ts'
import { fetchYouTube } from './lib/fetch-youtube.ts'
import { buildPrompt, REPORT_JSON_SCHEMA } from './lib/build-prompt.ts'
import { renderMarkdown } from './lib/render-markdown.ts'
import type { RawData, AuditReport } from './lib/types.ts'

const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY')!

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const { audit_id } = await req.json().catch(() => ({}))
  if (!audit_id) {
    return new Response(JSON.stringify({ error: 'audit_id required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  async function update(patch: Record<string, unknown>) {
    await supabase.from('social_audits').update(patch).eq('id', audit_id)
  }

  async function fail(error: string) {
    await update({ status: 'failed', error })
  }

  try {
    const { data: row, error: readErr } = await supabase
      .from('social_audits').select('inputs').eq('id', audit_id).single()
    if (readErr || !row) { await fail(`row not found: ${readErr?.message}`); return ok() }

    const inputs = validateInputs(row.inputs)
    await update({ status: 'fetching', progress_message: 'Fetching platform data…' })

    const raw: RawData = { warnings: [] }
    const fetches: Promise<void>[] = []
    if (inputs.platforms.instagram) {
      fetches.push(fetchInstagram(inputs.platforms.instagram.self, inputs.platforms.instagram.competitors)
        .then(r => { raw.instagram = r }))
    }
    if (inputs.platforms.youtube) {
      fetches.push(fetchYouTube(inputs.platforms.youtube.self, inputs.platforms.youtube.competitors)
        .then(r => { raw.youtube = r }))
    }
    await Promise.all(fetches)

    // Aggregation rule from spec: platform "succeeded" iff self handle was fetched
    const igOk = !!raw.instagram?.self?.available
    const ytOk = !!raw.youtube?.self?.available
    if (!igOk && !ytOk) {
      await update({ raw_data: raw })
      await fail('All requested platforms failed to fetch the lead\'s own handles.')
      return ok()
    }

    await update({ status: 'analyzing', progress_message: 'Analyzing content with AI…', raw_data: raw })

    const { systemPrompt, userContent } = buildPrompt(inputs, raw)
    const aiRes = await callOpenAI(systemPrompt, userContent)
    const report: AuditReport = JSON.parse(aiRes)
    const markdown = renderMarkdown(report)

    await update({
      status: 'completed',
      progress_message: 'Done',
      report,
      report_markdown: markdown,
      completed_at: new Date().toISOString(),
    })
    return ok()
  } catch (err) {
    await fail(err instanceof Error ? err.message : String(err))
    return ok()
  }
})

async function callOpenAI(systemPrompt: string, userContent: any[]): Promise<string> {
  const body = {
    model: 'gpt-4o',
    response_format: { type: 'json_schema', json_schema: REPORT_JSON_SCHEMA },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
  }

  const attempt = async () => {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`OpenAI ${res.status}: ${errText.slice(0, 500)}`)
    }
    const data = await res.json()
    return data.choices?.[0]?.message?.content ?? ''
  }

  try {
    return await attempt()
  } catch (err) {
    // One retry on rate-limit/transient errors
    await new Promise(r => setTimeout(r, 5000))
    return await attempt()
  }
}

function ok() {
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
}
```

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy generate-social-audit --project-ref ioxpfvxcsclgmwyslxjj
```

- [ ] **Step 3: End-to-end smoke test on a known IG Business handle**

Insert a test row:
```sql
INSERT INTO social_audits (inputs) VALUES ('{
  "platforms": {"instagram": {"self": "@nasa", "competitors": ["@spacex"]}},
  "audience": "space enthusiasts",
  "goal": "Awareness",
  "challenge": "expanding reach beyond core audience"
}'::jsonb) RETURNING id;
```
Note the returned `id` as `<test_id>`.

Invoke:
```bash
curl -X POST "https://ioxpfvxcsclgmwyslxjj.supabase.co/functions/v1/generate-social-audit" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"audit_id\":\"<test_id>\"}"
```

After ~60–90 seconds, query the row:
```sql
SELECT status, progress_message, report_markdown FROM social_audits WHERE id = '<test_id>';
```

Expected: `status='completed'`, `report_markdown` non-null with platform sections + recommendations.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/generate-social-audit/index.ts
git commit -m "feat(edge): wire up generate-social-audit orchestrator with retry + degradation"
```

---

## Task 10: Vercel `/api/start-social-audit.js`

**Files:**
- Create: `api/start-social-audit.js`

- [ ] **Step 1: Implement the kickoff endpoint**

```javascript
// api/start-social-audit.js
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { lead_id, inputs } = req.body || {}
  if (!inputs || typeof inputs !== 'object') {
    return res.status(400).json({ error: 'inputs required' })
  }
  // Light validation — Edge Function does authoritative check
  const platforms = inputs.platforms || {}
  const hasSelf = ['instagram', 'youtube'].some(p => platforms[p]?.self)
  if (!hasSelf) {
    return res.status(400).json({ error: 'at least one platform with a self handle is required' })
  }

  const { data, error } = await supabase
    .from('social_audits')
    .insert({ lead_id: lead_id || null, inputs, status: 'pending', progress_message: 'Queued…' })
    .select('id')
    .single()

  if (error) {
    return res.status(500).json({ error: `db insert failed: ${error.message}` })
  }

  // Fire-and-forget invoke the Edge Function
  const edgeUrl = `${process.env.SUPABASE_EDGE_FUNCTION_URL}/generate-social-audit`
  fetch(edgeUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ audit_id: data.id }),
  }).catch(err => console.error('Edge Function invoke failed:', err))

  return res.status(200).json({ audit_id: data.id })
}
```

- [ ] **Step 2: Deploy via push to main + Vercel auto-build**

```bash
git add api/start-social-audit.js
git commit -m "feat(api): add /api/start-social-audit Vercel endpoint"
git push origin main
```

- [ ] **Step 3: Smoke test the deployed endpoint**

```bash
curl -X POST "https://www.hazetechsolutions.com/api/start-social-audit" \
  -H "Content-Type: application/json" \
  -d '{"inputs":{"platforms":{"instagram":{"self":"@nasa","competitors":[]}},"audience":"x","goal":"Leads","challenge":"y"}}'
```

Expected: `{"audit_id":"<uuid>"}`. Confirm row exists in `social_audits` with `status='pending'` initially, then progresses to `completed` within ~90s (Edge Function fired by Vercel).

---

## Task 11: Vercel `/api/social-audit-status/[id].js`

**Files:**
- Create: `api/social-audit-status/[id].js`

- [ ] **Step 1: Implement the polling endpoint**

```javascript
// api/social-audit-status/[id].js
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { id } = req.query
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'id required' })
  }

  const { data, error } = await supabase
    .from('social_audits')
    .select('status,progress_message,report_markdown,error,updated_at')
    .eq('id', id)
    .single()

  if (error) {
    return res.status(404).json({ error: 'not found' })
  }

  // Sanitized — never return raw_data, inputs, or full report JSON to lead
  return res.status(200).json({
    status: data.status,
    progress_message: data.progress_message,
    report_markdown: data.status === 'completed' ? data.report_markdown : null,
    error: data.status === 'failed' ? data.error : null,
    updated_at: data.updated_at,
  })
}
```

- [ ] **Step 2: Deploy + smoke test**

```bash
git add api/social-audit-status/
git commit -m "feat(api): add sanitized /api/social-audit-status/[id] polling endpoint"
git push origin main
```

After Vercel builds:
```bash
curl "https://www.hazetechsolutions.com/api/social-audit-status/<test_id>"
```
Expected: `{"status":"completed","progress_message":"Done","report_markdown":"# ...", ...}` (or whatever current state).

---

## Task 12: Add `react-markdown` dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install react-markdown**

```bash
cd "c:/Users/wealt/OneDrive/Documents/N8N Workflows/Website Builders/haze-tech-solutions"
npm install react-markdown
```

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add react-markdown for audit report rendering"
```

---

## Task 13: Lead-facing `/audit/:id` page

**Files:**
- Create: `src/pages/AuditResults.jsx`

- [ ] **Step 1: Implement `AuditResults.jsx`**

```jsx
// src/pages/AuditResults.jsx
import { useEffect, useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'

const POLL_INTERVAL_MS = 2000
const MAX_POLL_MS = 5 * 60 * 1000   // 5 minutes

export default function AuditResults() {
  const { id } = useParams()
  const [state, setState] = useState({ status: 'pending', progress_message: 'Queued…' })
  const [stalled, setStalled] = useState(false)
  const startedAt = useRef(Date.now())

  useEffect(() => {
    let cancelled = false
    let timer

    async function poll() {
      try {
        const res = await fetch(`/api/social-audit-status/${id}`)
        const data = await res.json()
        if (cancelled) return
        setState(data)

        if (data.status === 'completed' || data.status === 'failed') return
        if (Date.now() - startedAt.current > MAX_POLL_MS) {
          setStalled(true)
          return
        }
        timer = setTimeout(poll, POLL_INTERVAL_MS)
      } catch (err) {
        if (!cancelled) timer = setTimeout(poll, POLL_INTERVAL_MS * 2)
      }
    }

    poll()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [id])

  if (stalled) {
    return (
      <Container>
        <h1>Hang tight — your audit is taking longer than expected</h1>
        <p>Our team has been notified. We'll email your audit to you within the next hour.</p>
        <Link to="/#contact">Back to home</Link>
      </Container>
    )
  }

  if (state.status === 'failed') {
    return (
      <Container>
        <h1>We couldn't complete your audit</h1>
        <p>{state.error}</p>
        <p>Our team will follow up directly with a manual review.</p>
        <Link to="/#contact">Back to home</Link>
      </Container>
    )
  }

  if (state.status === 'completed') {
    return (
      <Container>
        <article className="prose prose-invert max-w-none">
          <ReactMarkdown>{state.report_markdown}</ReactMarkdown>
        </article>
        <div style={{ marginTop: 32, padding: 24, background: 'rgba(0,212,255,0.06)', borderRadius: 12 }}>
          <h3>Want Haze Tech to execute this plan?</h3>
          <Link to="/#contact" style={{ color: '#00CFFF' }}>Book a strategy call →</Link>
        </div>
      </Container>
    )
  }

  // pending / fetching / analyzing
  return (
    <Container>
      <h1>Generating your social audit…</h1>
      <p>{state.progress_message}</p>
      <ProgressList status={state.status} />
      <SkeletonBlocks />
    </Container>
  )
}

function Container({ children }) {
  return (
    <main style={{ minHeight: '100vh', padding: '4rem 1.5rem', maxWidth: 800, margin: '0 auto', color: '#F1F5F9' }}>
      {children}
    </main>
  )
}

function ProgressList({ status }) {
  const steps = [
    { key: 'fetching',  label: 'Fetching platform data' },
    { key: 'analyzing', label: 'Analyzing with AI' },
  ]
  const order = ['pending', 'fetching', 'analyzing', 'completed']
  const currentIdx = order.indexOf(status)
  return (
    <ul style={{ listStyle: 'none', padding: 0 }}>
      {steps.map(s => {
        const stepIdx = order.indexOf(s.key)
        const done = currentIdx > stepIdx
        const active = currentIdx === stepIdx
        return (
          <li key={s.key} style={{ padding: '0.5rem 0', color: done ? '#22c55e' : active ? '#00CFFF' : '#64748B' }}>
            {done ? '✅' : active ? '🔄' : '⚪'} {s.label}
          </li>
        )
      })}
    </ul>
  )
}

function SkeletonBlocks() {
  return (
    <div style={{ marginTop: 32 }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{
          height: 80, marginBottom: 12, borderRadius: 8,
          background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 100%)',
          backgroundSize: '200% 100%',
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
      ))}
      <style>{`@keyframes pulse { 0%,100% { background-position: 0% 0% } 50% { background-position: 100% 0% } }`}</style>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/AuditResults.jsx
git commit -m "feat(frontend): add /audit/:id polling page with three render states"
```

---

## Task 14: Admin views — `SocialAudits.jsx` + `SocialAuditDetail.jsx`

**Files:**
- Create: `src/pages/admin/SocialAudits.jsx`
- Create: `src/pages/admin/SocialAuditDetail.jsx`

- [ ] **Step 1: Implement `SocialAudits.jsx` (list view)**

```jsx
// src/pages/admin/SocialAudits.jsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function SocialAudits() {
  const [rows, setRows] = useState([])
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    let q = supabase
      .from('social_audits')
      .select('id, status, progress_message, created_at, lead_id, leads(name,email)')
      .order('created_at', { ascending: false })
      .limit(100)
    if (statusFilter !== 'all') q = q.eq('status', statusFilter)

    q.then(({ data }) => setRows(data || []))
  }, [statusFilter])

  return (
    <div style={{ padding: 24 }}>
      <h1>Social Audits</h1>
      <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ marginBottom: 16 }}>
        <option value="all">All statuses</option>
        <option value="pending">Pending</option>
        <option value="fetching">Fetching</option>
        <option value="analyzing">Analyzing</option>
        <option value="completed">Completed</option>
        <option value="failed">Failed</option>
      </select>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th align="left">Created</th>
            <th align="left">Lead</th>
            <th align="left">Status</th>
            <th align="left">Progress</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td>{new Date(r.created_at).toLocaleString()}</td>
              <td>{r.leads?.name || '—'} <span style={{ color: '#64748B' }}>{r.leads?.email}</span></td>
              <td><StatusBadge status={r.status} /></td>
              <td style={{ color: '#94A3B8' }}>{r.progress_message}</td>
              <td><Link to={`/admin/social-audits/${r.id}`}>View →</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StatusBadge({ status }) {
  const colors = {
    pending: '#94A3B8', fetching: '#00CFFF', analyzing: '#FBBF24',
    completed: '#22C55E', failed: '#EF4444',
  }
  return <span style={{ padding: '2px 8px', background: colors[status] + '22', color: colors[status], borderRadius: 4, fontSize: 12 }}>{status}</span>
}
```

- [ ] **Step 2: Implement `SocialAuditDetail.jsx` (detail view with tabs)**

```jsx
// src/pages/admin/SocialAuditDetail.jsx
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { supabase } from '../../lib/supabase'

export default function SocialAuditDetail() {
  const { id } = useParams()
  const [row, setRow] = useState(null)
  const [tab, setTab] = useState('report')

  useEffect(() => {
    supabase.from('social_audits').select('*').eq('id', id).single()
      .then(({ data }) => setRow(data))
  }, [id])

  // Re-run endpoint not yet shipped — button disabled until follow-up task adds /api/admin/rerun-audit/[id]
  const canRerun = false

  if (!row) return <div style={{ padding: 24 }}>Loading…</div>

  return (
    <div style={{ padding: 24 }}>
      <h1>Audit {row.id.slice(0, 8)}…</h1>
      <p>Status: <strong>{row.status}</strong></p>

      <div style={{ display: 'flex', gap: 12, margin: '16px 0' }}>
        <button disabled={!canRerun} title={canRerun ? '' : 'Re-run endpoint not implemented yet'}>Re-run audit</button>
      </div>

      <nav style={{ display: 'flex', gap: 16, borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: 16 }}>
        {['report', 'inputs', 'raw'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ background: 'none', border: 'none', color: tab === t ? '#00CFFF' : '#94A3B8', padding: '8px 0', cursor: 'pointer', borderBottom: tab === t ? '2px solid #00CFFF' : 'none' }}>
            {t === 'report' ? 'Report' : t === 'inputs' ? 'Inputs' : 'Raw data'}
          </button>
        ))}
      </nav>

      {tab === 'report' && (
        row.report_markdown
          ? <article className="prose prose-invert max-w-none"><ReactMarkdown>{row.report_markdown}</ReactMarkdown></article>
          : <p>No report yet.</p>
      )}
      {tab === 'inputs' && <pre style={preStyle}>{JSON.stringify(row.inputs, null, 2)}</pre>}
      {tab === 'raw' && <pre style={preStyle}>{JSON.stringify(row.raw_data, null, 2)}</pre>}
    </div>
  )
}

const preStyle = {
  background: 'rgba(255,255,255,0.04)', padding: 12, borderRadius: 6,
  overflow: 'auto', fontSize: 12, maxHeight: '60vh',
}
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/SocialAudits.jsx src/pages/admin/SocialAuditDetail.jsx
git commit -m "feat(admin): add Social Audits list + detail views with tabs"
```

---

## Task 15: Routes + sidebar menu item

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/pages/admin/AdminLayout.jsx`

- [ ] **Step 1: Register routes in `App.jsx`**

Find the existing `<Routes>` block and add three entries (public `/audit/:id`, admin list, admin detail). Existing pattern from current `App.jsx` for admin routes is the model.

```jsx
// in src/App.jsx — inside <Routes>, alongside existing routes
import AuditResults from './pages/AuditResults'
import SocialAudits from './pages/admin/SocialAudits'
import SocialAuditDetail from './pages/admin/SocialAuditDetail'

// ...
<Route path="/audit/:id" element={<AuditResults />} />
<Route path="/admin/social-audits" element={<SocialAudits />} />
<Route path="/admin/social-audits/:id" element={<SocialAuditDetail />} />
```

If the admin routes use a layout wrapper (check `AdminLayout`), nest them accordingly to match existing admin route structure.

- [ ] **Step 2: Add sidebar item in `AdminLayout.jsx`**

Find the existing sidebar `<nav>` (look for the AI Reports / Leads links), add:
```jsx
<Link to="/admin/social-audits" className={navLinkClass(location.pathname.startsWith('/admin/social-audits'))}>
  📊 Social Audits
</Link>
```
Match the styling of neighboring links exactly.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx src/pages/admin/AdminLayout.jsx
git commit -m "feat(routes): register /audit/:id and admin social-audits routes"
```

---

## Task 16: Wire Contact form — fields + redirect

**Files:**
- Modify: `src/components/Contact.jsx`

- [ ] **Step 1: Add to `INITIAL_FORM`**

Locate `INITIAL_FORM` at top of [Contact.jsx](../../../src/components/Contact.jsx) and extend with:
```js
social_ig_self: '',
social_ig_comp1: '',
social_ig_comp2: '',
social_yt_self: '',
social_yt_comp1: '',
social_yt_comp2: '',
social_audience: '',
social_goal: 'Leads',
social_challenge: '',
```

- [ ] **Step 2: Add conditional Social Media block in JSX**

Place after the AI Automation `<AnimatePresence>` block (around line 421), follow the same `motion.div` + `AnimatePresence` pattern. The new block is gated on `service ∈ {'Social Media Marketing','All Three'}`:

```jsx
<AnimatePresence>
  {(form.service === 'Social Media Marketing' || form.service === 'All Three') && (
    <motion.div initial={{opacity:0, height:0}} animate={{opacity:1, height:'auto'}} exit={{opacity:0, height:0}}
      transition={{duration:0.3}} style={{overflow:'hidden'}}>
      <div className="space-y-5" style={{
        background:'rgba(0,207,255,0.04)', border:'1px solid rgba(0,207,255,0.12)',
        borderRadius:12, padding:'1.25rem', marginBottom:'1.25rem',
      }}>
        <p style={{fontSize:'0.8rem', color:'#00CFFF', fontWeight:600, letterSpacing:'0.05em', textTransform:'uppercase', margin:'0 0 0.75rem'}}>
          Social Media Audit Details
        </p>

        <div>
          <p style={{fontSize:'0.75rem', color:'#94A3B8', margin:'0 0 0.5rem'}}>Instagram</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input name="social_ig_self" value={form.social_ig_self} onChange={handleChange} placeholder="@yourbiz" style={inputBase} />
            <input name="social_ig_comp1" value={form.social_ig_comp1} onChange={handleChange} placeholder="Competitor 1" style={inputBase} />
            <input name="social_ig_comp2" value={form.social_ig_comp2} onChange={handleChange} placeholder="Competitor 2" style={inputBase} />
          </div>
        </div>

        <div>
          <p style={{fontSize:'0.75rem', color:'#94A3B8', margin:'0 0 0.5rem'}}>YouTube</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input name="social_yt_self" value={form.social_yt_self} onChange={handleChange} placeholder="@yourchannel or URL" style={inputBase} />
            <input name="social_yt_comp1" value={form.social_yt_comp1} onChange={handleChange} placeholder="Competitor 1" style={inputBase} />
            <input name="social_yt_comp2" value={form.social_yt_comp2} onChange={handleChange} placeholder="Competitor 2" style={inputBase} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-muted mb-2">Who's your target audience?</label>
          <textarea name="social_audience" value={form.social_audience} onChange={handleChange} rows={2}
            placeholder="e.g. Small business owners in real estate" style={{...inputBase, resize:'vertical'}} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-muted mb-2">Primary goal</label>
            <select name="social_goal" value={form.social_goal} onChange={handleChange} style={{...inputBase, cursor:'pointer'}}>
              <option value="Engagement" style={{background:'#071526'}}>Engagement</option>
              <option value="Leads" style={{background:'#071526'}}>Leads</option>
              <option value="Awareness" style={{background:'#071526'}}>Awareness</option>
              <option value="Sales" style={{background:'#071526'}}>Sales</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-muted mb-2">Biggest challenge</label>
            <textarea name="social_challenge" value={form.social_challenge} onChange={handleChange} rows={2}
              placeholder="Inconsistent posting, low engagement, etc." style={{...inputBase, resize:'vertical'}} />
          </div>
        </div>
      </div>
    </motion.div>
  )}
</AnimatePresence>
```

- [ ] **Step 3: Add post-submit redirect in `handleSubmit`**

Add at the top of the file:
```jsx
import { useNavigate } from 'react-router-dom'
```
Inside `Contact()`:
```jsx
const navigate = useNavigate()
```

After the existing supabase insert succeeds, when the service is Social Media Marketing or All Three, build the audit inputs payload and redirect:

Locate the `if (data && (form.service === 'AI Automation' || form.service === 'All Three'))` block (around line 77) and add a parallel branch right after it:

```jsx
// After the AI Automation /api/generate-report fetch:
if (data && (form.service === 'Social Media Marketing' || form.service === 'All Three')) {
  const platforms = {}
  if (form.social_ig_self.trim()) {
    platforms.instagram = {
      self: form.social_ig_self.trim(),
      competitors: [form.social_ig_comp1, form.social_ig_comp2].map(s => s.trim()).filter(Boolean),
    }
  }
  if (form.social_yt_self.trim()) {
    platforms.youtube = {
      self: form.social_yt_self.trim(),
      competitors: [form.social_yt_comp1, form.social_yt_comp2].map(s => s.trim()).filter(Boolean),
    }
  }
  if (Object.keys(platforms).length > 0) {
    const auditRes = await fetch('/api/start-social-audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_id: data.id,
        inputs: {
          platforms,
          audience: form.social_audience,
          goal: form.social_goal,
          challenge: form.social_challenge,
        },
      }),
    })
    if (auditRes.ok) {
      const { audit_id } = await auditRes.json()
      navigate(`/audit/${audit_id}`)
      return  // skip the EmailJS send + success card
    }
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/Contact.jsx
git commit -m "feat(contact): add Social Media audit fields + post-submit redirect to /audit/:id"
```

---

## Task 17: End-to-end smoke test

**Files:** none (verification only)

- [ ] **Step 1: Push all changes + wait for Vercel build**

```bash
git push origin main
```
Wait ~2 min for Vercel to rebuild.

- [ ] **Step 2: Run the 9-item checklist from the spec**

```
□ 1. POST /api/start-social-audit with valid IG-only inputs → 200 {audit_id}, social_audits row exists with status='pending'
□ 2. Within 5s, social_audits row updates to status='fetching'
□ 3. Within 30s, status='analyzing', raw_data.instagram populated
□ 4. Within 120s, status='completed', report + report_markdown populated
□ 5. /audit/:id polling shows progressive states then renders the report
□ 6. /admin/social-audits lists the audit; detail view shows Report/Inputs/Raw data tabs
□ 7. Submit with a personal IG handle → audit completes; report mentions handle was unavailable
□ 8. Submit with a non-existent YouTube channel → audit completes; YouTube section omitted
□ 9. Submit with no platforms (only audience/goal/challenge) → /api/start-social-audit returns 400
```

Use a real submission via the Contact form on the deployed site for items 5 & 6 specifically — that's the real user journey.

- [ ] **Step 3: If any item fails, file a follow-up commit**

The most likely failure modes are:
- Edge Function timeout on first invocation (cold start) — re-test
- IG Business Discovery quota hit — wait an hour
- OpenAI rate-limit on first request — built-in retry handles this

For unknown failures, query `raw_data` and `error` columns directly via psql for diagnosis.

---

## Self-review (run mentally before declaring plan done)

**Spec coverage:**
- [x] All form fields defined → Task 16
- [x] DB schema → Task 1
- [x] IG Business Discovery → Task 5
- [x] YouTube Data API → Task 6
- [x] Vision-enabled GPT-4o single call → Task 9 (wires lib/build-prompt.ts from Task 7)
- [x] Top-5-engagement + top-5-recent post selection (deduped) → Task 4
- [x] JSON schema response_format → Task 7 (REPORT_JSON_SCHEMA)
- [x] Markdown rendering → Task 8
- [x] Cross-platform failure aggregation rule (self-handle pivot) → Task 9
- [x] /api/start-social-audit kickoff → Task 10
- [x] /api/social-audit-status sanitized read → Task 11
- [x] Live polling page with three states → Task 13
- [x] Admin list + detail with tabs → Task 14
- [x] Routes + sidebar → Task 15
- [x] Form integration + redirect → Task 16
- [x] End-to-end smoke checklist → Task 17

**Not implemented in this plan (deferred per spec):**
- Facebook fetcher (Phase 2 once PPCA approved)
- "Email to lead" admin button (Phase 2)
- Re-run audit endpoint `/api/admin/rerun-audit/:id` is referenced in `SocialAuditDetail.jsx` but not implemented in this plan. Add as a follow-up task or remove the button until the endpoint exists. **Recommendation:** disable the button in Task 14 with a TODO comment if the endpoint isn't shipping with this plan.

**Type consistency:**
- `FetchedHandle.handle` shape: prefixed with `@` for IG (Task 5), prefixed with `@` for YouTube (Task 6) — consistent.
- `selectPosts` accepts `FetchedPost[]` and returns `FetchedPost[]` — consumed by `buildPrompt` (Task 7) ✅
- `AuditReport` shape returned from OpenAI (validated against `REPORT_JSON_SCHEMA`) is consumed by `renderMarkdown` (Task 8) ✅
- `validateInputs` returns `AuditInputs`, used by orchestrator (Task 9) and matches `inputs` jsonb in DB (Task 1) ✅

**Cross-task references:**
- Task 9's index.ts imports from Tasks 3, 4, 5, 6, 7, 8 — all exist before Task 9 is implemented ✅
- Task 16's `/api/start-social-audit` → exists by Task 10 ✅
- Task 13 imports `ReactMarkdown` → installed in Task 12 ✅

**Re-run button gap:** Task 14 references `/api/admin/rerun-audit/:id` which is not implemented. **Adding inline fix:** Task 14 step changes button to disabled with `title="Re-run not yet implemented"` until a follow-up task adds the endpoint.

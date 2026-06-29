# Blog AI Upgrades (segula parity) — Design

**Date:** 2026-06-29
**Status:** Approved

## Problem

haze-tech-solutions already has a working blog: admin CRUD with a Tiptap editor
([src/pages/admin/BlogManager.jsx](../../../src/pages/admin/BlogManager.jsx)),
public `/blog` + `/blog/:slug` pages
([src/pages/BlogPage.jsx](../../../src/pages/BlogPage.jsx),
[src/pages/BlogPost.jsx](../../../src/pages/BlogPost.jsx)), the `blog_posts`
table, and nav/route wiring. It lacks the richer authoring layer that
segula-management's blog has.

## Goal

Bring the haze-tech blog up to segula's feature level by adding: AI article
generation, AI cover-image generation, categories + author, and bulk
select/delete. Reuse existing patterns; do not rebuild the working CRUD.

## Non-Goals

- Rebuilding the existing CRUD, editor, or public pages from scratch.
- Per-article SEO meta tags / RSS / view counts / scheduling (YAGNI for v1).
- An AI provider toggle — article generation uses Claude only.
- HTML sanitization changes (admin-authored content, same trust model as today).

## Decisions (locked)

- **AI article model:** Claude Sonnet 4.6 (`claude-sonnet-4-6`), no UI toggle.
- **Cover image model:** OpenAI `gpt-image-2`, landscape `1536x1024`, opaque.
- **Categories:** fixed list — `Web Development`, `AI & Automation`,
  `Social Media`, `SEO`, `Business Growth`, `Case Studies`.
- **Backend placement:** the two AI calls are new actions on the existing
  `api/website.js` router (keeps the Vercel function count flat). CRUD stays on
  the supabase client + RLS (already working).

---

## A. Schema

Add two nullable columns to `blog_posts` (idempotent):

```sql
alter table blog_posts add column if not exists category text;
alter table blog_posts add column if not exists author   text default 'Haze Tech Solutions';
```

Migration file: `supabase/migrations/2026_06_29_blog_category_author.sql`.
Applied via the Supabase Management API (same pattern as prior migrations).
No RLS change (existing policies cover the table).

## B. AI article generation

New admin-gated action `POST /api/website?action=blog-generate`.

- **Auth:** `requireAdmin(req, res)` ([api/_lib/require-admin.js](../../../api/_lib/require-admin.js)).
- **Body:** `{ topic: string (required), keywords?: string, tone?: string, length?: 'short'|'medium'|'long', category?: string }`.
- **Model call:** `trackedClaude({ apiKey: getSetting('anthropic_api_key','ANTHROPIC_API_KEY'), model: 'claude-sonnet-4-6', system, messages })`
  ([api/_lib/tracked-claude.js](../../../api/_lib/tracked-claude.js),
  `getSetting` from [api/_lib/stripe.js](../../../api/_lib/stripe.js)).
- **System prompt:** instructs Claude to write a professional Haze Tech Solutions
  blog article and return STRICT JSON `{ "title": string, "excerpt": string, "content": string }`
  where `content` is clean semantic HTML (h2/h3/p/ul/li/strong/a only — matches
  the Tiptap StarterKit schema so it round-trips in the editor). Word-count
  guidance from `length` (short≈500, medium≈1000, long≈1800). Tone + keywords +
  category woven into the prompt.
- **Parsing:** a pure helper `parseBlogGeneration(text)` extracts the JSON object
  (tolerant of code fences / prose around it) → `{ title, excerpt, content }`;
  throws a clear error if no usable object. Unit-tested.
- **Returns:** `200 { title, excerpt, content }`. Errors: `400 missing topic`,
  `400 ai_not_configured` (no key), `502 ai_failed` (model/parse failure) with a
  friendly message.

**Admin UI:** a "✨ Generate with AI" button on the editor opens a dialog
(topic input, keywords input, tone `<select>` [Professional/Casual/
Educational/Inspirational], length `<select>`). On generate → POST → fill
`title` (and slug if untouched), `excerpt`, and the Tiptap `content`
(`editor.commands.setContent(html)`). Shows a spinner + inline error.

## C. AI cover image

New admin-gated action `POST /api/website?action=blog-generate-cover`.

- **Auth:** `requireAdmin`.
- **Body:** `{ title: string (required), category?: string }`.
- **Image call:** `POST https://api.openai.com/v1/images/generations` with
  `{ model: 'gpt-image-2', prompt, size: '1536x1024', n: 1 }`, key from
  `getSetting('openai_api_key','OPENAI_API_KEY')`. Prompt: a clean, modern,
  on-brand blog hero illustration for the title/category — no text/words in the
  image.
- **Storage:** new `api/_lib/r2.js` (uses `@aws-sdk/client-s3`, already a dep) —
  `uploadBuffer({ key, body, contentType }) → publicUrl`. Mirrors the edge
  `_shared/r2-upload.ts`: endpoint `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  creds `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`, bucket `R2_BUCKET`
  (fallback `'haze-tech-brand-kits'`), public base `R2_PUBLIC_URL`. Key:
  `blog/<timestamp>-<slugified-title>.png`. Pure key/url construction is
  unit-tested.
- **Returns:** `200 { url }`. Errors: `400 missing title`, `400 ai_not_configured`,
  `500 storage_not_configured` (R2 env missing — clear message), `502 image_failed`.

**Admin UI:** a "Generate cover image" button next to the Cover Image URL field;
on success fills `cover_image_url`. Spinner + inline error.

**Env:** the Vercel Node runtime needs `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`, and an OpenAI/Anthropic key
(DB-first via `admin_settings`, env fallback). Verified/added during deploy.

## D. Categories + Author

- Shared constant `src/lib/blogCategories.js` exporting
  `BLOG_CATEGORIES = ['Web Development','AI & Automation','Social Media','SEO','Business Growth','Case Studies']`.
- **Editor** (`BlogManager.jsx`): add a category `<select>` (from the constant)
  and an author text input (default `'Haze Tech Solutions'`) to the meta row;
  include `category` + `author` in the insert/update payload and `EMPTY_POST`.
- **Public index** (`BlogPage.jsx`): add `category, author` to the select; render
  a category badge on each card; add a simple category filter (pill row that
  filters the loaded posts client-side, plus an "All").
- **Public post** (`BlogPost.jsx`): render the category badge + author byline in
  the header (alongside the existing date/read-time).

## E. Bulk select + delete

In `BlogManager.jsx` list view: a checkbox column + header "select all", a
selection count, and a "Delete selected" button that confirms then deletes the
selected ids (`supabase.from('blog_posts').delete().in('id', ids)`), updating
local state. Reuses the existing delete-confirm modal styling.

## Testing

- **Unit (Deno, co-located):** `parseBlogGeneration` (clean JSON, fenced JSON,
  JSON-with-prose, garbage → throws); `r2.js` key/url construction
  (`buildBlogImageKey(title)` slugifies + timestamps; public-url join handles a
  trailing slash). Run: `deno test --allow-net <file>`.
- **Build/manual:** `npm run build` green; admin generate-article fills fields;
  generate-cover fills URL; category/author persist + show on public pages; bulk
  delete removes rows; existing single CRUD still works.

## Files

**New**
- `supabase/migrations/2026_06_29_blog_category_author.sql`
- `api/_lib/r2.js` (+ `api/_lib/r2.test.js`)
- `api/_lib/blog-generate.js` (pure `parseBlogGeneration` + prompt builder; + `.test.js`)
- `src/lib/blogCategories.js`

**Modified**
- `api/website.js` — `blog-generate` + `blog-generate-cover` actions + imports
- `src/pages/admin/BlogManager.jsx` — AI dialog, cover button, category/author fields, bulk delete
- `src/pages/BlogPage.jsx` — category/author in select, badge, filter
- `src/pages/BlogPost.jsx` — category badge + author byline

**Config (deploy)**
- Ensure R2_* + AI keys present in Vercel env; apply the migration.

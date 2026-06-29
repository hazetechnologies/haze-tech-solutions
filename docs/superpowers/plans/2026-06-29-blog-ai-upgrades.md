# Blog AI Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI article generation, AI cover-image generation, categories + author, and bulk delete to the existing Haze Tech blog admin, matching segula's feature set.

**Architecture:** Two new admin-gated AI actions on the existing `api/website.js` router (Claude Sonnet 4.6 for articles via `trackedClaude`; OpenAI `gpt-image-2` for covers, uploaded to R2 via a new `api/_lib/r2.js`). Pure helpers (`parseBlogGeneration`, R2 key/url builders) are unit-tested with Deno. CRUD stays on the supabase client; `blog_posts` gains `category` + `author` columns.

**Tech Stack:** React (Vite), Vercel Node serverless (`api/*.js`, ESM), Supabase Postgres, `@anthropic-ai/sdk` (via `api/_lib/tracked-claude.js`), `@aws-sdk/client-s3`, OpenAI Images API, Deno test runner.

**Spec:** `docs/superpowers/specs/2026-06-29-blog-ai-upgrades-design.md`
**Run Deno tests:** `export PATH="$HOME/.deno/bin:$PATH" && deno test --allow-net <file>`

---

## Task 1: Migration — category + author columns

**Files:**
- Create: `supabase/migrations/2026_06_29_blog_category_author.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add category + author to blog_posts (idempotent).
alter table blog_posts add column if not exists category text;
alter table blog_posts add column if not exists author   text default 'Haze Tech Solutions';
```

- [ ] **Step 2: Commit** (applied to the live DB in Task 9)

```bash
git add supabase/migrations/2026_06_29_blog_category_author.sql
git commit -m "feat(blog): migration for category + author columns"
```

---

## Task 2: Article-generation pure helper

**Files:**
- Create: `api/_lib/blog-generate.js`
- Create: `api/_lib/blog-generate.test.js`

- [ ] **Step 1: Write the failing test** — `api/_lib/blog-generate.test.js`

```js
import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { buildBlogPrompt, parseBlogGeneration } from './blog-generate.js'

Deno.test('buildBlogPrompt includes topic, tone, keywords, category, and word target', () => {
  const { system, user } = buildBlogPrompt({ topic: 'Why SEO matters', keywords: 'ranking, traffic', tone: 'Educational', length: 'short', category: 'SEO' })
  assertEquals(typeof system, 'string')
  assertEquals(user.includes('Why SEO matters'), true)
  assertEquals(user.includes('ranking, traffic'), true)
  assertEquals(user.includes('Educational'), true)
  assertEquals(user.includes('SEO'), true)
  assertEquals(user.includes('500'), true) // short ≈ 500 words
})

Deno.test('parseBlogGeneration reads clean JSON', () => {
  const out = parseBlogGeneration('{"title":"T","excerpt":"E","content":"<p>C</p>"}')
  assertEquals(out, { title: 'T', excerpt: 'E', content: '<p>C</p>' })
})

Deno.test('parseBlogGeneration tolerates code fences and surrounding prose', () => {
  const raw = 'Here you go:\n```json\n{"title":"T","excerpt":"E","content":"<p>C</p>"}\n```\nHope that helps!'
  assertEquals(parseBlogGeneration(raw).title, 'T')
})

Deno.test('parseBlogGeneration throws on missing title/content', () => {
  assertThrows(() => parseBlogGeneration('{"excerpt":"only"}'), Error)
})

Deno.test('parseBlogGeneration throws on non-JSON garbage', () => {
  assertThrows(() => parseBlogGeneration('no json here'), Error)
})
```

- [ ] **Step 2: Run it, confirm FAIL** — `export PATH="$HOME/.deno/bin:$PATH" && deno test --allow-net api/_lib/blog-generate.test.js` → module not found.

- [ ] **Step 3: Write `api/_lib/blog-generate.js`**

```js
// api/_lib/blog-generate.js
// Pure helpers for AI blog-article generation: the Claude prompt builder and a
// tolerant parser for its JSON response. No network — unit-testable.

const LENGTH_WORDS = { short: 500, medium: 1000, long: 1800 }

export function buildBlogPrompt({ topic, keywords = '', tone = 'Professional', length = 'medium', category = '' }) {
  const words = LENGTH_WORDS[length] ?? 1000
  const system = `You are a professional blog writer for Haze Tech Solutions, a web development, AI automation, and digital marketing agency. Write clear, genuinely useful, on-brand articles for a business audience. Return ONLY a single JSON object — no prose, no markdown code fences — with exactly these keys: "title" (string), "excerpt" (string, 1-2 sentences), "content" (clean semantic HTML using ONLY <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, <a> tags — no <h1>, no <html>/<head>/<body>, no inline styles, no markdown).`
  const user = `Write a blog article.\nTopic: ${topic}\n${category ? `Category: ${category}\n` : ''}${keywords ? `Keywords to weave in naturally: ${keywords}\n` : ''}Tone: ${tone}\nTarget length: about ${words} words.\nReturn the JSON object only.`
  return { system, user }
}

export function parseBlogGeneration(text) {
  if (!text || typeof text !== 'string') throw new Error('Empty AI response')
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) throw new Error('No JSON object found in AI response')
  let obj
  try {
    obj = JSON.parse(text.slice(start, end + 1))
  } catch {
    throw new Error('AI response was not valid JSON')
  }
  const title = (obj.title ?? '').toString().trim()
  const excerpt = (obj.excerpt ?? '').toString().trim()
  const content = (obj.content ?? '').toString().trim()
  if (!title || !content) throw new Error('AI response missing title or content')
  return { title, excerpt, content }
}
```

- [ ] **Step 4: Run tests, confirm PASS** (5 tests).
- [ ] **Step 5: Commit**

```bash
git add api/_lib/blog-generate.js api/_lib/blog-generate.test.js
git commit -m "feat(blog): Claude prompt builder + response parser"
```

---

## Task 3: R2 upload helper (Node)

**Files:**
- Create: `api/_lib/r2.js`
- Create: `api/_lib/r2.test.js`

- [ ] **Step 1: Write the failing test** — `api/_lib/r2.test.js`

```js
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { slugifyForKey, buildBlogImageKey, publicUrlFor } from './r2.js'

Deno.test('slugifyForKey lowercases, strips punctuation, hyphenates', () => {
  assertEquals(slugifyForKey('Why SEO Matters in 2026!'), 'why-seo-matters-in-2026')
})

Deno.test('slugifyForKey falls back to "post" when empty', () => {
  assertEquals(slugifyForKey('—'), 'post')
  assertEquals(slugifyForKey(''), 'post')
})

Deno.test('buildBlogImageKey composes blog/<ts>-<slug>.png', () => {
  assertEquals(buildBlogImageKey('My Post', '2026-06-29T12-00-00'), 'blog/2026-06-29T12-00-00-my-post.png')
})

Deno.test('publicUrlFor joins base + key, trimming trailing slash', () => {
  assertEquals(publicUrlFor('blog/x.png', 'https://pub-abc.r2.dev/'), 'https://pub-abc.r2.dev/blog/x.png')
  assertEquals(publicUrlFor('blog/x.png', 'https://pub-abc.r2.dev'), 'https://pub-abc.r2.dev/blog/x.png')
})
```

- [ ] **Step 2: Run it, confirm FAIL.**

- [ ] **Step 3: Write `api/_lib/r2.js`**

```js
// api/_lib/r2.js
// Minimal R2 (S3-compatible) upload helper for the Node api layer. Mirrors the
// edge function's supabase/functions/_shared/r2-upload.ts. Pure key/url builders
// are exported separately so they can be unit-tested without network/creds.
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const BUCKET = process.env.R2_BUCKET || 'haze-tech-brand-kits'
const PUBLIC_URL = process.env.R2_PUBLIC_URL || ''

export function r2Configured() {
  return Boolean(ACCOUNT_ID && ACCESS_KEY_ID && SECRET_ACCESS_KEY && PUBLIC_URL)
}

export function slugifyForKey(str) {
  const s = (str || '').toLowerCase().trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
  return s || 'post'
}

export function buildBlogImageKey(title, ts) {
  return `blog/${ts}-${slugifyForKey(title)}.png`
}

export function publicUrlFor(key, base = PUBLIC_URL) {
  return `${(base || '').replace(/\/$/, '')}/${key}`
}

let _client = null
function client() {
  if (_client) return _client
  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
  })
  return _client
}

export async function uploadBuffer({ key, body, contentType = 'image/png' }) {
  await client().send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }))
  return publicUrlFor(key)
}
```

- [ ] **Step 4: Run tests, confirm PASS** (4 tests).
- [ ] **Step 5: Commit**

```bash
git add api/_lib/r2.js api/_lib/r2.test.js
git commit -m "feat(blog): R2 upload helper for the Node layer"
```

---

## Task 4: website.js actions — blog-generate + blog-generate-cover

**Files:**
- Modify: `api/website.js`

No automated test (the pure logic is covered in Tasks 2–3; this is wiring). Verified by build + manual QA in Task 9.

- [ ] **Step 1: Add imports** near the top of `api/website.js` (with the other imports):

```js
import { requireAdmin } from './_lib/require-admin.js'
import { trackedClaude, extractText } from './_lib/tracked-claude.js'
import { buildBlogPrompt, parseBlogGeneration } from './_lib/blog-generate.js'
import { r2Configured, buildBlogImageKey, uploadBuffer } from './_lib/r2.js'
```

(If any of these are already imported, do not duplicate — `getSetting` is already imported from `./_lib/stripe.js`.)

- [ ] **Step 2: Register the actions** in the `switch (action)` block (after `case 'approve-logo':`):

```js
    case 'blog-generate':       return req.method === 'POST' ? blogGenerate(req, res)       : methodNotAllowed(res, 'POST')
    case 'blog-generate-cover': return req.method === 'POST' ? blogGenerateCover(req, res)  : methodNotAllowed(res, 'POST')
```

- [ ] **Step 3: Add the two handlers** (place after the `approveLogo` function):

```js
// POST ?action=blog-generate — admin-gated. Generates a blog article with Claude.
// Body: { topic, keywords?, tone?, length?, category? } → { title, excerpt, content }.
async function blogGenerate(req, res) {
  const ctx = await requireAdmin(req, res)
  if (!ctx) return
  const { topic, keywords, tone, length, category } = req.body || {}
  if (!topic || !String(topic).trim()) return res.status(400).json({ error: 'bad_request', message: 'topic is required' })
  const apiKey = await getSetting('anthropic_api_key', 'ANTHROPIC_API_KEY')
  if (!apiKey) return res.status(400).json({ error: 'ai_not_configured', message: 'Anthropic API key is not configured' })
  const { system, user } = buildBlogPrompt({ topic: String(topic).trim(), keywords, tone, length, category })
  const { data, status } = await trackedClaude({
    apiKey,
    model: 'claude-sonnet-4-6',
    system,
    messages: [{ role: 'user', content: user }],
    params: { max_tokens: 8000 },
    eventProperties: { surface: 'blog-generate' },
  })
  if (status !== 200) return res.status(502).json({ error: 'ai_failed', message: data?.error || 'AI generation failed' })
  try {
    return res.status(200).json(parseBlogGeneration(extractText(data)))
  } catch (err) {
    return res.status(502).json({ error: 'ai_failed', message: err.message })
  }
}

// POST ?action=blog-generate-cover — admin-gated. Generates a cover image with
// OpenAI gpt-image-2 and stores it in R2. Body: { title, category? } → { url }.
async function blogGenerateCover(req, res) {
  const ctx = await requireAdmin(req, res)
  if (!ctx) return
  const { title, category } = req.body || {}
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'bad_request', message: 'title is required' })
  if (!r2Configured()) return res.status(500).json({ error: 'storage_not_configured', message: 'R2 storage is not configured' })
  const apiKey = await getSetting('openai_api_key', 'OPENAI_API_KEY')
  if (!apiKey) return res.status(400).json({ error: 'ai_not_configured', message: 'OpenAI API key is not configured' })
  const prompt = `A clean, modern, professional blog hero illustration for an article titled "${String(title).trim()}"${category ? ` in the ${category} category` : ''}. Tech / digital-agency aesthetic, abstract and on-brand, vibrant but tasteful. ABSOLUTELY NO text, words, letters, numbers, or logos anywhere in the image.`
  let imgRes
  try {
    imgRes = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-image-2', prompt, size: '1536x1024', n: 1 }),
    })
  } catch {
    return res.status(502).json({ error: 'image_failed', message: 'Image service unreachable' })
  }
  if (!imgRes.ok) {
    const t = await imgRes.text().catch(() => '')
    return res.status(502).json({ error: 'image_failed', message: `Image generation failed (${imgRes.status}): ${t.slice(0, 200)}` })
  }
  const json = await imgRes.json().catch(() => null)
  const b64 = json?.data?.[0]?.b64_json
  if (!b64) return res.status(502).json({ error: 'image_failed', message: 'No image returned by the model' })
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const url = await uploadBuffer({ key: buildBlogImageKey(String(title).trim(), ts), body: Buffer.from(b64, 'base64'), contentType: 'image/png' })
    return res.status(200).json({ url })
  } catch (err) {
    return res.status(500).json({ error: 'storage_failed', message: err.message })
  }
}
```

- [ ] **Step 4: Verify build** — `npm run build` (succeeds).
- [ ] **Step 5: Commit**

```bash
git add api/website.js
git commit -m "feat(blog): admin AI article + cover-image generation endpoints"
```

---

## Task 5: Shared category constant

**Files:**
- Create: `src/lib/blogCategories.js`

- [ ] **Step 1: Create the file**

```js
// src/lib/blogCategories.js
export const BLOG_CATEGORIES = [
  'Web Development',
  'AI & Automation',
  'Social Media',
  'SEO',
  'Business Growth',
  'Case Studies',
]
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/blogCategories.js
git commit -m "feat(blog): shared category list constant"
```

---

## Task 6: Admin BlogManager — fields, AI dialog, cover button, bulk delete

**Files:**
- Modify: `src/pages/admin/BlogManager.jsx`

- [ ] **Step 1: Import the category list + a Sparkles/Image icon.** At the top, add to the existing `lucide-react` import the icons `Sparkles, Image as ImageIcon, CheckSquare, Square`, and add:

```jsx
import { BLOG_CATEGORIES } from '../../lib/blogCategories'
import { supabase } from '../../lib/supabase'  // (already imported — do not duplicate)
```

- [ ] **Step 2: Extend `EMPTY_POST`** to include the new fields:

```jsx
const EMPTY_POST = {
  title: '',
  slug: '',
  excerpt: '',
  cover_image_url: '',
  content: '',
  published: false,
  category: '',
  author: 'Haze Tech Solutions',
}
```

- [ ] **Step 3: Persist the new fields.** In `PostEditor`'s `handleSubmit`, extend `payload`:

```jsx
      const payload = {
        title:           form.title.trim(),
        slug:            form.slug.trim(),
        excerpt:         form.excerpt.trim(),
        cover_image_url: form.cover_image_url.trim(),
        content:         form.content || '',
        published:       Boolean(form.published),
        category:        form.category || null,
        author:          (form.author || '').trim() || 'Haze Tech Solutions',
      }
```

- [ ] **Step 4: Add category + author inputs** to the editor meta area. In `PostEditor`'s returned JSX, immediately after the Excerpt `metaField` block (the one wrapping the excerpt textarea), insert:

```jsx
        {/* Category + Author */}
        <div style={styles.metaRow}>
          <div style={styles.metaField}>
            <label style={styles.metaLabel}>Category</label>
            <select
              value={form.category || ''}
              onChange={e => set('category', e.target.value)}
              style={styles.metaInput}
            >
              <option value="">— Select category —</option>
              {BLOG_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={styles.metaField}>
            <label style={styles.metaLabel}>Author</label>
            <input
              value={form.author || ''}
              onChange={e => set('author', e.target.value)}
              placeholder="Haze Tech Solutions"
              style={styles.metaInput}
            />
          </div>
        </div>
```

- [ ] **Step 5: Add a "Generate cover image" button** under the Cover Image URL input. Replace the Cover Image URL `metaField` block with a version that adds the button + state. First, add near the top of `PostEditor` (with the other `useState` calls):

```jsx
  const [genCover, setGenCover] = useState(false)
  const [genCoverErr, setGenCoverErr] = useState(null)

  async function generateCover() {
    if (!form.title.trim()) { setGenCoverErr('Add a title first.'); return }
    setGenCover(true); setGenCoverErr(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/website?action=blog-generate-cover', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: form.title.trim(), category: form.category || '' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.message || json.error || `Error ${res.status}`)
      set('cover_image_url', json.url)
    } catch (err) {
      setGenCoverErr(err.message)
    } finally {
      setGenCover(false)
    }
  }
```

Then change the Cover Image URL field block to include the button + error under the input:

```jsx
          <div style={{ ...styles.metaField, flex: 2 }}>
            <label style={styles.metaLabel}>Cover Image URL</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                value={form.cover_image_url}
                onChange={e => set('cover_image_url', e.target.value)}
                placeholder="https://..."
                style={{ ...styles.metaInput, flex: 1 }}
              />
              <button type="button" onClick={generateCover} disabled={genCover} style={styles.aiSmallBtn}>
                <ImageIcon size={13} /> {genCover ? 'Generating…' : 'Generate'}
              </button>
            </div>
            {genCoverErr && <p style={{ color: '#FCA5A5', fontSize: '11px', margin: '4px 0 0' }}>{genCoverErr}</p>}
          </div>
```

- [ ] **Step 6: Add the "Generate with AI" dialog + button.** Add state near the other `PostEditor` `useState` calls:

```jsx
  const [aiOpen, setAiOpen]   = useState(false)
  const [aiBusy, setAiBusy]   = useState(false)
  const [aiErr, setAiErr]     = useState(null)
  const [ai, setAi]           = useState({ topic: '', keywords: '', tone: 'Professional', length: 'medium' })

  async function runAiGenerate() {
    if (!ai.topic.trim()) { setAiErr('Topic is required.'); return }
    setAiBusy(true); setAiErr(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/website?action=blog-generate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...ai, category: form.category || '' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.message || json.error || `Error ${res.status}`)
      set('title', json.title)
      set('excerpt', json.excerpt || '')
      setForm(prev => ({ ...prev, content: json.content }))
      editor?.commands.setContent(json.content)
      setAiOpen(false)
    } catch (err) {
      setAiErr(err.message)
    } finally {
      setAiBusy(false)
    }
  }
```

In the editor header (the `editorHeader` div), add a button before the Published toggle:

```jsx
          <button type="button" onClick={() => { setAiErr(null); setAiOpen(true) }} style={styles.aiBtn}>
            <Sparkles size={15} /> Generate with AI
          </button>
```

And render the dialog (place just before the closing `</div>` of `editorWrap`):

```jsx
      {aiOpen && (
        <div style={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setAiOpen(false) }}>
          <div style={styles.confirmModal}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '12px', fontWeight: 700, color: '#F1F5F9', letterSpacing: '0.06em', textTransform: 'uppercase', margin: 0 }}>Generate Article with AI</h3>
              <button onClick={() => setAiOpen(false)} style={styles.closeBtn}><X size={16} /></button>
            </div>
            {aiErr && <div style={styles.errorBanner}><AlertCircle size={14} /><span>{aiErr}</span></div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={styles.metaField}>
                <label style={styles.metaLabel}>Topic *</label>
                <input value={ai.topic} onChange={e => setAi(p => ({ ...p, topic: e.target.value }))} placeholder="e.g. How small businesses can use AI chatbots" style={styles.metaInput} />
              </div>
              <div style={styles.metaField}>
                <label style={styles.metaLabel}>Keywords (optional)</label>
                <input value={ai.keywords} onChange={e => setAi(p => ({ ...p, keywords: e.target.value }))} placeholder="comma, separated, keywords" style={styles.metaInput} />
              </div>
              <div style={styles.metaRow}>
                <div style={styles.metaField}>
                  <label style={styles.metaLabel}>Tone</label>
                  <select value={ai.tone} onChange={e => setAi(p => ({ ...p, tone: e.target.value }))} style={styles.metaInput}>
                    {['Professional', 'Casual', 'Educational', 'Inspirational'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div style={styles.metaField}>
                  <label style={styles.metaLabel}>Length</label>
                  <select value={ai.length} onChange={e => setAi(p => ({ ...p, length: e.target.value }))} style={styles.metaInput}>
                    <option value="short">Short (~500 words)</option>
                    <option value="medium">Medium (~1000 words)</option>
                    <option value="long">Long (~1800 words)</option>
                  </select>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button onClick={() => setAiOpen(false)} style={styles.cancelBtn}>Cancel</button>
              <button onClick={runAiGenerate} disabled={aiBusy} style={styles.saveBtn}>
                {aiBusy ? 'Generating…' : <><Sparkles size={14} /> Generate</>}
              </button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 7: Add the styles** used above. Add these keys to the `styles` object:

```jsx
  aiBtn: {
    display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 16px',
    background: 'linear-gradient(135deg, rgba(139,92,246,0.18), rgba(0,212,255,0.18))',
    border: '1px solid rgba(139,92,246,0.4)', borderRadius: '9px', color: '#C4B5FD',
    fontSize: '13px', fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer',
  },
  aiSmallBtn: {
    display: 'flex', alignItems: 'center', gap: '6px', padding: '0 12px',
    background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.35)',
    borderRadius: '9px', color: '#C4B5FD', fontSize: '12px', fontWeight: 600,
    fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer', whiteSpace: 'nowrap',
  },
```

- [ ] **Step 8: Bulk select + delete in the list view.** Add state in `BlogManager` (with the other `useState`):

```jsx
  const [selected, setSelected] = useState(() => new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  function toggleSelect(id) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleSelectAll() {
    setSelected(prev => prev.size === posts.length ? new Set() : new Set(posts.map(p => p.id)))
  }
  async function bulkDelete() {
    if (selected.size === 0) return
    if (!window.confirm(`Delete ${selected.size} selected post(s)? This cannot be undone.`)) return
    setBulkDeleting(true)
    try {
      const ids = [...selected]
      const { error: err } = await supabase.from('blog_posts').delete().in('id', ids)
      if (err) throw err
      setPosts(prev => prev.filter(p => !selected.has(p.id)))
      setSelected(new Set())
    } catch (err) {
      alert('Bulk delete failed: ' + (err.message || 'Unknown error'))
    } finally {
      setBulkDeleting(false)
    }
  }
```

Add a "Delete selected" button in the `topRow` actions (before the New Post button), shown only when there's a selection:

```jsx
          {selected.size > 0 && (
            <button onClick={bulkDelete} disabled={bulkDeleting} style={styles.deleteBtn}>
              <Trash2 size={14} /> {bulkDeleting ? 'Deleting…' : `Delete ${selected.size}`}
            </button>
          )}
```

Add a checkbox header cell as the FIRST `<th>` (before 'Title'):

```jsx
                <th style={{ ...styles.th, width: '40px' }}>
                  <button type="button" onClick={toggleSelectAll} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', padding: 0 }}>
                    {selected.size === posts.length && posts.length > 0 ? <CheckSquare size={15} /> : <Square size={15} />}
                  </button>
                </th>
```

(Adjust the loading-skeleton `colSpan`/widths and the empty-state `colSpan` from `5` to `6`.) Add a checkbox cell as the FIRST `<td>` in each post row:

```jsx
                    <td style={styles.td}>
                      <button type="button" onClick={() => toggleSelect(post.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: selected.has(post.id) ? '#00D4FF' : '#475569', padding: 0 }}>
                        {selected.has(post.id) ? <CheckSquare size={15} /> : <Square size={15} />}
                      </button>
                    </td>
```

- [ ] **Step 9: Verify build** — `npm run build` (succeeds).
- [ ] **Step 10: Commit**

```bash
git add src/pages/admin/BlogManager.jsx
git commit -m "feat(blog): AI generate dialog, cover-image button, category/author, bulk delete"
```

---

## Task 7: Public blog index — category badge + filter

**Files:**
- Modify: `src/pages/BlogPage.jsx`

- [ ] **Step 1: Import the categories** at the top:

```jsx
import { useState } from 'react'  // ensure useState is imported (add if missing)
import { BLOG_CATEGORIES } from '../lib/blogCategories'
```

- [ ] **Step 2: Select the new columns.** Change the `.select(...)` (currently `'id, title, slug, excerpt, cover_image_url, created_at'`) to:

```jsx
      .select('id, title, slug, excerpt, cover_image_url, created_at, category, author')
```

- [ ] **Step 3: Add a category filter.** Add state near the top of the component:

```jsx
  const [activeCat, setActiveCat] = useState('All')
```

Derive the visible list where the posts are mapped (replace `posts.map(...)` source with a filtered array):

```jsx
  const visiblePosts = activeCat === 'All' ? posts : posts.filter(p => p.category === activeCat)
```

(Then map over `visiblePosts` instead of `posts`.)

Render a pill row above the grid:

```jsx
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '1.5rem' }}>
          {['All', ...BLOG_CATEGORIES].map(cat => (
            <button key={cat} onClick={() => setActiveCat(cat)} style={{
              padding: '6px 14px', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
              background: activeCat === cat ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.04)',
              border: activeCat === cat ? '1px solid rgba(0,212,255,0.4)' : '1px solid rgba(255,255,255,0.1)',
              color: activeCat === cat ? '#00D4FF' : '#8BA8C4',
            }}>{cat}</button>
          ))}
        </div>
```

- [ ] **Step 4: Show a category badge** on each card (inside the card body, above the title):

```jsx
                      {post.category && (
                        <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 700, color: '#00D4FF', background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.25)', marginBottom: '0.5rem' }}>{post.category}</span>
                      )}
```

- [ ] **Step 5: Verify build** — `npm run build`.
- [ ] **Step 6: Commit**

```bash
git add src/pages/BlogPage.jsx
git commit -m "feat(blog): category badge + filter on the public blog index"
```

---

## Task 8: Public post page — category badge + author byline

**Files:**
- Modify: `src/pages/BlogPost.jsx`

- [ ] **Step 1: Render category + author** in the post header (it already `.select('*')`, so `post.category` / `post.author` are available). In the header area where the title/date/read-time render, add a category badge above the title and the author into the byline. Insert before the `<h1>` (the post title):

```jsx
        {post.category && (
          <span style={{ display: 'inline-block', padding: '3px 12px', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700, color: '#00D4FF', background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.25)', marginBottom: '1rem' }}>{post.category}</span>
        )}
```

And in the byline/meta line (where the date and read time show), add the author:

```jsx
        {post.author && <span>By {post.author}</span>}
```

(Place it consistent with the existing meta layout — e.g. before the date, separated the same way as the existing date/read-time items.)

- [ ] **Step 2: Verify build** — `npm run build`.
- [ ] **Step 3: Commit**

```bash
git add src/pages/BlogPost.jsx
git commit -m "feat(blog): category badge + author byline on the public post page"
```

---

## Task 9: Apply migration, configure env, deploy, QA

**Files:** none (DB + config + deploy + QA)

- [ ] **Step 1: Apply the migration to the live DB.** From the OneDrive haze-tech dir with `.env` sourced:

```bash
# cd OneDrive/.../Website Builders/haze-tech-solutions ; set -a; source .env; set +a
for stmt in \
  "alter table blog_posts add column if not exists category text;" \
  "alter table blog_posts add column if not exists author text default 'Haze Tech Solutions';" ; do
  curl -s -X POST "https://api.supabase.com/v1/projects/ioxpfvxcsclgmwyslxjj/database/query" \
    -H "Authorization: Bearer $SUPABASE_MGMT_API_TOKEN" -H "Content-Type: application/json" \
    -d "{\"query\": \"$stmt\"}" ; echo
done
```

Expected: each returns `[]` (success). Verify: `select column_name from information_schema.columns where table_name='blog_posts'` includes `category` + `author`.

- [ ] **Step 2: Ensure Vercel env vars exist** for the Node functions: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`, and `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` (or set the keys in `admin_settings` as `anthropic_api_key` / `openai_api_key`, which win). Check with `vercel env ls` (or the dashboard); add any missing with `vercel env add <NAME> production`. If `R2_BUCKET`/`R2_PUBLIC_URL` are unknown, read them from the Supabase edge function secrets (the brand-kit function uses the same names).

- [ ] **Step 3: Push to deploy** (Vercel auto-deploys `main` after the branch is merged in the finishing step). The migration + env are independent of the code deploy.

- [ ] **Step 4: Manual QA**

- Admin → Blog → New Post → "Generate with AI" (topic) → title/excerpt/content fill in.
- "Generate" cover image → a URL fills in and the image loads.
- Pick a category + author, Publish.
- Public `/blog` shows the category badge + filter works; `/blog/<slug>` shows badge + "By <author>".
- Select 2 posts → "Delete N" → they're removed.
- Existing single create/edit/delete still works.

---

## Self-Review Notes

- **Spec coverage:** A→T1; B→T2,T4,T6; C→T3,T4,T6; D→T5,T6,T7,T8; E→T6; testing→T2,T3 + T9. All spec sections mapped.
- **Naming consistency:** `buildBlogPrompt`/`parseBlogGeneration` (T2) used in T4; `r2Configured`/`buildBlogImageKey`/`uploadBuffer`/`slugifyForKey`/`publicUrlFor` (T3) used in T4; `BLOG_CATEGORIES` (T5) used in T6/T7; actions `blog-generate` / `blog-generate-cover` consistent between T4 and the T6 fetch calls; model `claude-sonnet-4-6` + `gpt-image-2` per spec.
- **No migration for RLS** — existing policies cover `blog_posts`; new columns are nullable/defaulted.

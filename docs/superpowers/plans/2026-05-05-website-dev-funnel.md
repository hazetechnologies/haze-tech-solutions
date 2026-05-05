# Website Dev Funnel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a structured funnel that turns a website-development lead into a private GitHub repo (created from a branded template) populated with AI-generated copy — triggered from a portal intake form filled by the client and a scaffold button clicked by the admin.

**Architecture:** New `website_projects` table tracks each engagement through `intake_pending → intake_submitted → generating → done`. A Supabase Edge Function (`generate-website-scaffold`, same `waitUntil` pattern as `generate-brand-kit`) calls Claude Sonnet for structured copy then GitHub's "create from template" + Contents API to produce the repo. Five Vercel API routes wrap admin auth (`requireAdmin`) and a client-auth submit route. New admin tab on `/admin/clients/:id` and new portal intake route at `/portal/website-intake`.

**Tech Stack:** React 19 + Vite, Supabase (Postgres + Edge Functions/Deno), Vercel Serverless Functions, Anthropic SDK (Claude Sonnet 4.6), GitHub REST API.

---

## File Structure

**Create:**
- `supabase/migrations/2026_05_05_create_website_projects.sql`
- `supabase/functions/generate-website-scaffold/index.ts`
- `supabase/functions/generate-website-scaffold/prompts.ts`
- `supabase/functions/generate-website-scaffold/types.ts`
- `supabase/functions/generate-website-scaffold/prompts.test.ts`
- `api/activate-website-project.js`
- `api/submit-website-intake.js`
- `api/start-website-scaffold.js`
- `api/website-scaffold-status/[id].js`
- `src/pages/admin/components/WebsiteProjectTab.jsx`
- `src/pages/portal/PortalWebsiteIntake.jsx`

**Modify:**
- `src/pages/admin/ClientDetail.jsx` — add Website tab
- `src/pages/portal/PortalDashboard.jsx` — add website project card
- `src/App.jsx` (or wherever portal routes live) — add `/portal/website-intake` route

**Reuse (no changes):**
- `api/_lib/require-admin.js` — admin auth on 3 of 4 admin routes
- `supabase/functions/_shared/tracked-claude.ts` — telemetry-wrapped Claude calls
- `BrandKitTab.jsx` and `BrandKitIntakeForm.jsx` patterns for new components

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/2026_05_05_create_website_projects.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/2026_05_05_create_website_projects.sql

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
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index website_projects_client_id_idx on website_projects(client_id);

alter table website_projects enable row level security;

-- Clients can read their own row (used by portal)
create policy "clients_read_own_website_project" on website_projects
  for select using (
    client_id in (select id from clients where user_id = auth.uid())
  );

-- Service role bypasses RLS automatically; no policy needed for admin/edge fn
```

- [ ] **Step 2: Apply migration via Supabase Management API**

Run from the project root:

```bash
node -e "
import('fs').then(async fs => {
  const sql = fs.readFileSync('supabase/migrations/2026_05_05_create_website_projects.sql','utf8')
  const r = await fetch('https://api.supabase.com/v1/projects/ioxpfvxcsclgmwyslxjj/database/query', {
    method:'POST',
    headers:{Authorization:'Bearer '+process.env.SUPABASE_MGMT_API_TOKEN, 'Content-Type':'application/json'},
    body: JSON.stringify({query: sql})
  })
  console.log(r.status, await r.text())
})
"
```

Expected: `201 []` (success, no rows returned).

- [ ] **Step 3: Verify table exists**

```bash
node -e "
import('@supabase/supabase-js').then(async ({createClient})=>{
  const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const {error} = await sb.from('website_projects').select('id').limit(1)
  console.log(error ? 'FAIL: '+error.message : 'OK: table exists')
})
"
```

Expected: `OK: table exists`

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/2026_05_05_create_website_projects.sql
git commit -m "feat(website-funnel): create website_projects table"
```

---

## Task 2: Edge function — types + prompt builder

**Files:**
- Create: `supabase/functions/generate-website-scaffold/types.ts`
- Create: `supabase/functions/generate-website-scaffold/prompts.ts`
- Create: `supabase/functions/generate-website-scaffold/prompts.test.ts`

- [ ] **Step 1: Write types.ts**

```typescript
// supabase/functions/generate-website-scaffold/types.ts

export interface WebsiteProjectInputs {
  template_id: 'service-business' | 'local-business' | 'creative-portfolio' | 'saas-landing' | 'travel-agency'
  domain: string
  business_description: string
  services: string[]
  pages: string[]
  color_style_prefs: string
  use_brand_kit: boolean
}

export interface BrandKitContext {
  business_name: string
  palette: Array<{ name: string; hex: string; use: string }>
  voice_tone: string
}

export interface AiContent {
  hero:        { headline: string; subheadline: string; cta: string }
  about:       { heading: string; body: string }
  services:    Array<{ name: string; description: string }>
  contact_cta: { heading: string; body: string }
  meta:        { title: string; description: string }
  footer_tagline: string
}
```

- [ ] **Step 2: Write prompts.ts**

```typescript
// supabase/functions/generate-website-scaffold/prompts.ts
import type { WebsiteProjectInputs, BrandKitContext } from './types.ts'

export const AI_CONTENT_SCHEMA = {
  type: 'object',
  required: ['hero','about','services','contact_cta','meta','footer_tagline'],
  properties: {
    hero: {
      type: 'object',
      required: ['headline','subheadline','cta'],
      properties: {
        headline:    { type: 'string', maxLength: 80 },
        subheadline: { type: 'string', maxLength: 200 },
        cta:         { type: 'string', maxLength: 30 },
      },
    },
    about: {
      type: 'object',
      required: ['heading','body'],
      properties: {
        heading: { type: 'string', maxLength: 60 },
        body:    { type: 'string', maxLength: 600 },
      },
    },
    services: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name','description'],
        properties: {
          name:        { type: 'string', maxLength: 50 },
          description: { type: 'string', maxLength: 200 },
        },
      },
    },
    contact_cta: {
      type: 'object',
      required: ['heading','body'],
      properties: {
        heading: { type: 'string', maxLength: 60 },
        body:    { type: 'string', maxLength: 200 },
      },
    },
    meta: {
      type: 'object',
      required: ['title','description'],
      properties: {
        title:       { type: 'string', maxLength: 60 },
        description: { type: 'string', maxLength: 160 },
      },
    },
    footer_tagline: { type: 'string', maxLength: 80 },
  },
}

export function buildSystemPrompt(brandKit: BrandKitContext | null): string {
  const lines = [
    'You are a senior website copywriter. Output ONLY valid JSON matching the schema. No markdown, no preamble.',
    'Tone: confident, benefit-led, scannable. Headlines under 80 chars. Avoid filler ("we are committed to..."), industry jargon, and hyperbole.',
    'CTAs: action verbs ("Get Started", "Book a Call", "See Pricing"). Never use "Click Here" or "Learn More".',
  ]
  if (brandKit) {
    lines.push(`Brand voice context for ${brandKit.business_name}:`)
    lines.push(brandKit.voice_tone)
    lines.push(`Honor this brand voice in every section.`)
  }
  return lines.join('\n\n')
}

export function buildUserPrompt(inputs: WebsiteProjectInputs, businessName: string): string {
  return [
    `Generate website copy for ${businessName}.`,
    '',
    'Inputs:',
    `- Domain: ${inputs.domain}`,
    `- Business description: ${inputs.business_description}`,
    `- Services to highlight: ${inputs.services.join(', ')}`,
    `- Pages: ${inputs.pages.join(', ')}`,
    `- Color & style preferences: ${inputs.color_style_prefs}`,
    `- Template: ${inputs.template_id}`,
    '',
    'Generate:',
    '- hero.headline: 6-9 words, punchy, benefit-led',
    '- hero.subheadline: one sentence elaborating on the headline',
    '- hero.cta: 2-3 word action verb',
    '- about.heading + about.body: 3-4 sentence about section, focused on what makes the business different',
    '- services: one entry per service input above (preserve order, do NOT add extras)',
    '- contact_cta: a heading + 1-2 sentence body that nudges visitors to reach out',
    '- meta.title: SEO title (≤60 chars, includes business name)',
    '- meta.description: SEO meta description (140-160 chars, includes a CTA)',
    '- footer_tagline: 4-8 words capturing the brand essence',
  ].join('\n')
}
```

- [ ] **Step 3: Write prompts.test.ts**

```typescript
// supabase/functions/generate-website-scaffold/prompts.test.ts
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { buildSystemPrompt, buildUserPrompt, AI_CONTENT_SCHEMA } from './prompts.ts'

Deno.test('buildSystemPrompt without brand kit', () => {
  const out = buildSystemPrompt(null)
  assertStringIncludes(out, 'senior website copywriter')
  assertStringIncludes(out, 'JSON')
})

Deno.test('buildSystemPrompt with brand kit injects voice tone', () => {
  const out = buildSystemPrompt({
    business_name: 'Acme Co',
    palette: [],
    voice_tone: '## Voice\n- Confident\n- Direct',
  })
  assertStringIncludes(out, 'Acme Co')
  assertStringIncludes(out, 'Confident')
})

Deno.test('buildUserPrompt includes all inputs', () => {
  const out = buildUserPrompt({
    template_id: 'service-business',
    domain: 'example.com',
    business_description: 'A landscaping company',
    services: ['Lawn care', 'Tree trimming'],
    pages: ['Home', 'About'],
    color_style_prefs: 'green and earthy',
    use_brand_kit: false,
  }, 'Green Thumb Co')
  assertStringIncludes(out, 'Green Thumb Co')
  assertStringIncludes(out, 'example.com')
  assertStringIncludes(out, 'Lawn care, Tree trimming')
  assertStringIncludes(out, 'service-business')
})

Deno.test('AI_CONTENT_SCHEMA has all required top-level fields', () => {
  assertEquals(AI_CONTENT_SCHEMA.required, ['hero','about','services','contact_cta','meta','footer_tagline'])
})
```

- [ ] **Step 4: Run tests**

```bash
cd supabase/functions/generate-website-scaffold && deno test prompts.test.ts
```

Expected: `ok | 4 passed | 0 failed`

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/generate-website-scaffold/
git commit -m "feat(website-funnel): edge function types + prompts"
```

---

## Task 3: Edge function — orchestrator

**Files:**
- Create: `supabase/functions/generate-website-scaffold/index.ts`

- [ ] **Step 1: Write index.ts**

```typescript
// supabase/functions/generate-website-scaffold/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { trackedClaude, extractText } from '../_shared/tracked-claude.ts'
import { buildSystemPrompt, buildUserPrompt } from './prompts.ts'
import type { WebsiteProjectInputs, AiContent, BrandKitContext } from './types.ts'

const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')!
const GITHUB_PAT    = Deno.env.get('GITHUB_PAT')!
const SONNET_MODEL  = 'claude-sonnet-4-6'
const GH_ORG        = 'hazetechnologies'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const { project_id } = await req.json().catch(() => ({}))
  if (!project_id) return new Response(JSON.stringify({ error: 'project_id required' }), { status: 400 })

  // @ts-ignore EdgeRuntime is a Supabase global
  EdgeRuntime.waitUntil(processProject(project_id))

  return new Response(JSON.stringify({ ok: true, project_id }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

async function processProject(projectId: string): Promise<void> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const update = (patch: Record<string, unknown>) =>
    supabase.from('website_projects').update(patch).eq('id', projectId)

  try {
    const { data: row, error: readErr } = await supabase
      .from('website_projects')
      .select('inputs, client_id, template_id')
      .eq('id', projectId)
      .single()
    if (readErr || !row) {
      await update({ status: 'failed', error: `row not found: ${readErr?.message}` })
      return
    }

    const inputs = row.inputs as WebsiteProjectInputs
    const clientId = row.client_id as string
    const templateId = row.template_id as string

    // Lookup client name + optional brand kit
    const { data: client } = await supabase
      .from('clients').select('name').eq('id', clientId).single()
    if (!client) throw new Error(`client ${clientId} not found`)
    const businessName = client.name

    let brandKit: BrandKitContext | null = null
    if (inputs.use_brand_kit) {
      const { data: kit } = await supabase
        .from('brand_kits')
        .select('assets')
        .eq('client_id', clientId)
        .eq('status', 'done')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (kit?.assets) {
        brandKit = {
          business_name: businessName,
          palette: kit.assets.color_palette ?? [],
          voice_tone: kit.assets.voice_tone ?? '',
        }
      }
    }

    await update({ status: 'generating', progress_message: 'Generating copy…' })

    // ── Generate AI content ──
    const aiContent = await generateContent(inputs, businessName, brandKit, projectId)
    await update({ ai_content: aiContent, progress_message: 'Creating GitHub repository…' })

    // ── Create repo from template ──
    const slug = slugify(businessName)
    const repoName = `${slug}-website`
    const repoUrl = await createRepoFromTemplate(templateId, repoName, businessName)

    // ── Wait for repo to initialize, then commit content.json ──
    await new Promise(r => setTimeout(r, 3000))
    await commitContent(repoName, aiContent)

    await update({
      status: 'done',
      progress_message: null,
      repo_name: repoName,
      repo_url: repoUrl,
    })
  } catch (err) {
    await update({
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
      progress_message: null,
    })
  }
}

async function generateContent(
  inputs: WebsiteProjectInputs,
  businessName: string,
  brandKit: BrandKitContext | null,
  projectId: string,
): Promise<AiContent> {
  const { data, status } = await trackedClaude({
    apiKey: ANTHROPIC_KEY,
    model: SONNET_MODEL,
    system: buildSystemPrompt(brandKit),
    messages: [{ role: 'user', content: buildUserPrompt(inputs, businessName) }],
    params: { max_tokens: 2000 },
    distinctId: projectId,
    eventProperties: { surface: 'website-scaffold', project_id: projectId },
  })
  if (status !== 200) throw new Error(`claude failed: ${status}: ${JSON.stringify(data).slice(0,300)}`)
  const text = extractText(data)
  // Strip any accidental code fences
  const cleaned = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
  return JSON.parse(cleaned) as AiContent
}

async function createRepoFromTemplate(templateId: string, repoName: string, businessName: string): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${GH_ORG}/template-${templateId}/generate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GITHUB_PAT}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      owner: GH_ORG,
      name: repoName,
      private: true,
      description: `${businessName} — generated by Haze Tech website funnel`,
    }),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`github create-from-template ${res.status}: ${txt.slice(0,300)}`)
  }
  const json = await res.json() as { html_url?: string }
  if (!json.html_url) throw new Error('github did not return html_url')
  return json.html_url
}

async function commitContent(repoName: string, aiContent: AiContent): Promise<void> {
  // Get current SHA of content.json (created by the template)
  const getRes = await fetch(`https://api.github.com/repos/${GH_ORG}/${repoName}/contents/content.json`, {
    headers: { 'Authorization': `Bearer ${GITHUB_PAT}`, 'Accept': 'application/vnd.github+json' },
  })
  let sha: string | undefined
  if (getRes.status === 200) {
    const existing = await getRes.json() as { sha?: string }
    sha = existing.sha
  } else if (getRes.status !== 404) {
    throw new Error(`github get content.json ${getRes.status}`)
  }

  // Commit (PUT — update if SHA known, create if not)
  const body: Record<string, unknown> = {
    message: 'feat: AI-generated initial site content',
    content: btoa(unescape(encodeURIComponent(JSON.stringify(aiContent, null, 2)))),
  }
  if (sha) body.sha = sha

  const putRes = await fetch(`https://api.github.com/repos/${GH_ORG}/${repoName}/contents/content.json`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${GITHUB_PAT}`, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!putRes.ok) {
    const txt = await putRes.text().catch(() => '')
    throw new Error(`github put content.json ${putRes.status}: ${txt.slice(0,300)}`)
  }
}

function slugify(s: string): string {
  return s.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}
```

- [ ] **Step 2: Set GITHUB_PAT secret in Supabase**

```bash
cd "<repo>"
npx supabase secrets set GITHUB_PAT=<paste-the-classic-PAT-with-repo-scope> --project-ref ioxpfvxcsclgmwyslxjj
```

Expected: `Finished supabase secrets set.`

- [ ] **Step 3: Deploy edge function**

```bash
npx supabase functions deploy generate-website-scaffold --project-ref ioxpfvxcsclgmwyslxjj
```

Expected: `Deployed Functions on project ioxpfvxcsclgmwyslxjj: generate-website-scaffold`

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/generate-website-scaffold/index.ts
git commit -m "feat(website-funnel): edge function orchestrator"
```

---

## Task 4: API — activate-website-project (admin)

**Files:**
- Create: `api/activate-website-project.js`

- [ ] **Step 1: Write activate-website-project.js**

```javascript
// api/activate-website-project.js
import { requireAdmin } from './_lib/require-admin'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed', message: 'POST only' })
  }

  const ctx = await requireAdmin(req, res)
  if (!ctx) return
  const { adminClient } = ctx

  const { client_id } = req.body || {}
  if (!client_id) {
    return res.status(400).json({ error: 'bad_request', message: 'client_id required' })
  }

  // Verify client exists
  const { data: client, error: clientErr } = await adminClient
    .from('clients').select('id').eq('id', client_id).maybeSingle()
  if (clientErr) return res.status(500).json({ error: 'db_error', message: clientErr.message })
  if (!client) return res.status(404).json({ error: 'not_found', message: 'Client not found' })

  // Reject duplicates: one website project per client
  const { data: existing } = await adminClient
    .from('website_projects').select('id').eq('client_id', client_id).maybeSingle()
  if (existing) {
    return res.status(409).json({ error: 'already_exists', message: 'Website project already activated', project_id: existing.id })
  }

  const { data: created, error: insertErr } = await adminClient
    .from('website_projects')
    .insert({ client_id, status: 'intake_pending' })
    .select('id')
    .single()
  if (insertErr) return res.status(500).json({ error: 'insert_failed', message: insertErr.message })

  return res.status(200).json({ project_id: created.id })
}
```

- [ ] **Step 2: Smoke test locally with curl**

Get an admin JWT (sign in via the admin login at https://www.hazetechsolutions.com/admin/login as info@hazetechsolutions.com, copy the token from `localStorage` key `sb-ioxpfvxcsclgmwyslxjj-auth-token` → `access_token`). Pick a real client UUID from `/admin/clients`.

```bash
curl -X POST https://www.hazetechsolutions.com/api/activate-website-project \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"client_id":"<test-client-uuid>"}'
```

Expected (first call): `{"project_id":"<uuid>"}`
Expected (second call with same client_id): HTTP 409 with `already_exists`.
Expected (no auth header): HTTP 401.

- [ ] **Step 3: Cleanup test row**

```bash
node -e "
import('@supabase/supabase-js').then(async ({createClient})=>{
  const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  await sb.from('website_projects').delete().eq('client_id','<test-client-uuid>')
  console.log('cleaned')
})
"
```

- [ ] **Step 4: Commit**

```bash
git add api/activate-website-project.js
git commit -m "feat(website-funnel): activate-website-project endpoint"
```

---

## Task 5: API — submit-website-intake (client)

**Files:**
- Create: `api/submit-website-intake.js`

- [ ] **Step 1: Write submit-website-intake.js**

```javascript
// api/submit-website-intake.js
import { createClient } from '@supabase/supabase-js'

const VALID_TEMPLATES = ['service-business','local-business','creative-portfolio','saas-landing','travel-agency']

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed', message: 'POST only' })
  }

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (!serviceKey) return res.status(500).json({ error: 'config_error', message: 'Service role key not configured' })

  // Authenticate the caller (any authenticated user — RLS check enforces ownership)
  const authHeader = req.headers.authorization
  if (!authHeader) return res.status(401).json({ error: 'unauthorized', message: 'Missing authorization header' })
  const m = /^Bearer\s+(.+)$/i.exec(authHeader)
  if (!m) return res.status(401).json({ error: 'unauthorized', message: 'Bearer token required' })

  const userClient = createClient(url, anonKey)
  const { data: { user: caller }, error: authErr } = await userClient.auth.getUser(m[1].trim())
  if (authErr || !caller) return res.status(401).json({ error: 'unauthorized', message: 'Invalid token' })

  const adminClient = createClient(url, serviceKey)

  const body = req.body || {}
  const { project_id, template_id, domain, business_description, services, pages, color_style_prefs, use_brand_kit } = body
  if (!project_id) return res.status(400).json({ error: 'bad_request', message: 'project_id required' })
  if (!VALID_TEMPLATES.includes(template_id)) {
    return res.status(400).json({ error: 'bad_request', message: 'Invalid template_id' })
  }
  if (!domain || !business_description) {
    return res.status(400).json({ error: 'bad_request', message: 'domain and business_description required' })
  }
  if (!Array.isArray(services) || services.length === 0) {
    return res.status(400).json({ error: 'bad_request', message: 'services must be a non-empty array' })
  }
  if (!Array.isArray(pages) || pages.length === 0) {
    return res.status(400).json({ error: 'bad_request', message: 'pages must be a non-empty array' })
  }

  // Verify caller owns the project (project's client.user_id == caller.id)
  const { data: project } = await adminClient
    .from('website_projects')
    .select('id, status, client_id, clients!inner(user_id)')
    .eq('id', project_id)
    .maybeSingle()
  if (!project) return res.status(404).json({ error: 'not_found', message: 'Project not found' })
  if (project.clients.user_id !== caller.id) {
    return res.status(403).json({ error: 'forbidden', message: 'Not your project' })
  }
  if (project.status !== 'intake_pending') {
    return res.status(409).json({ error: 'wrong_status', message: `Project is in status: ${project.status}` })
  }

  const inputs = {
    template_id,
    domain: String(domain).trim(),
    business_description: String(business_description).trim(),
    services: services.map(String),
    pages: pages.map(String),
    color_style_prefs: String(color_style_prefs || '').trim(),
    use_brand_kit: Boolean(use_brand_kit),
  }

  const { error: updErr } = await adminClient
    .from('website_projects')
    .update({
      status: 'intake_submitted',
      template_id,
      inputs,
      updated_at: new Date().toISOString(),
    })
    .eq('id', project_id)
  if (updErr) return res.status(500).json({ error: 'update_failed', message: updErr.message })

  return res.status(200).json({ ok: true })
}
```

- [ ] **Step 2: Smoke test**

Sign in as a portal client (one with an activated website project from Task 4). Get the JWT from `localStorage`. Run:

```bash
curl -X POST https://www.hazetechsolutions.com/api/submit-website-intake \
  -H "Authorization: Bearer <client-jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id":"<project-uuid>",
    "template_id":"service-business",
    "domain":"example.com",
    "business_description":"A landscaping company in Phoenix",
    "services":["Lawn care","Tree trimming"],
    "pages":["Home","About","Services","Contact"],
    "color_style_prefs":"green and earthy",
    "use_brand_kit":false
  }'
```

Expected: `{"ok":true}`. Verify `website_projects.status = 'intake_submitted'` and inputs jsonb is populated.

- [ ] **Step 3: Commit**

```bash
git add api/submit-website-intake.js
git commit -m "feat(website-funnel): submit-website-intake endpoint"
```

---

## Task 6: API — start-website-scaffold + status

**Files:**
- Create: `api/start-website-scaffold.js`
- Create: `api/website-scaffold-status/[id].js`

- [ ] **Step 1: Write start-website-scaffold.js**

```javascript
// api/start-website-scaffold.js
import { requireAdmin } from './_lib/require-admin'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'method_not_allowed', message: 'POST only' })
  }

  const ctx = await requireAdmin(req, res)
  if (!ctx) return
  const { adminClient } = ctx

  const { project_id } = req.body || {}
  if (!project_id) return res.status(400).json({ error: 'bad_request', message: 'project_id required' })

  const { data: project, error: readErr } = await adminClient
    .from('website_projects').select('id, status').eq('id', project_id).maybeSingle()
  if (readErr) return res.status(500).json({ error: 'db_error', message: readErr.message })
  if (!project) return res.status(404).json({ error: 'not_found', message: 'Project not found' })
  if (!['intake_submitted','failed'].includes(project.status)) {
    return res.status(409).json({ error: 'wrong_status', message: `Cannot start scaffold; status is: ${project.status}` })
  }

  await adminClient
    .from('website_projects')
    .update({ status: 'generating', progress_message: 'Starting…', error: null, updated_at: new Date().toISOString() })
    .eq('id', project_id)

  // Fire-and-forget invoke edge function
  const invoke = await fetch(`${SUPABASE_URL}/functions/v1/generate-website-scaffold`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ project_id }),
  })
  if (!invoke.ok) {
    const txt = await invoke.text().catch(() => '')
    await adminClient.from('website_projects').update({
      status: 'failed',
      error: `edge invoke failed: ${invoke.status}: ${txt.slice(0, 200)}`,
    }).eq('id', project_id)
    return res.status(500).json({ error: 'invoke_failed', message: 'Edge function invocation failed' })
  }

  return res.status(200).json({ project_id })
}
```

- [ ] **Step 2: Write website-scaffold-status/[id].js**

```javascript
// api/website-scaffold-status/[id].js
import { requireAdmin } from '../_lib/require-admin'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'method_not_allowed', message: 'GET only' })
  }

  const ctx = await requireAdmin(req, res)
  if (!ctx) return
  const { adminClient } = ctx

  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'bad_request', message: 'id required' })

  const { data, error } = await adminClient
    .from('website_projects')
    .select('id, status, progress_message, repo_url, repo_name, error, ai_content, inputs, template_id, updated_at')
    .eq('id', id)
    .maybeSingle()
  if (error) return res.status(500).json({ error: 'db_error', message: error.message })
  if (!data) return res.status(404).json({ error: 'not_found', message: 'Project not found' })

  return res.status(200).json(data)
}
```

- [ ] **Step 3: Smoke test**

Pick an `intake_submitted` project from Task 5. Trigger:

```bash
curl -X POST https://www.hazetechsolutions.com/api/start-website-scaffold \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"project_id":"<project-uuid>"}'
```

Expected: `{"project_id":"..."}`.

Then poll status until `done` or `failed`:

```bash
curl https://www.hazetechsolutions.com/api/website-scaffold-status/<project-uuid> \
  -H "Authorization: Bearer <admin-jwt>"
```

Expected: status progresses `generating` → `done` with `repo_url` populated.

NOTE: requires a `template-service-business` repo (or whichever was selected) to exist under hazetechnologies org. If this fails with `github create-from-template 404`, finish Task 11 first.

- [ ] **Step 4: Commit**

```bash
git add api/start-website-scaffold.js api/website-scaffold-status/
git commit -m "feat(website-funnel): start + status endpoints"
```

---

## Task 7: Portal — PortalWebsiteIntake component

**Files:**
- Create: `src/pages/portal/PortalWebsiteIntake.jsx`

- [ ] **Step 1: Find the existing portal route registration**

```bash
grep -rn "PortalDashboard\|portal/login\|/portal/" src/App.jsx src/main.jsx 2>/dev/null | head -20
```

Note the file and the routing pattern (likely react-router-dom with `<Route>` elements). Identify where `/portal/dashboard` is declared — the new route goes alongside it.

- [ ] **Step 2: Write PortalWebsiteIntake.jsx**

```jsx
// src/pages/portal/PortalWebsiteIntake.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const TEMPLATES = [
  { id: 'service-business',    name: 'Service Business',    blurb: 'For trades, consulting, and local services. Strong CTAs, simple bookings.' },
  { id: 'local-business',      name: 'Local Business',      blurb: 'Maps, hours, location-first. Great for restaurants and shops.' },
  { id: 'creative-portfolio',  name: 'Creative Portfolio',  blurb: 'Image-led, project showcase, gallery. For designers and creators.' },
  { id: 'saas-landing',        name: 'SaaS / Product Landing', blurb: 'Hero + features + pricing. Built for software products.' },
  { id: 'travel-agency',       name: 'Travel Agency',       blurb: 'Destinations, packages, booking — for travel and tour operators.' },
]

const PAGES_AVAILABLE = ['Home','About','Services','Contact','Blog','Portfolio','FAQ','Pricing']

export default function PortalWebsiteIntake() {
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [hasBrandKit, setHasBrandKit] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  // Form state
  const [templateId, setTemplateId] = useState('')
  const [domain, setDomain] = useState('')
  const [businessDescription, setBusinessDescription] = useState('')
  const [services, setServices] = useState([''])
  const [pages, setPages] = useState(['Home','About','Services','Contact'])
  const [colorStylePrefs, setColorStylePrefs] = useState('')
  const [useBrandKit, setUseBrandKit] = useState(true)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { navigate('/portal/login'); return }
      const { data: client } = await supabase.from('clients').select('id').eq('user_id', user.id).maybeSingle()
      if (!client) { setError('No client record found'); setLoading(false); return }
      const { data: proj } = await supabase
        .from('website_projects').select('*').eq('client_id', client.id).maybeSingle()
      if (!proj) { setError('No website project activated. Contact your dev team.'); setLoading(false); return }
      if (proj.status !== 'intake_pending') {
        setError(`This intake form has already been submitted (status: ${proj.status}).`)
        setLoading(false); return
      }
      setProject(proj)
      const { data: kit } = await supabase
        .from('brand_kits').select('id').eq('client_id', client.id).eq('status','done').maybeSingle()
      setHasBrandKit(Boolean(kit))
      setLoading(false)
    })()
  }, [navigate])

  const setServiceAt = (i, v) => setServices(s => s.map((x,idx) => idx===i ? v : x))
  const addService = () => setServices(s => [...s, ''])
  const removeService = (i) => setServices(s => s.filter((_,idx) => idx!==i))
  const togglePage = (p) => setPages(prev => prev.includes(p) ? prev.filter(x=>x!==p) : [...prev, p])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!templateId) { setError('Pick a template'); return }
    const filteredServices = services.map(s => s.trim()).filter(Boolean)
    if (filteredServices.length === 0) { setError('Add at least one service'); return }
    if (pages.length === 0) { setError('Pick at least one page'); return }
    if (!domain.trim() || !businessDescription.trim()) { setError('Domain and business description required'); return }
    setSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/submit-website-intake', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: project.id,
          template_id: templateId,
          domain: domain.trim(),
          business_description: businessDescription.trim(),
          services: filteredServices,
          pages,
          color_style_prefs: colorStylePrefs.trim(),
          use_brand_kit: hasBrandKit && useBrandKit,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || data.error || 'Submit failed')
      setSuccess(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div style={pageStyle}><p style={{ color:'#94A3B8' }}>Loading…</p></div>
  if (error && !project) return <div style={pageStyle}><p style={errStyle}>{error}</p></div>
  if (success) return (
    <div style={pageStyle}>
      <h1 style={h1}>You're all set</h1>
      <p style={{ color:'#CBD5E1', marginTop: 12 }}>
        Thanks — we'll get to work on your site and your dev team will reach out once it's ready to review.
      </p>
      <button onClick={() => navigate('/portal/dashboard')} style={btnPrimary}>Back to dashboard</button>
    </div>
  )

  return (
    <div style={pageStyle}>
      <h1 style={h1}>Website intake</h1>
      <p style={{ color:'#94A3B8', marginTop: 8 }}>Tell us about your site. Your dev team will use this to scaffold your project.</p>

      <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap: 24, marginTop: 28 }}>
        <Field label="Pick a template">
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
            {TEMPLATES.map(t => (
              <button type="button" key={t.id} onClick={() => setTemplateId(t.id)} style={tCard(templateId===t.id)}>
                <div style={{ color:'#F1F5F9', fontWeight: 700, fontSize: 14 }}>{t.name}</div>
                <div style={{ color:'#94A3B8', fontSize: 12, marginTop: 4 }}>{t.blurb}</div>
              </button>
            ))}
          </div>
        </Field>

        <Field label="Domain"><input style={input} value={domain} onChange={e=>setDomain(e.target.value)} placeholder="example.com" /></Field>

        <Field label="Business description">
          <textarea style={{ ...input, minHeight: 90 }} value={businessDescription} onChange={e=>setBusinessDescription(e.target.value)} placeholder="What does your business do? Who do you serve?" />
        </Field>

        <Field label="Services to highlight">
          <div style={{ display:'flex', flexDirection:'column', gap: 6 }}>
            {services.map((s, i) => (
              <div key={i} style={{ display:'flex', gap: 6 }}>
                <input style={input} value={s} onChange={e=>setServiceAt(i, e.target.value)} placeholder={`Service ${i+1}`} />
                {services.length > 1 && (
                  <button type="button" onClick={()=>removeService(i)} style={btnDanger}>Remove</button>
                )}
              </div>
            ))}
            <button type="button" onClick={addService} style={btnSecondary}>+ Add service</button>
          </div>
        </Field>

        <Field label="Pages needed">
          <div style={{ display:'flex', flexWrap:'wrap', gap: 8 }}>
            {PAGES_AVAILABLE.map(p => (
              <button type="button" key={p} onClick={()=>togglePage(p)} style={chip(pages.includes(p))}>{p}</button>
            ))}
          </div>
        </Field>

        <Field label="Color & style preferences">
          <textarea style={{ ...input, minHeight: 60 }} value={colorStylePrefs} onChange={e=>setColorStylePrefs(e.target.value)} placeholder="e.g. navy and gold, clean and professional, like Apple.com" />
        </Field>

        {hasBrandKit && (
          <Field label="Use my brand kit">
            <label style={{ display:'flex', alignItems:'center', gap: 8, color:'#CBD5E1' }}>
              <input type="checkbox" checked={useBrandKit} onChange={e=>setUseBrandKit(e.target.checked)} />
              Use the brand kit colors and voice
            </label>
          </Field>
        )}

        {error && <p style={errStyle}>{error}</p>}
        <button type="submit" disabled={submitting} style={btnPrimary}>
          {submitting ? 'Submitting…' : 'Submit intake'}
        </button>
      </form>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ color:'#F1F5F9', fontSize: 13, fontWeight: 600, display:'block', marginBottom: 8 }}>{label}</label>
      {children}
    </div>
  )
}

const pageStyle = { maxWidth: 800, margin: '0 auto', padding: '40px 24px', fontFamily: "'Plus Jakarta Sans', sans-serif" }
const h1 = { color:'#F1F5F9', fontSize: 28, fontWeight: 800, margin: 0 }
const input = { width:'100%', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding:'10px 12px', color:'#F1F5F9', fontSize: 13, fontFamily:'inherit' }
const btnPrimary = { background:'#00CFFF', border:'none', color:'#0F172A', borderRadius: 8, padding:'10px 18px', fontWeight: 700, cursor:'pointer', fontSize: 13 }
const btnSecondary = { background:'transparent', border:'1px solid rgba(255,255,255,0.1)', color:'#94A3B8', borderRadius: 8, padding:'8px 14px', fontSize: 12, cursor:'pointer' }
const btnDanger = { background:'transparent', border:'1px solid rgba(239,68,68,0.4)', color:'#F87171', borderRadius: 8, padding:'8px 12px', fontSize: 12, cursor:'pointer' }
const errStyle = { color:'#F87171', fontSize: 13 }
const tCard = (active) => ({ textAlign:'left', background: active ? 'rgba(0,207,255,0.08)' : 'rgba(255,255,255,0.03)', border:`1px solid ${active ? 'rgba(0,207,255,0.4)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 10, padding: 14, cursor:'pointer' })
const chip = (active) => ({ background: active ? 'rgba(0,207,255,0.1)' : 'rgba(255,255,255,0.04)', border:`1px solid ${active ? 'rgba(0,207,255,0.4)' : 'rgba(255,255,255,0.1)'}`, color: active ? '#00CFFF' : '#CBD5E1', borderRadius: 100, padding:'6px 14px', fontSize: 12, cursor:'pointer' })
```

- [ ] **Step 3: Register the route**

Edit `src/App.jsx` (or whichever file holds the portal routes — found in step 1). Add an import and a new route alongside the other `/portal/*` routes:

```jsx
import PortalWebsiteIntake from './pages/portal/PortalWebsiteIntake'
// ...
<Route path="/portal/website-intake" element={<PortalWebsiteIntake />} />
```

- [ ] **Step 4: Smoke test in browser**

Sign in as a portal client with an `intake_pending` website project. Visit `/portal/website-intake`. Verify the form renders, all fields work, submission succeeds, and the success state shows.

- [ ] **Step 5: Commit**

```bash
git add src/pages/portal/PortalWebsiteIntake.jsx src/App.jsx
git commit -m "feat(website-funnel): portal intake form"
```

---

## Task 8: Portal — Dashboard card

**Files:**
- Modify: `src/pages/portal/PortalDashboard.jsx`

- [ ] **Step 1: Read the existing dashboard to find the natural insertion point**

```bash
sed -n '1,80p' src/pages/portal/PortalDashboard.jsx
```

Identify the rendering region where existing project/invoice cards are listed.

- [ ] **Step 2: Add website project fetch + card**

In `PortalDashboard.jsx`, add this state + effect (alongside whatever already fetches projects/invoices):

```jsx
const [websiteProject, setWebsiteProject] = useState(null)

useEffect(() => {
  (async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: client } = await supabase.from('clients').select('id').eq('user_id', user.id).maybeSingle()
    if (!client) return
    const { data: wp } = await supabase
      .from('website_projects').select('id, status, repo_url').eq('client_id', client.id).maybeSingle()
    setWebsiteProject(wp || null)
  })()
}, [])
```

And render a card in the dashboard's main area:

```jsx
{websiteProject && (
  <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 18, marginBottom: 20 }}>
    <div style={{ color:'#F1F5F9', fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Website project</div>
    {websiteProject.status === 'intake_pending' && (
      <>
        <p style={{ color:'#CBD5E1', fontSize: 13, margin: '4px 0 12px' }}>We need a few details to get started.</p>
        <a href="/portal/website-intake" style={{ background:'#00CFFF', color:'#0F172A', padding:'8px 14px', borderRadius: 8, fontWeight: 700, fontSize: 12, textDecoration:'none' }}>Fill intake form</a>
      </>
    )}
    {websiteProject.status === 'intake_submitted' && (
      <p style={{ color:'#CBD5E1', fontSize: 13 }}>Intake received. Your team will start your site shortly.</p>
    )}
    {websiteProject.status === 'generating' && (
      <p style={{ color:'#CBD5E1', fontSize: 13 }}>In progress — your team is setting up your site.</p>
    )}
    {websiteProject.status === 'done' && (
      <p style={{ color:'#CBD5E1', fontSize: 13 }}>Ready — your dev team has your files.</p>
    )}
    {websiteProject.status === 'failed' && (
      <p style={{ color:'#F87171', fontSize: 13 }}>Something went wrong. Your team has been notified.</p>
    )}
  </div>
)}
```

- [ ] **Step 3: Smoke test**

Reload `/portal/dashboard`. Confirm the card appears with correct status text matching the underlying `website_projects.status`.

- [ ] **Step 4: Commit**

```bash
git add src/pages/portal/PortalDashboard.jsx
git commit -m "feat(website-funnel): portal dashboard website project card"
```

---

## Task 9: Admin — WebsiteProjectTab component

**Files:**
- Create: `src/pages/admin/components/WebsiteProjectTab.jsx`

- [ ] **Step 1: Write WebsiteProjectTab.jsx**

```jsx
// src/pages/admin/components/WebsiteProjectTab.jsx
import { useEffect, useState } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

export default function WebsiteProjectTab({ client }) {
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { loadProject() }, [client.id])

  async function loadProject() {
    setLoading(true)
    const { data } = await supabase
      .from('website_projects').select('*').eq('client_id', client.id).maybeSingle()
    setProject(data)
    setLoading(false)
  }

  async function activate() {
    setWorking(true); setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/activate-website-project', {
        method:'POST',
        headers:{ Authorization:`Bearer ${session.access_token}`, 'Content-Type':'application/json' },
        body: JSON.stringify({ client_id: client.id }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.message || j.error)
      await loadProject()
    } catch (e) { setError(e.message) } finally { setWorking(false) }
  }

  async function startScaffold() {
    setWorking(true); setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/start-website-scaffold', {
        method:'POST',
        headers:{ Authorization:`Bearer ${session.access_token}`, 'Content-Type':'application/json' },
        body: JSON.stringify({ project_id: project.id }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.message || j.error)
      // Poll until done/failed
      pollStatus(session.access_token)
    } catch (e) { setError(e.message); setWorking(false) }
  }

  async function pollStatus(token) {
    const interval = setInterval(async () => {
      const res = await fetch(`/api/website-scaffold-status/${project.id}`, {
        headers:{ Authorization:`Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      setProject(data)
      if (data.status === 'done' || data.status === 'failed') {
        clearInterval(interval)
        setWorking(false)
      }
    }, 3000)
  }

  if (loading) return <p style={{ color:'#94A3B8' }}>Loading…</p>

  // No project yet
  if (!project) {
    return (
      <div style={{ padding: 20 }}>
        <h3 style={h3}>Website project</h3>
        <p style={p}>No website project for this client yet. Activate one to send the intake form to their portal.</p>
        <button onClick={activate} disabled={working} style={btnPrimary}>
          {working ? 'Activating…' : 'Activate Website Project'}
        </button>
        {error && <p style={errStyle}>{error}</p>}
      </div>
    )
  }

  return (
    <div style={{ padding: 20, display:'flex', flexDirection:'column', gap: 18 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <h3 style={h3}>Website project</h3>
        <span style={badge(project.status)}>{project.status}</span>
      </div>

      {project.status === 'intake_pending' && (
        <p style={p}>Awaiting client intake. They have a link to fill the form in their portal.</p>
      )}

      {project.status === 'intake_submitted' && project.inputs && (
        <>
          <IntakePreview inputs={project.inputs} templateId={project.template_id} />
          <button onClick={startScaffold} disabled={working} style={btnPrimary}>
            {working ? 'Generating…' : 'Generate Scaffold'}
          </button>
        </>
      )}

      {project.status === 'generating' && (
        <div style={{ background:'rgba(0,207,255,0.06)', border:'1px solid rgba(0,207,255,0.2)', borderRadius: 10, padding: 14 }}>
          <p style={{ color:'#00CFFF', fontSize: 13, margin: 0 }}>{project.progress_message || 'Generating…'}</p>
        </div>
      )}

      {project.status === 'done' && project.repo_url && (
        <div>
          <a href={project.repo_url} target="_blank" rel="noreferrer" style={btnPrimary}>
            <ExternalLink size={14} style={{ marginRight: 6 }} /> View on GitHub
          </a>
          {project.ai_content && (
            <details style={{ marginTop: 16 }}>
              <summary style={{ color:'#94A3B8', fontSize: 12, cursor:'pointer' }}>Generated content</summary>
              <pre style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: 12, color:'#CBD5E1', fontSize: 11, overflow:'auto', marginTop: 8 }}>{JSON.stringify(project.ai_content, null, 2)}</pre>
            </details>
          )}
        </div>
      )}

      {project.status === 'failed' && (
        <>
          <p style={errStyle}>{project.error || 'Generation failed'}</p>
          <button onClick={startScaffold} disabled={working} style={btnPrimary}>
            <RefreshCw size={14} style={{ marginRight: 6 }} /> Retry
          </button>
        </>
      )}

      {error && <p style={errStyle}>{error}</p>}
    </div>
  )
}

function IntakePreview({ inputs, templateId }) {
  return (
    <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 14 }}>
      <Row label="Template"  value={templateId} />
      <Row label="Domain"    value={inputs.domain} />
      <Row label="Pages"     value={(inputs.pages || []).join(', ')} />
      <Row label="Services"  value={(inputs.services || []).join(', ')} />
      <Row label="Brand kit" value={inputs.use_brand_kit ? 'Yes' : 'No'} />
      <div style={{ marginTop: 8 }}>
        <div style={{ color:'#94A3B8', fontSize: 11, marginBottom: 4 }}>Description</div>
        <div style={{ color:'#CBD5E1', fontSize: 12 }}>{inputs.business_description}</div>
      </div>
      {inputs.color_style_prefs && (
        <div style={{ marginTop: 8 }}>
          <div style={{ color:'#94A3B8', fontSize: 11, marginBottom: 4 }}>Style preferences</div>
          <div style={{ color:'#CBD5E1', fontSize: 12 }}>{inputs.color_style_prefs}</div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div style={{ display:'flex', gap: 12, padding: '4px 0' }}>
      <div style={{ color:'#94A3B8', fontSize: 12, width: 90 }}>{label}</div>
      <div style={{ color:'#F1F5F9', fontSize: 12 }}>{value}</div>
    </div>
  )
}

const h3 = { color:'#F1F5F9', fontSize: 14, fontWeight: 700, margin: 0 }
const p = { color:'#CBD5E1', fontSize: 13 }
const errStyle = { color:'#F87171', fontSize: 13 }
const btnPrimary = { background:'#00CFFF', color:'#0F172A', border:'none', borderRadius: 8, padding:'8px 14px', fontWeight: 700, fontSize: 12, cursor:'pointer', textDecoration:'none', display:'inline-flex', alignItems:'center' }
const badge = (s) => ({
  background: s==='done' ? 'rgba(34,197,94,0.1)' : s==='failed' ? 'rgba(239,68,68,0.1)' : 'rgba(0,207,255,0.08)',
  color:     s==='done' ? '#4ADE80'             : s==='failed' ? '#F87171'             : '#00CFFF',
  border:`1px solid currentColor`,
  borderRadius: 100, padding:'4px 10px', fontSize: 11, fontWeight: 700, textTransform:'uppercase', letterSpacing:'0.05em',
})
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/admin/components/WebsiteProjectTab.jsx
git commit -m "feat(website-funnel): admin WebsiteProjectTab component"
```

---

## Task 10: Admin — ClientDetail tab integration

**Files:**
- Modify: `src/pages/admin/ClientDetail.jsx`

- [ ] **Step 1: Locate the tab list and add Website tab**

Open `src/pages/admin/ClientDetail.jsx`. Find where the tab navigation is rendered (search for "Brand Kit" — the brand kit tab will be next to where the website tab goes).

- [ ] **Step 2: Add the import and tab**

Add at the top:

```jsx
import WebsiteProjectTab from './components/WebsiteProjectTab'
```

In the tab definitions array (or wherever the tabs are listed), add a `'website'` tab after `'brandkit'`:

```jsx
{ key: 'website', label: 'Website' }
```

In the tab content renderer, add the case:

```jsx
{activeTab === 'website' && <WebsiteProjectTab client={client} />}
```

(Adapt to whatever pattern the file uses — `switch`, conditional rendering, or a tab map.)

- [ ] **Step 3: Smoke test**

Visit `/admin/clients/<id>` for a test client. Click the Website tab. Verify:
- "Activate Website Project" button shows when no project exists
- Activate creates a project and the tab now shows `intake_pending` state
- After client submits the intake (Task 7), tab shows the intake summary + "Generate Scaffold" button
- Clicking Generate Scaffold polls status and renders progress, then either repo URL or error

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/ClientDetail.jsx
git commit -m "feat(website-funnel): wire WebsiteProjectTab into ClientDetail"
```

---

## Task 11: GitHub template repos + GITHUB_PAT setup

**Files:** none in this repo (manual external setup)

- [ ] **Step 1: Create the GitHub PAT**

Go to https://github.com/settings/tokens?type=beta — generate a fine-grained token:
- **Resource owner:** hazetechnologies (org)
- **Repository access:** All repositories
- **Permissions → Repository permissions → Contents:** Read and write
- **Permissions → Repository permissions → Administration:** Read and write (needed for "create from template")
- **Permissions → Repository permissions → Metadata:** Read-only (auto-included)

Save the token. (If a fine-grained token doesn't work for create-from-template due to API quirks, fall back to a classic PAT with the `repo` scope.)

- [ ] **Step 2: Add GITHUB_PAT to Vercel**

```bash
cd "<repo>"
vercel env add GITHUB_PAT production --value "<paste-token>" --yes
vercel env add GITHUB_PAT preview --value "<paste-token>" --yes
vercel env add GITHUB_PAT development --value "<paste-token>" --yes
```

(Use `--value` flag, not stdin pipe — Windows quirk noted in repo memory.)

- [ ] **Step 3: Add GITHUB_PAT to Supabase secrets** (if not already done in Task 3)

```bash
npx supabase secrets set GITHUB_PAT="<paste-token>" --project-ref ioxpfvxcsclgmwyslxjj
```

- [ ] **Step 4: Create 5 template repos under hazetechnologies org**

For each of the 5 templates, create a private repo and mark it as a template repository:

Repo names:
- `hazetechnologies/template-service-business`
- `hazetechnologies/template-local-business`
- `hazetechnologies/template-creative-portfolio`
- `hazetechnologies/template-saas-landing`
- `hazetechnologies/template-travel-agency`

For each repo:
1. Create via `gh repo create hazetechnologies/template-<id> --private --add-readme`
2. Mark as template: Settings → "Template repository" checkbox
3. Add a `content.json` file at the root with empty placeholder structure:

```json
{
  "hero": { "headline": "", "subheadline": "", "cta": "" },
  "about": { "heading": "", "body": "" },
  "services": [],
  "contact_cta": { "heading": "", "body": "" },
  "meta": { "title": "", "description": "" },
  "footer_tagline": ""
}
```

The actual template HTML/Next.js scaffolding can be added later — the funnel works the moment `content.json` exists.

Bash one-liner to add `content.json` to all 5 once they're created:

```bash
for tpl in service-business local-business creative-portfolio saas-landing travel-agency; do
  gh api -X PUT "/repos/hazetechnologies/template-${tpl}/contents/content.json" \
    -f message="chore: add content.json placeholder" \
    -f content="$(echo -n '{
  "hero": { "headline": "", "subheadline": "", "cta": "" },
  "about": { "heading": "", "body": "" },
  "services": [],
  "contact_cta": { "heading": "", "body": "" },
  "meta": { "title": "", "description": "" },
  "footer_tagline": ""
}' | base64 -w 0)"
done
```

- [ ] **Step 5: Verify the full flow end-to-end**

1. Activate a website project for a test client (admin UI)
2. Sign in as that client in portal, fill intake form, submit
3. Back in admin, click Generate Scaffold
4. Wait ~30-60s for status to flip to `done`
5. Visit the returned `repo_url` — confirm new repo exists at `github.com/hazetechnologies/<slug>-website`
6. Confirm the repo's `content.json` contains the AI-generated copy
7. Repeat with `use_brand_kit: true` for a client with a kit; confirm copy reflects brand voice

- [ ] **Step 6: Commit (none needed — all manual external work)**

No code change for this task; the changelog is satisfied by Tasks 1-10 plus the manual setup above.

---

## Self-Review Notes

**Spec coverage (cross-checked with `docs/superpowers/specs/2026-05-04-website-dev-funnel-design.md`):**
- DB table → Task 1 ✓
- 5 template repos → Task 11 ✓
- 4 API endpoints → Tasks 4, 5, 6 ✓
- Edge function → Tasks 2, 3 ✓
- Admin UI (ClientDetail tab + WebsiteProjectTab) → Tasks 9, 10 ✓
- Portal UI (PortalWebsiteIntake + Dashboard card) → Tasks 7, 8 ✓
- GITHUB_PAT env var → Task 11 ✓
- Brand kit reuse via `use_brand_kit` flag → Task 3 (edge fn `if (inputs.use_brand_kit)` block) + Task 5 (input validation) + Task 7 (toggle in form) ✓
- Verification steps end-to-end → Task 11 step 5 ✓

**Type consistency:** `WebsiteProjectInputs.template_id`, `inputs.template_id`, the API payload `template_id`, and the `VALID_TEMPLATES` constant are all aligned. `AiContent` shape matches what the edge function writes to `content.json` and what the admin UI displays in the accordion.

**No placeholders:** All steps contain executable code or commands. Self-scan complete.

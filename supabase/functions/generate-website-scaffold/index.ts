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

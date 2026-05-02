// supabase/functions/generate-social-audit/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { validateInputs } from './lib/validate-inputs.ts'
import { fetchInstagram } from './lib/fetch-instagram.ts'
import { fetchYouTube } from './lib/fetch-youtube.ts'
import { buildPrompt, REPORT_JSON_SCHEMA } from './lib/build-prompt.ts'
import { renderMarkdown } from './lib/render-markdown.ts'
import type { RawData, AuditReport } from './lib/types.ts'
import { trackedOpenAi } from '../_shared/tracked-openai.ts'

const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY')!

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const { audit_id } = await req.json().catch(() => ({}))
  if (!audit_id) {
    return new Response(JSON.stringify({ error: 'audit_id required' }), {
      status: 400, headers: { 'Content-Type': 'application/json' }
    })
  }

  // @ts-ignore EdgeRuntime is a Supabase global; not in @types/deno
  EdgeRuntime.waitUntil(processAudit(audit_id))

  return new Response(JSON.stringify({ ok: true, audit_id }), {
    headers: { 'Content-Type': 'application/json' }
  })
})

async function processAudit(audit_id: string): Promise<void> {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  async function update(patch: Record<string, unknown>) {
    await supabase.from('social_audits').update(patch).eq('id', audit_id)
  }

  try {
    const { data: row, error: readErr } = await supabase
      .from('social_audits').select('inputs').eq('id', audit_id).single()
    if (readErr || !row) {
      await update({ status: 'failed', error: `row not found: ${readErr?.message}` })
      return
    }

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

    const igOk = !!raw.instagram?.self?.available
    const ytOk = !!raw.youtube?.self?.available
    if (!igOk && !ytOk) {
      await update({ raw_data: raw, status: 'failed', error: 'All requested platforms failed to fetch the lead\'s own handles.' })
      return
    }

    await update({ status: 'analyzing', progress_message: 'Analyzing content with AI…', raw_data: raw })

    const { systemPrompt, userContent } = await buildPrompt(inputs, raw)
    const aiRes = await callOpenAI(systemPrompt, userContent, audit_id)
    const report: AuditReport = JSON.parse(aiRes)
    const markdown = renderMarkdown(report)

    await update({
      status: 'completed',
      progress_message: 'Done',
      report,
      report_markdown: markdown,
      completed_at: new Date().toISOString(),
    })
  } catch (err) {
    await update({ status: 'failed', error: err instanceof Error ? err.message : String(err) })
  }
}

async function callOpenAI(systemPrompt: string, userContent: any[], auditId: string): Promise<string> {
  const attempt = async () => {
    const { data, status } = await trackedOpenAi({
      apiKey: OPENAI_KEY,
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      params: {
        response_format: { type: 'json_schema', json_schema: REPORT_JSON_SCHEMA },
      },
      distinctId: auditId,
      eventProperties: { surface: 'social-audit', audit_id: auditId },
    })
    if (status !== 200) {
      const errText = JSON.stringify(data).slice(0, 500)
      throw new Error(`OpenAI ${status}: ${errText}`)
    }
    return data.choices?.[0]?.message?.content ?? ''
  }

  try {
    return await attempt()
  } catch (_err) {
    await new Promise(r => setTimeout(r, 5000))
    return await attempt()
  }
}

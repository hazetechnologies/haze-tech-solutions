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

    const { systemPrompt, userContent } = await buildPrompt(inputs, raw)
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
    model: 'gpt-4o-mini',
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

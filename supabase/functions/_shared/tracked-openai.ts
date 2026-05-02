// supabase/functions/_shared/tracked-openai.ts
const POSTHOG_KEY = Deno.env.get('POSTHOG_PROJECT_API_KEY')
const POSTHOG_HOST = Deno.env.get('POSTHOG_HOST') ?? 'https://us.i.posthog.com'

interface TrackedOpenAiOpts {
  apiKey: string
  model: string
  messages: unknown[]
  params?: Record<string, unknown>
  distinctId?: string
  eventProperties?: Record<string, unknown>
}

interface TrackedOpenAiResult {
  data: any
  status: number
}

export async function trackedOpenAi({
  apiKey, model, messages, params = {}, distinctId = 'anonymous', eventProperties = {},
}: TrackedOpenAiOpts): Promise<TrackedOpenAiResult> {
  const start = Date.now()
  const body = { model, messages, ...params }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  })
  const latencyMs = Date.now() - start
  const data = await res.json()

  if (POSTHOG_KEY) {
    const usage = data.usage ?? {}
    fetch(`${POSTHOG_HOST}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: POSTHOG_KEY,
        event: '$ai_generation',
        distinct_id: distinctId,
        properties: {
          $ai_model: model,
          $ai_provider: 'openai',
          $ai_input_tokens: usage.prompt_tokens ?? null,
          $ai_output_tokens: usage.completion_tokens ?? null,
          $ai_total_tokens: usage.total_tokens ?? null,
          $ai_latency: latencyMs,
          $ai_http_status: res.status,
          ...eventProperties,
        },
      }),
    }).catch(() => {})
  }

  return { data, status: res.status }
}

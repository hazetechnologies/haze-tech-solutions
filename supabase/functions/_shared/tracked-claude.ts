// supabase/functions/_shared/tracked-claude.ts
const POSTHOG_KEY = Deno.env.get('POSTHOG_PROJECT_API_KEY')
const POSTHOG_HOST = Deno.env.get('POSTHOG_HOST') ?? 'https://us.i.posthog.com'

interface TrackedClaudeOpts {
  apiKey: string
  model: string                    // e.g. 'claude-opus-4-7'
  system?: string
  messages: { role: 'user' | 'assistant'; content: string }[]
  params?: Record<string, unknown>
  distinctId?: string
  eventProperties?: Record<string, unknown>
}

interface TrackedClaudeResult {
  data: any
  status: number
}

export async function trackedClaude({
  apiKey, model, system, messages, params = {}, distinctId = 'anonymous', eventProperties = {},
}: TrackedClaudeOpts): Promise<TrackedClaudeResult> {
  const start = Date.now()
  const body: Record<string, unknown> = {
    model,
    max_tokens: params.max_tokens ?? 4096,
    messages,
    ...params,
  }
  if (system) body.system = system

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
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
          $ai_provider: 'anthropic',
          $ai_input_tokens: usage.input_tokens ?? null,
          $ai_output_tokens: usage.output_tokens ?? null,
          $ai_total_tokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
          $ai_latency: latencyMs,
          $ai_http_status: res.status,
          ...eventProperties,
        },
      }),
    }).catch(() => {})
  }

  return { data, status: res.status }
}

/** Helper: extract concatenated text from an Anthropic Messages response. */
export function extractText(data: any): string {
  if (!data?.content || !Array.isArray(data.content)) return ''
  return data.content
    .filter((block: any) => block.type === 'text')
    .map((block: any) => block.text)
    .join('')
}

// api/_lib/tracked-openai.js
import { PostHog } from 'posthog-node'

const POSTHOG_KEY = process.env.POSTHOG_PROJECT_API_KEY || process.env.VITE_POSTHOG_KEY
const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://us.i.posthog.com'

let phClient = null
function getClient() {
  if (phClient) return phClient
  if (!POSTHOG_KEY) return null
  phClient = new PostHog(POSTHOG_KEY, { host: POSTHOG_HOST, flushAt: 1, flushInterval: 0 })
  return phClient
}

/**
 * Calls OpenAI chat completions and emits a $ai_generation event to PostHog.
 * Wraps raw fetch (we don't use the OpenAI SDK in this codebase).
 *
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.model
 * @param {Array}  opts.messages
 * @param {object} [opts.params] - extra fields merged into the body (max_tokens, temperature, response_format, etc.)
 * @param {string} [opts.distinctId='anonymous']
 * @param {object} [opts.eventProperties] - extra properties to include in the PostHog event
 * @returns {Promise<{ data: object, status: number }>}
 */
export async function trackedOpenAi({ apiKey, model, messages, params = {}, distinctId = 'anonymous', eventProperties = {} }) {
  const start = Date.now()
  const body = { model, messages, ...params }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  })
  const latencyMs = Date.now() - start
  const data = await res.json()

  const client = getClient()
  if (client) {
    const usage = data.usage || {}
    client.capture({
      distinctId,
      event: '$ai_generation',
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
    })
    await client.shutdown().catch(() => {})
    phClient = null
  }

  return { data, status: res.status }
}

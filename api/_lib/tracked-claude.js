// api/_lib/tracked-claude.js
import Anthropic from '@anthropic-ai/sdk'
import { PostHog } from 'posthog-node'

const POSTHOG_KEY = process.env.POSTHOG_PROJECT_API_KEY || process.env.VITE_POSTHOG_KEY
const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://us.i.posthog.com'

let phClient = null
function getPhClient() {
  if (phClient) return phClient
  if (!POSTHOG_KEY) return null
  phClient = new PostHog(POSTHOG_KEY, { host: POSTHOG_HOST, flushAt: 1, flushInterval: 0 })
  return phClient
}

/**
 * Calls Anthropic Messages API and emits a $ai_generation event to PostHog.
 *
 * @param {object} opts
 * @param {string} opts.apiKey
 * @param {string} opts.model        e.g. 'claude-opus-4-7'
 * @param {string} [opts.system]     system prompt
 * @param {Array}  opts.messages     [{role:'user', content:'...'}, ...]
 * @param {object} [opts.params]     extra fields (max_tokens, temperature, etc.)
 * @param {string} [opts.distinctId='anonymous']
 * @param {object} [opts.eventProperties]
 * @returns {Promise<{ data: object, status: number }>}
 */
export async function trackedClaude({
  apiKey, model, system, messages, params = {}, distinctId = 'anonymous', eventProperties = {},
}) {
  const start = Date.now()
  const client = new Anthropic({ apiKey })

  let data, status = 200
  try {
    data = await client.messages.create({
      model,
      max_tokens: params.max_tokens ?? 4096,
      ...(system ? { system } : {}),
      messages,
      ...params,
    })
  } catch (err) {
    status = err.status ?? 500
    data = { error: err.message }
  }
  const latencyMs = Date.now() - start

  const ph = getPhClient()
  if (ph) {
    const usage = data.usage ?? {}
    ph.capture({
      distinctId,
      event: '$ai_generation',
      properties: {
        $ai_model: model,
        $ai_provider: 'anthropic',
        $ai_input_tokens: usage.input_tokens ?? null,
        $ai_output_tokens: usage.output_tokens ?? null,
        $ai_total_tokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
        $ai_latency: latencyMs,
        $ai_http_status: status,
        ...eventProperties,
      },
    })
    await ph.shutdown().catch(() => {})
    phClient = null
  }

  return { data, status }
}

/** Helper: extract concatenated text from an Anthropic Messages response. */
export function extractText(data) {
  if (!data?.content) return ''
  return data.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
}

// supabase/functions/generate-brand-kit/kie.ts
//
// Pure helpers for parsing KIE AI's response envelope. Extracted from index.ts
// so the error-handling logic is unit-testable without the Edge Runtime or a
// live network call.
//
// CRITICAL: KIE wraps every response as { code, msg, data } and returns
// HTTP 200 even for business failures — e.g. insufficient credits comes back as
// HTTP 200 with body { code: 402, msg: "Credits insufficient ...", data: null }.
// Checking res.ok alone silently swallows those, which is exactly what turned a
// real "out of credits" failure into a useless "did not generate" message.
// Route every KIE response through unwrapKieEnvelope so the real reason surfaces.

export interface KieEnvelope<T> {
  code?: number
  msg?: string
  data?: T | null
}

/**
 * Validate a KIE envelope and return its `data`, or throw a descriptive error
 * that includes KIE's own `code` + `msg`. Treats BOTH a non-2xx HTTP status and
 * an in-body `code` other than 200 as failure.
 */
export function unwrapKieEnvelope<T>(
  httpStatus: number,
  json: KieEnvelope<T> | null | undefined,
  context: string,
): T {
  if (!json) {
    throw new Error(`KIE ${context}: empty or non-JSON response (HTTP ${httpStatus})`)
  }
  const code = json.code
  const httpFailed = httpStatus < 200 || httpStatus >= 300
  const codeFailed = code != null && code !== 200
  if (httpFailed || codeFailed) {
    const reason = json.msg?.trim() || `HTTP ${httpStatus}`
    throw new Error(`KIE ${context} failed (code ${code ?? httpStatus}): ${reason}`)
  }
  if (json.data == null) {
    throw new Error(`KIE ${context}: succeeded but response carried no data`)
  }
  return json.data
}

/**
 * Collapse per-banner error messages into one short, deduped, human-readable
 * reason for the brand_kits.error column, so the admin sees WHY banners failed
 * (e.g. "KIE createTask ... failed (code 402): Credits insufficient") instead of
 * only the list of missing assets. Returns '' when there is nothing useful.
 */
export function summarizeBannerErrors(errors: string[]): string {
  const cleaned = errors.map((e) => (e ?? '').trim()).filter(Boolean)
  if (cleaned.length === 0) return ''
  const unique = [...new Set(cleaned)]
  return unique.slice(0, 3).join(' | ').slice(0, 400)
}

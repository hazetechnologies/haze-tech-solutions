// supabase/functions/generate-social-audit/lib/validate-inputs.ts
import type { AuditInputs, Platform } from './types.ts'

const VALID_GOALS = ['Engagement', 'Leads', 'Awareness', 'Sales'] as const
const VALID_PLATFORMS: Platform[] = ['instagram', 'youtube']

export function validateInputs(raw: unknown): AuditInputs {
  if (!raw || typeof raw !== 'object') throw new Error('inputs must be an object')
  const r = raw as Record<string, unknown>

  if (!VALID_GOALS.includes(r.goal as any)) {
    throw new Error(`goal must be one of ${VALID_GOALS.join(', ')}`)
  }
  if (typeof r.audience !== 'string') throw new Error('audience required')
  if (typeof r.challenge !== 'string') throw new Error('challenge required')

  const platforms: AuditInputs['platforms'] = {}
  const platformsRaw = (r.platforms ?? {}) as Record<string, any>

  for (const p of VALID_PLATFORMS) {
    const v = platformsRaw[p]
    if (!v || typeof v !== 'object') continue
    const self = typeof v.self === 'string' ? v.self.trim() : ''
    if (!self) continue
    const competitors = Array.isArray(v.competitors)
      ? v.competitors.map((c: any) => String(c ?? '').trim()).filter(Boolean)
      : []
    if (competitors.length > 2) {
      throw new Error(`too many competitors for ${p} (max 2)`)
    }
    platforms[p] = { self, competitors }
  }

  if (Object.keys(platforms).length === 0) {
    throw new Error('at least one platform with a self handle is required')
  }

  return {
    platforms,
    audience: r.audience,
    goal: r.goal as AuditInputs['goal'],
    challenge: r.challenge
  }
}

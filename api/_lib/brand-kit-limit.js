// api/_lib/brand-kit-limit.js
// Pure helper: decide whether a client may generate another brand kit this
// billing cycle. Failed kits do NOT count (a failed generation — e.g. KIE out
// of credits — shouldn't burn an attempt); pending/generating/
// awaiting_logo_approval/done all count.

export function evaluateBrandKitLimit({ kits, limit, periodStart, resetsAt = null }) {
  const start = periodStart instanceof Date ? periodStart : new Date(periodStart)
  const used = (kits || []).filter((k) => {
    if (k.status === 'failed') return false
    return new Date(k.created_at) >= start
  }).length
  return { allowed: used < limit, used, limit, resetsAt }
}

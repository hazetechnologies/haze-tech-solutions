// src/lib/telemetry.js
import posthog from './posthog'
import * as Sentry from '@sentry/react'

export function trackEvent(name, properties = {}) {
  posthog.capture(name, properties)
}

export function trackCta(ctaId, location, extra = {}) {
  posthog.capture('cta_clicked', { cta_id: ctaId, location, ...extra })
}

export function identifyUser({ id, email, ...traits }) {
  if (!id) return
  posthog.identify(id, { email, ...traits })
  Sentry.setUser({ id, email })
}

export function identifyLead({ email, name, source, ...traits }) {
  if (!email) return
  posthog.identify(email, { email, name, lead_source: source, ...traits })
  Sentry.setUser({ id: email, email })
}

export function resetIdentity() {
  posthog.reset()
  Sentry.setUser(null)
}

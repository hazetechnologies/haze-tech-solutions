// src/lib/telemetry.js
import posthog from './posthog'
import * as Sentry from '@sentry/react'
import { gaEvent, gaSetUser, gaClearUser } from './gtag'

export function trackEvent(name, properties = {}) {
  posthog.capture(name, properties)
  gaEvent(name, properties)
}

export function trackCta(ctaId, location, extra = {}) {
  posthog.capture('cta_clicked', { cta_id: ctaId, location, ...extra })
  gaEvent('cta_clicked', { cta_id: ctaId, location, ...extra })
}

// GA4 recommended conversion events. `generate_lead` and `sign_up` are names
// GA4 recognizes out of the box — mark them as Key Events in GA4 Admin → Events
// to count them as conversions. Fired to both PostHog and GA.
export function trackLead(source, extra = {}) {
  trackEvent('generate_lead', { lead_source: source, ...extra })
}

export function trackSignup(method, extra = {}) {
  trackEvent('sign_up', { method, ...extra })
}

export function identifyUser({ id, email, ...traits }) {
  if (!id) return
  posthog.identify(id, { email, ...traits })
  Sentry.setUser({ id, email })
  gaSetUser(id)
}

export function identifyLead({ email, name, source, ...traits }) {
  if (!email) return
  posthog.identify(email, { email, name, lead_source: source, ...traits })
  Sentry.setUser({ id: email, email })
  gaSetUser(email)
}

export function resetIdentity() {
  posthog.reset()
  Sentry.setUser(null)
  gaClearUser()
}

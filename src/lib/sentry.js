// src/lib/sentry.js
import * as Sentry from '@sentry/react'

const DSN = import.meta.env.VITE_SENTRY_DSN

let initialized = false

export function initSentry() {
  if (initialized) return Sentry
  if (!DSN) {
    console.warn('[sentry] VITE_SENTRY_DSN missing — error tracking disabled')
    return Sentry
  }
  Sentry.init({
    dsn: DSN,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    environment: import.meta.env.MODE,
  })
  initialized = true
  return Sentry
}

export default Sentry

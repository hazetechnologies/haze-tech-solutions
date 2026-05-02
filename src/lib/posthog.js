// src/lib/posthog.js
import posthog from 'posthog-js'

const KEY = import.meta.env.VITE_POSTHOG_KEY
const HOST = import.meta.env.VITE_POSTHOG_HOST

let initialized = false

export function initPosthog() {
  if (initialized) return posthog
  if (!KEY || !HOST) {
    console.warn('[posthog] VITE_POSTHOG_KEY or VITE_POSTHOG_HOST missing — telemetry disabled')
    return posthog
  }
  posthog.init(KEY, {
    api_host: HOST,
    person_profiles: 'identified_only',
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: true,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '.ph-mask',
    },
  })
  initialized = true
  return posthog
}

export default posthog

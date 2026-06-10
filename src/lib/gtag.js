// src/lib/gtag.js
// Google Analytics 4 (gtag.js). The Measurement ID is resolved at runtime,
// DB-first via /api/website?action=public-config (set in /admin/settings),
// falling back to the build-time VITE_GA_MEASUREMENT_ID env var. GA stays
// inert until initGtag() is called with a valid G- id.
//
// SPA page_view events are sent manually on route change (see
// hooks/useGaPageviews.js), so config uses send_page_view:false to avoid
// double-counting. The first page_view is buffered until init completes.
const ENV_ID = import.meta.env.VITE_GA_MEASUREMENT_ID

let id = null
let initialized = false
let pendingPath = null

function gtag() {
  // gtag pushes the literal `arguments` object onto the dataLayer.
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push(arguments)
}

// idArg comes from the runtime config fetch; ENV_ID is the build-time fallback.
export function initGtag(idArg) {
  if (initialized) return
  if (typeof window === 'undefined') return
  id = idArg || ENV_ID || null
  if (!id) {
    console.warn('[ga4] no Measurement ID (admin_settings.ga_measurement_id / VITE_GA_MEASUREMENT_ID) — Google Analytics disabled')
    return
  }

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`
  document.head.appendChild(script)

  gtag('js', new Date())
  gtag('config', id, { send_page_view: false })

  initialized = true

  if (pendingPath) {
    gaPageview(pendingPath)
    pendingPath = null
  }
}

export function gaPageview(path) {
  if (!initialized) { pendingPath = path; return } // buffer until init completes
  if (!id) return
  gtag('event', 'page_view', {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  })
}

export function gaEvent(name, params = {}) {
  if (!initialized || !id) return
  gtag('event', name, params)
}

export function gaSetUser(userId) {
  if (!initialized || !id) return
  gtag('set', 'user_properties', { app_user_id: userId })
  gtag('config', id, { user_id: userId })
}

export function gaClearUser() {
  if (!initialized || !id) return
  gtag('set', 'user_properties', { app_user_id: null })
}

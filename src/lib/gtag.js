// src/lib/gtag.js
// Google Analytics 4 (gtag.js) — loaded only when VITE_GA_MEASUREMENT_ID is set.
// SPA page_view events are sent manually on route change (see hooks/useGaPageviews.js),
// so the initial config disables automatic page_view to avoid double-counting.
const ID = import.meta.env.VITE_GA_MEASUREMENT_ID

let initialized = false

function gtag() {
  // gtag pushes the literal `arguments` object onto the dataLayer.
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push(arguments)
}

export function initGtag() {
  if (initialized) return
  if (typeof window === 'undefined') return
  if (!ID) {
    console.warn('[ga4] VITE_GA_MEASUREMENT_ID missing — Google Analytics disabled')
    return
  }

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${ID}`
  document.head.appendChild(script)

  gtag('js', new Date())
  gtag('config', ID, { send_page_view: false })

  initialized = true
}

export function gaPageview(path) {
  if (!initialized || !ID) return
  gtag('event', 'page_view', {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  })
}

export function gaEvent(name, params = {}) {
  if (!initialized || !ID) return
  gtag('event', name, params)
}

export function gaSetUser(userId) {
  if (!initialized || !ID) return
  gtag('set', 'user_properties', { app_user_id: userId })
  gtag('config', ID, { user_id: userId })
}

export function gaClearUser() {
  if (!initialized || !ID) return
  gtag('set', 'user_properties', { app_user_id: null })
}

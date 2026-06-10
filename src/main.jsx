// src/main.jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initPosthog } from './lib/posthog'
import { initSentry } from './lib/sentry'
import { initGtag } from './lib/gtag'

initPosthog()
initSentry()

// GA4: resolve the Measurement ID DB-first (admin_settings via public-config),
// falling back to the build-time env var if the fetch fails.
fetch('/api/website?action=public-config')
  .then((r) => (r.ok ? r.json() : null))
  .then((cfg) => initGtag(cfg?.gaMeasurementId))
  .catch(() => initGtag())

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

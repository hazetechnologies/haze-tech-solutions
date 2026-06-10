// src/hooks/useGaPageviews.js
// Sends a GA4 page_view on every client-side route change (and on first load).
// Must be mounted inside <BrowserRouter> so useLocation() has router context.
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { gaPageview } from '../lib/gtag'

export default function useGaPageviews() {
  const location = useLocation()

  useEffect(() => {
    gaPageview(location.pathname + location.search)
  }, [location.pathname, location.search])
}

// src/hooks/useAffiliateRef.js
// Captures ?ref=CODE on mount and on every SPA route change. Must be mounted
// inside <BrowserRouter> so useLocation() works (mirrors useGaPageviews).
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { captureRefFromUrl } from '../lib/affiliateRef'
import { trackEvent } from '../lib/telemetry'

export default function useAffiliateRef() {
  const location = useLocation()
  useEffect(() => {
    const code = captureRefFromUrl()
    if (code && location.search.includes('ref=')) {
      // New referral visit — record it (v1 "clicks" signal; no clicks table yet).
      trackEvent('affiliate_link_visit', { ref_code: code, path: location.pathname })
    }
  }, [location.pathname, location.search])
}

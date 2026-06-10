// src/pages/RefRedirect.jsx
// Short referral link: /r/:code → persist the code (first-touch) then send the
// visitor to the homepage. Lets affiliates share hazetechsolutions.com/r/CODE.
import { useParams, Navigate } from 'react-router-dom'
import { captureRef } from '../lib/affiliateRef'

export default function RefRedirect() {
  const { code } = useParams()
  captureRef(code)
  return <Navigate to="/" replace />
}

// src/pages/affiliate/AffiliateConfirm.jsx
// /affiliate/confirm?token=… — SafeLinks-safe email confirmation. Loading the
// page is inert; we POST the token (once) to confirm the account, then send the
// user to /affiliate to log in.
import { useEffect, useState, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

const C = { bg: '#040D1A', card: '#0B1A2E', cyan: '#00CFFF', text: '#E8F4FF', mut: '#7C93AD', line: 'rgba(255,255,255,0.08)' }

export default function AffiliateConfirm() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [state, setState] = useState('working') // working | ok | error
  const [msg, setMsg] = useState('')
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    const token = params.get('token')
    if (!token) { setState('error'); setMsg('Missing confirmation token.'); return }
    ;(async () => {
      try {
        const res = await fetch('/api/website?action=affiliate-confirm', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
        })
        const json = await res.json().catch(() => ({}))
        if (res.ok) { setState('ok') }
        else { setState('error'); setMsg(json.message || 'This link is invalid or has expired.') }
      } catch { setState('error'); setMsg('Something went wrong. Please try again.') }
    })()
  }, [params])

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Plus Jakarta Sans', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: 36, maxWidth: 420, width: '100%', textAlign: 'center' }}>
        {state === 'working' && (
          <>
            <Loader2 size={34} style={{ animation: 'spin 0.8s linear infinite', color: C.cyan }} />
            <h1 style={{ ...h, marginTop: 16 }}>Confirming your account…</h1>
          </>
        )}
        {state === 'ok' && (
          <>
            <CheckCircle2 size={40} color="#22C55E" />
            <h1 style={{ ...h, marginTop: 14 }}>Email confirmed 🎉</h1>
            <p style={{ color: C.mut, fontSize: 14, margin: '8px 0 22px' }}>Your partner account is active. Log in to get your referral link.</p>
            <button onClick={() => navigate('/affiliate')} style={btn}>Go to login</button>
          </>
        )}
        {state === 'error' && (
          <>
            <AlertCircle size={38} color="#FCA5A5" />
            <h1 style={{ ...h, marginTop: 14 }}>Couldn't confirm</h1>
            <p style={{ color: C.mut, fontSize: 14, margin: '8px 0 22px' }}>{msg}</p>
            <button onClick={() => navigate('/affiliate')} style={btn}>Back to sign up</button>
          </>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

const h = { fontFamily: "'Orbitron', sans-serif", fontSize: 20, margin: 0 }
const btn = { background: `linear-gradient(135deg, ${C.cyan}, #0099CC)`, border: 'none', borderRadius: 9, padding: '11px 22px', color: '#020817', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer' }

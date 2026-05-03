import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { CheckCircle2, AlertCircle } from 'lucide-react'

export default function AcceptInvite() {
  const navigate = useNavigate()
  // 'verifying' | 'ready' | 'invalid' | 'submitting' | 'success'
  const [view, setView] = useState('verifying')
  const [error, setError] = useState(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  useEffect(() => {
    let cancelled = false

    // Supabase JS auto-detects session in URL hash. Parse properly to avoid
    // substring false-positives, then watch for SIGNED_IN to confirm.
    const params = new URLSearchParams((window.location.hash || '').replace(/^#/, ''))
    const isInvite = params.get('type') === 'invite'

    // Give the supabase client a brief moment to process the URL hash, then check session.
    // On slow networks, the listener may fire later — only mark 'invalid' if there's
    // no invite hash at all. With an invite hash, trust the listener.
    const timer = setTimeout(async () => {
      if (cancelled) return
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session && isInvite) {
          setView(v => (v === 'verifying' ? 'ready' : v))
        } else if (session && !isInvite) {
          // Already logged in (returning visitor) — bounce to portal
          navigate('/portal', { replace: true })
        } else if (!isInvite) {
          // No invite hash and no session — definitely not a valid invite landing
          setView('invalid')
        }
        // else: isInvite but no session yet — wait for the listener
      } catch (e) {
        console.error('AcceptInvite getSession failed:', e)
        if (!isInvite) setView('invalid')
      }
    }, 600)

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return
      if (event === 'SIGNED_IN' && session && isInvite) {
        setView('ready')
      }
    })

    return () => {
      cancelled = true
      clearTimeout(timer)
      sub.subscription.unsubscribe()
    }
  }, [navigate])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }

    setView('submitting')
    const { error: updateErr } = await supabase.auth.updateUser({ password })
    if (updateErr) {
      setError(updateErr.message)
      setView('ready')
      return
    }

    setView('success')
    setTimeout(() => navigate('/portal', { replace: true }), 1200)
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ marginBottom: 22, textAlign: 'center' }}>
          <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 18, fontWeight: 700, color: '#00D4FF', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
            Haze Tech Solutions
          </div>
          <div style={{ fontSize: 13, color: '#94A3B8' }}>Welcome — set up your client portal</div>
        </div>

        {view === 'verifying' && (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#475569', fontSize: 13 }}>
            Verifying invite…
          </div>
        )}

        {view === 'invalid' && (
          <div style={errorPanel}>
            <AlertCircle size={20} />
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Invite link expired or invalid</div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>Please contact your account manager to receive a new invite.</div>
            </div>
          </div>
        )}

        {(view === 'ready' || view === 'submitting') && (
          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{ ...errorPanel, marginBottom: 14 }}>
                <AlertCircle size={16} />
                <div style={{ fontSize: 13 }}>{error}</div>
              </div>
            )}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>New password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                disabled={view === 'submitting'}
                style={inputStyle}
                autoComplete="new-password"
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                minLength={8}
                disabled={view === 'submitting'}
                style={inputStyle}
                autoComplete="new-password"
              />
            </div>
            <button type="submit" disabled={view === 'submitting'} style={primaryBtn}>
              {view === 'submitting' ? 'Setting password…' : 'Set password & continue'}
            </button>
          </form>
        )}

        {view === 'success' && (
          <div style={successPanel}>
            <CheckCircle2 size={20} />
            <div>
              <div style={{ fontWeight: 600 }}>Password set</div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>Redirecting to your portal…</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const pageStyle = {
  minHeight: '100vh',
  background: 'linear-gradient(180deg, #020817 0%, #0F172A 100%)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 24, fontFamily: "'Plus Jakarta Sans', sans-serif",
}
const cardStyle = {
  background: '#0F172A', border: '1px solid rgba(0,212,255,0.2)',
  borderRadius: 16, padding: 32, width: '100%', maxWidth: 380,
  boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
}
const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 600, color: '#94A3B8',
  letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6,
}
const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(0,212,255,0.15)',
  borderRadius: 8, padding: '10px 12px',
  color: '#F1F5F9', fontFamily: "'Plus Jakarta Sans', sans-serif",
  fontSize: 13, outline: 'none',
}
const primaryBtn = {
  width: '100%', padding: '11px 14px',
  background: 'linear-gradient(135deg, #00D4FF, #0099CC)',
  border: 'none', borderRadius: 8, color: '#020817',
  fontSize: 13, fontWeight: 700,
  fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer',
}
const errorPanel = {
  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
  borderRadius: 10, padding: 14, color: '#FCA5A5',
  display: 'flex', alignItems: 'flex-start', gap: 10,
}
const successPanel = {
  background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
  borderRadius: 10, padding: 14, color: '#4ADE80',
  display: 'flex', alignItems: 'center', gap: 10,
}

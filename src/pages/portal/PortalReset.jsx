import { useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { CheckCircle2, AlertCircle } from 'lucide-react'

// SafeLinks-safe: this page only reads the token from the URL and renders a form.
// Email scanners that pre-fetch the link load this page but consume nothing — the
// password is set (and the token burned) only when the form is submitted.
export default function PortalReset() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') || ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [view, setView] = useState(token ? 'ready' : 'invalid') // ready|submitting|success|invalid
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }

    setView('submitting')
    try {
      const res = await fetch('/api/website?action=portal-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data.error === 'invalid_or_expired') { setView('invalid'); return }
        setError(data.message || 'Could not set your password.'); setView('ready'); return
      }
      setView('success')
      setTimeout(() => navigate('/portal/login', { replace: true }), 1500)
    } catch {
      setError('Network error. Please try again.'); setView('ready')
    }
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={{ marginBottom: 22, textAlign: 'center' }}>
          <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 18, fontWeight: 700, color: '#00D4FF', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
            Haze Tech Solutions
          </div>
          <div style={{ fontSize: 13, color: '#94A3B8' }}>Set your portal password</div>
        </div>

        {view === 'invalid' && (
          <div style={errorPanel}>
            <AlertCircle size={20} />
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Link expired or invalid</div>
              <div style={{ fontSize: 12, opacity: 0.85 }}>
                Request a fresh link from the <Link to="/portal/login" style={{ color: '#7dd3fc' }}>portal login</Link> page using “Forgot password”.
              </div>
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
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} disabled={view === 'submitting'} style={inputStyle} autoComplete="new-password" />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Confirm password</label>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} disabled={view === 'submitting'} style={inputStyle} autoComplete="new-password" />
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
              <div style={{ fontSize: 12, opacity: 0.85 }}>Redirecting to login…</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const pageStyle = { minHeight: '100vh', background: 'linear-gradient(180deg, #020817 0%, #0F172A 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'Plus Jakarta Sans', sans-serif" }
const cardStyle = { background: '#0F172A', border: '1px solid rgba(0,212,255,0.2)', borderRadius: 16, padding: 32, width: '100%', maxWidth: 380, boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }
const labelStyle = { display: 'block', fontSize: 11, fontWeight: 600, color: '#94A3B8', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 }
const inputStyle = { width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(0,212,255,0.15)', borderRadius: 8, padding: '10px 12px', color: '#F1F5F9', fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 13, outline: 'none' }
const primaryBtn = { width: '100%', padding: '11px 14px', background: 'linear-gradient(135deg, #00D4FF, #0099CC)', border: 'none', borderRadius: 8, color: '#020817', fontSize: 13, fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer' }
const errorPanel = { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: 14, color: '#FCA5A5', display: 'flex', alignItems: 'flex-start', gap: 10 }
const successPanel = { background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10, padding: 14, color: '#4ADE80', display: 'flex', alignItems: 'center', gap: 10 }

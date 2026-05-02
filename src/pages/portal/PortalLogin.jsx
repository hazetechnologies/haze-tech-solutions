import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabase'
import { User } from 'lucide-react'
import { trackEvent } from '../../lib/telemetry'

export default function PortalLogin() {
  const navigate = useNavigate()
  const { signIn } = useAuth()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState(null)
  const [loading, setLoading]   = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim() || !password) return

    setError(null)
    setLoading(true)
    try {
      trackEvent('portal_login_attempted', { surface: 'portal' })
      const { data, error: authError } = await signIn(email.trim(), password)
      if (authError) {
        trackEvent('portal_login_failed', { surface: 'portal', error_code: authError.message })
        setError(authError.message || 'Invalid credentials.')
        return
      }

      const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', data.user.id)
        .maybeSingle()

      if (!client) {
        setError('No client account found for this email.')
        return
      }

      trackEvent('portal_login_succeeded', { surface: 'portal' })
      navigate('/portal/dashboard')
    } catch (err) {
      setError('An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={styles.card}>
        <div style={styles.logoRow}>
          <div style={styles.iconWrap}>
            <User size={22} color="#00D4FF" />
          </div>
          <h1 style={styles.logoText}>HAZE TECH</h1>
          <p style={styles.subtitle}>Client Portal</p>
        </div>

        <div style={styles.divider} />

        <form onSubmit={handleSubmit} noValidate>
          <div style={styles.fieldGroup}>
            <div>
              <label style={styles.label}>Email</label>
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                style={styles.input}
                disabled={loading}
                required
              />
            </div>
            <div>
              <label style={styles.label}>Password</label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                style={styles.input}
                disabled={loading}
                required
              />
            </div>
          </div>

          {error && <div style={styles.errorBox}>{error}</div>}

          <button
            type="submit"
            style={{ ...styles.button, ...(loading || !email || !password ? styles.buttonDisabled : {}) }}
            disabled={loading || !email || !password}
          >
            {loading && <span style={styles.spinner} />}
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <Link to="/" style={styles.backLink}>Back to main site</Link>
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh', background: '#020817',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: "'Plus Jakarta Sans', sans-serif", padding: '24px',
  },
  card: {
    width: '100%', maxWidth: '420px', background: '#0F172A',
    border: '1px solid rgba(0,212,255,0.15)', borderRadius: '16px',
    padding: '48px 40px',
    boxShadow: '0 0 40px rgba(0,212,255,0.06), 0 24px 48px rgba(0,0,0,0.4)',
  },
  logoRow: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    marginBottom: '36px', gap: '10px',
  },
  iconWrap: {
    width: '52px', height: '52px', background: 'rgba(0,212,255,0.1)',
    border: '1px solid rgba(0,212,255,0.25)', borderRadius: '14px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  logoText: {
    fontFamily: "'Orbitron', sans-serif", fontSize: '22px', fontWeight: 700,
    color: '#00D4FF', letterSpacing: '0.1em', margin: 0,
  },
  subtitle: {
    fontSize: '13px', color: '#64748B', letterSpacing: '0.08em',
    textTransform: 'uppercase', margin: 0,
  },
  divider: { height: '1px', background: 'rgba(255,255,255,0.06)', marginBottom: '32px' },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: '18px', marginBottom: '24px' },
  label: {
    display: 'block', fontSize: '12px', fontWeight: 600, color: '#94A3B8',
    letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '8px',
  },
  input: {
    width: '100%', background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px',
    padding: '12px 16px', color: '#F1F5F9', fontSize: '15px',
    fontFamily: "'Plus Jakarta Sans', sans-serif", outline: 'none', boxSizing: 'border-box',
  },
  button: {
    width: '100%', padding: '14px',
    background: 'linear-gradient(135deg, #00D4FF 0%, #0099CC 100%)',
    border: 'none', borderRadius: '10px', color: '#020817',
    fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '15px', fontWeight: 700,
    cursor: 'pointer', marginBottom: '16px',
  },
  buttonDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  errorBox: {
    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: '8px', padding: '12px 14px', color: '#FCA5A5',
    fontSize: '13px', lineHeight: 1.5, marginBottom: '16px',
  },
  spinner: {
    display: 'inline-block', width: '16px', height: '16px',
    border: '2px solid rgba(2,8,23,0.4)', borderTopColor: '#020817',
    borderRadius: '50%', animation: 'spin 0.7s linear infinite',
    verticalAlign: 'middle', marginRight: '8px',
  },
  backLink: {
    display: 'block', textAlign: 'center', fontSize: '13px',
    color: '#475569', textDecoration: 'none',
  },
}

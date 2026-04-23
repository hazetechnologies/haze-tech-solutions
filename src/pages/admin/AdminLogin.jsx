import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'
import { supabase } from '../../lib/supabase'
import { Lock } from 'lucide-react'

const CAPTCHA_SITE_KEY = '6LcXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX' // Replace with your reCAPTCHA site key

export default function AdminLogin() {
  const navigate = useNavigate()
  const { signIn } = useAuth()

  const [view, setView] = useState('login') // 'login' | 'forgot' | 'sent' | 'reset'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  // Detect password reset token in URL hash
  useEffect(() => {
    const hash = window.location.hash
    if (hash.includes('type=recovery') || hash.includes('access_token')) {
      // Parse hash params
      const params = new URLSearchParams(hash.replace('#', ''))
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')
      const errorCode = params.get('error_code')

      if (errorCode === 'otp_expired') {
        setError('This password reset link has expired. Please request a new one.')
        setView('forgot')
        window.history.replaceState(null, '', window.location.pathname)
        return
      }

      if (accessToken) {
        // Set the session so we can update the password
        supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
          .then(() => {
            setView('reset')
            window.history.replaceState(null, '', window.location.pathname)
          })
      }
    }
  }, [])

  // Simple math captcha
  const [captchaA, setCaptchaA] = useState(0)
  const [captchaB, setCaptchaB] = useState(0)
  const [captchaInput, setCaptchaInput] = useState('')

  useEffect(() => { newCaptcha() }, [])

  function newCaptcha() {
    setCaptchaA(Math.floor(Math.random() * 10) + 1)
    setCaptchaB(Math.floor(Math.random() * 10) + 1)
    setCaptchaInput('')
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!email.trim() || !password) return

    // Verify captcha
    if (parseInt(captchaInput) !== captchaA + captchaB) {
      setError('Incorrect captcha answer. Try again.')
      newCaptcha()
      return
    }

    setError(null)
    setLoading(true)
    try {
      const { error: authError } = await signIn(email.trim(), password)
      if (authError) {
        setError(authError.message || 'Invalid credentials. Please try again.')
        newCaptcha()
      } else {
        navigate('/admin/dashboard')
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
      newCaptcha()
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (e) => {
    e.preventDefault()
    if (!newPassword || newPassword.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setError(null)
    setLoading(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
      if (updateError) {
        setError(updateError.message || 'Failed to update password')
      } else {
        await supabase.auth.signOut()
        setNewPassword('')
        setConfirmPassword('')
        setView('login')
        setError('Password updated! Sign in with your new password.')
      }
    } catch (err) {
      setError('An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async (e) => {
    e.preventDefault()
    if (!email.trim()) return

    setError(null)
    setLoading(true)
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/admin/login`,
      })
      if (resetError) {
        setError(resetError.message || 'Failed to send reset email.')
      } else {
        setView('sent')
      }
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
            <Lock size={22} color="#00D4FF" />
          </div>
          <h1 style={styles.logoText}>HAZE TECH</h1>
          <p style={styles.subtitle}>Admin Portal</p>
        </div>

        <div style={styles.divider} />

        {/* ── Login View ── */}
        {view === 'login' && (
          <form onSubmit={handleLogin} noValidate>
            <div style={styles.fieldGroup}>
              <div>
                <label htmlFor="email" style={styles.label}>Email</label>
                <input
                  id="email" type="email" autoComplete="username"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@hazetechsolutions.com"
                  style={styles.input} disabled={loading} required
                />
              </div>
              <div>
                <label htmlFor="password" style={styles.label}>Password</label>
                <input
                  id="password" type="password" autoComplete="current-password"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  style={styles.input} disabled={loading} required
                />
              </div>
              <div>
                <label style={styles.label}>Verify: What is {captchaA} + {captchaB}?</label>
                <input
                  type="number" value={captchaInput}
                  onChange={(e) => setCaptchaInput(e.target.value)}
                  placeholder="Answer"
                  style={styles.input} disabled={loading} required
                />
              </div>
            </div>

            {error && <div style={styles.errorBox} role="alert">{error}</div>}

            <button
              type="submit"
              style={{ ...styles.button, ...(loading || !email || !password || !captchaInput ? styles.buttonDisabled : {}) }}
              disabled={loading || !email || !password || !captchaInput}
            >
              {loading && <span style={styles.spinner} />}
              {loading ? 'Signing in...' : 'Sign In'}
            </button>

            <div
              onClick={() => { setView('forgot'); setError(null) }}
              style={styles.forgotLink}
            >
              Forgot password?
            </div>
          </form>
        )}

        {/* ── Forgot Password View ── */}
        {view === 'forgot' && (
          <form onSubmit={handleForgotPassword} noValidate>
            <p style={{ color: '#94A3B8', fontSize: '14px', lineHeight: 1.6, marginBottom: '20px' }}>
              Enter your email address and we'll send you a link to reset your password.
            </p>
            <div style={{ marginBottom: '20px' }}>
              <label htmlFor="reset-email" style={styles.label}>Email</label>
              <input
                id="reset-email" type="email"
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@hazetechsolutions.com"
                style={styles.input} disabled={loading} required
              />
            </div>

            {error && <div style={styles.errorBox} role="alert">{error}</div>}

            <button
              type="submit"
              style={{ ...styles.button, ...(loading || !email ? styles.buttonDisabled : {}) }}
              disabled={loading || !email}
            >
              {loading && <span style={styles.spinner} />}
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>

            <div
              onClick={() => { setView('login'); setError(null) }}
              style={styles.forgotLink}
            >
              Back to login
            </div>
          </form>
        )}

        {/* ── Reset Password View ── */}
        {view === 'reset' && (
          <form onSubmit={handleResetPassword} noValidate>
            <p style={{ color: '#94A3B8', fontSize: '14px', lineHeight: 1.6, marginBottom: '20px' }}>
              Enter your new password below.
            </p>
            <div style={styles.fieldGroup}>
              <div>
                <label htmlFor="new-password" style={styles.label}>New Password</label>
                <input
                  id="new-password" type="password" autoComplete="new-password"
                  value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  style={styles.input} disabled={loading} required minLength={6}
                />
              </div>
              <div>
                <label htmlFor="confirm-password" style={styles.label}>Confirm Password</label>
                <input
                  id="confirm-password" type="password" autoComplete="new-password"
                  value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  style={styles.input} disabled={loading} required
                />
              </div>
            </div>

            {error && <div style={styles.errorBox} role="alert">{error}</div>}

            <button
              type="submit"
              style={{ ...styles.button, ...(loading || !newPassword || !confirmPassword ? styles.buttonDisabled : {}) }}
              disabled={loading || !newPassword || !confirmPassword}
            >
              {loading && <span style={styles.spinner} />}
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        )}

        {/* ── Email Sent View ── */}
        {view === 'sent' && (
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#F1F5F9', marginBottom: '8px' }}>Check your email</h3>
            <p style={{ color: '#94A3B8', fontSize: '13px', lineHeight: 1.6, marginBottom: '24px' }}>
              We sent a password reset link to <span style={{ color: '#00D4FF' }}>{email}</span>. Click the link in the email to reset your password.
            </p>
            <div
              onClick={() => { setView('login'); setError(null) }}
              style={styles.forgotLink}
            >
              Back to login
            </div>
          </div>
        )}
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
    border: '1px solid rgba(0, 212, 255, 0.15)', borderRadius: '16px',
    padding: '48px 40px',
    boxShadow: '0 0 40px rgba(0, 212, 255, 0.06), 0 24px 48px rgba(0, 0, 0, 0.4)',
  },
  logoRow: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    marginBottom: '36px', gap: '10px',
  },
  iconWrap: {
    width: '52px', height: '52px', background: 'rgba(0, 212, 255, 0.1)',
    border: '1px solid rgba(0, 212, 255, 0.25)', borderRadius: '14px',
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
    background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '8px', padding: '12px 14px', color: '#FCA5A5',
    fontSize: '13px', lineHeight: 1.5, marginBottom: '16px',
  },
  spinner: {
    display: 'inline-block', width: '16px', height: '16px',
    border: '2px solid rgba(2, 8, 23, 0.4)', borderTopColor: '#020817',
    borderRadius: '50%', animation: 'spin 0.7s linear infinite',
    verticalAlign: 'middle', marginRight: '8px',
  },
  forgotLink: {
    textAlign: 'center', fontSize: '13px', color: '#00D4FF',
    cursor: 'pointer', userSelect: 'none',
  },
}

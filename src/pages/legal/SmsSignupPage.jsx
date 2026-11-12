import { useState } from 'react'
import { Link } from 'react-router-dom'
import LegalLayout, { FromNumber } from './LegalLayout'
import { CONSENT_TEXT, CONSENT_VERSION, SMS_BRAND, SMS_TERMS_PATH, SMS_PRIVACY_PATH, validateSmsOptIn } from '../../lib/smsProgram'

// The 10DLC opt-in form. The box starts unchecked and nothing is saved without
// it. Nothing typed here is sent to analytics (ph-no-capture), and submitting
// records consent only: no text is sent from this page.
export default function SmsSignupPage() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [consent, setConsent] = useState(false)
  const [website, setWebsite] = useState('') // honeypot
  const [state, setState] = useState({ status: 'idle', message: '' }) // idle | saving | done | error

  const submit = async (e) => {
    e.preventDefault()
    const payload = { name, phone, consent, consentVersion: CONSENT_VERSION, website }
    const check = validateSmsOptIn(payload)
    if (!check.ok) { setState({ status: 'error', message: check.message }); return }
    setState({ status: 'saving', message: '' })
    try {
      const r = await fetch('/api/website?action=sms-optin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.message || 'We could not save your sign-up. Try again, or email hello@hazetechsolutions.com.')
      setState({ status: 'done', message: '' })
    } catch (err) {
      setState({ status: 'error', message: err.message || 'We could not save your sign-up. Try again.' })
    }
  }

  return (
    <LegalLayout
      title="Get texts from Haze Tech Solutions"
      intro={<p>Sign up to get texts from {SMS_BRAND} about your questions, appointments, projects and account. Texts come from <FromNumber />. We don&apos;t send marketing texts.</p>}
    >
      {state.status === 'done' ? (
        <div role="status" style={card}>
          <p style={{ color: '#F1F5F9', fontWeight: 700, fontSize: 18, margin: '0 0 8px' }}>You&apos;re signed up.</p>
          <p style={{ margin: 0 }}>Our texts will come from <FromNumber />. Reply STOP to any of them to stop, or HELP for help.</p>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="ph-no-capture" style={card}>
          <label style={label} htmlFor="sms-name">Your name</label>
          <input id="sms-name" name="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required style={input} />

          <label style={label} htmlFor="sms-phone">Mobile number</label>
          <input id="sms-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="305 555 0123" value={phone} onChange={(e) => setPhone(e.target.value)} required style={input} />

          {/* Honeypot: hidden from people and screen readers; bots fill it. */}
          <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
            <label htmlFor="sms-website">Website</label>
            <input id="sms-website" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', margin: '20px 0 8px' }}>
            <input id="sms-consent" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ width: 20, height: 20, marginTop: 4, flexShrink: 0, accentColor: '#38BDF8' }} />
            <label htmlFor="sms-consent" style={{ fontSize: 14, lineHeight: 1.6, color: '#CBD5E1' }}>{CONSENT_TEXT}</label>
          </div>
          <p style={{ fontSize: 14, color: '#94A3B8', margin: '0 0 20px 32px' }}>
            Read the <Link to={SMS_TERMS_PATH}>Text Message Terms</Link> and <Link to={SMS_PRIVACY_PATH}>Privacy Policy</Link>.
          </p>

          {state.status === 'error' && <p role="alert" style={{ color: '#FCA5A5', fontSize: 14, margin: '0 0 14px' }}>{state.message}</p>}

          <button type="submit" className="btn-primary" disabled={state.status === 'saving'} style={{ opacity: state.status === 'saving' ? 0.6 : 1 }}>
            {state.status === 'saving' ? 'Signing up…' : 'Sign up for texts'}
          </button>
        </form>
      )}
    </LegalLayout>
  )
}

const card = { position: 'relative', background: 'rgba(15, 23, 42, 0.7)', border: '1px solid rgba(56, 189, 248, 0.18)', borderRadius: 14, padding: 'clamp(20px, 4vw, 32px)', marginTop: 12 }
const label = { display: 'block', fontSize: 14, fontWeight: 600, color: '#E2E8F0', margin: '14px 0 6px' }
const input = { width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(148, 163, 184, 0.35)', borderRadius: 8, color: '#F1F5F9', padding: '0.7rem 0.9rem', fontSize: 16, fontFamily: 'inherit' }

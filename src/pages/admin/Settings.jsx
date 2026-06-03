import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { Save, Eye, EyeOff, RefreshCw, AlertCircle, CheckCircle, Mail, Key, CreditCard, Zap } from 'lucide-react'

const MODELS = [
  { value: 'gpt-4o', label: 'GPT-4o (Best quality)' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Fast, low cost)' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (Cheapest)' },
]

export default function Settings() {
  const [settings, setSettings] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [stripeTest, setStripeTest] = useState(null)   // null | { ok, … } | { ok: false, message }
  const [stripeTesting, setStripeTesting] = useState(false)
  const [emailTestTo, setEmailTestTo] = useState('')
  const [emailTesting, setEmailTesting] = useState(false)
  const [emailTestResult, setEmailTestResult] = useState(null)

  async function sendTestEmail() {
    setEmailTesting(true); setEmailTestResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/website?action=send-test-email', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: emailTestTo || undefined }),
      })
      const json = await res.json()
      if (!res.ok) setEmailTestResult({ ok: false, message: json.message || json.error || 'Failed' })
      else if (json.sent) setEmailTestResult({ ok: true, message: `Test email sent to ${json.to}. Check the inbox (and spam).` })
      else setEmailTestResult({ ok: false, message: json.status === 'skipped' ? 'SMTP not configured — fill the fields above and Save first.' : 'Send failed — double-check the SMTP host / port / user / password.' })
    } catch (e) {
      setEmailTestResult({ ok: false, message: e.message })
    } finally {
      setEmailTesting(false)
    }
  }

  async function testStripeConnection() {
    setStripeTesting(true); setStripeTest(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/website?action=stripe-test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: '{}',
      })
      const json = await res.json()
      setStripeTest(res.ok ? json : { ok: false, message: json.message || json.error || 'Unknown error' })
    } catch (e) {
      setStripeTest({ ok: false, message: e.message })
    } finally {
      setStripeTesting(false)
    }
  }

  const fetchSettings = useCallback(async () => {
    setError(null)
    try {
      const { data, error: err } = await supabase.from('admin_settings').select('key, value')
      if (err) throw err
      const map = {}
      for (const row of data || []) map[row.key] = row.value
      setSettings(map)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSettings() }, [fetchSettings])

  const set = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    setSuccess(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      for (const [key, value] of Object.entries(settings)) {
        const { error: err } = await supabase
          .from('admin_settings')
          .upsert({ key, value: value || '', updated_at: new Date().toISOString() }, { onConflict: 'key' })
        if (err) throw err
      }
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {[100, 200].map((h, i) => (
        <div key={i} style={{ height: h, background: 'rgba(255,255,255,0.04)', borderRadius: '14px', animation: 'pulse 1.5s ease-in-out infinite' }} />
      ))}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', fontFamily: "'Plus Jakarta Sans', sans-serif", maxWidth: '700px' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      <div>
        <h2 style={styles.pageTitle}>Settings</h2>
        <p style={{ fontSize: '13px', color: '#475569', margin: 0 }}>Manage API keys, email, billing, and AI models</p>
      </div>

      {error && <div style={styles.errorBanner}><AlertCircle size={15} /> {error}</div>}
      {success && <div style={styles.successBanner}><CheckCircle size={15} /> Settings saved successfully</div>}

      {/* ── OpenAI Configuration ── */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={{ ...styles.cardIcon, background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.2)' }}>
            <Key size={18} color="#00D4FF" />
          </div>
          <div>
            <h3 style={styles.cardTitle}>OpenAI Configuration</h3>
            <p style={styles.cardDesc}>API key and model selection</p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div>
            <label style={styles.label}>OpenAI API Key</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showKey ? 'text' : 'password'}
                value={settings.openai_api_key || ''}
                onChange={e => set('openai_api_key', e.target.value)}
                placeholder="sk-..."
                style={{ ...styles.input, paddingRight: '44px' }}
              />
              <button onClick={() => setShowKey(!showKey)} style={styles.eyeBtn} type="button">
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label style={styles.label}>Report Model</label>
            <p style={styles.fieldDesc}>For automation plan generation (the chatbot model lives on the Chat Bot page)</p>
            <select value={settings.report_model || 'gpt-4o'} onChange={e => set('report_model', e.target.value)} style={styles.select}>
              {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Email (SMTP) Configuration ── */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={{ ...styles.cardIcon, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <Mail size={18} color="#4ADE80" />
          </div>
          <div>
            <h3 style={styles.cardTitle}>Email (SMTP)</h3>
            <p style={styles.cardDesc}>Powers client + admin notification emails (welcome, status, payment)</p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '14px' }}>
            <div>
              <label style={styles.label}>SMTP Host</label>
              <p style={styles.fieldDesc}>e.g. smtp.hostinger.com</p>
              <input type="text" value={settings.SMTP_HOST || ''} onChange={e => set('SMTP_HOST', e.target.value)} placeholder="smtp.hostinger.com" style={styles.input} />
            </div>
            <div>
              <label style={styles.label}>Port</label>
              <p style={styles.fieldDesc}>465 (SSL) / 587</p>
              <input type="number" value={settings.SMTP_PORT || ''} onChange={e => set('SMTP_PORT', e.target.value)} placeholder="465" style={styles.input} />
            </div>
          </div>
          <div>
            <label style={styles.label}>SMTP Username</label>
            <p style={styles.fieldDesc}>Full mailbox address. The "From" on every email is this exact address — aliases get rejected (553).</p>
            <input type="text" value={settings.SMTP_USER || ''} onChange={e => set('SMTP_USER', e.target.value)} placeholder="info@hazetechsolutions.com" style={styles.input} />
          </div>
          <div>
            <label style={styles.label}>SMTP Password</label>
            <input type="password" value={settings.SMTP_PASS || ''} onChange={e => set('SMTP_PASS', e.target.value)} placeholder="••••••••" style={styles.input} />
          </div>
          <div>
            <label style={styles.label}>Admin Notification Email</label>
            <p style={styles.fieldDesc}>Where admin alerts go (defaults to info@hazetechsolutions.com)</p>
            <input type="email" value={settings.ADMIN_NOTIFY_EMAIL || ''} onChange={e => set('ADMIN_NOTIFY_EMAIL', e.target.value)} placeholder="info@hazetechsolutions.com" style={styles.input} />
          </div>
          <p style={{ fontSize: 12, color: '#64748B', margin: 0, lineHeight: 1.5 }}>
            Until these are filled, notifications still appear in-app (Workflows + client portal) but no emails send. The 5-minute status cron + daily digest also need a <code style={{ color: '#94A3B8' }}>CRON_SECRET</code> set as a Vercel environment variable.
          </p>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={styles.label}>Send a test email</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="email" value={emailTestTo} onChange={e => setEmailTestTo(e.target.value)} placeholder="you@example.com (defaults to the admin email)" style={{ ...styles.input, flex: 1 }} />
              <button type="button" onClick={sendTestEmail} disabled={emailTesting} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '0 16px',
                background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8,
                color: '#4ADE80', fontSize: 12, fontWeight: 600, cursor: emailTesting ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', opacity: emailTesting ? 0.5 : 1, whiteSpace: 'nowrap',
              }}>
                {emailTesting ? <><RefreshCw size={13} style={{ animation: 'spin 0.7s linear infinite' }} /> Sending…</> : <><Mail size={13} /> Send test</>}
              </button>
            </div>
            <p style={{ fontSize: 11, color: '#475569', margin: 0 }}>Uses your saved SMTP settings — Save above first if you just changed them. Tip: preview &amp; send any specific template from Admin → Workflows.</p>
            {emailTestResult && (
              <div style={{ fontSize: 12, color: emailTestResult.ok ? '#86EFAC' : '#FCA5A5', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                {emailTestResult.ok ? <CheckCircle size={14} style={{ marginTop: 1, flexShrink: 0 }} /> : <AlertCircle size={14} style={{ marginTop: 1, flexShrink: 0 }} />} {emailTestResult.message}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Stripe Configuration ── */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={{ ...styles.cardIcon, background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}>
            <CreditCard size={18} color="#818CF8" />
          </div>
          <div>
            <h3 style={styles.cardTitle}>Stripe Configuration</h3>
            <p style={styles.cardDesc}>Secret key + webhook secret for billing</p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div>
            <label style={styles.label}>Stripe Secret Key</label>
            <p style={styles.fieldDesc}>From dashboard.stripe.com/apikeys (sk_live_… or sk_test_…)</p>
            <input
              type="password"
              value={settings.stripe_secret_key || ''}
              onChange={e => set('stripe_secret_key', e.target.value)}
              placeholder="sk_..."
              style={styles.input}
            />
          </div>
          <div>
            <label style={styles.label}>Stripe Publishable Key</label>
            <p style={styles.fieldDesc}>Safe to expose; used by client-side Stripe.js if/when needed</p>
            <input
              type="text"
              value={settings.stripe_publishable_key || ''}
              onChange={e => set('stripe_publishable_key', e.target.value)}
              placeholder="pk_..."
              style={styles.input}
            />
          </div>
          <div>
            <label style={styles.label}>Stripe Webhook Secret</label>
            <p style={styles.fieldDesc}>From dashboard.stripe.com/webhooks → endpoint signing secret (whsec_…). Endpoint URL: <code style={{ color: '#94A3B8' }}>https://www.hazetechsolutions.com/api/stripe-webhook</code></p>
            <input
              type="password"
              value={settings.stripe_webhook_secret || ''}
              onChange={e => set('stripe_webhook_secret', e.target.value)}
              placeholder="whsec_..."
              style={styles.input}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 4 }}>
            <button
              type="button"
              onClick={testStripeConnection}
              disabled={stripeTesting || !settings.stripe_secret_key}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.3)',
                borderRadius: 8, color: '#A5B4FC', fontSize: 12, fontWeight: 600,
                cursor: stripeTesting || !settings.stripe_secret_key ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', opacity: stripeTesting || !settings.stripe_secret_key ? 0.5 : 1,
              }}
              title={!settings.stripe_secret_key ? 'Enter a secret key first' : 'Hit Stripe with the saved key + report what it resolves to'}
            >
              {stripeTesting
                ? <><RefreshCw size={13} style={{ animation: 'spin 0.7s linear infinite' }} /> Testing…</>
                : <><Zap size={13} /> Test connection</>}
            </button>
            <span style={{ fontSize: 11, color: '#475569' }}>
              {!settings.stripe_secret_key ? 'Save the secret key first' : 'Hits Stripe + reports back what your key resolves to'}
            </span>
          </div>

          {stripeTest && stripeTest.ok && (
            <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, padding: 12, fontSize: 12, lineHeight: 1.6, color: '#86EFAC' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, marginBottom: 6 }}>
                <CheckCircle size={14} /> Connected as <strong>{stripeTest.account_name}</strong> · <span style={{ padding: '1px 6px', borderRadius: 4, background: stripeTest.key_mode === 'live' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)', color: stripeTest.key_mode === 'live' ? '#FCA5A5' : '#FCD34D', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{stripeTest.key_mode}</span>
              </div>
              <div style={{ color: '#94A3B8' }}>
                Account: <code style={{ color: '#CBD5E1' }}>{stripeTest.account_id}</code>{stripeTest.account_email ? <> · {stripeTest.account_email}</> : null}
                <br/>Products in Stripe: {stripeTest.products_in_stripe === 0 ? <span style={{ color: '#FCD34D' }}>none yet — create them in Stripe + paste the IDs into /admin/products</span> : `${stripeTest.products_in_stripe}+ found`}
              </div>
            </div>
          )}
          {stripeTest && !stripeTest.ok && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, fontSize: 12, color: '#FCA5A5', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <AlertCircle size={14} style={{ marginTop: 2, flexShrink: 0 }} />
              <div>{stripeTest.message}</div>
            </div>
          )}

          <p style={{ fontSize: 12, color: '#64748B', margin: 0, lineHeight: 1.5 }}>
            Next: head to <a href="/admin/products" style={{ color: '#00D4FF' }}>Products &amp; Subscriptions</a> and paste a <code style={{ color: '#94A3B8' }}>price_…</code> ID into each plan you want to bill (Edit → Stripe Price ID). Create the Products + Prices in <a href="https://dashboard.stripe.com/products" target="_blank" rel="noopener noreferrer" style={{ color: '#00D4FF' }}>Stripe</a> first.
            <br/>
            <span style={{ color: '#475569' }}>Bulk alternative: <code style={{ color: '#94A3B8' }}>node scripts/sync-stripe-catalog.mjs</code> auto-creates and links them in one shot.</span>
          </p>
        </div>
      </div>

      {/* Save */}
      <button onClick={handleSave} disabled={saving} style={{ ...styles.saveBtn, opacity: saving ? 0.6 : 1 }}>
        {saving ? <><RefreshCw size={15} style={{ animation: 'spin 0.7s linear infinite' }} /> Saving...</> : <><Save size={15} /> Save Settings</>}
      </button>
    </div>
  )
}

const styles = {
  pageTitle: { fontFamily: "'Orbitron', sans-serif", fontSize: '14px', fontWeight: 700, color: '#F1F5F9', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '4px' },
  card: { background: '#0F172A', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', padding: '24px' },
  cardHeader: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' },
  cardIcon: { width: 40, height: 40, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: '15px', fontWeight: 700, color: '#F1F5F9', margin: 0 },
  cardDesc: { fontSize: '12px', color: '#475569', margin: '2px 0 0' },
  label: { display: 'block', fontSize: '12px', fontWeight: 600, color: '#94A3B8', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: '6px' },
  fieldDesc: { fontSize: '11px', color: '#475569', margin: '-2px 0 8px' },
  input: { width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '9px', padding: '11px 14px', color: '#F1F5F9', fontSize: '13px', fontFamily: "'Plus Jakarta Sans', sans-serif", outline: 'none', boxSizing: 'border-box' },
  select: { width: '100%', background: '#0F172A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '9px', padding: '11px 14px', color: '#F1F5F9', fontSize: '13px', fontFamily: "'Plus Jakarta Sans', sans-serif", outline: 'none', boxSizing: 'border-box', cursor: 'pointer' },
  eyeBtn: { position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: '4px' },
  saveBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', background: 'linear-gradient(135deg, #00D4FF, #0099CC)', border: 'none', borderRadius: '10px', color: '#020817', fontSize: '14px', fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer', width: '100%' },
  errorBanner: { display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '10px', padding: '12px 16px', color: '#FCA5A5', fontSize: '13px' },
  successBanner: { display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: '10px', padding: '12px 16px', color: '#4ADE80', fontSize: '13px' },
}

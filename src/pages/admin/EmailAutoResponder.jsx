import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { Save, RefreshCw, AlertCircle, CheckCircle, Mail, Play, ShieldAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import FaqManager from './FaqManager'

const MODELS = [
  { value: 'gpt-4o', label: 'GPT-4o (Best quality)' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Fast, low cost)' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (Cheapest)' },
]

const PERSONALITIES = [
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly & Warm' },
  { value: 'casual', label: 'Casual & Fun' },
]

// Keys this page owns in admin_settings (so save doesn't touch unrelated keys).
const EMAIL_RESPONDER_KEYS = [
  'email_responder_enabled',
  'email_responder_inbound_enabled',
  'email_responder_leads_enabled',
  'email_responder_imap_host',
  'email_responder_imap_port',
  'email_responder_model',
  'email_responder_max_tokens',
  'email_responder_personality',
  'email_responder_system_prompt',
  'email_responder_signature',
  'email_responder_defer_message',
  'email_responder_max_per_run',
  'email_responder_blocklist',
]

// A reusable toggle row (mirrors the Chat Bot page's switch styling).
function Toggle({ on, onClick, label }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}>
      <div style={{ width: 44, height: 24, borderRadius: 12, position: 'relative', background: on ? 'rgba(0,212,255,0.4)' : 'rgba(255,255,255,0.1)', transition: 'background 0.2s' }}>
        <div style={{ width: 18, height: 18, borderRadius: '50%', position: 'absolute', top: 3, left: on ? 23 : 3, background: on ? '#00D4FF' : '#475569', transition: 'left 0.2s, background 0.2s' }} />
      </div>
      <span style={{ fontSize: '13px', color: '#94A3B8' }}>{label || (on ? 'Enabled' : 'Disabled')}</span>
    </div>
  )
}

export default function EmailAutoResponder() {
  const [settings, setSettings] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState(null)

  const fetchSettings = useCallback(async () => {
    setError(null)
    try {
      const { data, error: err } = await supabase.from('admin_settings').select('key, value').in('key', EMAIL_RESPONDER_KEYS)
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

  const set = (key, value) => { setSettings((prev) => ({ ...prev, [key]: value })); setSuccess(false) }
  // master enable defaults OFF (must opt in); sub-toggles default ON once master is on.
  const masterOn = settings.email_responder_enabled === 'true'
  const inboundOn = settings.email_responder_inbound_enabled !== 'false'
  const leadsOn = settings.email_responder_leads_enabled !== 'false'

  const handleSave = async () => {
    setSaving(true); setError(null); setSuccess(false)
    try {
      for (const key of EMAIL_RESPONDER_KEYS) {
        const { error: err } = await supabase
          .from('admin_settings')
          .upsert({ key, value: settings[key] ?? '', updated_at: new Date().toISOString() }, { onConflict: 'key' })
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

  const handleRunNow = async () => {
    setRunning(true); setRunResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/website?action=email-responder-run-now', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}`, 'Content-Type': 'application/json' },
        body: '{}',
      })
      const data = await res.json()
      if (!res.ok) { setRunResult({ ok: false, msg: data.message || data.error || `Server error (${res.status})` }); return }
      if (data.enabled === false) { setRunResult({ ok: false, msg: 'The responder is disabled. Turn it on and Save first.' }); return }
      const inb = data.inbound || {}, ld = data.leads || {}
      const parts = []
      if (inb.error) parts.push(`Inbound error: ${inb.error}`)
      else if (inb.disabled) parts.push('Inbound off')
      else if (inb.skipped === 'no-credentials') parts.push('Inbound: SMTP creds not set in Settings → Email')
      else parts.push(`Inbound: ${inb.replied ?? 0} replied, ${inb.ignored ?? 0} ignored, ${inb.skipped ?? 0} skipped`)
      if (ld.disabled) parts.push('Leads off')
      else parts.push(`Leads: ${ld.replied ?? 0} replied`)
      setRunResult({ ok: true, msg: parts.join(' · ') })
    } catch (e) {
      setRunResult({ ok: false, msg: e.message })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      <div>
        <h2 style={styles.pageTitle}>Email Auto-Responder</h2>
        <p style={{ fontSize: '13px', color: '#475569', margin: 0 }}>An AI agent that replies to inbound emails and new contact-form leads using the same FAQs as the Chat Bot</p>
      </div>

      {error && <div style={styles.errorBanner}><AlertCircle size={15} /> {error}</div>}
      {success && <div style={styles.successBanner}><CheckCircle size={15} /> Saved successfully</div>}

      {loading ? (
        <div style={{ height: 240, background: 'rgba(255,255,255,0.04)', borderRadius: 14, animation: 'pulse 1.5s ease-in-out infinite' }} />
      ) : (
        <div style={{ ...styles.card, maxWidth: 700 }}>
          <div style={styles.cardHeader}>
            <div style={{ ...styles.cardIcon, background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.2)' }}>
              <Mail size={18} color="#00D4FF" />
            </div>
            <div>
              <h3 style={styles.cardTitle}>Configuration</h3>
              <p style={styles.cardDesc}>Sources, model, voice, and behavior</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Master + source toggles */}
            <div>
              <label style={styles.label}>Auto-Responder</label>
              <p style={styles.fieldDesc}>Master switch. When off, nothing is sent and the cron does nothing.</p>
              <Toggle on={masterOn} onClick={() => set('email_responder_enabled', masterOn ? 'false' : 'true')} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', opacity: masterOn ? 1 : 0.5, pointerEvents: masterOn ? 'auto' : 'none' }}>
              <div>
                <label style={styles.label}>Reply to inbound email</label>
                <p style={styles.fieldDesc}>Polls your mailbox over IMAP.</p>
                <Toggle on={inboundOn} onClick={() => set('email_responder_inbound_enabled', inboundOn ? 'false' : 'true')} />
              </div>
              <div>
                <label style={styles.label}>Reply to form leads</label>
                <p style={styles.fieldDesc}>Replies to new contact/lead submissions.</p>
                <Toggle on={leadsOn} onClick={() => set('email_responder_leads_enabled', leadsOn ? 'false' : 'true')} />
              </div>
            </div>

            {/* Mailbox connection */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 18 }}>
              <label style={styles.label}>Mailbox (IMAP)</label>
              <p style={styles.fieldDesc}>
                Authenticates with the SMTP mailbox you set in <Link to="/admin/settings" style={styles.link}>Settings → Email</Link> (same user &amp; password). Only the IMAP host/port differ.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '14px' }}>
                <input type="text" value={settings.email_responder_imap_host || ''} onChange={(e) => set('email_responder_imap_host', e.target.value)} placeholder="imap.hostinger.com" style={styles.input} />
                <input type="number" value={settings.email_responder_imap_port || ''} onChange={(e) => set('email_responder_imap_port', e.target.value)} placeholder="993" style={styles.input} />
              </div>
            </div>

            {/* Model + voice */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={styles.label}>Model</label>
                <select value={settings.email_responder_model || 'gpt-4o-mini'} onChange={(e) => set('email_responder_model', e.target.value)} style={styles.select}>
                  {MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label style={styles.label}>Personality / Tone</label>
                <select value={settings.email_responder_personality || 'professional'} onChange={(e) => set('email_responder_personality', e.target.value)} style={styles.select}>
                  {PERSONALITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label style={styles.label}>System Prompt</label>
              <p style={styles.fieldDesc}>The core instruction defining the email agent's identity. It answers ONLY from the FAQs/business info below — anything else is deferred to your team.</p>
              <textarea
                value={settings.email_responder_system_prompt || ''}
                onChange={(e) => set('email_responder_system_prompt', e.target.value)}
                placeholder="You are Haze, the email assistant for Haze Tech Solutions..."
                rows={4}
                style={{ ...styles.input, resize: 'vertical', lineHeight: 1.6 }}
              />
            </div>

            <div>
              <label style={styles.label}>Defer Message</label>
              <p style={styles.fieldDesc}>Sent when a real person asks something the FAQs don't cover.</p>
              <textarea
                value={settings.email_responder_defer_message || ''}
                onChange={(e) => set('email_responder_defer_message', e.target.value)}
                placeholder="Thanks for reaching out! One of our team members will personally follow up with you shortly."
                rows={2}
                style={{ ...styles.input, resize: 'vertical', lineHeight: 1.6 }}
              />
            </div>

            <div>
              <label style={styles.label}>Email Signature</label>
              <p style={styles.fieldDesc}>Appended to the bottom of every reply (optional).</p>
              <textarea
                value={settings.email_responder_signature || ''}
                onChange={(e) => set('email_responder_signature', e.target.value)}
                placeholder={'— The Haze Tech Solutions Team\nhazetechsolutions.com'}
                rows={2}
                style={{ ...styles.input, resize: 'vertical', lineHeight: 1.6 }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '14px' }}>
              <div>
                <label style={styles.label}>Max per run</label>
                <p style={styles.fieldDesc}>Emails/leads per poll.</p>
                <input type="number" value={settings.email_responder_max_per_run || ''} onChange={(e) => set('email_responder_max_per_run', e.target.value)} placeholder="5" min="1" max="25" style={styles.input} />
              </div>
              <div>
                <label style={styles.label}>Max response length</label>
                <p style={styles.fieldDesc}>Tokens (roughly 1 token = 4 chars).</p>
                <input type="number" value={settings.email_responder_max_tokens || ''} onChange={(e) => set('email_responder_max_tokens', e.target.value)} placeholder="400" min="80" max="1500" style={styles.input} />
              </div>
            </div>

            {/* Spam / notification filtering */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <ShieldAlert size={15} color="#FBBF24" />
                <label style={{ ...styles.label, margin: 0 }}>Spam &amp; notification filtering</label>
              </div>
              <p style={styles.fieldDesc}>
                Inbound mail is protected three ways: (1) automated mail — your own notifications, no-reply senders, mailing lists, bounces — is dropped for free; (2) the AI ignores spam &amp; cold marketing; (3) anything skipped stays <strong>unread</strong> in your inbox. Only emails the agent actually replies to are marked read.
              </p>
              <label style={styles.label}>Blocked senders</label>
              <p style={styles.fieldDesc}>Comma-separated domains, addresses, or keywords. Any From address containing one of these is never replied to.</p>
              <textarea
                value={settings.email_responder_blocklist || ''}
                onChange={(e) => set('email_responder_blocklist', e.target.value)}
                placeholder="noreply, mailer-daemon, vercel.com, stripe.com, github.com, google.com, paypal, mailchimp"
                rows={2}
                style={{ ...styles.input, resize: 'vertical', lineHeight: 1.6 }}
              />
              <p style={styles.fieldDesc}>Leave blank to use the built-in defaults.</p>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={handleSave} disabled={saving} style={{ ...styles.saveBtn, flex: 1, minWidth: 220, opacity: saving ? 0.6 : 1 }}>
                {saving ? <><RefreshCw size={15} style={{ animation: 'spin 0.7s linear infinite' }} /> Saving...</> : <><Save size={15} /> Save responder settings</>}
              </button>
              <button onClick={handleRunNow} disabled={running} style={{ ...styles.secondaryBtn, opacity: running ? 0.6 : 1 }} title="Run one poll now (no need to wait for the schedule)">
                {running ? <><RefreshCw size={15} style={{ animation: 'spin 0.7s linear infinite' }} /> Running...</> : <><Play size={15} /> Run now</>}
              </button>
            </div>
            {runResult && (
              <div style={runResult.ok ? styles.successBanner : styles.errorBanner}>
                {runResult.ok ? <CheckCircle size={15} /> : <AlertCircle size={15} />} {runResult.msg}
              </div>
            )}
            <p style={{ fontSize: 11, color: '#475569', margin: 0 }}>
              The schedule runs automatically every 5 minutes once <code style={styles.code}>CRON_SECRET</code> is set in Vercel. "Run now" works without it.
            </p>
          </div>
        </div>
      )}

      {/* FAQs — shared with the Chat Bot (same chatbot_faqs table) */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 24 }}>
        <h3 style={{ ...styles.pageTitle, marginBottom: 4 }}>FAQs — shared with the Chat Bot</h3>
        <p style={{ fontSize: '13px', color: '#475569', margin: '0 0 16px' }}>The email agent answers from these same questions &amp; answers. Editing here also updates the <Link to="/admin/chatbot" style={styles.link}>Chat Bot</Link>.</p>
        <FaqManager />
      </div>
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
  saveBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', background: 'linear-gradient(135deg, #00D4FF, #0099CC)', border: 'none', borderRadius: '10px', color: '#020817', fontSize: '14px', fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer' },
  secondaryBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px 18px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', color: '#E2E8F0', fontSize: '14px', fontWeight: 600, fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer' },
  errorBanner: { display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '10px', padding: '12px 16px', color: '#FCA5A5', fontSize: '13px' },
  successBanner: { display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: '10px', padding: '12px 16px', color: '#4ADE80', fontSize: '13px' },
  link: { color: '#7dd3fc', textDecoration: 'none' },
  code: { background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: 4, fontSize: 10 },
}

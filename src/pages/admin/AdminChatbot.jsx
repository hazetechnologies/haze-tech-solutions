import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { Save, RefreshCw, AlertCircle, CheckCircle, Bot } from 'lucide-react'

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
const CHATBOT_KEYS = [
  'chatbot_model',
  'chatbot_avatar_url',
  'chatbot_system_prompt',
  'chatbot_greeting',
  'chatbot_personality',
  'chatbot_max_tokens',
  'chatbot_lead_capture',
  'chatbot_followup_enabled',
  'chatbot_followup_delay',
  'chatbot_followup_message',
]

export default function AdminChatbot() {
  const [settings, setSettings] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  const fetchSettings = useCallback(async () => {
    setError(null)
    try {
      const { data, error: err } = await supabase.from('admin_settings').select('key, value').in('key', CHATBOT_KEYS)
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

  const handleSave = async () => {
    setSaving(true); setError(null); setSuccess(false)
    try {
      for (const key of CHATBOT_KEYS) {
        const { error: err } = await supabase
          .from('admin_settings')
          .upsert({ key, value: settings[key] || '', updated_at: new Date().toISOString() }, { onConflict: 'key' })
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      <div>
        <h2 style={styles.pageTitle}>Chat Bot</h2>
        <p style={{ fontSize: '13px', color: '#475569', margin: 0 }}>Configure the website chatbot. It answers from the shared FAQs (see the FAQs tab).</p>
      </div>

      {error && <div style={styles.errorBanner}><AlertCircle size={15} /> {error}</div>}
      {success && <div style={styles.successBanner}><CheckCircle size={15} /> Saved successfully</div>}

      {loading ? (
        <div style={{ height: 240, background: 'rgba(255,255,255,0.04)', borderRadius: 14, animation: 'pulse 1.5s ease-in-out infinite' }} />
      ) : (
        <div style={{ ...styles.card, maxWidth: 700 }}>
          <div style={styles.cardHeader}>
            <div style={{ ...styles.cardIcon, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
              <Bot size={18} color="#A78BFA" />
            </div>
            <div>
              <h3 style={styles.cardTitle}>Configuration</h3>
              <p style={styles.cardDesc}>Model, personality, greeting, and behavior</p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div>
              <label style={styles.label}>Chatbot Model</label>
              <p style={styles.fieldDesc}>Model used for website chat responses</p>
              <select value={settings.chatbot_model || 'gpt-4o-mini'} onChange={(e) => set('chatbot_model', e.target.value)} style={styles.select}>
                {MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>

            <div>
              <label style={styles.label}>Profile Image URL</label>
              <p style={styles.fieldDesc}>Shown as the bot's avatar in the chat header. Paste a hosted image URL (e.g. your logo or an R2 public URL). Leave blank for the default icon.</p>
              <input
                type="text"
                value={settings.chatbot_avatar_url || ''}
                onChange={(e) => set('chatbot_avatar_url', e.target.value)}
                placeholder="https://…/bot-avatar.png"
                style={styles.input}
              />
              {settings.chatbot_avatar_url ? (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <img src={settings.chatbot_avatar_url} alt="avatar preview" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }} />
                  <span style={{ fontSize: 11, color: '#64748B' }}>Preview</span>
                </div>
              ) : null}
            </div>

            <div>
              <label style={styles.label}>System Prompt</label>
              <p style={styles.fieldDesc}>The core instruction that defines the chatbot's identity and behavior</p>
              <textarea
                value={settings.chatbot_system_prompt || ''}
                onChange={(e) => set('chatbot_system_prompt', e.target.value)}
                placeholder="You are Haze, the friendly AI assistant for Haze Tech Solutions..."
                rows={5}
                style={{ ...styles.input, resize: 'vertical', lineHeight: 1.6 }}
              />
            </div>

            <div>
              <label style={styles.label}>Greeting Message</label>
              <p style={styles.fieldDesc}>First message visitors see when they open the chat</p>
              <textarea
                value={settings.chatbot_greeting || ''}
                onChange={(e) => set('chatbot_greeting', e.target.value)}
                placeholder="Hey! I'm Haze, your AI assistant. How can I help you today?"
                rows={2}
                style={{ ...styles.input, resize: 'vertical', lineHeight: 1.6 }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={styles.label}>Personality / Tone</label>
                <select value={settings.chatbot_personality || 'professional'} onChange={(e) => set('chatbot_personality', e.target.value)} style={styles.select}>
                  {PERSONALITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label style={styles.label}>Max Response Length</label>
                <p style={styles.fieldDesc}>Tokens (roughly 1 token = 4 chars)</p>
                <input
                  type="number"
                  value={settings.chatbot_max_tokens || '300'}
                  onChange={(e) => set('chatbot_max_tokens', e.target.value)}
                  min="50" max="2000"
                  style={styles.input}
                />
              </div>
            </div>

            <div>
              <label style={styles.label}>Lead Capture</label>
              <p style={styles.fieldDesc}>Chatbot will guide visitors to share their name and email</p>
              <div
                onClick={() => set('chatbot_lead_capture', settings.chatbot_lead_capture === 'false' ? 'true' : 'false')}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}
              >
                <div style={{ width: 44, height: 24, borderRadius: 12, position: 'relative', background: settings.chatbot_lead_capture !== 'false' ? 'rgba(0,212,255,0.4)' : 'rgba(255,255,255,0.1)', transition: 'background 0.2s' }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', position: 'absolute', top: 3, left: settings.chatbot_lead_capture !== 'false' ? 23 : 3, background: settings.chatbot_lead_capture !== 'false' ? '#00D4FF' : '#475569', transition: 'left 0.2s, background 0.2s' }} />
                </div>
                <span style={{ fontSize: '13px', color: '#94A3B8' }}>{settings.chatbot_lead_capture !== 'false' ? 'Enabled' : 'Disabled'}</span>
              </div>
            </div>

            {/* Idle follow-up */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 18 }}>
              <label style={styles.label}>Idle Follow-up</label>
              <p style={styles.fieldDesc}>If a visitor opens the chat and then goes quiet, the bot sends one nudge after the delay below.</p>
              <div
                onClick={() => set('chatbot_followup_enabled', settings.chatbot_followup_enabled === 'true' ? 'false' : 'true')}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', userSelect: 'none' }}
              >
                <div style={{ width: 44, height: 24, borderRadius: 12, position: 'relative', background: settings.chatbot_followup_enabled === 'true' ? 'rgba(0,212,255,0.4)' : 'rgba(255,255,255,0.1)', transition: 'background 0.2s' }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', position: 'absolute', top: 3, left: settings.chatbot_followup_enabled === 'true' ? 23 : 3, background: settings.chatbot_followup_enabled === 'true' ? '#00D4FF' : '#475569', transition: 'left 0.2s, background 0.2s' }} />
                </div>
                <span style={{ fontSize: '13px', color: '#94A3B8' }}>{settings.chatbot_followup_enabled === 'true' ? 'Enabled' : 'Disabled'}</span>
              </div>
            </div>

            {settings.chatbot_followup_enabled === 'true' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '14px' }}>
                <div>
                  <label style={styles.label}>Delay (seconds)</label>
                  <input
                    type="number"
                    value={settings.chatbot_followup_delay || '30'}
                    onChange={(e) => set('chatbot_followup_delay', e.target.value)}
                    min="5" max="600"
                    style={styles.input}
                  />
                </div>
                <div>
                  <label style={styles.label}>Follow-up Message</label>
                  <input
                    type="text"
                    value={settings.chatbot_followup_message || ''}
                    onChange={(e) => set('chatbot_followup_message', e.target.value)}
                    placeholder="Still there? Happy to help — just ask, or leave your email and we'll follow up."
                    style={styles.input}
                  />
                </div>
              </div>
            )}

            <button onClick={handleSave} disabled={saving} style={{ ...styles.saveBtn, opacity: saving ? 0.6 : 1 }}>
              {saving ? <><RefreshCw size={15} style={{ animation: 'spin 0.7s linear infinite' }} /> Saving...</> : <><Save size={15} /> Save chatbot settings</>}
            </button>
          </div>
        </div>
      )}
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
  saveBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', background: 'linear-gradient(135deg, #00D4FF, #0099CC)', border: 'none', borderRadius: '10px', color: '#020817', fontSize: '14px', fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer', width: '100%' },
  errorBanner: { display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '10px', padding: '12px 16px', color: '#FCA5A5', fontSize: '13px' },
  successBanner: { display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: '10px', padding: '12px 16px', color: '#4ADE80', fontSize: '13px' },
}

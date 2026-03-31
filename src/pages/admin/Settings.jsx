import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { Save, Eye, EyeOff, RefreshCw, AlertCircle, CheckCircle, Bot, Key } from 'lucide-react'

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

export default function Settings() {
  const [settings, setSettings] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [showKey, setShowKey] = useState(false)

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
        <p style={{ fontSize: '13px', color: '#475569', margin: 0 }}>Manage API keys, chatbot behavior, and AI models</p>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={styles.label}>Report Model</label>
              <p style={styles.fieldDesc}>For automation plan generation</p>
              <select value={settings.report_model || 'gpt-4o'} onChange={e => set('report_model', e.target.value)} style={styles.select}>
                {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label style={styles.label}>Chatbot Model</label>
              <p style={styles.fieldDesc}>For website chat responses</p>
              <select value={settings.chatbot_model || 'gpt-4o-mini'} onChange={e => set('chatbot_model', e.target.value)} style={styles.select}>
                {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ── Chatbot Configuration ── */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={{ ...styles.cardIcon, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
            <Bot size={18} color="#A78BFA" />
          </div>
          <div>
            <h3 style={styles.cardTitle}>Chatbot Configuration</h3>
            <p style={styles.cardDesc}>Personality, greeting, and behavior</p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div>
            <label style={styles.label}>System Prompt</label>
            <p style={styles.fieldDesc}>The core instruction that defines the chatbot's identity and behavior</p>
            <textarea
              value={settings.chatbot_system_prompt || ''}
              onChange={e => set('chatbot_system_prompt', e.target.value)}
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
              onChange={e => set('chatbot_greeting', e.target.value)}
              placeholder="Hey! I'm Haze, your AI assistant. How can I help you today?"
              rows={2}
              style={{ ...styles.input, resize: 'vertical', lineHeight: 1.6 }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={styles.label}>Personality / Tone</label>
              <select value={settings.chatbot_personality || 'professional'} onChange={e => set('chatbot_personality', e.target.value)} style={styles.select}>
                {PERSONALITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label style={styles.label}>Max Response Length</label>
              <p style={styles.fieldDesc}>Tokens (roughly 1 token = 4 chars)</p>
              <input
                type="number"
                value={settings.chatbot_max_tokens || '300'}
                onChange={e => set('chatbot_max_tokens', e.target.value)}
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
              <div style={{
                width: 44, height: 24, borderRadius: 12, position: 'relative',
                background: settings.chatbot_lead_capture !== 'false' ? 'rgba(0,212,255,0.4)' : 'rgba(255,255,255,0.1)',
                transition: 'background 0.2s',
              }}>
                <div style={{
                  width: 18, height: 18, borderRadius: '50%', position: 'absolute', top: 3,
                  left: settings.chatbot_lead_capture !== 'false' ? 23 : 3,
                  background: settings.chatbot_lead_capture !== 'false' ? '#00D4FF' : '#475569',
                  transition: 'left 0.2s, background 0.2s',
                }} />
              </div>
              <span style={{ fontSize: '13px', color: '#94A3B8' }}>
                {settings.chatbot_lead_capture !== 'false' ? 'Enabled' : 'Disabled'}
              </span>
            </div>
          </div>
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

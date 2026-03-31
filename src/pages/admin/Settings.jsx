import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { Save, Eye, EyeOff, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react'

const MODELS = [
  { value: 'gpt-4o', label: 'GPT-4o (Best quality, higher cost)' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Fast, low cost)' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (Cheapest)' },
  { value: 'o1-mini', label: 'o1-mini (Reasoning)' },
]

const SETTINGS_CONFIG = [
  { key: 'openai_api_key', label: 'OpenAI API Key', type: 'secret', placeholder: 'sk-...' },
  { key: 'report_model', label: 'Automation Report Model', type: 'model', description: 'Model used to generate AI automation plans for leads' },
  { key: 'chatbot_model', label: 'Chatbot Model', type: 'model', description: 'Model used for the website chatbot (Haze AI)' },
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
      const { data, error: err } = await supabase
        .from('admin_settings')
        .select('key, value')
      if (err) throw err
      const map = {}
      for (const row of data || []) {
        map[row.key] = row.value
      }
      setSettings(map)
    } catch (err) {
      setError(err.message || 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSettings() }, [fetchSettings])

  const handleChange = (key, value) => {
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
          .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
        if (err) throw err
      }
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err.message || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {[80, 60, 60].map((h, i) => (
        <div key={i} style={{ height: h, background: 'rgba(255,255,255,0.04)', borderRadius: '14px', animation: 'pulse 1.5s ease-in-out infinite' }} />
      ))}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', fontFamily: "'Plus Jakarta Sans', sans-serif", maxWidth: '700px' }}>
      <div>
        <h2 style={styles.pageTitle}>Settings</h2>
        <p style={{ fontSize: '13px', color: '#475569', margin: 0 }}>Manage API keys and AI model configurations</p>
      </div>

      {error && (
        <div style={styles.errorBanner}>
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {success && (
        <div style={styles.successBanner}>
          <CheckCircle size={15} /> Settings saved successfully
        </div>
      )}

      {/* OpenAI Section */}
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={styles.cardIcon}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg>
          </div>
          <div>
            <h3 style={styles.cardTitle}>OpenAI Configuration</h3>
            <p style={styles.cardDesc}>API key and model selection for AI features</p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {SETTINGS_CONFIG.map(config => (
            <div key={config.key}>
              <label style={styles.label}>{config.label}</label>
              {config.description && <p style={styles.fieldDesc}>{config.description}</p>}

              {config.type === 'secret' ? (
                <div style={{ position: 'relative' }}>
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={settings[config.key] || ''}
                    onChange={e => handleChange(config.key, e.target.value)}
                    placeholder={config.placeholder}
                    style={{ ...styles.input, paddingRight: '44px' }}
                  />
                  <button
                    onClick={() => setShowKey(!showKey)}
                    style={styles.eyeBtn}
                    type="button"
                  >
                    {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              ) : config.type === 'model' ? (
                <select
                  value={settings[config.key] || 'gpt-4o'}
                  onChange={e => handleChange(config.key, e.target.value)}
                  style={styles.select}
                >
                  {MODELS.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={settings[config.key] || ''}
                  onChange={e => handleChange(config.key, e.target.value)}
                  placeholder={config.placeholder}
                  style={styles.input}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{ ...styles.saveBtn, opacity: saving ? 0.6 : 1 }}
      >
        {saving ? (
          <><RefreshCw size={15} style={{ animation: 'spin 0.7s linear infinite' }} /> Saving...</>
        ) : (
          <><Save size={15} /> Save Settings</>
        )}
      </button>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

const styles = {
  pageTitle: { fontFamily: "'Orbitron', sans-serif", fontSize: '14px', fontWeight: 700, color: '#F1F5F9', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '4px' },
  card: { background: '#0F172A', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', padding: '24px' },
  cardHeader: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' },
  cardIcon: { width: 40, height: 40, borderRadius: '10px', background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
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

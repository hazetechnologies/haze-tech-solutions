import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { Plus, X, Edit2, Trash2, AlertCircle, Zap, Eye, EyeOff, Play } from 'lucide-react'

const SOURCES = [
  { value: 'chatbot', label: 'Chatbot — triggers when visitor says a phrase' },
  { value: 'contact_form', label: 'Contact Form — triggers on new lead submission' },
  { value: 'newsletter', label: 'Newsletter — triggers on new subscriber' },
  { value: 'audit', label: 'Audit — triggers when audit is completed' },
  { value: 'manual', label: 'Manual — trigger from admin dashboard' },
]

const EVENTS = [
  { value: 'new_lead', label: 'New Lead' },
  { value: 'new_subscriber', label: 'New Subscriber' },
  { value: 'audit_complete', label: 'Audit Complete' },
  { value: 'chat_phrase', label: 'Chat Phrase Match' },
  { value: 'project_update', label: 'Project Status Change' },
  { value: 'manual', label: 'Manual Trigger' },
]

export default function AutomationTriggers() {
  const [triggers, setTriggers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modal, setModal] = useState(null)
  const [testing, setTesting] = useState(null)

  const fetchTriggers = useCallback(async () => {
    setError(null)
    try {
      const { data, error: err } = await supabase.from('automation_triggers').select('*').order('created_at', { ascending: false })
      if (err) throw err
      setTriggers(data ?? [])
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchTriggers() }, [fetchTriggers])

  const handleSaved = () => { setModal(null); setLoading(true); fetchTriggers() }

  const handleDelete = async (id) => {
    if (!confirm('Delete this trigger?')) return
    await supabase.from('automation_triggers').delete().eq('id', id)
    handleSaved()
  }

  const toggleActive = async (id, current) => {
    await supabase.from('automation_triggers').update({ active: !current }).eq('id', id)
    setTriggers(prev => prev.map(t => t.id === id ? { ...t, active: !current } : t))
  }

  const handleTest = async (trigger) => {
    setTesting(trigger.id)
    try {
      const res = await fetch(trigger.webhook_url, {
        method: trigger.webhook_method || 'POST',
        headers: { 'Content-Type': 'application/json', ...(trigger.webhook_headers || {}) },
        body: JSON.stringify({ trigger: trigger.name, test: true, timestamp: new Date().toISOString() }),
      })
      alert(res.ok ? 'Webhook fired successfully!' : `Webhook returned ${res.status}`)
    } catch (err) {
      alert('Failed: ' + err.message)
    } finally {
      setTesting(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={styles.pageTitle}>Automation Triggers</h2>
          <p style={{ fontSize: '13px', color: '#475569', margin: 0 }}>Connect n8n workflows to platform events</p>
        </div>
        <button onClick={() => setModal({ data: null })} style={styles.addBtn}><Plus size={14} /> Add Trigger</button>
      </div>

      {error && <div style={styles.errorBanner}><AlertCircle size={15} /> {error}</div>}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1, 2].map(i => <div key={i} style={{ height: 90, background: 'rgba(255,255,255,0.04)', borderRadius: 14, animation: 'pulse 1.5s ease-in-out infinite' }} />)}
        </div>
      ) : triggers.length === 0 ? (
        <div style={styles.emptyState}>
          <Zap size={28} color="#334155" />
          <p>No triggers yet. Connect n8n workflows to chatbot phrases, form submissions, and other events.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {triggers.map(t => (
            <div key={t.id} style={{ ...styles.card, opacity: t.active ? 1 : 0.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <Zap size={14} color="#F59E0B" />
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: '#F1F5F9', margin: 0 }}>{t.name}</h3>
                    <span style={styles.sourceBadge}>{t.trigger_source}</span>
                  </div>
                  {t.description && <p style={{ fontSize: 12, color: '#64748B', margin: '0 0 6px', lineHeight: 1.5 }}>{t.description}</p>}
                  {t.trigger_phrases && t.trigger_phrases.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                      {t.trigger_phrases.map((p, i) => (
                        <span key={i} style={styles.phraseBadge}>"{p}"</span>
                      ))}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: '#475569', fontFamily: 'monospace' }}>
                    {t.webhook_method || 'POST'} {t.webhook_url}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, marginLeft: 12 }}>
                  <button onClick={() => handleTest(t)} disabled={testing === t.id} style={{ ...styles.testBtn, opacity: testing === t.id ? 0.5 : 1 }}>
                    <Play size={11} /> {testing === t.id ? '...' : 'Test'}
                  </button>
                  <IconBtn icon={t.active ? Eye : EyeOff} onClick={() => toggleActive(t.id, t.active)} color={t.active ? '#22C55E' : '#64748B'} />
                  <IconBtn icon={Edit2} onClick={() => setModal({ data: t })} />
                  <IconBtn icon={Trash2} onClick={() => handleDelete(t.id)} color="#EF4444" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && <TriggerModal trigger={modal.data} onClose={() => setModal(null)} onSaved={handleSaved} />}
    </div>
  )
}

function TriggerModal({ trigger, onClose, onSaved }) {
  const [form, setForm] = useState(trigger || {
    name: '', description: '', trigger_source: 'chatbot', trigger_phrases: [],
    event_type: 'chat_phrase', webhook_url: '', webhook_method: 'POST', webhook_headers: {}, active: true,
  })
  const [phrasesText, setPhrasesText] = useState((trigger?.trigger_phrases || []).join(', '))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name || !form.webhook_url) return
    setSaving(true)
    try {
      const phrases = phrasesText.split(',').map(p => p.trim()).filter(Boolean)
      const payload = {
        name: form.name, description: form.description || null,
        trigger_source: form.trigger_source, trigger_phrases: phrases,
        event_type: form.event_type || null,
        webhook_url: form.webhook_url, webhook_method: form.webhook_method || 'POST',
        webhook_headers: form.webhook_headers || {}, active: form.active,
      }
      if (form.id) {
        const { error: err } = await supabase.from('automation_triggers').update(payload).eq('id', form.id)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from('automation_triggers').insert(payload)
        if (err) throw err
      }
      onSaved()
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  return (
    <div onClick={onClose} style={styles.overlay}>
      <div onClick={e => e.stopPropagation()} style={styles.modal}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 13, fontWeight: 700, color: '#F1F5F9', letterSpacing: '0.06em', margin: 0 }}>{form.id ? 'Edit' : 'Add'} Trigger</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={styles.label}>Name *</label>
            <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Book a Meeting" style={styles.input} required />
          </div>
          <div>
            <label style={styles.label}>Description</label>
            <input value={form.description || ''} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="What this trigger does..." style={styles.input} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={styles.label}>Source</label>
              <select value={form.trigger_source} onChange={e => setForm(p => ({ ...p, trigger_source: e.target.value }))} style={styles.select}>
                {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label style={styles.label}>Event Type</label>
              <select value={form.event_type || ''} onChange={e => setForm(p => ({ ...p, event_type: e.target.value }))} style={styles.select}>
                {EVENTS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
              </select>
            </div>
          </div>
          {form.trigger_source === 'chatbot' && (
            <div>
              <label style={styles.label}>Trigger Phrases (comma-separated)</label>
              <input value={phrasesText} onChange={e => setPhrasesText(e.target.value)} placeholder="book a call, schedule meeting, book appointment" style={styles.input} />
              <p style={{ fontSize: 11, color: '#475569', margin: '4px 0 0' }}>When the chatbot detects these phrases, it fires the webhook</p>
            </div>
          )}
          <div>
            <label style={styles.label}>n8n Webhook URL *</label>
            <input value={form.webhook_url} onChange={e => setForm(p => ({ ...p, webhook_url: e.target.value }))} placeholder="https://n8n.srv934577.hstgr.cloud/webhook/..." style={styles.input} required />
          </div>
          <div>
            <label style={styles.label}>Method</label>
            <select value={form.webhook_method} onChange={e => setForm(p => ({ ...p, webhook_method: e.target.value }))} style={styles.select}>
              <option value="POST">POST</option>
              <option value="GET">GET</option>
            </select>
          </div>
          {error && <div style={{ color: '#FCA5A5', fontSize: 12 }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>Cancel</button>
            <button type="submit" disabled={saving} style={{ ...styles.saveBtn, opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function IconBtn({ icon: Icon, onClick, color = '#64748B' }) {
  return <button onClick={onClick} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: 4, cursor: 'pointer', color }} onMouseEnter={e => { e.currentTarget.style.borderColor = color }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}><Icon size={13} /></button>
}

const styles = {
  pageTitle: { fontFamily: "'Orbitron', sans-serif", fontSize: 14, fontWeight: 700, color: '#F1F5F9', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 },
  addBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: 'linear-gradient(135deg, #00D4FF, #0099CC)', border: 'none', borderRadius: 9, color: '#020817', fontSize: 13, fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer' },
  testBtn: { display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 6, color: '#F59E0B', fontSize: 11, fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer', fontWeight: 600 },
  card: { background: '#0F172A', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 18 },
  sourceBadge: { fontSize: 10, fontWeight: 600, color: '#F59E0B', background: 'rgba(245,158,11,0.1)', padding: '2px 8px', borderRadius: 4, textTransform: 'capitalize' },
  phraseBadge: { fontSize: 10, color: '#94A3B8', background: 'rgba(255,255,255,0.04)', padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.08)' },
  emptyState: { background: '#0F172A', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 50, textAlign: 'center', color: '#475569', fontSize: 13 },
  errorBanner: { display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '12px 16px', color: '#FCA5A5', fontSize: 13 },
  overlay: { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(2,8,23,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modal: { background: '#0F172A', border: '1px solid rgba(0,212,255,0.15)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' },
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 },
  input: { width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, padding: '10px 14px', color: '#F1F5F9', fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif", outline: 'none', boxSizing: 'border-box' },
  select: { width: '100%', background: '#0F172A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, padding: '10px 14px', color: '#F1F5F9', fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif", outline: 'none', boxSizing: 'border-box', cursor: 'pointer' },
  cancelBtn: { padding: '9px 18px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, color: '#94A3B8', fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer' },
  saveBtn: { padding: '9px 18px', background: 'linear-gradient(135deg, #00D4FF, #0099CC)', border: 'none', borderRadius: 9, color: '#020817', fontSize: 13, fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer' },
}

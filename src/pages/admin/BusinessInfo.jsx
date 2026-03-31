import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { Plus, X, Edit2, Trash2, RefreshCw, AlertCircle, Building, Eye, EyeOff } from 'lucide-react'

const CATEGORIES = ['about', 'services', 'pricing', 'hours', 'location', 'team', 'policies', 'custom']

export default function BusinessInfo() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [modal, setModal] = useState(null)

  const fetchItems = useCallback(async () => {
    setError(null)
    try {
      const { data, error: err } = await supabase.from('business_info').select('*').order('display_order')
      if (err) throw err
      setItems(data ?? [])
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  const handleSaved = () => { setModal(null); setLoading(true); fetchItems() }

  const handleDelete = async (id) => {
    if (!confirm('Delete this entry?')) return
    await supabase.from('business_info').delete().eq('id', id)
    handleSaved()
  }

  const toggleActive = async (id, current) => {
    await supabase.from('business_info').update({ active: !current }).eq('id', id)
    setItems(prev => prev.map(i => i.id === id ? { ...i, active: !current } : i))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={styles.pageTitle}>Business Info</h2>
          <p style={{ fontSize: '13px', color: '#475569', margin: 0 }}>Details the chatbot knows about your business</p>
        </div>
        <button onClick={() => setModal({ data: null })} style={styles.addBtn}><Plus size={14} /> Add Info</button>
      </div>

      {error && <div style={styles.errorBanner}><AlertCircle size={15} /> {error}</div>}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[1, 2, 3].map(i => <div key={i} style={{ height: 80, background: 'rgba(255,255,255,0.04)', borderRadius: 14, animation: 'pulse 1.5s ease-in-out infinite' }} />)}
        </div>
      ) : items.length === 0 ? (
        <div style={styles.emptyState}><Building size={28} color="#334155" /><p>No business info yet. Add details about your company, services, pricing, hours, etc.</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {items.map(item => (
            <div key={item.id} style={{ ...styles.card, opacity: item.active ? 1 : 0.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={styles.categoryBadge}>{item.category}</span>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#F1F5F9', margin: 0 }}>{item.title}</h3>
                  </div>
                  <p style={{ fontSize: '12px', color: '#64748B', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{item.content.length > 200 ? item.content.slice(0, 200) + '...' : item.content}</p>
                </div>
                <div style={{ display: 'flex', gap: '4px', marginLeft: '12px' }}>
                  <IconBtn icon={item.active ? Eye : EyeOff} onClick={() => toggleActive(item.id, item.active)} color={item.active ? '#22C55E' : '#64748B'} />
                  <IconBtn icon={Edit2} onClick={() => setModal({ data: item })} />
                  <IconBtn icon={Trash2} onClick={() => handleDelete(item.id)} color="#EF4444" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && <FormModal item={modal.data} onClose={() => setModal(null)} onSaved={handleSaved} />}
    </div>
  )
}

function FormModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState(item || { category: 'custom', title: '', content: '', display_order: 0, active: true })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title || !form.content) return
    setSaving(true)
    try {
      const payload = { category: form.category, title: form.title, content: form.content, display_order: form.display_order || 0, active: form.active }
      if (form.id) {
        const { error: err } = await supabase.from('business_info').update(payload).eq('id', form.id)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from('business_info').insert(payload)
        if (err) throw err
      }
      onSaved()
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  return (
    <div onClick={onClose} style={styles.overlay}>
      <div onClick={e => e.stopPropagation()} style={styles.modal}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '13px', fontWeight: 700, color: '#F1F5F9', letterSpacing: '0.06em', margin: 0 }}>{form.id ? 'Edit' : 'Add'} Business Info</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={styles.label}>Category</label>
            <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} style={styles.select}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label style={styles.label}>Title *</label>
            <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Business Hours" style={styles.input} required />
          </div>
          <div>
            <label style={styles.label}>Content *</label>
            <textarea value={form.content} onChange={e => setForm(p => ({ ...p, content: e.target.value }))} placeholder="Details the chatbot should know..." rows={6} style={{ ...styles.input, resize: 'vertical', lineHeight: 1.6 }} required />
          </div>
          <div>
            <label style={styles.label}>Display Order</label>
            <input type="number" value={form.display_order} onChange={e => setForm(p => ({ ...p, display_order: parseInt(e.target.value) || 0 }))} style={styles.input} />
          </div>
          {error && <div style={{ color: '#FCA5A5', fontSize: '12px' }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>Cancel</button>
            <button type="submit" disabled={saving} style={{ ...styles.saveBtn, opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function IconBtn({ icon: Icon, onClick, color = '#64748B' }) {
  return <button onClick={onClick} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: 4, cursor: 'pointer', color, transition: 'border-color 0.15s' }} onMouseEnter={e => { e.currentTarget.style.borderColor = color }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}><Icon size={13} /></button>
}

const styles = {
  pageTitle: { fontFamily: "'Orbitron', sans-serif", fontSize: '14px', fontWeight: 700, color: '#F1F5F9', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '4px' },
  addBtn: { display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px', background: 'linear-gradient(135deg, #00D4FF, #0099CC)', border: 'none', borderRadius: '9px', color: '#020817', fontSize: '13px', fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer' },
  card: { background: '#0F172A', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 18, transition: 'opacity 0.2s' },
  categoryBadge: { fontSize: '10px', fontWeight: 600, color: '#00D4FF', background: 'rgba(0,212,255,0.1)', padding: '2px 8px', borderRadius: 4, textTransform: 'capitalize' },
  emptyState: { background: '#0F172A', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 50, textAlign: 'center', color: '#475569', fontSize: 13 },
  errorBanner: { display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '12px 16px', color: '#FCA5A5', fontSize: 13 },
  overlay: { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(2,8,23,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modal: { background: '#0F172A', border: '1px solid rgba(0,212,255,0.15)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' },
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 },
  input: { width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, padding: '10px 14px', color: '#F1F5F9', fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif", outline: 'none', boxSizing: 'border-box' },
  select: { width: '100%', background: '#0F172A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, padding: '10px 14px', color: '#F1F5F9', fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif", outline: 'none', boxSizing: 'border-box', cursor: 'pointer' },
  cancelBtn: { padding: '9px 18px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, color: '#94A3B8', fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer' },
  saveBtn: { padding: '9px 18px', background: 'linear-gradient(135deg, #00D4FF, #0099CC)', border: 'none', borderRadius: 9, color: '#020817', fontSize: 13, fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer' },
}

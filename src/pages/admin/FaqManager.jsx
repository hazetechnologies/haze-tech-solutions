import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { Plus, X, Edit2, Trash2, Upload, Download, AlertCircle, HelpCircle, Search, Eye, EyeOff } from 'lucide-react'

export default function FaqManager() {
  const [faqs, setFaqs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const fileRef = useRef(null)

  const fetchFaqs = useCallback(async () => {
    setError(null)
    try {
      const { data, error: err } = await supabase.from('chatbot_faqs').select('*').order('created_at', { ascending: false })
      if (err) throw err
      setFaqs(data ?? [])
    } catch (err) { setError(err.message) } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchFaqs() }, [fetchFaqs])

  const handleSaved = () => { setModal(null); setLoading(true); fetchFaqs() }

  const handleDelete = async (id) => {
    if (!confirm('Delete this FAQ?')) return
    await supabase.from('chatbot_faqs').delete().eq('id', id)
    handleSaved()
  }

  const toggleActive = async (id, current) => {
    await supabase.from('chatbot_faqs').update({ active: !current }).eq('id', id)
    setFaqs(prev => prev.map(f => f.id === id ? { ...f, active: !current } : f))
  }

  // CSV Upload
  const handleCsvUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const lines = text.split('\n').filter(l => l.trim())
    if (lines.length < 2) { alert('CSV must have a header row and at least one data row'); return }

    const header = lines[0].toLowerCase()
    const hasCategory = header.includes('category')

    const rows = []
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i])
      if (cols.length >= 2 && cols[0].trim() && cols[1].trim()) {
        rows.push({
          question: cols[0].trim(),
          answer: cols[1].trim(),
          category: hasCategory && cols[2] ? cols[2].trim() : 'general',
          active: true,
        })
      }
    }

    if (rows.length === 0) { alert('No valid rows found. CSV needs columns: question, answer, category (optional)'); return }

    const { error: err } = await supabase.from('chatbot_faqs').insert(rows)
    if (err) { alert('Upload error: ' + err.message); return }
    alert(`${rows.length} FAQs imported!`)
    handleSaved()
    e.target.value = ''
  }

  // CSV Download
  const handleCsvDownload = () => {
    const header = 'question,answer,category'
    const rows = faqs.map(f => `"${f.question.replace(/"/g, '""')}","${f.answer.replace(/"/g, '""')}","${f.category || 'general'}"`)
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'chatbot-faqs.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const filtered = faqs.filter(f => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q)
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={styles.pageTitle}>FAQ Knowledge Base</h2>
          <p style={{ fontSize: '13px', color: '#475569', margin: 0 }}>{faqs.length} FAQs — the chatbot uses these to answer questions</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => fileRef.current?.click()} style={styles.iconBtn}><Upload size={14} /> Upload CSV</button>
          <input ref={fileRef} type="file" accept=".csv" onChange={handleCsvUpload} style={{ display: 'none' }} />
          <button onClick={handleCsvDownload} disabled={faqs.length === 0} style={styles.iconBtn}><Download size={14} /> Export</button>
          <button onClick={() => setModal({ data: null })} style={styles.addBtn}><Plus size={14} /> Add FAQ</button>
        </div>
      </div>

      {error && <div style={styles.errorBanner}><AlertCircle size={15} /> {error}</div>}

      {/* Search */}
      <div style={{ position: 'relative', maxWidth: 360 }}>
        <Search size={15} color="#475569" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search FAQs..." style={{ ...styles.input, paddingLeft: 36 }} />
      </div>

      {/* FAQ list */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3].map(i => <div key={i} style={{ height: 70, background: 'rgba(255,255,255,0.04)', borderRadius: 14, animation: 'pulse 1.5s ease-in-out infinite' }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div style={styles.emptyState}><HelpCircle size={28} color="#334155" /><p>{faqs.length > 0 ? 'No FAQs match your search.' : 'No FAQs yet. Add Q&A pairs or upload a CSV.'}</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map(faq => (
            <div key={faq.id} style={{ ...styles.card, opacity: faq.active ? 1 : 0.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#00D4FF' }}>Q:</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#F1F5F9' }}>{faq.question}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#4ADE80' }}>A:</span>
                    <span style={{ fontSize: 12, color: '#64748B', lineHeight: 1.5 }}>{faq.answer.length > 150 ? faq.answer.slice(0, 150) + '...' : faq.answer}</span>
                  </div>
                  {faq.category && faq.category !== 'general' && <span style={styles.categoryBadge}>{faq.category}</span>}
                </div>
                <div style={{ display: 'flex', gap: 4, marginLeft: 12 }}>
                  <IconBtn icon={faq.active ? Eye : EyeOff} onClick={() => toggleActive(faq.id, faq.active)} color={faq.active ? '#22C55E' : '#64748B'} />
                  <IconBtn icon={Edit2} onClick={() => setModal({ data: faq })} />
                  <IconBtn icon={Trash2} onClick={() => handleDelete(faq.id)} color="#EF4444" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && <FaqModal faq={modal.data} onClose={() => setModal(null)} onSaved={handleSaved} />}
    </div>
  )
}

function FaqModal({ faq, onClose, onSaved }) {
  const [form, setForm] = useState(faq || { question: '', answer: '', category: 'general', active: true })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.question || !form.answer) return
    setSaving(true)
    try {
      const payload = { question: form.question, answer: form.answer, category: form.category || 'general', active: form.active }
      if (form.id) {
        const { error: err } = await supabase.from('chatbot_faqs').update(payload).eq('id', form.id)
        if (err) throw err
      } else {
        const { error: err } = await supabase.from('chatbot_faqs').insert(payload)
        if (err) throw err
      }
      onSaved()
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }

  return (
    <div onClick={onClose} style={styles.overlay}>
      <div onClick={e => e.stopPropagation()} style={styles.modal}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 13, fontWeight: 700, color: '#F1F5F9', letterSpacing: '0.06em', margin: 0 }}>{form.id ? 'Edit' : 'Add'} FAQ</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={styles.label}>Question *</label>
            <input value={form.question} onChange={e => setForm(p => ({ ...p, question: e.target.value }))} placeholder="What services do you offer?" style={styles.input} required />
          </div>
          <div>
            <label style={styles.label}>Answer *</label>
            <textarea value={form.answer} onChange={e => setForm(p => ({ ...p, answer: e.target.value }))} placeholder="We offer AI Automation, Social Media Marketing, and Website Development." rows={4} style={{ ...styles.input, resize: 'vertical', lineHeight: 1.6 }} required />
          </div>
          <div>
            <label style={styles.label}>Category</label>
            <input value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} placeholder="general" style={styles.input} />
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

function parseCsvLine(line) {
  const result = []; let current = ''; let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { inQuotes = !inQuotes }
    else if (c === ',' && !inQuotes) { result.push(current); current = '' }
    else { current += c }
  }
  result.push(current)
  return result
}

function IconBtn({ icon: Icon, onClick, color = '#64748B' }) {
  return <button onClick={onClick} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: 4, cursor: 'pointer', color }} onMouseEnter={e => { e.currentTarget.style.borderColor = color }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}><Icon size={13} /></button>
}

const styles = {
  pageTitle: { fontFamily: "'Orbitron', sans-serif", fontSize: 14, fontWeight: 700, color: '#F1F5F9', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 },
  addBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', background: 'linear-gradient(135deg, #00D4FF, #0099CC)', border: 'none', borderRadius: 9, color: '#020817', fontSize: 13, fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer' },
  iconBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, color: '#94A3B8', fontSize: 12, fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer' },
  card: { background: '#0F172A', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 16 },
  categoryBadge: { display: 'inline-block', fontSize: 10, fontWeight: 600, color: '#A78BFA', background: 'rgba(139,92,246,0.1)', padding: '2px 8px', borderRadius: 4, marginTop: 6, textTransform: 'capitalize' },
  emptyState: { background: '#0F172A', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 50, textAlign: 'center', color: '#475569', fontSize: 13 },
  errorBanner: { display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '12px 16px', color: '#FCA5A5', fontSize: 13 },
  overlay: { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(2,8,23,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modal: { background: '#0F172A', border: '1px solid rgba(0,212,255,0.15)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' },
  label: { display: 'block', fontSize: 11, fontWeight: 600, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 },
  input: { width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, padding: '10px 14px', color: '#F1F5F9', fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif", outline: 'none', boxSizing: 'border-box' },
  cancelBtn: { padding: '9px 18px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 9, color: '#94A3B8', fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer' },
  saveBtn: { padding: '9px 18px', background: 'linear-gradient(135deg, #00D4FF, #0099CC)', border: 'none', borderRadius: 9, color: '#020817', fontSize: 13, fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer' },
}

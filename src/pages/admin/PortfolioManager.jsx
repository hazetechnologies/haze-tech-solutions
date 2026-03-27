import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import {
  Plus, Edit2, Trash2, Eye, EyeOff, X, AlertCircle,
  Layers, RefreshCw, CheckCircle,
} from 'lucide-react'

// ─── constants ────────────────────────────────────────────────────────────────

const SERVICE_TAGS  = ['AI Automation', 'Social Media', 'Website Dev']
const ITEM_TYPES    = ['case_study', 'video']

const EMPTY_FORM = {
  title: '',
  client: '',
  industry: '',
  problem: '',
  result: '',
  service_tag: SERVICE_TAGS[0],
  type: 'case_study',
  youtube_url: '',
  display_order: 0,
  published: false,
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const badgeBase = {
  display: 'inline-block',
  padding: '3px 10px',
  borderRadius: '20px',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'capitalize',
  whiteSpace: 'nowrap',
}

function typeBadge(type) {
  if (type === 'video') return { ...badgeBase, background: 'rgba(139,92,246,0.15)', color: '#A78BFA', border: '1px solid rgba(139,92,246,0.3)' }
  return { ...badgeBase, background: 'rgba(0,212,255,0.12)', color: '#00D4FF', border: '1px solid rgba(0,212,255,0.25)' }
}

// ─── FormModal ────────────────────────────────────────────────────────────────

function FormModal({ item, onClose, onSaved }) {
  const isEdit = Boolean(item?.id)
  const [form, setForm]     = useState(isEdit ? { ...item } : { ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!form.title.trim())   { setError('Title is required.'); return }
    if (!form.client.trim())  { setError('Client name is required.'); return }

    setSaving(true)
    try {
      const payload = {
        title:         form.title.trim(),
        client:        form.client.trim(),
        industry:      form.industry.trim(),
        problem:       form.problem.trim(),
        result:        form.result.trim(),
        service_tag:   form.service_tag,
        type:          form.type,
        youtube_url:   form.type === 'video' ? form.youtube_url.trim() : null,
        display_order: Number(form.display_order) || 0,
        published:     Boolean(form.published),
      }

      let result
      if (isEdit) {
        result = await supabase.from('portfolio_items').update(payload).eq('id', item.id).select().single()
      } else {
        result = await supabase.from('portfolio_items').insert(payload).select().single()
      }

      if (result.error) throw result.error
      onSaved(result.data, isEdit)
    } catch (err) {
      console.error('Save error:', err)
      setError(err.message || 'Failed to save item.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={styles.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>{isEdit ? 'Edit Portfolio Item' : 'Add Portfolio Item'}</h3>
          <button onClick={onClose} style={styles.closeBtn} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div style={{ ...styles.errorBanner, margin: '0 0 16px' }}>
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formGrid}>
            {/* Title */}
            <div style={{ ...styles.field, gridColumn: '1 / -1' }}>
              <label style={styles.label}>Title *</label>
              <input
                value={form.title}
                onChange={e => set('title', e.target.value)}
                placeholder="e.g. 10x Lead Generation with AI"
                style={styles.input}
              />
            </div>

            {/* Client */}
            <div style={styles.field}>
              <label style={styles.label}>Client Name *</label>
              <input
                value={form.client}
                onChange={e => set('client', e.target.value)}
                placeholder="e.g. Acme Corp"
                style={styles.input}
              />
            </div>

            {/* Industry */}
            <div style={styles.field}>
              <label style={styles.label}>Industry</label>
              <input
                value={form.industry}
                onChange={e => set('industry', e.target.value)}
                placeholder="e.g. E-commerce"
                style={styles.input}
              />
            </div>

            {/* Problem */}
            <div style={{ ...styles.field, gridColumn: '1 / -1' }}>
              <label style={styles.label}>Problem</label>
              <textarea
                value={form.problem}
                onChange={e => set('problem', e.target.value)}
                rows={3}
                placeholder="Describe the client's problem…"
                style={styles.textarea}
              />
            </div>

            {/* Result */}
            <div style={{ ...styles.field, gridColumn: '1 / -1' }}>
              <label style={styles.label}>Result</label>
              <textarea
                value={form.result}
                onChange={e => set('result', e.target.value)}
                rows={3}
                placeholder="Describe the outcome achieved…"
                style={styles.textarea}
              />
            </div>

            {/* Service Tag */}
            <div style={styles.field}>
              <label style={styles.label}>Service Tag</label>
              <select
                value={form.service_tag}
                onChange={e => set('service_tag', e.target.value)}
                style={styles.select}
              >
                {SERVICE_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* Type */}
            <div style={styles.field}>
              <label style={styles.label}>Type</label>
              <select
                value={form.type}
                onChange={e => set('type', e.target.value)}
                style={styles.select}
              >
                {ITEM_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
              </select>
            </div>

            {/* YouTube URL — only when type=video */}
            {form.type === 'video' && (
              <div style={{ ...styles.field, gridColumn: '1 / -1' }}>
                <label style={styles.label}>YouTube URL</label>
                <input
                  value={form.youtube_url}
                  onChange={e => set('youtube_url', e.target.value)}
                  placeholder="https://youtube.com/watch?v=..."
                  style={styles.input}
                />
              </div>
            )}

            {/* Display Order */}
            <div style={styles.field}>
              <label style={styles.label}>Display Order</label>
              <input
                type="number"
                value={form.display_order}
                onChange={e => set('display_order', e.target.value)}
                min={0}
                style={styles.input}
              />
            </div>

            {/* Published toggle */}
            <div style={{ ...styles.field, justifyContent: 'flex-end', display: 'flex', alignItems: 'flex-end' }}>
              <label style={styles.toggleRow}>
                <span style={styles.label}>Published</span>
                <button
                  type="button"
                  onClick={() => set('published', !form.published)}
                  style={{
                    ...styles.toggle,
                    background: form.published ? 'rgba(0,212,255,0.2)' : 'rgba(255,255,255,0.07)',
                    border: form.published ? '1px solid rgba(0,212,255,0.4)' : '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  <span style={{
                    ...styles.toggleKnob,
                    transform: form.published ? 'translateX(20px)' : 'translateX(2px)',
                    background: form.published ? '#00D4FF' : '#334155',
                  }} />
                </button>
              </label>
            </div>
          </div>

          {/* Footer */}
          <div style={styles.modalFooter}>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>Cancel</button>
            <button type="submit" disabled={saving} style={styles.saveBtn}>
              {saving ? (
                <><span style={{ animation: 'spin 0.7s linear infinite', display: 'inline-block' }}>↻</span> Saving…</>
              ) : (
                <><CheckCircle size={15} /> {isEdit ? 'Save Changes' : 'Add Item'}</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── PortfolioCard ────────────────────────────────────────────────────────────

function PortfolioCard({ item, onEdit, onDelete, onTogglePublished }) {
  const [toggling, setToggling] = useState(false)

  async function handleToggle() {
    setToggling(true)
    try {
      const { error } = await supabase
        .from('portfolio_items')
        .update({ published: !item.published })
        .eq('id', item.id)
      if (error) throw error
      onTogglePublished(item.id, !item.published)
    } catch (err) {
      console.error('Toggle error:', err)
      alert('Failed to update: ' + (err.message || 'Unknown error'))
    } finally {
      setToggling(false)
    }
  }

  return (
    <div style={styles.card}>
      <div style={styles.cardTop}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={typeBadge(item.type)}>{item.type?.replace('_', ' ')}</span>
          {item.service_tag && (
            <span style={{ ...badgeBase, background: 'rgba(255,255,255,0.06)', color: '#64748B', border: '1px solid rgba(255,255,255,0.08)', fontSize: '10px' }}>
              {item.service_tag}
            </span>
          )}
        </div>
        <span style={{ fontSize: '11px', color: item.published ? '#4ADE80' : '#475569', fontWeight: 600 }}>
          {item.published ? '● Live' : '○ Draft'}
        </span>
      </div>

      <h4 style={styles.cardTitle}>{item.title || 'Untitled'}</h4>
      <p style={styles.cardClient}>{item.client || '—'}</p>

      {item.industry && (
        <p style={styles.cardMeta}>Industry: <span style={{ color: '#94A3B8' }}>{item.industry}</span></p>
      )}
      {item.result && (
        <p style={styles.cardResult}>{item.result.length > 100 ? item.result.slice(0, 100) + '…' : item.result}</p>
      )}

      <div style={styles.cardActions}>
        <button
          onClick={handleToggle}
          disabled={toggling}
          title={item.published ? 'Unpublish' : 'Publish'}
          style={styles.cardIconBtn}
          onMouseEnter={e => { e.currentTarget.style.borderColor = item.published ? 'rgba(234,179,8,0.4)' : 'rgba(0,212,255,0.4)'; e.currentTarget.style.color = item.published ? '#FACC15' : '#00D4FF' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#475569' }}
        >
          {item.published ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
        <button
          onClick={() => onEdit(item)}
          title="Edit"
          style={styles.cardIconBtn}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.4)'; e.currentTarget.style.color = '#A78BFA' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#475569' }}
        >
          <Edit2 size={15} />
        </button>
        <button
          onClick={() => onDelete(item)}
          title="Delete"
          style={styles.cardIconBtn}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)'; e.currentTarget.style.color = '#F87171' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#475569' }}
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  )
}

// ─── main component ───────────────────────────────────────────────────────────

export default function PortfolioManager() {
  const [items, setItems]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [modalItem, setModalItem]   = useState(null)   // null=closed, false=new, object=edit
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const fetchItems = useCallback(async () => {
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('portfolio_items')
        .select('*')
        .order('display_order', { ascending: true })
      if (err) throw err
      setItems(data ?? [])
    } catch (err) {
      console.error('Fetch error:', err)
      setError(err.message || 'Failed to load portfolio items')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  const handleRefresh = async () => {
    setRefreshing(true)
    setLoading(true)
    await fetchItems()
    setRefreshing(false)
  }

  function handleSaved(savedItem, isEdit) {
    if (isEdit) {
      setItems(prev => prev.map(i => i.id === savedItem.id ? savedItem : i))
    } else {
      setItems(prev => [...prev, savedItem])
    }
    setModalItem(null)
  }

  function handleTogglePublished(id, newVal) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, published: newVal } : i))
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const { error: err } = await supabase.from('portfolio_items').delete().eq('id', deleteTarget.id)
      if (err) throw err
      setItems(prev => prev.filter(i => i.id !== deleteTarget.id))
      setDeleteTarget(null)
    } catch (err) {
      console.error('Delete error:', err)
      alert('Failed to delete: ' + (err.message || 'Unknown error'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div style={styles.page}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin   { to{transform:rotate(360deg)} }
        .modal-input:focus, .modal-select:focus, .modal-textarea:focus {
          outline: none; border-color: rgba(0,212,255,0.5) !important;
          box-shadow: 0 0 0 3px rgba(0,212,255,0.08);
        }
      `}</style>

      {/* ── Header ── */}
      <div style={styles.topRow}>
        <div>
          <h2 style={styles.pageTitle}>Portfolio Manager</h2>
          <p style={styles.pageSub}>
            {!loading && <><span style={{ color: '#00D4FF', fontWeight: 600 }}>{items.length}</span> <span style={{ color: '#475569' }}>{items.length === 1 ? 'item' : 'items'}</span></>}
            {loading && <span style={{ color: '#475569' }}>Loading…</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            style={styles.iconBtn}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#00D4FF'; e.currentTarget.style.color = '#00D4FF' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#64748B' }}
          >
            <RefreshCw size={14} style={{ animation: refreshing ? 'spin 0.7s linear infinite' : 'none' }} />
            Refresh
          </button>
          <button
            onClick={() => setModalItem(false)}
            style={styles.primaryBtn}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 0 20px rgba(0,212,255,0.3)' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none' }}
          >
            <Plus size={16} />
            Add New
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={styles.errorBanner}>
          <AlertCircle size={15} />
          <span>{error}</span>
          <button onClick={handleRefresh} style={styles.retryBtn}>Retry</button>
        </div>
      )}

      {/* ── Grid ── */}
      {loading ? (
        <div style={styles.grid}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ ...styles.card, padding: '20px' }}>
              {[60, 100, 70, 120, 80].map((w, j) => (
                <div key={j} style={{ height: j === 1 ? '18px' : '12px', width: w + '%', background: 'rgba(255,255,255,0.06)', borderRadius: '6px', animation: 'pulse 1.5s ease-in-out infinite', marginBottom: '12px' }} />
              ))}
            </div>
          ))}
        </div>
      ) : !error && items.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}><Layers size={36} color="#334155" /></div>
          <p style={styles.emptyTitle}>No portfolio items yet</p>
          <p style={styles.emptySub}>Click "Add New" to create your first portfolio item.</p>
        </div>
      ) : (
        <div style={styles.grid}>
          {items.map(item => (
            <PortfolioCard
              key={item.id}
              item={item}
              onEdit={setModalItem}
              onDelete={setDeleteTarget}
              onTogglePublished={handleTogglePublished}
            />
          ))}
        </div>
      )}

      {/* ── Add/Edit Modal ── */}
      {modalItem !== null && (
        <FormModal
          item={modalItem || null}
          onClose={() => setModalItem(null)}
          onSaved={handleSaved}
        />
      )}

      {/* ── Delete confirmation ── */}
      {deleteTarget && (
        <div style={styles.overlay} onClick={e => { if (e.target === e.currentTarget) setDeleteTarget(null) }}>
          <div style={{ ...styles.modal, maxWidth: '420px' }}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Delete Item</h3>
              <button onClick={() => setDeleteTarget(null)} style={styles.closeBtn}><X size={18} /></button>
            </div>
            <p style={{ color: '#94A3B8', fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>
              Are you sure you want to delete <strong style={{ color: '#F1F5F9' }}>"{deleteTarget.title}"</strong>?
              This action cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setDeleteTarget(null)} style={styles.cancelBtn}>Cancel</button>
              <button onClick={confirmDelete} disabled={deleting} style={styles.deleteBtn}>
                {deleting ? 'Deleting…' : <><Trash2 size={14} /> Delete</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  },
  topRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '16px',
    flexWrap: 'wrap',
  },
  pageTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '14px',
    fontWeight: 700,
    color: '#F1F5F9',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    marginBottom: '4px',
  },
  pageSub: { fontSize: '13px', color: '#475569' },
  iconBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    padding: '9px 16px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '9px',
    color: '#64748B',
    fontSize: '13px',
    fontWeight: 500,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    cursor: 'pointer',
    transition: 'border-color 0.15s, color 0.15s',
  },
  primaryBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    padding: '9px 18px',
    background: 'linear-gradient(135deg, rgba(0,212,255,0.15), rgba(139,92,246,0.15))',
    border: '1px solid rgba(0,212,255,0.35)',
    borderRadius: '9px',
    color: '#00D4FF',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    cursor: 'pointer',
    transition: 'box-shadow 0.2s',
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.25)',
    borderRadius: '10px',
    padding: '12px 16px',
    color: '#FCA5A5',
    fontSize: '13px',
  },
  retryBtn: {
    marginLeft: 'auto',
    padding: '4px 12px',
    background: 'rgba(239,68,68,0.2)',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: '6px',
    color: '#FCA5A5',
    fontSize: '12px',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    cursor: 'pointer',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '16px',
  },
  card: {
    background: '#0F172A',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '14px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
    transition: 'border-color 0.2s',
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
  },
  cardTitle: {
    fontSize: '15px',
    fontWeight: 700,
    color: '#F1F5F9',
    lineHeight: 1.4,
    margin: 0,
  },
  cardClient: {
    fontSize: '12px',
    color: '#64748B',
    margin: 0,
    fontWeight: 500,
  },
  cardMeta: {
    fontSize: '12px',
    color: '#475569',
    margin: 0,
  },
  cardResult: {
    fontSize: '12px',
    color: '#64748B',
    lineHeight: 1.5,
    margin: 0,
    flex: 1,
  },
  cardActions: {
    display: 'flex',
    gap: '8px',
    marginTop: '4px',
    paddingTop: '12px',
    borderTop: '1px solid rgba(255,255,255,0.05)',
  },
  cardIconBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '34px',
    height: '34px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px',
    color: '#475569',
    cursor: 'pointer',
    transition: 'border-color 0.15s, color 0.15s',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    padding: '80px 20px',
    textAlign: 'center',
  },
  emptyIcon: {
    width: '72px',
    height: '72px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '6px',
  },
  emptyTitle: { fontSize: '15px', fontWeight: 600, color: '#475569' },
  emptySub:   { fontSize: '13px', color: '#334155', maxWidth: '280px' },
  // Modal
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(2,8,23,0.8)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: '20px',
  },
  modal: {
    background: '#0F172A',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '18px',
    padding: '28px',
    width: '100%',
    maxWidth: '640px',
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '24px',
  },
  modalTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '13px',
    fontWeight: 700,
    color: '#F1F5F9',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    margin: 0,
  },
  closeBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px',
    color: '#64748B',
    cursor: 'pointer',
    transition: 'color 0.15s',
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'rgba(239,68,68,0.1)',
    border: '1px solid rgba(239,68,68,0.25)',
    borderRadius: '8px',
    padding: '10px 14px',
    color: '#FCA5A5',
    fontSize: '13px',
  },
  form: { display: 'flex', flexDirection: 'column', gap: '20px' },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  field: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#64748B',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  input: {
    padding: '10px 12px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '9px',
    color: '#F1F5F9',
    fontSize: '13px',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    transition: 'border-color 0.15s',
    outline: 'none',
  },
  textarea: {
    padding: '10px 12px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '9px',
    color: '#F1F5F9',
    fontSize: '13px',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    resize: 'vertical',
    lineHeight: 1.6,
    transition: 'border-color 0.15s',
    outline: 'none',
  },
  select: {
    padding: '10px 12px',
    background: '#0A1628',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '9px',
    color: '#F1F5F9',
    fontSize: '13px',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    cursor: 'pointer',
    outline: 'none',
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    cursor: 'pointer',
  },
  toggle: {
    position: 'relative',
    width: '44px',
    height: '24px',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'background 0.2s, border-color 0.2s',
    flexShrink: 0,
  },
  toggleKnob: {
    position: 'absolute',
    top: '3px',
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    transition: 'transform 0.2s, background 0.2s',
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    paddingTop: '8px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
  },
  cancelBtn: {
    padding: '10px 20px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '9px',
    color: '#64748B',
    fontSize: '13px',
    fontWeight: 500,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    cursor: 'pointer',
  },
  saveBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 22px',
    background: 'linear-gradient(135deg, rgba(0,212,255,0.2), rgba(139,92,246,0.2))',
    border: '1px solid rgba(0,212,255,0.4)',
    borderRadius: '9px',
    color: '#00D4FF',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    cursor: 'pointer',
    transition: 'box-shadow 0.2s',
  },
  deleteBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 22px',
    background: 'rgba(239,68,68,0.15)',
    border: '1px solid rgba(239,68,68,0.35)',
    borderRadius: '9px',
    color: '#F87171',
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    cursor: 'pointer',
  },
}

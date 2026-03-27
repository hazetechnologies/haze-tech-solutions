import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import {
  Package, Plus, X, Edit2, Trash2, RefreshCw, AlertCircle,
  Eye, EyeOff, DollarSign, Clock,
} from 'lucide-react'

export default function ProductsManager() {
  const [products, setProducts]   = useState([])
  const [plans, setPlans]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [modal, setModal]         = useState(null) // { type: 'product'|'plan', data? }

  const fetchAll = useCallback(async () => {
    setError(null)
    try {
      const [pRes, sRes] = await Promise.all([
        supabase.from('products').select('*').order('display_order'),
        supabase.from('subscription_plans').select('*').order('display_order'),
      ])
      if (pRes.error) throw pRes.error
      if (sRes.error) throw sRes.error
      setProducts(pRes.data ?? [])
      setPlans(sRes.data ?? [])
    } catch (err) {
      setError(err.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleSaved = () => { setModal(null); setLoading(true); fetchAll() }

  const handleDelete = async (table, id) => {
    if (!confirm('Delete this item?')) return
    await supabase.from(table).delete().eq('id', id)
    handleSaved()
  }

  const toggleActive = async (table, id, current) => {
    await supabase.from(table).update({ active: !current }).eq('id', id)
    if (table === 'products') setProducts(prev => prev.map(p => p.id === id ? { ...p, active: !current } : p))
    else setPlans(prev => prev.map(p => p.id === id ? { ...p, active: !current } : p))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>

      {error && (
        <div style={styles.errorBanner}><AlertCircle size={15} /> {error}</div>
      )}

      {/* ── Products Section ── */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <h2 style={styles.sectionTitle}><Package size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />Products & Services</h2>
            <p style={{ fontSize: '12px', color: '#475569', margin: 0 }}>Services you offer to clients</p>
          </div>
          <button onClick={() => setModal({ type: 'product' })} style={styles.addBtn}><Plus size={14} /> Add Product</button>
        </div>

        {loading ? <Skeleton count={3} /> : products.length === 0 ? (
          <Empty text="No products yet. Add your first service offering." />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
            {products.map(p => (
              <div key={p.id} style={{ ...styles.card, opacity: p.active ? 1 : 0.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#F1F5F9', margin: 0 }}>{p.name}</h3>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <IconBtn icon={p.active ? Eye : EyeOff} onClick={() => toggleActive('products', p.id, p.active)} color={p.active ? '#22C55E' : '#64748B'} />
                    <IconBtn icon={Edit2} onClick={() => setModal({ type: 'product', data: p })} />
                    <IconBtn icon={Trash2} onClick={() => handleDelete('products', p.id)} color="#EF4444" />
                  </div>
                </div>
                {p.description && <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 8px', lineHeight: 1.5 }}>{p.description}</p>}
                {p.base_price && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <DollarSign size={13} color="#00D4FF" />
                    <span style={{ fontSize: '16px', fontWeight: 700, color: '#00D4FF', fontFamily: "'Orbitron', sans-serif" }}>{Number(p.base_price).toLocaleString()}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Subscription Plans Section ── */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <div>
            <h2 style={styles.sectionTitle}><Clock size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />Subscription Plans</h2>
            <p style={{ fontSize: '12px', color: '#475569', margin: 0 }}>Billing cycles and contract terms</p>
          </div>
          <button onClick={() => setModal({ type: 'plan' })} style={styles.addBtn}><Plus size={14} /> Add Plan</button>
        </div>

        {loading ? <Skeleton count={3} /> : plans.length === 0 ? (
          <Empty text="No plans yet. Add your billing options." />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '14px' }}>
            {plans.map(p => (
              <div key={p.id} style={{ ...styles.card, opacity: p.active ? 1 : 0.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#F1F5F9', margin: 0 }}>{p.name}</h3>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <IconBtn icon={p.active ? Eye : EyeOff} onClick={() => toggleActive('subscription_plans', p.id, p.active)} color={p.active ? '#22C55E' : '#64748B'} />
                    <IconBtn icon={Edit2} onClick={() => setModal({ type: 'plan', data: p })} />
                    <IconBtn icon={Trash2} onClick={() => handleDelete('subscription_plans', p.id)} color="#EF4444" />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={styles.tag}>{p.billing_cycle}</span>
                  {p.duration_months && <span style={styles.tagMuted}>{p.duration_months} mo</span>}
                  {p.discount_percent > 0 && <span style={{ ...styles.tag, color: '#4ADE80', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}>{p.discount_percent}% off</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {modal && modal.type === 'product' && (
        <FormModal title={modal.data ? 'Edit Product' : 'Add Product'} onClose={() => setModal(null)} onSaved={handleSaved}
          fields={[
            { key: 'name', label: 'Name *', required: true, placeholder: 'e.g. Social Media Management' },
            { key: 'description', label: 'Description', type: 'textarea', placeholder: 'What this service includes...' },
            { key: 'base_price', label: 'Base Price ($)', type: 'number', placeholder: '1500.00' },
            { key: 'display_order', label: 'Display Order', type: 'number' },
            { key: 'active', label: 'Active', type: 'toggle' },
          ]}
          initial={modal.data || { active: true, display_order: 0 }}
          table="products"
        />
      )}
      {modal && modal.type === 'plan' && (
        <FormModal title={modal.data ? 'Edit Plan' : 'Add Plan'} onClose={() => setModal(null)} onSaved={handleSaved}
          fields={[
            { key: 'name', label: 'Name *', required: true, placeholder: 'e.g. Monthly' },
            { key: 'billing_cycle', label: 'Billing Cycle', type: 'select', options: ['monthly', 'quarterly', 'semi-annual', 'annual', 'one-time'] },
            { key: 'duration_months', label: 'Duration (months)', type: 'number', placeholder: 'e.g. 6 (leave empty for one-time)' },
            { key: 'discount_percent', label: 'Discount %', type: 'number', placeholder: '0' },
            { key: 'display_order', label: 'Display Order', type: 'number' },
            { key: 'active', label: 'Active', type: 'toggle' },
          ]}
          initial={modal.data || { active: true, billing_cycle: 'monthly', discount_percent: 0, display_order: 0 }}
          table="subscription_plans"
        />
      )}
    </div>
  )
}

// ─── Shared components ──────────────────────────────────────

function IconBtn({ icon: Icon, onClick, color = '#64748B' }) {
  return (
    <button onClick={onClick}
      style={{ background: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '4px', cursor: 'pointer', color, transition: 'border-color 0.15s' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = color }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
    >
      <Icon size={13} />
    </button>
  )
}

function Skeleton({ count }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ height: 100, background: 'rgba(255,255,255,0.04)', borderRadius: '14px', animation: 'pulse 1.5s ease-in-out infinite' }} />
      ))}
    </div>
  )
}

function Empty({ text }) {
  return (
    <div style={{ background: '#0F172A', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', padding: '40px', textAlign: 'center' }}>
      <p style={{ color: '#475569', fontSize: '13px', margin: 0 }}>{text}</p>
    </div>
  )
}

function FormModal({ title, onClose, onSaved, fields, initial, table }) {
  const [form, setForm] = useState({ ...initial })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const payload = {}
    fields.forEach(f => {
      let val = form[f.key]
      if (f.type === 'toggle') { payload[f.key] = !!val; return }
      if (val === '' || val === undefined) val = null
      if (f.type === 'number' && val !== null) val = Number(val)
      payload[f.key] = val
    })

    try {
      let result
      if (form.id) {
        result = await supabase.from(table).update(payload).eq('id', form.id).select().single()
      } else {
        result = await supabase.from(table).insert(payload).select().single()
      }
      if (result.error) throw result.error
      onSaved()
    } catch (err) {
      setError(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div onClick={onClose} style={styles.overlay}>
      <div onClick={e => e.stopPropagation()} style={styles.modal}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '13px', fontWeight: 700, color: '#F1F5F9', letterSpacing: '0.06em', margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '18px' }}>
            {fields.map(f => (
              <div key={f.key}>
                <label style={styles.fieldLabel}>{f.label}</label>
                {f.type === 'textarea' ? (
                  <textarea value={form[f.key] || ''} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder} rows={3} style={{ ...styles.fieldInput, resize: 'vertical' }} />
                ) : f.type === 'select' ? (
                  <select value={form[f.key] || ''} onChange={e => set(f.key, e.target.value)} style={{ ...styles.fieldInput, cursor: 'pointer' }}>
                    {f.options.map(o => <option key={o} value={o}>{o.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
                  </select>
                ) : f.type === 'toggle' ? (
                  <button type="button" onClick={() => set(f.key, !form[f.key])}
                    style={{ width: 44, height: 24, borderRadius: 12, border: 'none', background: form[f.key] ? 'rgba(0,212,255,0.4)' : 'rgba(255,255,255,0.1)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: form[f.key] ? '#00D4FF' : '#475569', position: 'absolute', top: 3, left: form[f.key] ? 23 : 3, transition: 'left 0.2s, background 0.2s' }} />
                  </button>
                ) : (
                  <input type={f.type || 'text'} value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder} style={styles.fieldInput} />
                )}
              </div>
            ))}
          </div>

          {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '10px', color: '#FCA5A5', fontSize: '12px', marginBottom: '14px' }}>{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>Cancel</button>
            <button type="submit" disabled={saving} style={{ ...styles.saveBtn, opacity: saving ? 0.5 : 1 }}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const styles = {
  sectionTitle: { fontFamily: "'Orbitron', sans-serif", fontSize: '13px', fontWeight: 700, color: '#F1F5F9', letterSpacing: '0.06em', textTransform: 'uppercase', margin: '0 0 2px' },
  addBtn: { display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 16px', background: 'linear-gradient(135deg, #00D4FF, #0099CC)', border: 'none', borderRadius: '8px', color: '#020817', fontSize: '12px', fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer' },
  card: { background: '#0F172A', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', padding: '18px', transition: 'opacity 0.2s' },
  tag: { fontSize: '10px', fontWeight: 600, color: '#00D4FF', background: 'rgba(0,212,255,0.1)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(0,212,255,0.2)', textTransform: 'capitalize' },
  tagMuted: { fontSize: '10px', fontWeight: 600, color: '#64748B', background: 'rgba(255,255,255,0.04)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.08)' },
  errorBanner: { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '10px', padding: '14px', color: '#FCA5A5', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' },
  overlay: { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(2,8,23,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' },
  modal: { background: '#0F172A', border: '1px solid rgba(0,212,255,0.15)', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' },
  fieldLabel: { display: 'block', fontSize: '11px', fontWeight: 600, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px' },
  fieldInput: { width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '9px', padding: '10px 14px', color: '#F1F5F9', fontSize: '13px', fontFamily: "'Plus Jakarta Sans', sans-serif", outline: 'none', boxSizing: 'border-box' },
  cancelBtn: { padding: '9px 18px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '9px', color: '#94A3B8', fontSize: '13px', fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer' },
  saveBtn: { padding: '9px 18px', background: 'linear-gradient(135deg, #00D4FF, #0099CC)', border: 'none', borderRadius: '9px', color: '#020817', fontSize: '13px', fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer' },
}

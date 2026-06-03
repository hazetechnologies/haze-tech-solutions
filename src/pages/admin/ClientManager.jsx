import { useEffect, useMemo, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { effectivePrice } from '../../lib/pricing'
import {
  Users, Plus, X, RefreshCw, AlertCircle, ChevronRight,
  Mail, Phone, Edit2, Trash2,
} from 'lucide-react'

export default function ClientManager() {
  const [clients, setClients]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [editClient, setEditClient] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchClients = useCallback(async () => {
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('clients')
        .select('*, projects(id, status)')
        .order('created_at', { ascending: false })
      if (err) throw err
      setClients(data ?? [])
    } catch (err) {
      setError(err.message || 'Failed to load clients')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchClients() }, [fetchClients])

  const handleRefresh = async () => {
    setRefreshing(true)
    setLoading(true)
    await fetchClients()
    setRefreshing(false)
  }

  const handleCreated = (newClient) => {
    setClients(prev => [{ ...newClient, projects: [] }, ...prev])
    setShowModal(false)
  }

  const handleUpdated = (updated) => {
    setClients(prev => prev.map(c => (c.id === updated.id ? { ...c, ...updated } : c)))
    setEditClient(null)
  }

  const handleDelete = async (c) => {
    if (!window.confirm(`Delete ${c.name}? This permanently removes their account, projects, brand kit, invoices, and notifications. This cannot be undone.`)) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/client?action=delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ id: c.id }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.message || j.error || 'Delete failed')
      setClients(prev => prev.filter(x => x.id !== c.id))
    } catch (e) {
      alert('Delete failed: ' + e.message)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin { to{transform:rotate(360deg)} }
      `}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={styles.pageTitle}>Clients</h2>
          <p style={{ fontSize: '13px', color: '#475569' }}>
            {!loading && <><span style={{ color: '#00D4FF', fontWeight: 600 }}>{clients.length}</span> {clients.length === 1 ? 'client' : 'clients'}</>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => setShowModal(true)} style={styles.primaryBtn}>
            <Plus size={15} /> Add Client
          </button>
          <button onClick={handleRefresh} disabled={refreshing} style={styles.iconBtn}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#00D4FF' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
          >
            <RefreshCw size={14} style={{ animation: refreshing ? 'spin 0.7s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '10px', padding: '14px', color: '#FCA5A5', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: 160, background: 'rgba(255,255,255,0.04)', borderRadius: '14px', animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      ) : clients.length === 0 ? (
        <div style={{ background: '#0F172A', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', padding: '60px', textAlign: 'center' }}>
          <Users size={36} color="#334155" />
          <p style={{ color: '#475569', fontSize: '14px', marginTop: '12px' }}>No clients yet. Click "Add Client" to onboard your first client.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {clients.map(c => {
            const activeProjects = (c.projects || []).filter(p => p.status !== 'completed').length
            const totalProjects = (c.projects || []).length
            return (
              <Link key={c.id} to={`/admin/clients/${c.id}`} style={{ textDecoration: 'none' }}>
                <div style={styles.clientCard}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(0,212,255,0.25)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                    <div style={styles.avatar}>{(c.name || 'C')[0].toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '15px', fontWeight: 600, color: '#F1F5F9' }}>{c.name}</div>
                      {c.company && <div style={{ fontSize: '12px', color: '#64748B' }}>{c.company}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button title="Edit" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditClient(c) }} style={styles.cardActionBtn}><Edit2 size={13} /></button>
                      <button title="Delete" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(c) }} style={{ ...styles.cardActionBtn, color: '#F87171' }}><Trash2 size={13} /></button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: '#64748B', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Mail size={12} /> {c.email}</div>
                    {c.phone && <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Phone size={12} /> {c.phone}</div>}
                    {c.product && <div style={{ marginTop: '4px' }}><span style={{ fontSize: '10px', fontWeight: 600, color: '#00D4FF', background: 'rgba(0,212,255,0.1)', padding: '2px 8px', borderRadius: '4px' }}>{c.product}</span>
                    {c.price && <span style={{ marginLeft: '6px', fontSize: '11px', color: '#F1F5F9', fontWeight: 600 }}>${Number(c.price).toLocaleString()}</span>}
                    {c.subscription_terms && <span style={{ marginLeft: '6px', fontSize: '10px', color: '#475569' }}>({c.subscription_terms})</span>}
                    </div>}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: '#475569' }}>
                      <span style={{ color: '#00D4FF', fontWeight: 600 }}>{activeProjects}</span> active / {totalProjects} total projects
                    </span>
                    <span style={{ fontSize: '11px', color: '#00D4FF', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      Manage <ChevronRight size={11} />
                    </span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {showModal && <ClientModal onClose={() => setShowModal(false)} onSaved={handleCreated} />}
      {editClient && <ClientModal client={editClient} onClose={() => setEditClient(null)} onSaved={handleUpdated} />}
    </div>
  )
}

function ClientModal({ client, onClose, onSaved }) {
  const isEdit = !!client
  const [form, setForm] = useState(() => client
    ? { name: client.name || '', email: client.email || '', password: '', company: client.company || '', phone: client.phone || '', product_id: client.product_id || '', subscription_plan_id: client.subscription_plan_id || '', price: client.price ?? '' }
    : { name: '', email: '', password: '', company: '', phone: '', product_id: '', subscription_plan_id: '', price: '' })
  const [products, setProducts] = useState([])
  const [plans, setPlans]       = useState([])
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState(null)

  useEffect(() => {
    Promise.all([
      supabase.from('products').select('*').eq('active', true).order('display_order'),
      supabase.from('subscription_plans').select('*').eq('active', true).order('display_order'),
    ]).then(([pRes, sRes]) => {
      setProducts(pRes.data ?? [])
      setPlans(sRes.data ?? [])
    })
  }, [])

  const selectedProduct = products.find(p => p.id === form.product_id)
  const selectedPlan    = plans.find(p => p.id === form.subscription_plan_id)

  // Plan dropdown is scoped to the selected product:
  //   - product chosen + dedicated plans exist → show only dedicated plans
  //   - otherwise → show legacy global plans (product_id = null)
  // Mirrors ConvertLeadModal so the two onboarding paths can't disagree.
  const availablePlans = useMemo(() => {
    if (!form.product_id) return plans.filter(p => !p.product_id)
    const dedicated = plans.filter(p => p.product_id === form.product_id)
    return dedicated.length > 0 ? dedicated : plans.filter(p => !p.product_id)
  }, [plans, form.product_id])

  // If selected plan disappears from the visible set after a product switch, clear it.
  useEffect(() => {
    if (form.subscription_plan_id && !availablePlans.find(p => p.id === form.subscription_plan_id)) {
      setForm(prev => ({ ...prev, subscription_plan_id: '' }))
    }
  }, [availablePlans, form.subscription_plan_id])

  const handleProductChange = (productId) => {
    const prod = products.find(p => p.id === productId)
    const newPrice = prod ? effectivePrice(selectedPlan, prod).toFixed(2) : ''
    setForm(prev => ({ ...prev, product_id: productId, price: newPrice }))
  }

  const handlePlanChange = (planId) => {
    const plan = plans.find(p => p.id === planId)
    const newPrice = selectedProduct ? effectivePrice(plan, selectedProduct).toFixed(2) : form.price
    setForm(prev => ({ ...prev, subscription_plan_id: planId, price: newPrice }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name || !form.email || (!isEdit && !form.password)) return
    setSaving(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const url = isEdit ? '/api/client?action=update' : '/api/create-client'
      const body = isEdit
        ? { id: client.id, name: form.name, company: form.company, phone: form.phone, product_id: form.product_id, subscription_plan_id: form.subscription_plan_id, price: form.price }
        : form
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.message || result.error || (isEdit ? 'Failed to update client' : 'Failed to create client'))
      onSaved(result.client)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))
  const selectStyle = { width: '100%', background: '#0F172A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '9px', padding: '10px 14px', color: '#F1F5F9', fontSize: '14px', fontFamily: "'Plus Jakarta Sans', sans-serif", outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }

  return (
    <div onClick={onClose} style={styles.overlay}>
      <div onClick={e => e.stopPropagation()} style={styles.modal}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h3 style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '14px', fontWeight: 700, color: '#F1F5F9', letterSpacing: '0.06em', margin: 0 }}>{isEdit ? 'Edit Client' : 'Add New Client'}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
            <Field label="Full Name *" value={form.name} onChange={v => set('name', v)} placeholder="John Smith" />
            <Field label="Email *" value={form.email} onChange={v => set('email', v)} placeholder="john@company.com" type="email" disabled={isEdit} />
            {!isEdit && <Field label="Password *" value={form.password} onChange={v => set('password', v)} placeholder="Temporary password" type="password" />}
            <Field label="Company" value={form.company} onChange={v => set('company', v)} placeholder="Acme Corp" />
            <Field label="Phone" value={form.phone} onChange={v => set('phone', v)} placeholder="+1 (555) 000-0000" />

            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px' }}>Product / Service</label>
              <select value={form.product_id} onChange={e => handleProductChange(e.target.value)} style={selectStyle}>
                <option value="">-- Select a product --</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name}{p.base_price ? ` — $${Number(p.base_price).toLocaleString()}` : ''}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px' }}>Subscription Plan</label>
              <select value={form.subscription_plan_id} onChange={e => handlePlanChange(e.target.value)} style={selectStyle}>
                <option value="">-- Select a plan --</option>
                {availablePlans.map(p => (
                  <option key={p.id} value={p.id}>{p.name}{p.discount_percent > 0 ? ` (${p.discount_percent}% off)` : ''}</option>
                ))}
              </select>
            </div>

            <Field label="Price ($)" value={form.price} onChange={v => set('price', v)} placeholder="Auto-filled from product × plan" type="number" />
          </div>

          {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '10px', color: '#FCA5A5', fontSize: '12px', marginBottom: '16px' }}>{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>Cancel</button>
            <button type="submit" disabled={saving || !form.name || !form.email || (!isEdit && !form.password)}
              style={{ ...styles.saveBtn, opacity: saving || !form.name || !form.email || (!isEdit && !form.password) ? 0.5 : 1 }}>
              {saving ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save Changes' : 'Create Client')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text', disabled = false }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px' }}>{label}</label>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled}
        style={{ width: '100%', background: disabled ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '9px', padding: '10px 14px', color: disabled ? '#64748B' : '#F1F5F9', fontSize: '14px', fontFamily: "'Plus Jakarta Sans', sans-serif", outline: 'none', boxSizing: 'border-box', cursor: disabled ? 'not-allowed' : 'text' }}
      />
    </div>
  )
}

const styles = {
  pageTitle: { fontFamily: "'Orbitron', sans-serif", fontSize: '14px', fontWeight: 700, color: '#F1F5F9', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '4px' },
  primaryBtn: { display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 18px', background: 'linear-gradient(135deg, #00D4FF, #0099CC)', border: 'none', borderRadius: '9px', color: '#020817', fontSize: '13px', fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer' },
  iconBtn: { display: 'flex', alignItems: 'center', padding: '9px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '9px', color: '#64748B', cursor: 'pointer', transition: 'border-color 0.15s' },
  clientCard: { background: '#0F172A', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', padding: '20px', transition: 'border-color 0.15s', cursor: 'pointer' },
  avatar: { width: 40, height: 40, borderRadius: '50%', background: 'rgba(0,212,255,0.15)', border: '1px solid rgba(0,212,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 700, color: '#00D4FF' },
  cardActionBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 7, color: '#94A3B8', cursor: 'pointer' },
  overlay: { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(2,8,23,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' },
  modal: { background: '#0F172A', border: '1px solid rgba(0,212,255,0.15)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '480px', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' },
  cancelBtn: { padding: '9px 18px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '9px', color: '#94A3B8', fontSize: '13px', fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer' },
  saveBtn: { padding: '9px 18px', background: 'linear-gradient(135deg, #00D4FF, #0099CC)', border: 'none', borderRadius: '9px', color: '#020817', fontSize: '13px', fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer' },
}

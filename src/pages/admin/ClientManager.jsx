import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import {
  Users, Plus, X, RefreshCw, AlertCircle, ChevronRight,
  Mail, Phone,
} from 'lucide-react'

export default function ClientManager() {
  const [clients, setClients]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [showModal, setShowModal] = useState(false)
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
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 600, color: '#F1F5F9' }}>{c.name}</div>
                      {c.company && <div style={{ fontSize: '12px', color: '#64748B' }}>{c.company}</div>}
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

      {showModal && <AddClientModal onClose={() => setShowModal(false)} onCreated={handleCreated} />}
    </div>
  )
}

function AddClientModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', company: '', phone: '', product: '', price: '', subscription_terms: '' })
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

  const handleProductChange = (productName) => {
    const prod = products.find(p => p.name === productName)
    setForm(prev => ({
      ...prev,
      product: productName,
      price: prod?.base_price ? String(prod.base_price) : prev.price,
    }))
  }

  const handlePlanChange = (planName) => {
    const plan = plans.find(p => p.name === planName)
    if (plan && plan.discount_percent > 0 && form.price) {
      const discounted = Number(form.price) * (1 - plan.discount_percent / 100)
      setForm(prev => ({ ...prev, subscription_terms: planName, price: String(discounted.toFixed(2)) }))
    } else {
      setForm(prev => ({ ...prev, subscription_terms: planName }))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name || !form.email || !form.password) return
    setSaving(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/create-client', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(form),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Failed to create client')
      onCreated(result.client)
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
          <h3 style={{ fontFamily: "'Orbitron', sans-serif", fontSize: '14px', fontWeight: 700, color: '#F1F5F9', letterSpacing: '0.06em', margin: 0 }}>Add New Client</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
            <Field label="Full Name *" value={form.name} onChange={v => set('name', v)} placeholder="John Smith" />
            <Field label="Email *" value={form.email} onChange={v => set('email', v)} placeholder="john@company.com" type="email" />
            <Field label="Password *" value={form.password} onChange={v => set('password', v)} placeholder="Temporary password" type="password" />
            <Field label="Company" value={form.company} onChange={v => set('company', v)} placeholder="Acme Corp" />
            <Field label="Phone" value={form.phone} onChange={v => set('phone', v)} placeholder="+1 (555) 000-0000" />

            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px' }}>Product / Service</label>
              <select value={form.product} onChange={e => handleProductChange(e.target.value)} style={selectStyle}>
                <option value="">-- Select a product --</option>
                {products.map(p => (
                  <option key={p.id} value={p.name}>{p.name}{p.base_price ? ` — $${Number(p.base_price).toLocaleString()}` : ''}</option>
                ))}
              </select>
            </div>

            <Field label="Price ($)" value={form.price} onChange={v => set('price', v)} placeholder="Auto-filled from product" type="number" />

            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px' }}>Subscription Plan</label>
              <select value={form.subscription_terms} onChange={e => handlePlanChange(e.target.value)} style={selectStyle}>
                <option value="">-- Select a plan --</option>
                {plans.map(p => (
                  <option key={p.id} value={p.name}>{p.name}{p.discount_percent > 0 ? ` (${p.discount_percent}% off)` : ''}</option>
                ))}
              </select>
            </div>
          </div>

          {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '10px', color: '#FCA5A5', fontSize: '12px', marginBottom: '16px' }}>{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>Cancel</button>
            <button type="submit" disabled={saving || !form.name || !form.email || !form.password}
              style={{ ...styles.saveBtn, opacity: saving || !form.name || !form.email || !form.password ? 0.5 : 1 }}>
              {saving ? 'Creating...' : 'Create Client'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#94A3B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '6px' }}>{label}</label>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '9px', padding: '10px 14px', color: '#F1F5F9', fontSize: '14px', fontFamily: "'Plus Jakarta Sans', sans-serif", outline: 'none', boxSizing: 'border-box' }}
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
  overlay: { position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(2,8,23,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' },
  modal: { background: '#0F172A', border: '1px solid rgba(0,212,255,0.15)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '480px', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' },
  cancelBtn: { padding: '9px 18px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '9px', color: '#94A3B8', fontSize: '13px', fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer' },
  saveBtn: { padding: '9px 18px', background: 'linear-gradient(135deg, #00D4FF, #0099CC)', border: 'none', borderRadius: '9px', color: '#020817', fontSize: '13px', fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer' },
}

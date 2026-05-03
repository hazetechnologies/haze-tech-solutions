import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { trackEvent } from '../../../lib/telemetry'
import { X, Send, Link2, CheckCircle2, AlertCircle } from 'lucide-react'

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(0,212,255,0.15)',
  borderRadius: 8, padding: '9px 11px',
  color: '#F1F5F9', fontFamily: "'Plus Jakarta Sans', sans-serif",
  fontSize: 13, outline: 'none',
}

const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 600, color: '#94A3B8',
  letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 5,
}

export default function ConvertLeadModal({ lead, onClose, onConverted }) {
  // sub-state: 'form' | 'collision' | 'success'
  const [view, setView] = useState('form')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // form fields — name and company prefilled, email locked
  // Parent (Leads.jsx) only mounts this when a lead is selected, so
  // `lead` is always non-null on first render.
  const [form, setForm] = useState({
    name: lead?.name || '',
    company: lead?.business_name || '',
    phone: '',
    product: '',
    price: '',
    subscription_terms: '',
  })

  // collision state
  const [collision, setCollision] = useState(null)  // { existing_client_id, existing_client_name }

  // success state
  const [result, setResult] = useState(null)  // { client_id, mode }

  if (!lead) return null

  const setField = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  async function postConvert(payload) {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/convert-lead', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify(payload),
    })
    // Tolerate non-JSON 5xx responses (Vercel HTML error pages, gateway errors).
    const text = await res.text()
    let data = {}
    try { data = text ? JSON.parse(text) : {} } catch { /* leave empty */ }
    if (!data.message && !res.ok) data.message = `Server error (${res.status})`
    return { res, data }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!form.name.trim()) { setError('Name is required'); return }

    setSubmitting(true)
    const startedAt = Date.now()
    trackEvent('lead_convert_started', { lead_id: lead.id, lead_source: lead.source || 'contact' })

    try {
      const { res, data } = await postConvert({
        lead_id: lead.id,
        name: form.name,
        company: form.company || null,
        phone: form.phone || null,
        product: form.product || null,
        price: form.price || null,
        subscription_terms: form.subscription_terms || null,
      })

      if (res.status === 409 && data.error === 'client_exists') {
        setCollision({
          existing_client_id: data.existing_client_id,
          existing_client_name: data.existing_client_name,
        })
        setView('collision')
        trackEvent('lead_convert_email_collision', {
          lead_id: lead.id,
          existing_client_id: data.existing_client_id,
        })
        return
      }

      if (!res.ok) {
        setError(data.message || 'Conversion failed')
        trackEvent('lead_convert_failed', {
          lead_id: lead.id,
          error_code: data.error,
          mode: 'full',
        })
        return
      }

      setResult({ client_id: data.client_id, mode: data.mode })
      setView('success')
      trackEvent('lead_convert_completed', {
        lead_id: lead.id,
        client_id: data.client_id,
        mode: data.mode,
        duration_ms: Date.now() - startedAt,
      })
      onConverted?.(data.client_id)
    } catch (e) {
      setError(e.message || 'Network error')
      trackEvent('lead_convert_failed', { lead_id: lead.id, error_code: 'network', mode: 'full' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLinkExisting() {
    setError(null)
    setSubmitting(true)
    const startedAt = Date.now()

    try {
      const { res, data } = await postConvert({
        lead_id: lead.id,
        link_only: true,
        existing_client_id: collision.existing_client_id,
      })

      if (!res.ok) {
        setError(data.message || 'Link failed')
        trackEvent('lead_convert_failed', { lead_id: lead.id, error_code: data.error, mode: 'link_only' })
        return
      }

      setResult({ client_id: data.client_id, mode: data.mode })
      setView('success')
      trackEvent('lead_convert_completed', {
        lead_id: lead.id,
        client_id: data.client_id,
        mode: 'link_only',
        duration_ms: Date.now() - startedAt,
      })
      onConverted?.(data.client_id)
    } catch (e) {
      setError(e.message || 'Network error')
      trackEvent('lead_convert_failed', { lead_id: lead.id, error_code: 'network', mode: 'link_only' })
    } finally {
      setSubmitting(false)
    }
  }

  // Block dismiss while a request is in-flight: clicking the overlay or X
  // mid-submit would unmount the modal but the fetch keeps running, leaving
  // a ghost client + no badge in UI.
  const safeClose = submitting ? undefined : onClose

  return (
    <div onClick={safeClose} style={overlay}>
      <div onClick={e => e.stopPropagation()} style={modal}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#F1F5F9', marginBottom: 4 }}>
              {view === 'success' ? 'Conversion complete' : 'Convert lead to client'}
            </div>
            <div style={{ fontSize: 12, color: '#475569' }}>
              {lead.name} · {lead.email}
            </div>
          </div>
          <button onClick={safeClose} disabled={submitting} style={{ ...closeBtn, opacity: submitting ? 0.4 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}><X size={18} /></button>
        </div>

        {/* Error banner */}
        {error && (
          <div style={errorBanner}>
            <AlertCircle size={14} /><span>{error}</span>
          </div>
        )}

        {/* ─── FORM VIEW ─── */}
        {view === 'form' && (
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Email (locked)</label>
                <input style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }} value={lead.email} disabled />
              </div>
              <div>
                <label style={labelStyle}>Name *</label>
                <input style={inputStyle} value={form.name} onChange={e => setField('name', e.target.value)} required />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Company</label>
                <input style={inputStyle} value={form.company} onChange={e => setField('company', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input style={inputStyle} value={form.phone} onChange={e => setField('phone', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Product</label>
                <input style={inputStyle} value={form.product} onChange={e => setField('product', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Price ($)</label>
                <input style={inputStyle} type="number" step="0.01" value={form.price} onChange={e => setField('price', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Subscription Terms</label>
                <input style={inputStyle} value={form.subscription_terms} onChange={e => setField('subscription_terms', e.target.value)} placeholder="monthly, annual, one-time…" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button type="button" onClick={onClose} disabled={submitting} style={ghostBtn}>Cancel</button>
              <button type="submit" disabled={submitting} style={primaryBtn}>
                <Send size={13} />
                {submitting ? 'Converting…' : 'Convert & invite'}
              </button>
            </div>
          </form>
        )}

        {/* ─── COLLISION VIEW ─── */}
        {view === 'collision' && (
          <div>
            <div style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: 10, padding: 14, marginBottom: 14, color: '#FACC15', fontSize: 13, lineHeight: 1.5 }}>
              A client named <strong>{collision.existing_client_name}</strong> with email <strong>{lead.email}</strong> already exists. Link this lead to them instead? (No new client will be created.)
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={onClose} disabled={submitting} style={ghostBtn}>Cancel</button>
              <button onClick={handleLinkExisting} disabled={submitting} style={primaryBtn}>
                <Link2 size={13} />
                {submitting ? 'Linking…' : 'Link to existing client'}
              </button>
            </div>
          </div>
        )}

        {/* ─── SUCCESS VIEW ─── */}
        {view === 'success' && (
          <div>
            <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10, padding: 14, marginBottom: 14, color: '#4ADE80', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 size={16} />
              {result.mode === 'link_only'
                ? 'Lead linked to existing client.'
                : `Invite sent to ${lead.email}. Client created.`}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={ghostBtn}>Close</button>
              <Link to={`/admin/clients/${result.client_id}`} style={{ ...primaryBtn, textDecoration: 'none' }}>
                Open client
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const overlay = {
  position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
}
const modal = {
  background: '#0F172A', border: '1px solid rgba(0,212,255,0.2)',
  borderRadius: 16, padding: 24, width: '100%', maxWidth: 520,
  boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
  fontFamily: "'Plus Jakarta Sans', sans-serif",
}
const closeBtn = { background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: 2 }
const errorBanner = {
  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
  borderRadius: 8, padding: '10px 12px', marginBottom: 12,
  color: '#FCA5A5', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8,
}
const ghostBtn = {
  padding: '8px 14px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8, color: '#94A3B8', fontSize: 13, fontWeight: 500,
  fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer',
}
const primaryBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '8px 14px', background: 'linear-gradient(135deg, #00D4FF, #0099CC)',
  border: 'none', borderRadius: 8, color: '#020817', fontSize: 13, fontWeight: 700,
  fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer',
}

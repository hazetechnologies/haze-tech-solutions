// src/pages/admin/AffiliatesManager.jsx
// Admin view of the Partner Program: affiliates list + commissions with
// approve / mark-paid / void actions. Mirrors the authed-fetch pattern used by
// Settings.jsx (supabase session → Bearer → /api/website?action=...).
import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, Check, DollarSign, XCircle, AlertCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const money = (c) => `$${((c || 0) / 100).toFixed(2)}`

async function authed(path, opts = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(path, {
    ...opts,
    headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  })
  return { ok: res.ok, json: await res.json().catch(() => ({})) }
}

export default function AffiliatesManager() {
  const [affiliates, setAffiliates] = useState([])
  const [commissions, setCommissions] = useState([])
  const [tab, setTab] = useState('affiliates')
  const [statusFilter, setStatusFilter] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [a, c] = await Promise.all([
        authed('/api/website?action=admin-affiliates-list'),
        authed(`/api/website?action=admin-commissions-list${statusFilter !== 'all' ? `&status=${statusFilter}` : ''}`),
      ])
      if (!a.ok) throw new Error(a.json.message || 'Failed to load affiliates')
      if (!c.ok) throw new Error(c.json.message || 'Failed to load commissions')
      setAffiliates(a.json.affiliates || [])
      setCommissions(c.json.commissions || [])
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  async function act(commission_id, action) {
    setBusyId(commission_id)
    try {
      const payout_ref = action === 'mark-paid' ? (prompt('Payout reference (optional, e.g. PayPal txn id):') || undefined) : undefined
      const r = await authed('/api/website?action=admin-commission-update', { method: 'POST', body: JSON.stringify({ commission_id, action, payout_ref }) })
      if (!r.ok) { setError(r.json.message || 'Update failed'); return }
      await load()
    } finally { setBusyId(null) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontFamily: "'Plus Jakarta Sans', sans-serif", maxWidth: 1000 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={styles.title}>Partner Program</h2>
          <p style={{ fontSize: 13, color: '#475569', margin: 0 }}>Affiliates and their referral commissions</p>
        </div>
        <button onClick={load} style={styles.refresh}><RefreshCw size={14} style={loading ? { animation: 'spin 0.7s linear infinite' } : undefined} /> Refresh</button>
      </div>

      {error && <div style={styles.errorBanner}><AlertCircle size={15} /> {error}</div>}

      <div style={{ display: 'flex', gap: 8 }}>
        {['affiliates', 'commissions'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}>{t === 'affiliates' ? 'Affiliates' : 'Commissions'}</button>
        ))}
      </div>

      {tab === 'affiliates' && (
        <div style={styles.card}>
          {affiliates.length === 0 ? <Empty>No affiliates yet.</Empty> : (
            <table style={styles.table}>
              <thead><tr style={styles.headRow}><th style={styles.th}>Name</th><th style={styles.th}>Email</th><th style={styles.th}>Code</th><th style={styles.th}>Status</th><th style={styles.th}>Owed</th><th style={styles.th}>Paid</th></tr></thead>
              <tbody>
                {affiliates.map(a => (
                  <tr key={a.id} style={styles.row}>
                    <td style={styles.td}>{a.name}</td>
                    <td style={styles.td}>{a.email}</td>
                    <td style={styles.td}><code style={{ color: '#00D4FF' }}>{a.code}</code></td>
                    <td style={styles.td}>{a.status}</td>
                    <td style={styles.td}>{money(a.owed_cents)}</td>
                    <td style={styles.td}>{money(a.paid_cents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'commissions' && (
        <div style={styles.card}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {['pending', 'approved', 'paid', 'void', 'all'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} style={{ ...styles.chip, ...(statusFilter === s ? styles.chipActive : {}) }}>{s}</button>
            ))}
          </div>
          {commissions.length === 0 ? <Empty>No commissions in this view.</Empty> : (
            <table style={styles.table}>
              <thead><tr style={styles.headRow}><th style={styles.th}>Date</th><th style={styles.th}>Affiliate</th><th style={styles.th}>Client</th><th style={styles.th}>Amount</th><th style={styles.th}>Status</th><th style={styles.th}>Actions</th></tr></thead>
              <tbody>
                {commissions.map(c => (
                  <tr key={c.id} style={styles.row}>
                    <td style={styles.td}>{new Date(c.created_at).toLocaleDateString()}</td>
                    <td style={styles.td}>{c.affiliate?.name || c.affiliate?.email || '—'}</td>
                    <td style={styles.td}>{c.client?.name || c.client?.email || '—'}</td>
                    <td style={styles.td}>{money(c.amount_cents)}</td>
                    <td style={styles.td}>{c.status}</td>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {c.status === 'pending' && <button disabled={busyId === c.id} onClick={() => act(c.id, 'approve')} style={styles.act}><Check size={13} /> Approve</button>}
                        {(c.status === 'pending' || c.status === 'approved') && <button disabled={busyId === c.id} onClick={() => act(c.id, 'mark-paid')} style={{ ...styles.act, color: '#4ADE80', borderColor: 'rgba(34,197,94,0.3)' }}><DollarSign size={13} /> Mark paid</button>}
                        {c.status !== 'paid' && c.status !== 'void' && <button disabled={busyId === c.id} onClick={() => act(c.id, 'void')} style={{ ...styles.act, color: '#FCA5A5', borderColor: 'rgba(239,68,68,0.3)' }}><XCircle size={13} /> Void</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

function Empty({ children }) { return <p style={{ color: '#475569', fontSize: 14, padding: 8 }}>{children}</p> }

const styles = {
  title: { fontFamily: "'Orbitron', sans-serif", fontSize: 14, fontWeight: 700, color: '#F1F5F9', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 },
  card: { background: '#0F172A', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 20 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13, color: '#CBD5E1' },
  headRow: { color: '#64748B', textAlign: 'left' },
  th: { padding: '8px', fontWeight: 600 },
  row: { borderTop: '1px solid rgba(255,255,255,0.06)' },
  td: { padding: '10px 8px' },
  refresh: { display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 8, padding: '8px 14px', color: '#00D4FF', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' },
  tab: { background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 16px', color: '#94A3B8', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' },
  tabActive: { background: 'rgba(0,212,255,0.12)', color: '#00D4FF', borderColor: 'rgba(0,212,255,0.3)' },
  chip: { background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '4px 10px', color: '#94A3B8', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' },
  chipActive: { background: 'rgba(0,212,255,0.12)', color: '#00D4FF', borderColor: 'rgba(0,212,255,0.3)' },
  act: { display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 6, padding: '5px 9px', color: '#00D4FF', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' },
  errorBanner: { display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '12px 16px', color: '#FCA5A5', fontSize: 13 },
}

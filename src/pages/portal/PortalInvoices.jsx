import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useClient } from '../../lib/PortalProtectedRoute'
import { Receipt, AlertCircle } from 'lucide-react'

function fmtDate(d) {
  if (!d) return '--'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtMoney(n) {
  return '$' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const statusStyle = (s) => {
  const base = { display: 'inline-block', padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, textTransform: 'capitalize' }
  if (s === 'paid')    return { ...base, color: '#4ADE80', background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.25)' }
  if (s === 'overdue') return { ...base, color: '#F87171', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.25)' }
  return { ...base, color: '#FACC15', background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.25)' }
}

export default function PortalInvoices() {
  const client = useClient()
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  const fetchInvoices = useCallback(async () => {
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('invoices')
        .select('*, projects(title)')
        .eq('client_id', client.id)
        .order('created_at', { ascending: false })
      if (err) throw err
      setInvoices(data ?? [])
    } catch (err) {
      setError(err.message || 'Failed to load invoices')
    } finally {
      setLoading(false)
    }
  }, [client.id])

  useEffect(() => { fetchInvoices() }, [fetchInvoices])

  const totals = {
    total: invoices.reduce((s, i) => s + Number(i.amount), 0),
    paid:  invoices.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount), 0),
    outstanding: invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + Number(i.amount), 0),
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>

      {!loading && !error && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
          <SummaryCard label="Total Billed" value={fmtMoney(totals.total)} color="#00D4FF" />
          <SummaryCard label="Paid" value={fmtMoney(totals.paid)} color="#22C55E" />
          <SummaryCard label="Outstanding" value={fmtMoney(totals.outstanding)} color="#F59E0B" />
        </div>
      )}

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '10px', padding: '14px', color: '#FCA5A5', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={15} /> {error}
        </div>
      )}

      <div style={styles.tableCard}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>
                {['Invoice #', 'Project', 'Description', 'Amount', 'Due Date', 'Paid Date', 'Status'].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} style={styles.td}>
                        <div style={{ height: 13, width: [80, 120, 150, 70, 80, 80, 60][j], background: 'rgba(255,255,255,0.06)', borderRadius: '6px', animation: 'pulse 1.5s ease-in-out infinite' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ ...styles.td, padding: '50px 20px', textAlign: 'center' }}>
                    <Receipt size={28} color="#334155" style={{ margin: '0 auto 8px', display: 'block' }} />
                    <p style={{ color: '#475569', fontSize: '13px', margin: 0 }}>No invoices yet.</p>
                  </td>
                </tr>
              ) : (
                invoices.map((inv, i) => (
                  <tr key={inv.id}
                    style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.012)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,212,255,0.03)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.012)' }}
                  >
                    <td style={{ ...styles.td, fontWeight: 600, color: '#F1F5F9' }}>{inv.invoice_number}</td>
                    <td style={{ ...styles.td, color: '#64748B' }}>{inv.projects?.title || '--'}</td>
                    <td style={{ ...styles.td, color: '#64748B', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.description || '--'}</td>
                    <td style={{ ...styles.td, fontWeight: 600, color: '#F1F5F9', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(inv.amount)}</td>
                    <td style={{ ...styles.td, color: '#64748B', whiteSpace: 'nowrap' }}>{fmtDate(inv.due_date)}</td>
                    <td style={{ ...styles.td, color: '#64748B', whiteSpace: 'nowrap' }}>{fmtDate(inv.paid_date)}</td>
                    <td style={styles.td}><span style={statusStyle(inv.status)}>{inv.status}</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ label, value, color }) {
  return (
    <div style={{ background: '#0F172A', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', padding: '16px' }}>
      <div style={{ fontSize: '11px', color: '#64748B', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '20px', fontWeight: 700, color, fontFamily: "'Orbitron', sans-serif" }}>{value}</div>
    </div>
  )
}

const styles = {
  tableCard: {
    background: '#0F172A', border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '14px', overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
  },
  th: {
    padding: '12px 18px', textAlign: 'left', fontSize: '11px', fontWeight: 600,
    color: '#475569', letterSpacing: '0.07em', textTransform: 'uppercase',
    borderBottom: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap',
    background: 'rgba(255,255,255,0.02)',
  },
  td: {
    padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)',
    verticalAlign: 'middle', color: '#CBD5E1',
  },
}

// src/pages/admin/SocialAudits.jsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function SocialAudits() {
  const [rows, setRows] = useState([])
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    let q = supabase
      .from('social_audits')
      .select('id, status, progress_message, created_at, lead_id, leads(name,email)')
      .order('created_at', { ascending: false })
      .limit(100)
    if (statusFilter !== 'all') q = q.eq('status', statusFilter)

    q.then(({ data }) => setRows(data || []))
  }, [statusFilter])

  return (
    <div style={{ padding: 24 }}>
      <h1>Social Audits</h1>
      <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ marginBottom: 16 }}>
        <option value="all">All statuses</option>
        <option value="pending">Pending</option>
        <option value="fetching">Fetching</option>
        <option value="analyzing">Analyzing</option>
        <option value="completed">Completed</option>
        <option value="failed">Failed</option>
      </select>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th align="left">Created</th>
            <th align="left">Lead</th>
            <th align="left">Status</th>
            <th align="left">Progress</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td>{new Date(r.created_at).toLocaleString()}</td>
              <td>{r.leads?.name || '—'} <span style={{ color: '#64748B' }}>{r.leads?.email}</span></td>
              <td><StatusBadge status={r.status} /></td>
              <td style={{ color: '#94A3B8' }}>{r.progress_message}</td>
              <td><Link to={`/admin/social-audits/${r.id}`}>View →</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StatusBadge({ status }) {
  const colors = {
    pending: '#94A3B8', fetching: '#00CFFF', analyzing: '#FBBF24',
    completed: '#22C55E', failed: '#EF4444',
  }
  return <span style={{ padding: '2px 8px', background: colors[status] + '22', color: colors[status], borderRadius: 4, fontSize: 12 }}>{status}</span>
}

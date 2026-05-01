// src/pages/admin/SocialAuditDetail.jsx
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { supabase } from '../../lib/supabase'

export default function SocialAuditDetail() {
  const { id } = useParams()
  const [row, setRow] = useState(null)
  const [tab, setTab] = useState('report')

  useEffect(() => {
    supabase.from('social_audits').select('*').eq('id', id).single()
      .then(({ data }) => setRow(data))
  }, [id])

  // Re-run endpoint not yet shipped — button disabled until follow-up task adds /api/admin/rerun-audit/[id]
  const canRerun = false

  if (!row) return <div style={{ padding: 24 }}>Loading…</div>

  return (
    <div style={{ padding: 24 }}>
      <h1>Audit {row.id.slice(0, 8)}…</h1>
      <p>Status: <strong>{row.status}</strong></p>

      <div style={{ display: 'flex', gap: 12, margin: '16px 0' }}>
        <button disabled={!canRerun} title={canRerun ? '' : 'Re-run endpoint not implemented yet'}>Re-run audit</button>
      </div>

      <nav style={{ display: 'flex', gap: 16, borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: 16 }}>
        {['report', 'inputs', 'raw'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ background: 'none', border: 'none', color: tab === t ? '#00CFFF' : '#94A3B8', padding: '8px 0', cursor: 'pointer', borderBottom: tab === t ? '2px solid #00CFFF' : 'none' }}>
            {t === 'report' ? 'Report' : t === 'inputs' ? 'Inputs' : 'Raw data'}
          </button>
        ))}
      </nav>

      {tab === 'report' && (
        row.report_markdown
          ? <article className="prose prose-invert max-w-none"><ReactMarkdown>{row.report_markdown}</ReactMarkdown></article>
          : <p>No report yet.</p>
      )}
      {tab === 'inputs' && <pre style={preStyle}>{JSON.stringify(row.inputs, null, 2)}</pre>}
      {tab === 'raw' && <pre style={preStyle}>{JSON.stringify(row.raw_data, null, 2)}</pre>}
    </div>
  )
}

const preStyle = {
  background: 'rgba(255,255,255,0.04)', padding: 12, borderRadius: 6,
  overflow: 'auto', fontSize: 12, maxHeight: '60vh',
}

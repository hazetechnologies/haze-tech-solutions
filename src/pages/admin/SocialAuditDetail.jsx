// src/pages/admin/SocialAuditDetail.jsx
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { supabase } from '../../lib/supabase'

const mdComponents = {
  h1: (props) => <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0 0 1rem' }} {...props} />,
  h2: (props) => <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '1.5rem 0 0.75rem', color: '#00CFFF', borderBottom: '1px solid rgba(0,207,255,0.2)', paddingBottom: 4 }} {...props} />,
  h3: (props) => <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '1rem 0 0.5rem' }} {...props} />,
  p:  (props) => <p style={{ margin: '0.5rem 0', lineHeight: 1.6 }} {...props} />,
  strong: (props) => <strong style={{ fontWeight: 700 }} {...props} />,
  ul: (props) => <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem', lineHeight: 1.6, listStyleType: 'disc', listStylePosition: 'outside' }} {...props} />,
  ol: (props) => <ol style={{ margin: '0.5rem 0', paddingLeft: '1.5rem', lineHeight: 1.6, listStyleType: 'decimal', listStylePosition: 'outside' }} {...props} />,
  li: (props) => <li style={{ margin: '0.25rem 0', display: 'list-item' }} {...props} />,
  hr: () => <hr style={{ margin: '1.5rem 0', border: 0, borderTop: '1px solid rgba(255,255,255,0.1)' }} />,
  table: (props) => (
    <div style={{ overflowX: 'auto', margin: '0.75rem 0' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }} {...props} />
    </div>
  ),
  thead: (props) => <thead style={{ background: 'rgba(0,207,255,0.08)' }} {...props} />,
  th: (props) => <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid rgba(0,207,255,0.25)', fontWeight: 600 }} {...props} />,
  td: (props) => <td style={{ padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)' }} {...props} />,
}

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
          ? <article><ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{row.report_markdown}</ReactMarkdown></article>
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

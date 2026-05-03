import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import ConvertLeadModal from './components/ConvertLeadModal'
import {
  Users, Search, Download, RefreshCw, AlertCircle,
  ChevronDown, FileX, Filter, BarChart2, X, ExternalLink, FileText,
  CheckCircle2, UserPlus,
} from 'lucide-react'

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function escCsv(v) {
  if (v == null) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
  return s
}

function downloadCsv(leads) {
  const headers = ['Name', 'Email', 'Business', 'Service', 'Source', 'URL', 'Overall', 'Perf', 'SEO', 'Mobile', 'Security', 'CRO', 'Status', 'Notes', 'Date']
  const rows = leads.map(l => [
    l.name, l.email, l.business_name, l.service_interest, l.source, l.url,
    l.overall_score, l.perf_score, l.seo_score, l.mobile_score, l.security_score, l.cro_score,
    l.status, l.notes, fmtDate(l.created_at),
  ].map(escCsv).join(','))
  const csv = [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── badge styles ─────────────────────────────────────────────────────────────

const badgeBase = {
  display: 'inline-block',
  padding: '3px 10px',
  borderRadius: '20px',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'capitalize',
  whiteSpace: 'nowrap',
  cursor: 'default',
}

function sourceBadgeStyle(src) {
  if (src === 'audit') return { ...badgeBase, background: 'rgba(139,92,246,0.15)', color: '#A78BFA', border: '1px solid rgba(139,92,246,0.3)' }
  return { ...badgeBase, background: 'rgba(0,212,255,0.12)', color: '#00D4FF', border: '1px solid rgba(0,212,255,0.25)' }
}

function statusBadgeStyle(status) {
  if (status === 'contacted') return { ...badgeBase, background: 'rgba(59,130,246,0.15)', color: '#60A5FA', border: '1px solid rgba(59,130,246,0.3)', cursor: 'pointer' }
  if (status === 'closed')    return { ...badgeBase, background: 'rgba(34,197,94,0.15)',  color: '#4ADE80', border: '1px solid rgba(34,197,94,0.3)',  cursor: 'pointer' }
  return { ...badgeBase, background: 'rgba(234,179,8,0.15)', color: '#FACC15', border: '1px solid rgba(234,179,8,0.3)', cursor: 'pointer' }
}

// ─── StatusDropdown ───────────────────────────────────────────────────────────

const STATUS_OPTIONS = ['new', 'contacted', 'closed']

function StatusDropdown({ lead, onUpdate }) {
  const [open, setOpen]       = useState(false)
  const [saving, setSaving]   = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function pick(newStatus) {
    if (newStatus === lead.status) { setOpen(false); return }
    setSaving(true)
    setOpen(false)
    try {
      const { error } = await supabase.from('leads').update({ status: newStatus }).eq('id', lead.id)
      if (error) throw error
      onUpdate(lead.id, 'status', newStatus)
    } catch (err) {
      console.error('Status update error:', err)
      alert('Failed to update status: ' + (err.message || 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(v => !v)}
        disabled={saving}
        style={{ ...statusBadgeStyle(lead.status || 'new'), display: 'inline-flex', alignItems: 'center', gap: '4px', background: saving ? 'rgba(255,255,255,0.05)' : statusBadgeStyle(lead.status || 'new').background, border: 'none', fontFamily: 'inherit' }}
      >
        {saving ? '...' : (lead.status || 'new')}
        <ChevronDown size={11} />
      </button>
      {open && (
        <div style={styles.dropdown}>
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt}
              onClick={() => pick(opt)}
              style={{
                ...styles.dropdownItem,
                background: opt === (lead.status || 'new') ? 'rgba(0,212,255,0.08)' : 'transparent',
                color: opt === (lead.status || 'new') ? '#00D4FF' : '#94A3B8',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#F1F5F9' }}
              onMouseLeave={e => {
                e.currentTarget.style.background = opt === (lead.status || 'new') ? 'rgba(0,212,255,0.08)' : 'transparent'
                e.currentTarget.style.color = opt === (lead.status || 'new') ? '#00D4FF' : '#94A3B8'
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── NotesCell ────────────────────────────────────────────────────────────────

function NotesCell({ lead, onUpdate }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue]     = useState(lead.notes || '')
  const [saving, setSaving]   = useState(false)

  async function save() {
    if (value === (lead.notes || '')) { setEditing(false); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('leads').update({ notes: value }).eq('id', lead.id)
      if (error) throw error
      onUpdate(lead.id, 'notes', value)
      setEditing(false)
    } catch (err) {
      console.error('Notes update error:', err)
      alert('Failed to save notes: ' + (err.message || 'Unknown error'))
    } finally {
      setSaving(false)
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save() }
    if (e.key === 'Escape') { setValue(lead.notes || ''); setEditing(false) }
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '180px' }}>
        <textarea
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKey}
          rows={2}
          style={styles.notesTextarea}
          placeholder="Add notes..."
        />
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={save} disabled={saving} style={styles.notesSaveBtn}>
            {saving ? '...' : 'Save'}
          </button>
          <button onClick={() => { setValue(lead.notes || ''); setEditing(false) }} style={styles.notesCancelBtn}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      onClick={() => setEditing(true)}
      title="Click to edit"
      style={styles.notesView}
    >
      {value || <span style={{ color: '#334155', fontStyle: 'italic' }}>Add note…</span>}
    </div>
  )
}

// ─── AuditScoresModal ─────────────────────────────────────────────────────────

function ScoreBar({ label, score }) {
  const color = score >= 90 ? '#22c55e' : score >= 70 ? '#f59e0b' : '#ef4444'
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F'
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
        <span style={{ fontSize: '12px', color: '#94A3B8', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: '12px', fontWeight: 700, color, fontFamily: 'monospace' }}>{grade} ({score})</span>
      </div>
      <div style={{ height: '6px', background: 'rgba(255,255,255,0.07)', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${score}%`, background: color, borderRadius: '4px', transition: 'width 0.6s ease', boxShadow: `0 0 8px ${color}60` }} />
      </div>
    </div>
  )
}

function AuditScoresModal({ lead, onClose }) {
  if (!lead) return null
  const scores = [
    { label: 'Overall',  score: lead.overall_score },
    { label: 'Performance', score: lead.perf_score },
    { label: 'SEO',      score: lead.seo_score },
    { label: 'Mobile',   score: lead.mobile_score },
    { label: 'Security', score: lead.security_score },
    { label: 'Design / CRO', score: lead.cro_score },
  ]
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#0F172A', border: '1px solid rgba(0,212,255,0.2)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '420px', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <BarChart2 size={16} color="#00D4FF" />
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#F1F5F9' }}>Audit Report</span>
            </div>
            <div style={{ fontSize: '12px', color: '#475569' }}>{lead.name} — {lead.business_name || lead.url}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: '2px' }}>
            <X size={18} />
          </button>
        </div>

        {lead.url && (
          <a
            href={lead.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: '#00D4FF', textDecoration: 'none', marginBottom: '20px', background: 'rgba(0,212,255,0.08)', padding: '5px 10px', borderRadius: '6px', border: '1px solid rgba(0,212,255,0.2)' }}
          >
            <ExternalLink size={12} /> {lead.url}
          </a>
        )}

        {scores.every(s => s.score == null) ? (
          <p style={{ color: '#475569', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>No score data saved for this audit.</p>
        ) : (
          scores.map(s => s.score != null && <ScoreBar key={s.label} label={s.label} score={s.score} />)
        )}
      </div>
    </div>
  )
}

// ─── AutomationReportModal ────────────────────────────────────────────────────

function AutomationReportModal({ lead, onClose }) {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!lead) return
    supabase
      .from('automation_reports')
      .select('*')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setReport(data)
        setLoading(false)
      })
  }, [lead])

  if (!lead) return null

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#0F172A', border: '1px solid rgba(0,212,255,0.2)', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '640px', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <FileText size={16} color="#00D4FF" />
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#F1F5F9' }}>Automation Report</span>
            </div>
            <div style={{ fontSize: '12px', color: '#475569' }}>{lead.name} — {lead.business_name || lead.email}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: '2px' }}>
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#475569', fontSize: '13px' }}>Loading report...</div>
        ) : !report ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <FileText size={32} color="#334155" style={{ margin: '0 auto 8px' }} />
            <p style={{ color: '#475569', fontSize: '13px' }}>No automation report generated yet.</p>
            <p style={{ color: '#334155', fontSize: '12px' }}>The report is generated automatically when an AI Automation lead submits the form.</p>
          </div>
        ) : (
          <div style={{ fontSize: '13px', color: '#CBD5E1', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
            {report.report}
            <div style={{ marginTop: '16px', padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', fontSize: '11px', color: '#475569' }}>
              Generated: {new Date(report.created_at).toLocaleString()} | Status: {report.status}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── main component ───────────────────────────────────────────────────────────

export default function Leads() {
  const [leads, setLeads]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedAudit, setSelectedAudit] = useState(null)
  const [selectedReport, setSelectedReport] = useState(null)
  const [convertingLead, setConvertingLead] = useState(null)

  // filters
  const [sourceFilter, setSourceFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch]             = useState('')

  const fetchLeads = useCallback(async () => {
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('leads')
        .select('id, name, email, business_name, service_interest, source, url, perf_score, seo_score, mobile_score, security_score, cro_score, overall_score, status, notes, created_at, converted_to_client_id')
        .order('created_at', { ascending: false })
      if (err) throw err
      setLeads(data ?? [])
    } catch (err) {
      console.error('Leads fetch error:', err)
      setError(err.message || 'Failed to load leads')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchLeads() }, [fetchLeads])

  const handleRefresh = async () => {
    setRefreshing(true)
    setLoading(true)
    await fetchLeads()
    setRefreshing(false)
  }

  function handleUpdate(id, field, value) {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l))
  }

  // derived filtered list
  const filtered = leads.filter(l => {
    if (sourceFilter !== 'all' && (l.source || 'contact') !== sourceFilter) return false
    if (statusFilter !== 'all' && (l.status || 'new') !== statusFilter) return false
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      if (!(l.name || '').toLowerCase().includes(q) && !(l.email || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  return (
    <div style={styles.page}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin   { to{transform:rotate(360deg)} }
        .notes-view:hover { background: rgba(0,212,255,0.05) !important; border-color: rgba(0,212,255,0.25) !important; }
        .filter-select:focus { outline: none; border-color: rgba(0,212,255,0.5) !important; }
        .search-input:focus  { outline: none; border-color: rgba(0,212,255,0.5) !important; }
      `}</style>

      <AuditScoresModal lead={selectedAudit} onClose={() => setSelectedAudit(null)} />
      <AutomationReportModal lead={selectedReport} onClose={() => setSelectedReport(null)} />
      <ConvertLeadModal
        lead={convertingLead}
        onClose={() => setConvertingLead(null)}
        onConverted={(client_id) => {
          if (convertingLead) {
            handleUpdate(convertingLead.id, 'converted_to_client_id', client_id)
            handleUpdate(convertingLead.id, 'status', 'closed')
          }
        }}
      />

      {/* ── Header ── */}
      <div style={styles.topRow}>
        <div>
          <h2 style={styles.pageTitle}>Leads</h2>
          <p style={styles.pageSub}>
            {!loading && !error && (
              <>
                <span style={{ color: '#00D4FF', fontWeight: 600 }}>{filtered.length}</span>
                {filtered.length !== leads.length && <span style={{ color: '#475569' }}> of {leads.length}</span>}
                <span style={{ color: '#475569' }}> {filtered.length === 1 ? 'lead' : 'leads'}</span>
              </>
            )}
            {loading && <span style={{ color: '#475569' }}>Loading…</span>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => downloadCsv(filtered)}
            disabled={loading || filtered.length === 0}
            style={{ ...styles.iconBtn, gap: '7px' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#00D4FF'; e.currentTarget.style.color = '#00D4FF' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#64748B' }}
          >
            <Download size={14} />
            Export CSV
          </button>
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
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div style={styles.filterBar}>
        <div style={styles.searchWrap}>
          <Search size={15} color="#475569" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input
            className="search-input"
            type="text"
            placeholder="Search name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={styles.searchInput}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Filter size={14} color="#475569" />
          <select
            className="filter-select"
            value={sourceFilter}
            onChange={e => setSourceFilter(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="all">All Sources</option>
            <option value="contact">Contact Form</option>
            <option value="audit">Audit Tool</option>
          </select>
          <select
            className="filter-select"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={styles.filterSelect}
          >
            <option value="all">All Statuses</option>
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div style={styles.errorBanner}>
          <AlertCircle size={15} />
          <span>{error}</span>
          <button onClick={handleRefresh} style={styles.retryBtn}>Retry</button>
        </div>
      )}

      {/* ── Table card ── */}
      <div style={styles.tableCard}>
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {['Name', 'Email', 'Business', 'Service Interest', 'Source', 'Date', 'Status', 'Notes', 'Actions'].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} style={styles.td}>
                        <div style={{ ...styles.skeleton, width: [100, 150, 100, 120, 60, 80, 60, 120, 50][j] + 'px' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : !error && filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} style={styles.emptyCell}>
                    <div style={styles.emptyState}>
                      <div style={styles.emptyIcon}>
                        <FileX size={32} color="#334155" />
                      </div>
                      <p style={styles.emptyTitle}>No leads found</p>
                      <p style={styles.emptySub}>
                        {leads.length > 0
                          ? 'Try adjusting your filters or search query.'
                          : 'Leads submitted via the contact form or audit tool will appear here.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((lead, i) => (
                  <tr
                    key={lead.id}
                    style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.012)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,212,255,0.03)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.012)' }}
                  >
                    <td style={{ ...styles.td, ...styles.tdBold }}>{lead.name || '—'}</td>
                    <td style={{ ...styles.td, ...styles.tdMuted, maxWidth: '180px' }}>{lead.email || '—'}</td>
                    <td style={{ ...styles.td, ...styles.tdMuted, maxWidth: '140px' }}>{lead.business_name || '—'}</td>
                    <td style={{ ...styles.td, ...styles.tdMuted, maxWidth: '150px' }}>{lead.service_interest || '—'}</td>
                    <td style={styles.td}>
                      <span style={sourceBadgeStyle(lead.source)}>{lead.source || 'contact'}</span>
                    </td>
                    <td style={{ ...styles.td, ...styles.tdMuted, whiteSpace: 'nowrap' }}>{fmtDate(lead.created_at)}</td>
                    <td style={styles.td}>
                      <StatusDropdown lead={lead} onUpdate={handleUpdate} />
                    </td>
                    <td style={{ ...styles.td, minWidth: '200px' }}>
                      <NotesCell lead={lead} onUpdate={handleUpdate} />
                    </td>
                    <td style={styles.td}>
                      {lead.converted_to_client_id ? (
                        <a
                          href={`/admin/clients/${lead.converted_to_client_id}`}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 7, color: '#4ADE80', fontSize: 12, textDecoration: 'none', whiteSpace: 'nowrap', marginBottom: 4 }}
                          title="Open the client this lead was converted to"
                        >
                          <CheckCircle2 size={12} /> Converted
                        </a>
                      ) : (
                        <button
                          onClick={() => setConvertingLead(lead)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 7, color: '#00D4FF', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap', marginBottom: 4 }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,212,255,0.22)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,212,255,0.12)' }}
                          title="Convert this lead to a client"
                        >
                          <UserPlus size={12} /> Convert
                        </button>
                      )}
                      {lead.source === 'audit' && (
                        <button
                          onClick={() => setSelectedAudit(lead)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', borderRadius: 7, color: '#A78BFA', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap', marginBottom: 4 }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.22)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.12)' }}
                        >
                          <BarChart2 size={12} /> Audit
                        </button>
                      )}
                      {(lead.service_interest === 'AI Automation' || lead.service_interest === 'All Three') && (
                        <button
                          onClick={() => setSelectedReport(lead)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 7, color: '#00D4FF', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,212,255,0.22)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,212,255,0.12)' }}
                        >
                          <FileText size={12} /> AI Plan
                        </button>
                      )}
                    </td>
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

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
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
  pageSub: {
    fontSize: '13px',
    color: '#475569',
    lineHeight: 1.4,
  },
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
  filterBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
  },
  searchWrap: {
    position: 'relative',
    flex: '1 1 240px',
    minWidth: '200px',
    maxWidth: '360px',
  },
  searchInput: {
    width: '100%',
    padding: '9px 12px 9px 36px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '9px',
    color: '#F1F5F9',
    fontSize: '13px',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  },
  filterSelect: {
    padding: '9px 12px',
    background: '#0F172A',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '9px',
    color: '#94A3B8',
    fontSize: '13px',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    cursor: 'pointer',
    transition: 'border-color 0.15s',
    appearance: 'auto',
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
  tableCard: {
    background: '#0F172A',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '14px',
    overflow: 'hidden',
    boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
  },
  tableWrap: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  th: {
    padding: '12px 18px',
    textAlign: 'left',
    fontSize: '11px',
    fontWeight: 600,
    color: '#475569',
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    whiteSpace: 'nowrap',
    background: 'rgba(255,255,255,0.02)',
  },
  td: {
    padding: '12px 18px',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    verticalAlign: 'middle',
    color: '#CBD5E1',
    transition: 'background 0.1s',
  },
  tdBold: {
    fontWeight: 600,
    color: '#F1F5F9',
    whiteSpace: 'nowrap',
  },
  tdMuted: {
    color: '#64748B',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  skeleton: {
    height: '13px',
    background: 'rgba(255,255,255,0.06)',
    borderRadius: '6px',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  emptyCell: {
    padding: '60px 20px',
    textAlign: 'center',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
  },
  emptyIcon: {
    width: '64px',
    height: '64px',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '4px',
  },
  emptyTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#475569',
  },
  emptySub: {
    fontSize: '13px',
    color: '#334155',
    maxWidth: '320px',
  },
  // dropdown
  dropdown: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: 0,
    zIndex: 50,
    background: '#1E293B',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '10px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    overflow: 'hidden',
    minWidth: '120px',
  },
  dropdownItem: {
    display: 'block',
    width: '100%',
    padding: '9px 14px',
    background: 'transparent',
    border: 'none',
    textAlign: 'left',
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    letterSpacing: '0.04em',
    textTransform: 'capitalize',
    cursor: 'pointer',
    transition: 'background 0.12s, color 0.12s',
  },
  // notes
  notesView: {
    fontSize: '12px',
    color: '#64748B',
    cursor: 'pointer',
    padding: '6px 8px',
    borderRadius: '6px',
    border: '1px solid transparent',
    transition: 'background 0.15s, border-color 0.15s',
    minWidth: '120px',
    lineHeight: 1.4,
    whiteSpace: 'pre-wrap',
  },
  notesTextarea: {
    width: '100%',
    padding: '7px 9px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(0,212,255,0.4)',
    borderRadius: '7px',
    color: '#F1F5F9',
    fontSize: '12px',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    resize: 'vertical',
    boxSizing: 'border-box',
    outline: 'none',
    lineHeight: 1.5,
  },
  notesSaveBtn: {
    padding: '4px 12px',
    background: 'rgba(0,212,255,0.15)',
    border: '1px solid rgba(0,212,255,0.3)',
    borderRadius: '6px',
    color: '#00D4FF',
    fontSize: '11px',
    fontWeight: 600,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    cursor: 'pointer',
  },
  notesCancelBtn: {
    padding: '4px 10px',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '6px',
    color: '#475569',
    fontSize: '11px',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    cursor: 'pointer',
  },
}

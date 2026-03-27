import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { Users, Search, FileText, TrendingUp, RefreshCw, AlertCircle } from 'lucide-react'

// ─── helpers ────────────────────────────────────────────────────────────────

function startOfMonth() {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function fmtNum(n) {
  if (n === null || n === undefined) return '—'
  return Number(n).toLocaleString()
}

// ─── badge styles ────────────────────────────────────────────────────────────

const sourceBadge = (source) => {
  const base = {
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'capitalize',
    whiteSpace: 'nowrap',
  }
  if (source === 'audit') return { ...base, background: 'rgba(139,92,246,0.15)', color: '#A78BFA', border: '1px solid rgba(139,92,246,0.25)' }
  // contact / default
  return { ...base, background: 'rgba(0,212,255,0.12)', color: '#00D4FF', border: '1px solid rgba(0,212,255,0.2)' }
}

const statusBadge = (status) => {
  const base = {
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'capitalize',
    whiteSpace: 'nowrap',
  }
  if (status === 'contacted') return { ...base, background: 'rgba(59,130,246,0.15)', color: '#60A5FA', border: '1px solid rgba(59,130,246,0.25)' }
  if (status === 'closed')    return { ...base, background: 'rgba(34,197,94,0.15)',  color: '#4ADE80', border: '1px solid rgba(34,197,94,0.25)' }
  // new / default
  return { ...base, background: 'rgba(234,179,8,0.15)', color: '#FACC15', border: '1px solid rgba(234,179,8,0.25)' }
}

// ─── KPI card ────────────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, value, label, trend, iconColor, loading, error }) {
  return (
    <div style={styles.kpiCard}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div
          style={{
            ...styles.kpiIcon,
            background: `${iconColor}18`,
            border: `1px solid ${iconColor}30`,
          }}
        >
          <Icon size={20} color={iconColor} />
        </div>
        {trend && !loading && !error && (
          <span style={styles.kpiTrend}>{trend}</span>
        )}
      </div>
      <div style={styles.kpiValueRow}>
        {loading ? (
          <div style={styles.kpiSkeleton} />
        ) : error ? (
          <span style={styles.kpiError}>—</span>
        ) : (
          <span style={styles.kpiValue}>{fmtNum(value)}</span>
        )}
      </div>
      <span style={styles.kpiLabel}>{label}</span>
    </div>
  )
}

// ─── main component ──────────────────────────────────────────────────────────

export default function Dashboard() {
  const [kpis, setKpis]         = useState({ totalLeads: null, monthLeads: null, audits: null, posts: null })
  const [leads, setLeads]       = useState([])
  const [kpiLoading, setKpiLoading]   = useState(true)
  const [leadsLoading, setLeadsLoading] = useState(true)
  const [kpiError, setKpiError]   = useState(null)
  const [leadsError, setLeadsError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const fetchKpis = useCallback(async () => {
    setKpiError(null)
    try {
      const [
        { count: totalLeads, error: e1 },
        { count: monthLeads, error: e2 },
        { count: audits,     error: e3 },
        { count: blogPosts,  error: e4 },
        { count: pressRels,  error: e5 },
      ] = await Promise.all([
        supabase.from('leads').select('*', { count: 'exact', head: true }),
        supabase.from('leads').select('*', { count: 'exact', head: true }).gte('created_at', startOfMonth()),
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('source', 'audit'),
        supabase.from('blog_posts').select('*', { count: 'exact', head: true }).eq('published', true),
        supabase.from('press_releases').select('*', { count: 'exact', head: true }).eq('published', true),
      ])

      const err = e1 || e2 || e3 || e4 || e5
      if (err) throw err

      setKpis({
        totalLeads: totalLeads ?? 0,
        monthLeads: monthLeads ?? 0,
        audits:     audits ?? 0,
        posts:      (blogPosts ?? 0) + (pressRels ?? 0),
      })
    } catch (err) {
      console.error('KPI fetch error:', err)
      setKpiError(err.message || 'Failed to load KPIs')
    } finally {
      setKpiLoading(false)
    }
  }, [])

  const fetchLeads = useCallback(async () => {
    setLeadsError(null)
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('id, name, email, business_name, service_interest, source, status, created_at')
        .order('created_at', { ascending: false })
        .limit(10)

      if (error) throw error
      setLeads(data ?? [])
    } catch (err) {
      console.error('Leads fetch error:', err)
      setLeadsError(err.message || 'Failed to load leads')
    } finally {
      setLeadsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchKpis()
    fetchLeads()
  }, [fetchKpis, fetchLeads])

  const handleRefresh = async () => {
    setRefreshing(true)
    setKpiLoading(true)
    setLeadsLoading(true)
    await Promise.all([fetchKpis(), fetchLeads()])
    setRefreshing(false)
  }

  const kpiCards = [
    { icon: Users,     value: kpis.totalLeads, label: 'Total Leads',       trend: 'All time',         iconColor: '#00D4FF' },
    { icon: TrendingUp, value: kpis.monthLeads, label: 'Leads This Month',  trend: 'Current month',   iconColor: '#8B5CF6' },
    { icon: Search,    value: kpis.audits,     label: 'Audits Run',        trend: 'Via audit tool',   iconColor: '#F59E0B' },
    { icon: FileText,  value: kpis.posts,      label: 'Published Posts',   trend: 'Blog + Press',     iconColor: '#10B981' },
  ]

  return (
    <div style={styles.page}>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }
        @keyframes spin   { to { transform: rotate(360deg) } }
      `}</style>

      {/* Header row */}
      <div style={styles.topRow}>
        <div>
          <h2 style={styles.sectionHeading}>Overview</h2>
          <p style={styles.sectionSub}>Real-time metrics from your Supabase data.</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing || kpiLoading}
          style={styles.refreshBtn}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#00D4FF'; e.currentTarget.style.color = '#00D4FF' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#64748B' }}
        >
          <RefreshCw size={14} style={{ animation: refreshing ? 'spin 0.7s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {/* KPI error banner */}
      {kpiError && !kpiLoading && (
        <div style={styles.errorBanner}>
          <AlertCircle size={15} />
          <span>{kpiError}</span>
        </div>
      )}

      {/* KPI cards */}
      <div style={styles.kpiGrid}>
        {kpiCards.map((card) => (
          <KpiCard
            key={card.label}
            {...card}
            loading={kpiLoading}
            error={!!kpiError}
          />
        ))}
      </div>

      {/* Recent leads */}
      <div style={styles.tableCard}>
        <div style={styles.tableHeader}>
          <div>
            <h3 style={styles.tableTitle}>Recent Leads</h3>
            <p style={styles.tableSub}>Last 10 submissions across all sources.</p>
          </div>
        </div>

        {leadsError && (
          <div style={{ ...styles.errorBanner, margin: '0 24px 16px' }}>
            <AlertCircle size={15} />
            <span>{leadsError}</span>
          </div>
        )}

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {['Name', 'Email', 'Business', 'Service', 'Source', 'Date', 'Status'].map((h) => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leadsLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} style={styles.td}>
                        <div style={{ ...styles.rowSkeleton, width: j === 1 ? '160px' : j === 4 || j === 6 ? '70px' : '100px' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ ...styles.td, textAlign: 'center', color: '#475569', padding: '40px' }}>
                    No leads found.
                  </td>
                </tr>
              ) : (
                leads.map((lead, i) => (
                  <tr
                    key={lead.id}
                    style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,212,255,0.04)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}
                  >
                    <td style={{ ...styles.td, ...styles.tdName }}>{lead.name || '—'}</td>
                    <td style={{ ...styles.td, ...styles.tdMuted }}>{lead.email || '—'}</td>
                    <td style={{ ...styles.td, ...styles.tdMuted }}>{lead.business_name || '—'}</td>
                    <td style={{ ...styles.td, ...styles.tdMuted }}>{lead.service_interest || '—'}</td>
                    <td style={styles.td}>
                      <span style={sourceBadge(lead.source)}>{lead.source || 'contact'}</span>
                    </td>
                    <td style={{ ...styles.td, ...styles.tdMuted, whiteSpace: 'nowrap' }}>{fmtDate(lead.created_at)}</td>
                    <td style={styles.td}>
                      <span style={statusBadge(lead.status)}>{lead.status || 'new'}</span>
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

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '28px',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  },
  topRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '16px',
    flexWrap: 'wrap',
  },
  sectionHeading: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '14px',
    fontWeight: 700,
    color: '#F1F5F9',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    marginBottom: '4px',
  },
  sectionSub: {
    fontSize: '13px',
    color: '#475569',
  },
  refreshBtn: {
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
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '16px',
  },
  kpiCard: {
    background: '#0F172A',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '14px',
    padding: '22px 22px 20px',
    backdropFilter: 'blur(10px)',
    boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  kpiIcon: {
    width: '42px',
    height: '42px',
    borderRadius: '11px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  kpiTrend: {
    fontSize: '11px',
    color: '#334155',
    fontWeight: 500,
  },
  kpiValueRow: {
    minHeight: '40px',
    display: 'flex',
    alignItems: 'center',
  },
  kpiValue: {
    fontSize: '38px',
    fontWeight: 700,
    color: '#F1F5F9',
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums',
  },
  kpiError: {
    fontSize: '32px',
    color: '#334155',
  },
  kpiSkeleton: {
    width: '80px',
    height: '36px',
    background: 'rgba(255,255,255,0.06)',
    borderRadius: '8px',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  kpiLabel: {
    fontSize: '13px',
    color: '#64748B',
    fontWeight: 500,
  },
  tableCard: {
    background: '#0F172A',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '14px',
    overflow: 'hidden',
    boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
  },
  tableHeader: {
    padding: '22px 24px 18px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  tableTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#F1F5F9',
    marginBottom: '3px',
  },
  tableSub: {
    fontSize: '12px',
    color: '#475569',
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
    padding: '12px 20px',
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
    padding: '13px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    verticalAlign: 'middle',
    color: '#CBD5E1',
    transition: 'background 0.1s',
  },
  tdName: {
    fontWeight: 600,
    color: '#F1F5F9',
    whiteSpace: 'nowrap',
  },
  tdMuted: {
    color: '#64748B',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '180px',
  },
  rowSkeleton: {
    height: '14px',
    background: 'rgba(255,255,255,0.06)',
    borderRadius: '6px',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
}

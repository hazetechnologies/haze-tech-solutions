import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useClient } from '../../lib/PortalProtectedRoute'
import {
  FolderKanban, CheckCircle, Clock, AlertCircle,
  TrendingUp, Receipt, ChevronRight,
} from 'lucide-react'

const statusConfig = {
  not_started: { label: 'Not Started', color: '#64748B', bg: 'rgba(100,116,139,0.15)' },
  in_progress: { label: 'In Progress', color: '#3B82F6', bg: 'rgba(59,130,246,0.15)' },
  review:      { label: 'In Review',   color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
  completed:   { label: 'Completed',   color: '#22C55E', bg: 'rgba(34,197,94,0.15)' },
}

export default function PortalDashboard() {
  const client = useClient()
  const [projects, setProjects]     = useState([])
  const [milestones, setMilestones] = useState([])
  const [invoiceStats, setInvoiceStats] = useState({ total: 0, paid: 0, pending: 0 })
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [websiteProject, setWebsiteProject] = useState(null)

  const fetchData = useCallback(async () => {
    setError(null)
    try {
      const [projRes, msRes, invRes] = await Promise.all([
        supabase.from('projects').select('*').eq('client_id', client.id).order('updated_at', { ascending: false }),
        supabase.from('milestones').select('*, projects!inner(client_id, title)').eq('projects.client_id', client.id).order('created_at', { ascending: false }).limit(5),
        supabase.from('invoices').select('amount, status').eq('client_id', client.id),
      ])
      if (projRes.error) throw projRes.error
      if (msRes.error) throw msRes.error
      if (invRes.error) throw invRes.error

      setProjects(projRes.data ?? [])
      setMilestones(msRes.data ?? [])

      const inv = invRes.data ?? []
      setInvoiceStats({
        total: inv.reduce((s, i) => s + Number(i.amount), 0),
        paid: inv.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount), 0),
        pending: inv.filter(i => i.status !== 'paid').reduce((s, i) => s + Number(i.amount), 0),
      })
    } catch (err) {
      setError(err.message || 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [client.id])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    if (!client?.id) return
    (async () => {
      const { data: wp } = await supabase
        .from('website_projects').select('id, status, repo_url').eq('client_id', client.id).maybeSingle()
      setWebsiteProject(wp || null)
    })()
  }, [client?.id])

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {[200, 120, 120].map((h, i) => (
        <div key={i} style={{ height: h, background: 'rgba(255,255,255,0.04)', borderRadius: '14px', animation: 'pulse 1.5s ease-in-out infinite' }} />
      ))}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )

  if (error) return (
    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '10px', padding: '16px', color: '#FCA5A5', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
      <AlertCircle size={15} /> {error}
      <button onClick={() => { setLoading(true); fetchData() }} style={{ marginLeft: 'auto', padding: '4px 12px', background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '6px', color: '#FCA5A5', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>Retry</button>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Welcome */}
      <div style={styles.welcomeCard}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#F1F5F9', margin: '0 0 6px' }}>
          Welcome back, {client.name?.split(' ')[0] || 'there'}
        </h2>
        <p style={{ fontSize: '14px', color: '#64748B', margin: 0 }}>
          Here's an overview of your projects and account.
        </p>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <KpiCard icon={FolderKanban} color="#3B82F6" label="Active Projects" value={projects.filter(p => p.status !== 'completed').length} />
        <KpiCard icon={CheckCircle} color="#22C55E" label="Completed" value={projects.filter(p => p.status === 'completed').length} />
        <KpiCard icon={Receipt} color="#F59E0B" label="Pending Invoices" value={`$${invoiceStats.pending.toLocaleString()}`} />
        <KpiCard icon={TrendingUp} color="#00D4FF" label="Total Invested" value={`$${invoiceStats.total.toLocaleString()}`} />
      </div>

      {/* Website project */}
      {websiteProject && (
        <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 18, marginBottom: 20 }}>
          <div style={{ color:'#F1F5F9', fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Website project</div>
          {websiteProject.status === 'intake_pending' && (
            <>
              <p style={{ color:'#CBD5E1', fontSize: 13, margin: '4px 0 12px' }}>We need a few details to get started.</p>
              <a href="/portal/website-intake" style={{ background:'#00CFFF', color:'#0F172A', padding:'8px 14px', borderRadius: 8, fontWeight: 700, fontSize: 12, textDecoration:'none', display: 'inline-block' }}>Fill intake form</a>
            </>
          )}
          {websiteProject.status === 'intake_submitted' && (
            <p style={{ color:'#CBD5E1', fontSize: 13 }}>Intake received. Your team will start your site shortly.</p>
          )}
          {websiteProject.status === 'generating' && (
            <p style={{ color:'#CBD5E1', fontSize: 13 }}>In progress — your team is setting up your site.</p>
          )}
          {websiteProject.status === 'done' && (
            <p style={{ color:'#CBD5E1', fontSize: 13 }}>Ready — your dev team has your files.</p>
          )}
          {websiteProject.status === 'failed' && (
            <p style={{ color:'#F87171', fontSize: 13 }}>Something went wrong. Your team has been notified.</p>
          )}
        </div>
      )}

      {/* Projects */}
      <div>
        <h3 style={styles.sectionTitle}>Your Projects</h3>
        {projects.length === 0 ? (
          <div style={styles.emptyCard}>
            <FolderKanban size={28} color="#334155" />
            <p style={{ color: '#475569', fontSize: '13px', margin: '8px 0 0' }}>No projects yet. Your team will add projects here once onboarding is complete.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
            {projects.map(p => {
              const sc = statusConfig[p.status] || statusConfig.not_started
              return (
                <Link key={p.id} to={`/portal/projects/${p.id}`} style={{ textDecoration: 'none' }}>
                  <div style={styles.projectCard}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(0,212,255,0.25)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <div>
                        <h4 style={{ fontSize: '15px', fontWeight: 600, color: '#F1F5F9', margin: '0 0 4px' }}>{p.title}</h4>
                        {p.service_type && <span style={styles.serviceTag}>{p.service_type}</span>}
                      </div>
                      <span style={{ ...styles.statusBadge, color: sc.color, background: sc.bg, border: `1px solid ${sc.color}30` }}>{sc.label}</span>
                    </div>
                    {p.description && <p style={{ fontSize: '12px', color: '#64748B', margin: '0 0 12px', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.description}</p>}
                    <div style={{ marginTop: 'auto' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '11px', color: '#475569' }}>Progress</span>
                        <span style={{ fontSize: '11px', color: sc.color, fontWeight: 600 }}>{p.progress}%</span>
                      </div>
                      <div style={{ height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px' }}>
                        <div style={{ height: '100%', width: `${p.progress}%`, background: sc.color, borderRadius: '2px', transition: 'width 0.5s ease' }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                      <span style={{ fontSize: '11px', color: '#00D4FF', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        View Details <ChevronRight size={12} />
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Recent milestones */}
      {milestones.length > 0 && (
        <div>
          <h3 style={styles.sectionTitle}>Recent Milestones</h3>
          <div style={styles.tableCard}>
            {milestones.map((m, i) => {
              const isComplete = m.status === 'completed'
              return (
                <div key={m.id} style={{ ...styles.milestoneRow, ...(i > 0 ? { borderTop: '1px solid rgba(255,255,255,0.04)' } : {}) }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {isComplete
                      ? <CheckCircle size={16} color="#22C55E" />
                      : <Clock size={16} color="#64748B" />}
                    <div>
                      <div style={{ fontSize: '13px', color: '#F1F5F9', fontWeight: 500 }}>{m.title}</div>
                      <div style={{ fontSize: '11px', color: '#475569' }}>{m.projects?.title}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: '12px', color: isComplete ? '#22C55E' : '#64748B', textTransform: 'capitalize' }}>{m.status}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function KpiCard({ icon: Icon, color, label, value }) {
  return (
    <div style={styles.kpiCard}>
      <div style={{ width: 38, height: 38, borderRadius: '10px', background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={18} color={color} />
      </div>
      <div style={{ fontSize: '24px', fontWeight: 700, color: '#F1F5F9', fontFamily: "'Orbitron', sans-serif" }}>{value}</div>
      <div style={{ fontSize: '12px', color: '#64748B' }}>{label}</div>
    </div>
  )
}

const styles = {
  welcomeCard: {
    background: 'linear-gradient(135deg, rgba(0,212,255,0.08) 0%, rgba(139,92,246,0.06) 100%)',
    border: '1px solid rgba(0,212,255,0.15)', borderRadius: '14px', padding: '24px',
  },
  sectionTitle: {
    fontFamily: "'Orbitron', sans-serif", fontSize: '13px', fontWeight: 700,
    color: '#F1F5F9', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '14px',
  },
  kpiCard: {
    background: '#0F172A', border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '14px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px',
  },
  projectCard: {
    background: '#0F172A', border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '14px', padding: '20px', display: 'flex', flexDirection: 'column',
    transition: 'border-color 0.15s', cursor: 'pointer', minHeight: '140px',
  },
  serviceTag: {
    fontSize: '10px', fontWeight: 600, color: '#00D4FF', letterSpacing: '0.04em',
    background: 'rgba(0,212,255,0.1)', padding: '2px 8px', borderRadius: '4px',
  },
  statusBadge: {
    display: 'inline-block', padding: '3px 10px', borderRadius: '20px',
    fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap',
  },
  emptyCard: {
    background: '#0F172A', border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '14px', padding: '40px', textAlign: 'center',
  },
  tableCard: {
    background: '#0F172A', border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '14px', overflow: 'hidden',
  },
  milestoneRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 20px',
  },
}

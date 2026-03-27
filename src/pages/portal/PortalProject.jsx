import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import {
  ArrowLeft, CheckCircle, Clock, Circle,
  FileText, Image, Video, Link as LinkIcon, Download,
  AlertCircle,
} from 'lucide-react'

const statusConfig = {
  not_started: { label: 'Not Started', color: '#64748B' },
  in_progress: { label: 'In Progress', color: '#3B82F6' },
  review:      { label: 'In Review',   color: '#F59E0B' },
  completed:   { label: 'Completed',   color: '#22C55E' },
}

const fileIcons = {
  pdf: FileText, image: Image, video: Video, link: LinkIcon,
}

export default function PortalProject() {
  const { projectId } = useParams()
  const [project, setProject]           = useState(null)
  const [milestones, setMilestones]     = useState([])
  const [deliverables, setDeliverables] = useState([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState(null)

  const fetchData = useCallback(async () => {
    setError(null)
    try {
      const [pRes, mRes, dRes] = await Promise.all([
        supabase.from('projects').select('*').eq('id', projectId).single(),
        supabase.from('milestones').select('*').eq('project_id', projectId).order('display_order'),
        supabase.from('deliverables').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      ])
      if (pRes.error) throw pRes.error
      setProject(pRes.data)
      setMilestones(mRes.data ?? [])
      setDeliverables(dRes.data ?? [])
    } catch (err) {
      setError(err.message || 'Failed to load project')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {[80, 200, 150].map((h, i) => (
        <div key={i} style={{ height: h, background: 'rgba(255,255,255,0.04)', borderRadius: '14px', animation: 'pulse 1.5s ease-in-out infinite' }} />
      ))}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )

  if (error || !project) return (
    <div>
      <Link to="/portal/dashboard" style={styles.backLink}><ArrowLeft size={14} /> Back to Dashboard</Link>
      <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '10px', padding: '16px', color: '#FCA5A5', fontSize: '13px', marginTop: '12px' }}>
        <AlertCircle size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} />
        {error || 'Project not found'}
      </div>
    </div>
  )

  const sc = statusConfig[project.status] || statusConfig.not_started

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <Link to="/portal/dashboard" style={styles.backLink}><ArrowLeft size={14} /> Back to Dashboard</Link>

      {/* Project header */}
      <div style={styles.headerCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#F1F5F9', margin: '0 0 6px' }}>{project.title}</h2>
            {project.service_type && <span style={styles.serviceTag}>{project.service_type}</span>}
          </div>
          <span style={{ ...styles.statusBadge, color: sc.color, background: `${sc.color}18`, border: `1px solid ${sc.color}30` }}>{sc.label}</span>
        </div>
        {project.description && <p style={{ fontSize: '13px', color: '#94A3B8', margin: '12px 0 0', lineHeight: 1.6 }}>{project.description}</p>}

        <div style={{ marginTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '12px', color: '#64748B' }}>Overall Progress</span>
            <span style={{ fontSize: '12px', color: sc.color, fontWeight: 700 }}>{project.progress}%</span>
          </div>
          <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px' }}>
            <div style={{ height: '100%', width: `${project.progress}%`, background: sc.color, borderRadius: '3px', transition: 'width 0.5s', boxShadow: `0 0 8px ${sc.color}40` }} />
          </div>
        </div>

        {(project.start_date || project.due_date) && (
          <div style={{ display: 'flex', gap: '24px', marginTop: '16px' }}>
            {project.start_date && <div style={{ fontSize: '12px', color: '#64748B' }}>Started: <span style={{ color: '#94A3B8' }}>{new Date(project.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>}
            {project.due_date && <div style={{ fontSize: '12px', color: '#64748B' }}>Due: <span style={{ color: '#94A3B8' }}>{new Date(project.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>}
          </div>
        )}
      </div>

      {/* Milestones */}
      <div>
        <h3 style={styles.sectionTitle}>Milestones</h3>
        {milestones.length === 0 ? (
          <div style={styles.emptyCard}>
            <Clock size={24} color="#334155" />
            <p style={{ color: '#475569', fontSize: '13px', margin: '8px 0 0' }}>No milestones set yet.</p>
          </div>
        ) : (
          <div style={styles.card}>
            {milestones.map((m, i) => {
              const icon = m.status === 'completed' ? <CheckCircle size={18} color="#22C55E" />
                : m.status === 'in_progress' ? <Clock size={18} color="#3B82F6" />
                : <Circle size={18} color="#334155" />
              return (
                <div key={m.id} style={{ display: 'flex', gap: '14px', padding: '16px 20px', ...(i > 0 ? { borderTop: '1px solid rgba(255,255,255,0.04)' } : {}) }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', paddingTop: '2px' }}>
                    {icon}
                    {i < milestones.length - 1 && <div style={{ flex: 1, width: '2px', background: 'rgba(255,255,255,0.06)', minHeight: '16px' }} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: m.status === 'completed' ? '#22C55E' : '#F1F5F9' }}>{m.title}</div>
                    {m.description && <p style={{ fontSize: '12px', color: '#64748B', margin: '4px 0 0', lineHeight: 1.5 }}>{m.description}</p>}
                    {m.due_date && <span style={{ fontSize: '11px', color: '#475569', marginTop: '4px', display: 'block' }}>Due: {new Date(m.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Deliverables */}
      <div>
        <h3 style={styles.sectionTitle}>Deliverables</h3>
        {deliverables.length === 0 ? (
          <div style={styles.emptyCard}>
            <FileText size={24} color="#334155" />
            <p style={{ color: '#475569', fontSize: '13px', margin: '8px 0 0' }}>No deliverables uploaded yet.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
            {deliverables.map(d => {
              const Icon = fileIcons[d.file_type] || FileText
              return (
                <div key={d.id} style={styles.deliverableCard}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '8px', background: 'rgba(0,212,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon size={16} color="#00D4FF" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#F1F5F9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.title}</div>
                      {d.description && <div style={{ fontSize: '11px', color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.description}</div>}
                    </div>
                  </div>
                  {d.file_url && (
                    <a href={d.file_url} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#00D4FF', textDecoration: 'none', marginTop: '10px', background: 'rgba(0,212,255,0.08)', padding: '4px 10px', borderRadius: '6px', border: '1px solid rgba(0,212,255,0.2)' }}>
                      <Download size={11} /> Open File
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  backLink: { display: 'flex', alignItems: 'center', gap: '6px', color: '#64748B', textDecoration: 'none', fontSize: '13px', width: 'fit-content' },
  headerCard: { background: '#0F172A', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', padding: '24px' },
  serviceTag: { fontSize: '10px', fontWeight: 600, color: '#00D4FF', letterSpacing: '0.04em', background: 'rgba(0,212,255,0.1)', padding: '2px 8px', borderRadius: '4px' },
  statusBadge: { display: 'inline-block', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap' },
  sectionTitle: { fontFamily: "'Orbitron', sans-serif", fontSize: '13px', fontWeight: 700, color: '#F1F5F9', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '14px' },
  card: { background: '#0F172A', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', overflow: 'hidden' },
  emptyCard: { background: '#0F172A', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', padding: '40px', textAlign: 'center' },
  deliverableCard: { background: '#0F172A', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '12px', padding: '14px' },
}

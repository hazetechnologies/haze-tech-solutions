// src/pages/admin/components/WebsiteProjectTab.jsx
import { useEffect, useState } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

export default function WebsiteProjectTab({ client }) {
  const [project, setProject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { loadProject() }, [client.id])

  async function loadProject() {
    setLoading(true)
    const { data } = await supabase
      .from('website_projects').select('*').eq('client_id', client.id).maybeSingle()
    setProject(data)
    setLoading(false)
  }

  // Poll while generating/pending
  useEffect(() => {
    if (!project) return
    if (project.status !== 'generating' && project.status !== 'pending') return

    let cancelled = false
    let timer

    async function poll() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch(`/api/website-scaffold-status/${project.id}`, {
          headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
        })
        const data = await res.json()
        if (cancelled) return
        setProject(prev => ({ ...prev, ...data }))

        if (data.status === 'done' || data.status === 'failed') {
          setWorking(false)
          return
        }
        timer = setTimeout(poll, 3000)
      } catch {
        if (!cancelled) timer = setTimeout(poll, 3000 * 2)
      }
    }

    timer = setTimeout(poll, 3000)
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [project?.id, project?.status])

  async function activate() {
    setWorking(true); setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/activate-website-project', {
        method:'POST',
        headers:{ Authorization:`Bearer ${session.access_token}`, 'Content-Type':'application/json' },
        body: JSON.stringify({ client_id: client.id }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.message || j.error)
      await loadProject()
    } catch (e) { setError(e.message) } finally { setWorking(false) }
  }

  async function startScaffold() {
    setWorking(true); setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/start-website-scaffold', {
        method:'POST',
        headers:{ Authorization:`Bearer ${session.access_token}`, 'Content-Type':'application/json' },
        body: JSON.stringify({ project_id: project.id }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.message || j.error)
      await loadProject()
    } catch (e) { setError(e.message); setWorking(false) }
  }

  if (loading) return <p style={{ color:'#94A3B8' }}>Loading…</p>

  // No project yet
  if (!project) {
    return (
      <div style={{ padding: 20 }}>
        <h3 style={h3}>Website project</h3>
        <p style={p}>No website project for this client yet. Activate one to send the intake form to their portal.</p>
        <button onClick={activate} disabled={working} style={btnPrimary}>
          {working ? 'Activating…' : 'Activate Website Project'}
        </button>
        {error && <p style={errStyle}>{error}</p>}
      </div>
    )
  }

  return (
    <div style={{ padding: 20, display:'flex', flexDirection:'column', gap: 18 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <h3 style={h3}>Website project</h3>
        <span style={badge(project.status)}>{project.status}</span>
      </div>

      {project.status === 'intake_pending' && (
        <p style={p}>Awaiting client intake. They have a link to fill the form in their portal.</p>
      )}

      {project.status === 'intake_submitted' && project.inputs && (
        <>
          <IntakePreview inputs={project.inputs} templateId={project.template_id} />
          <button onClick={startScaffold} disabled={working} style={btnPrimary}>
            {working ? 'Generating…' : 'Generate Scaffold'}
          </button>
        </>
      )}

      {project.status === 'generating' && (
        <div style={{ background:'rgba(0,207,255,0.06)', border:'1px solid rgba(0,207,255,0.2)', borderRadius: 10, padding: 14 }}>
          <p style={{ color:'#00CFFF', fontSize: 13, margin: 0 }}>{project.progress_message || 'Generating…'}</p>
        </div>
      )}

      {project.status === 'done' && project.repo_url && (
        <div>
          <a href={project.repo_url} target="_blank" rel="noreferrer" style={btnPrimary}>
            <ExternalLink size={14} style={{ marginRight: 6 }} /> View on GitHub
          </a>
          {project.ai_content && (
            <details style={{ marginTop: 16 }}>
              <summary style={{ color:'#94A3B8', fontSize: 12, cursor:'pointer' }}>Generated content</summary>
              <pre style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: 12, color:'#CBD5E1', fontSize: 11, overflow:'auto', marginTop: 8 }}>{JSON.stringify(project.ai_content, null, 2)}</pre>
            </details>
          )}
        </div>
      )}

      {project.status === 'failed' && (
        <>
          <p style={errStyle}>{project.error || 'Generation failed'}</p>
          <button onClick={startScaffold} disabled={working} style={btnPrimary}>
            <RefreshCw size={14} style={{ marginRight: 6 }} /> Retry
          </button>
        </>
      )}

      {error && <p style={errStyle}>{error}</p>}
    </div>
  )
}

function IntakePreview({ inputs, templateId }) {
  return (
    <div style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 14 }}>
      <Row label="Template"  value={templateId} />
      <Row label="Domain"    value={inputs.domain} />
      <Row label="Pages"     value={(inputs.pages || []).join(', ')} />
      <Row label="Services"  value={(inputs.services || []).join(', ')} />
      <Row label="Brand kit" value={inputs.use_brand_kit ? 'Yes' : 'No'} />
      <div style={{ marginTop: 8 }}>
        <div style={{ color:'#94A3B8', fontSize: 11, marginBottom: 4 }}>Description</div>
        <div style={{ color:'#CBD5E1', fontSize: 12 }}>{inputs.business_description}</div>
      </div>
      {inputs.color_style_prefs && (
        <div style={{ marginTop: 8 }}>
          <div style={{ color:'#94A3B8', fontSize: 11, marginBottom: 4 }}>Style preferences</div>
          <div style={{ color:'#CBD5E1', fontSize: 12 }}>{inputs.color_style_prefs}</div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div style={{ display:'flex', gap: 12, padding: '4px 0' }}>
      <div style={{ color:'#94A3B8', fontSize: 12, width: 90 }}>{label}</div>
      <div style={{ color:'#F1F5F9', fontSize: 12 }}>{value}</div>
    </div>
  )
}

const h3 = { color:'#F1F5F9', fontSize: 14, fontWeight: 700, margin: 0 }
const p = { color:'#CBD5E1', fontSize: 13 }
const errStyle = { color:'#F87171', fontSize: 13 }
const btnPrimary = { background:'#00CFFF', color:'#0F172A', border:'none', borderRadius: 8, padding:'8px 14px', fontWeight: 700, fontSize: 12, cursor:'pointer', textDecoration:'none', display:'inline-flex', alignItems:'center' }
const badge = (s) => ({
  background: s==='done' ? 'rgba(34,197,94,0.1)' : s==='failed' ? 'rgba(239,68,68,0.1)' : 'rgba(0,207,255,0.08)',
  color:     s==='done' ? '#4ADE80'             : s==='failed' ? '#F87171'             : '#00CFFF',
  border:`1px solid currentColor`,
  borderRadius: 100, padding:'4px 10px', fontSize: 11, fontWeight: 700, textTransform:'uppercase', letterSpacing:'0.05em',
})

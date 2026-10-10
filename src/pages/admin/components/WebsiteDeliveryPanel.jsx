// src/pages/admin/components/WebsiteDeliveryPanel.jsx
//
// The operator half of website delivery: publish the generated repo to Vercel,
// watch the build, see what the client asked for, and attach their domain.
//
// Everything here is admin-gated server-side; this file only decides what to
// offer. The one piece of judgement baked in: a Vercel deploy is triggered by
// the operator, not automatically when the scaffold finishes, so AI-written
// copy gets a human read before the client is emailed a link to it.
import { useEffect, useState, useCallback } from 'react'
import { ExternalLink, Rocket, Globe, Check, Loader2, AlertTriangle, MessageSquare } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

export default function WebsiteDeliveryPanel({ project, onRefresh }) {
  const [working, setWorking] = useState(null) // 'deploy' | 'approve' | 'domain' | null
  const [error, setError] = useState(null)
  const [buildMessage, setBuildMessage] = useState(null)
  const [inspectorUrl, setInspectorUrl] = useState(null)
  const [domain, setDomain] = useState(project.live_url?.replace(/^https?:\/\//, '') || project.inputs?.domain || '')
  const [verification, setVerification] = useState(null)

  const token = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }, [])

  // Poll the running build. The cron does this too, for the case where nobody
  // is on this page — whichever gets there first advances the project, and the
  // server's compare-and-swap makes sure only one of them emails the client.
  useEffect(() => {
    if (project.status !== 'deploying') { setBuildMessage(null); return }
    let cancelled = false
    let timer

    async function poll() {
      try {
        const res = await fetch(`/api/website?action=deploy-status&id=${project.id}`, {
          headers: { Authorization: `Bearer ${await token()}` },
        })
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (res.ok) {
          setBuildMessage(data.message || null)
          setInspectorUrl(data.inspector_url || null)
          if (data.status !== 'deploying') { onRefresh?.(); return }
        }
      } catch { /* keep polling — a dropped request is not a failed build */ }
      if (!cancelled) timer = setTimeout(poll, 5000)
    }

    timer = setTimeout(poll, 2000)
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, project.status])

  async function post(action, body, key) {
    setWorking(key); setError(null); setVerification(null)
    try {
      const res = await fetch(`/api/website?action=${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: project.id, ...body }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.message || json.error || `Request failed (${res.status})`)
      // An attached-but-unverified domain is a success with homework attached.
      if (json.verified === false) setVerification(json)
      onRefresh?.()
      return json
    } catch (e) {
      setError(e.message)
      return null
    } finally {
      setWorking(null)
    }
  }

  const revisions = Array.isArray(project.website_revisions) ? project.website_revisions : []
  const open = revisions.filter((r) => !r.resolved_at)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  const resolved = revisions.filter((r) => r.resolved_at).length

  const isDeploying = project.status === 'deploying'
  const canDeploy = project.status !== 'deploying'
  const canApprove = ['preview_ready', 'changes_requested'].includes(project.status)
  const canAttach = ['approved', 'live'].includes(project.status)

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <Rocket size={14} color="#00CFFF" />
        <span style={{ color: '#F1F5F9', fontSize: 13, fontWeight: 700 }}>Delivery</span>
      </div>

      {/* Links the client can see */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {project.live_url && (
          <a href={project.live_url} target="_blank" rel="noreferrer" style={{ ...btnGhost, color: '#4ADE80', borderColor: 'rgba(34,197,94,0.35)' }}>
            <Globe size={13} /> {project.live_url.replace(/^https?:\/\//, '')}
          </a>
        )}
        {project.preview_url && (
          <a href={project.preview_url} target="_blank" rel="noreferrer" style={btnGhost}>
            <ExternalLink size={13} /> Preview
          </a>
        )}
        {inspectorUrl && (
          <a href={inspectorUrl} target="_blank" rel="noreferrer" style={btnGhost}>
            <ExternalLink size={13} /> Build log
          </a>
        )}
      </div>

      {isDeploying && (
        <p style={muted}>
          <Loader2 size={12} style={{ verticalAlign: '-2px', marginRight: 6 }} />
          {buildMessage || 'Building on Vercel…'}
        </p>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
        <button onClick={() => post('deploy', {}, 'deploy')} disabled={!canDeploy || working === 'deploy'} style={canDeploy ? btnPrimary : btnDisabled}>
          <Rocket size={13} />
          {working === 'deploy' ? 'Starting…'
            // Once a domain is attached, a deploy IS the live site — Vercel also
            // rebuilds production on any push to the repo. The button says so
            // rather than reading like a harmless preview refresh.
            : project.live_url ? 'Redeploy (updates the live site)'
            : project.vercel_project_id ? 'Redeploy' : 'Publish to Vercel'}
        </button>
        {canApprove && (
          <button onClick={() => post('approve-site', {}, 'approve')} disabled={working === 'approve'} style={btnGhost}>
            <Check size={13} /> {working === 'approve' ? 'Approving…' : 'Approve for client'}
          </button>
        )}
      </div>

      {canAttach && (
        <div style={subPanel}>
          <label htmlFor="wdp-domain" style={label}>Custom domain</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              id="wdp-domain" value={domain} onChange={(e) => setDomain(e.target.value)}
              placeholder="acme.com" autoComplete="off" spellCheck={false} style={input}
            />
            <button onClick={() => post('attach-domain', { domain }, 'domain')} disabled={working === 'domain' || !domain.trim()} style={btnPrimary}>
              <Globe size={13} /> {working === 'domain' ? 'Checking…' : project.status === 'live' ? 'Re-check' : 'Attach + go live'}
            </button>
          </div>
          <p style={{ ...muted, marginTop: 8 }}>
            The domain must stay in the client's own registrar account, pointed here. Run this again after the DNS records are added — the site only goes live once Vercel confirms the domain resolves.
          </p>
        </div>
      )}

      {verification && (
        <div style={{ ...subPanel, borderColor: 'rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.06)' }}>
          <div style={{ color: '#FCD34D', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={13} /> Domain attached, not verified yet
          </div>
          <p style={{ ...muted, margin: '6px 0 8px' }}>{verification.message}</p>
          {verification.verification?.length > 0 ? (
            <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
              <thead>
                <tr>{['Type', 'Name', 'Value'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', color: '#94A3B8', padding: '4px 10px 4px 0', fontWeight: 700 }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {verification.verification.map((v, i) => (
                  <tr key={i}>
                    <td style={td}>{v.type}</td>
                    <td style={td}>{v.domain || v.name || '@'}</td>
                    <td style={{ ...td, wordBreak: 'break-all', color: '#F1F5F9' }}>{v.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={muted}>Vercel returned no specific records — point the domain's A record at 76.76.21.21, or its CNAME at cname.vercel-dns.com.</p>
          )}
        </div>
      )}

      {/* What the client asked for */}
      {(open.length > 0 || resolved > 0) && (
        <div style={subPanel}>
          <div style={{ color: '#F1F5F9', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <MessageSquare size={13} color="#00CFFF" />
            {open.length} open change request{open.length === 1 ? '' : 's'}
            {resolved > 0 && <span style={{ color: '#475569', fontWeight: 400 }}>· {resolved} resolved</span>}
          </div>
          {open.map((r) => (
            <div key={r.id} style={{ borderLeft: '3px solid #00CFFF', padding: '6px 0 6px 10px', marginBottom: 8 }}>
              <div style={{ color: '#CBD5E1', fontSize: 12, whiteSpace: 'pre-wrap' }}>{r.note}</div>
              <div style={{ color: '#475569', fontSize: 11, marginTop: 3 }}>{new Date(r.created_at).toLocaleString()}</div>
            </div>
          ))}
          {open.length > 0 && (
            <>
              <button onClick={() => post('resolve-changes', {}, 'resolve')} disabled={working === 'resolve'} style={btnGhost}>
                <Check size={13} /> {working === 'resolve' ? 'Closing…' : `Mark done & tell the client`}
              </button>
              <p style={{ ...muted, marginTop: 8 }}>
                A Redeploy of a live site closes these automatically and emails the client. Use this button when the work went out another way — a direct push to the repo builds on Vercel without going through here, so nothing would close it.
              </p>
            </>
          )}
        </div>
      )}

      {error && <p style={{ color: '#F87171', fontSize: 12, margin: 0 }}>{error}</p>}
    </div>
  )
}

const card = {
  background: 'rgba(0,207,255,0.04)', border: '1px solid rgba(0,207,255,0.18)',
  borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
}
const subPanel = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 12 }
const muted = { color: '#94A3B8', fontSize: 11, margin: 0, lineHeight: 1.5 }
const label = { display: 'block', color: '#94A3B8', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }
const baseBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8, padding: '7px 12px',
  fontWeight: 700, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
  border: '1px solid transparent', textDecoration: 'none',
}
const btnPrimary = { ...baseBtn, background: '#00CFFF', color: '#0F172A' }
const btnGhost = { ...baseBtn, background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.12)', color: '#F1F5F9' }
const btnDisabled = { ...baseBtn, background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)', color: '#475569', cursor: 'not-allowed' }
const input = {
  flex: 1, minWidth: 180, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8, padding: '7px 10px', color: '#F1F5F9', fontSize: 12, fontFamily: 'inherit',
}
const td = { color: '#CBD5E1', padding: '4px 10px 4px 0', verticalAlign: 'top' }

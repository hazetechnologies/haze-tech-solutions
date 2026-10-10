// src/pages/portal/WebsiteReviewPanel.jsx
//
// The client's review surface. This replaces a single line of text that read
// "Ready — your dev team has your files" at the end of a build worth $1,500 to
// $7,500. A client who paid for a website should be able to see it, say what
// they want changed, and sign it off, without an email thread.
//
// Deliberate choices:
//  • The preview opens in a NEW TAB as the primary action, with the iframe as a
//    thumbnail. A 3D or video-background template does not read correctly in a
//    small sandboxed frame, and showing a cramped version of the thing they
//    bought undersells it.
//  • The iframe is sandboxed. It renders a separate deployment we built but do
//    not audit per-render, inside the portal where the client is logged in.
//  • No native confirm() anywhere — approval uses an inline two-step so it
//    matches the rest of the product and can't be suppressed by the browser.
import { useState } from 'react'
import { ExternalLink, Check, MessageSquarePlus, Loader2, Globe } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function WebsiteReviewPanel({ project, onChanged }) {
  const [mode, setMode] = useState(null) // null | 'confirm-approve' | 'request-changes'
  const [note, setNote] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState(null)

  const previewUrl = project.preview_url
  const liveUrl = project.live_url
  const status = project.status

  async function post(action, body) {
    setWorking(true); setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/website?action=${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: project.id, ...body }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.message || json.error || `Something went wrong (${res.status})`)
      setMode(null); setNote('')
      onChanged?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setWorking(false)
    }
  }

  // A live site keeps its link visible whatever the project status says — a
  // client who requests a change on a live site has not lost their website.
  const liveStrip = liveUrl ? (
    <a href={liveUrl} target="_blank" rel="noreferrer" style={{ ...linkBtn, background: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.35)', color: '#4ADE80' }}>
      <Globe size={14} /> {liveUrl.replace(/^https?:\/\//, '')}
    </a>
  ) : null

  if (status === 'deploying') {
    return (
      <Shell>
        <p style={body}><Loader2 size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} />Publishing your site — this usually takes a couple of minutes. We'll email you the moment it's ready to look at.</p>
        {liveStrip}
      </Shell>
    )
  }

  if (!previewUrl && !liveUrl) {
    // Covers 'done': built, not yet published. Says what is actually true
    // rather than implying the client has something to collect.
    return (
      <Shell>
        <p style={body}>Your site is built and going through our checks. You'll get a preview link to review shortly — nothing needed from you yet.</p>
      </Shell>
    )
  }

  const reviewable = status === 'preview_ready' || status === 'changes_requested'
  const canComment = ['preview_ready', 'changes_requested', 'approved', 'live'].includes(status)

  return (
    <Shell>
      {status === 'preview_ready' && (
        <p style={body}>Your site is ready to review. Have a look, then approve it or tell us what you'd like changed.</p>
      )}
      {status === 'changes_requested' && (
        <p style={body}>We have your change request and we're on it. You'll get a new preview when it's updated.</p>
      )}
      {status === 'approved' && (
        <p style={body}>Approved — thank you. We're pointing your domain at it now and will email you when it's live.</p>
      )}
      {status === 'live' && (
        <p style={body}>Your site is live. Need a change? Ask below any time.</p>
      )}

      {/* Primary actions. The new tab comes first: the preview frame below is a
          thumbnail, not the way to judge the work. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
        {liveStrip}
        {previewUrl && (
          <a href={previewUrl} target="_blank" rel="noreferrer" style={linkBtn}>
            <ExternalLink size={14} /> {liveUrl ? 'Open preview' : 'Open your site in a new tab'}
          </a>
        )}
        {reviewable && mode !== 'confirm-approve' && (
          <button onClick={() => { setMode('confirm-approve'); setError(null) }} style={primaryBtn} disabled={working}>
            <Check size={14} /> Approve
          </button>
        )}
        {canComment && mode !== 'request-changes' && (
          <button onClick={() => { setMode('request-changes'); setError(null) }} style={ghostBtn} disabled={working}>
            <MessageSquarePlus size={14} /> Request changes
          </button>
        )}
      </div>

      {mode === 'confirm-approve' && (
        <div style={panel}>
          <p style={{ ...body, margin: '0 0 10px' }}>
            Approving tells us the site is good to go and we'll put it on your domain. You can still ask for changes afterwards.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => post('approve-site')} style={primaryBtn} disabled={working}>
              {working ? 'Approving…' : 'Yes, approve it'}
            </button>
            <button onClick={() => setMode(null)} style={ghostBtn} disabled={working}>Not yet</button>
          </div>
        </div>
      )}

      {mode === 'request-changes' && (
        <div style={panel}>
          <label htmlFor="wrp-note" style={{ display: 'block', color: '#94A3B8', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
            What would you like changed?
          </label>
          <textarea
            id="wrp-note" value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={4000}
            placeholder="Be as specific as you like — which section, and what it should say or show."
            style={textarea}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
            <button onClick={() => post('request-changes', { note })} style={primaryBtn} disabled={working || !note.trim()}>
              {working ? 'Sending…' : 'Send request'}
            </button>
            <button onClick={() => { setMode(null); setNote('') }} style={ghostBtn} disabled={working}>Cancel</button>
            <span style={{ marginLeft: 'auto', color: '#475569', fontSize: 11 }}>{note.length}/4000</span>
          </div>
        </div>
      )}

      {error && <p style={{ color: '#F87171', fontSize: 13, margin: '10px 0 0' }}>{error}</p>}

      {previewUrl && (
        <div style={{ marginTop: 14 }}>
          <div style={{ color: '#475569', fontSize: 11, marginBottom: 6 }}>Preview — open in a new tab for the full experience</div>
          <div style={{ position: 'relative', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'hidden', background: '#0B1120' }}>
            <iframe
              src={previewUrl} title="Website preview" loading="lazy"
              sandbox="allow-scripts allow-same-origin allow-popups"
              referrerPolicy="no-referrer"
              style={{ width: '100%', height: 360, border: 0, display: 'block' }}
            />
          </div>
        </div>
      )}
    </Shell>
  )
}

function Shell({ children }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
}

const body = { color: '#CBD5E1', fontSize: 13, margin: 0, lineHeight: 1.5 }
const panel = { marginTop: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 14 }
const baseBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8,
  padding: '8px 14px', fontWeight: 700, fontSize: 12, cursor: 'pointer',
  fontFamily: 'inherit', textDecoration: 'none', border: '1px solid transparent',
}
const primaryBtn = { ...baseBtn, background: '#00CFFF', color: '#0F172A' }
const ghostBtn = { ...baseBtn, background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.12)', color: '#CBD5E1' }
const linkBtn = { ...baseBtn, background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.12)', color: '#F1F5F9' }
const textarea = {
  width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '10px 12px',
  color: '#F1F5F9', fontSize: 13, fontFamily: 'inherit', resize: 'vertical',
}

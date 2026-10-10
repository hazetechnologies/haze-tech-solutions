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
  const openRequests = (Array.isArray(project.website_revisions) ? project.website_revisions : [])
    .filter((r) => !r.resolved_at).length

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

  if (status === 'failed') {
    // PortalDashboard renders its own line for `failed` today, so this is
    // belt and braces — but two files disagreeing about who owns a status is
    // exactly how a client ends up reading "going through our checks" about a
    // build that failed hours ago.
    return (
      <Shell>
        <p style={body}>We've hit a snag publishing your site. The team has been alerted and is on it — we'll email you as soon as it's sorted. Nothing needed from you.</p>
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
        // Not "we're pointing your domain at it now": the DNS records still
        // have to be added and verified, which can take a day. Saying it is
        // already happening sets a clock the next step cannot keep.
        <p style={body}>Approved — thank you. Next we connect your domain. That needs a DNS change and can take up to a day to take effect; we'll email you the moment it's live.</p>
      )}
      {status === 'live' && (
        openRequests > 0
          // A live site keeps its `live` status when changes are requested —
          // there is no staging copy to review, so the status would be lying if
          // it said otherwise. The acknowledgement has to come from the request
          // itself instead, or the client clicks send and sees nothing change.
          ? <p style={body}>Your site is live, and we have {openRequests === 1 ? 'your change request' : `${openRequests} change requests`}. We'll update the live site and let you know — there's no separate preview for a site that's already running.</p>
          : <p style={body}>Your site is live. Need a change? Ask below any time.</p>
      )}

      {/* OPENING the site is the accent action, not approving it. An earlier
          version made Approve the brightest thing on screen, which invites a
          client to sign off a $7,500 build without looking at it — and on
          `changes_requested` it would have approved the very version they had
          just asked us to change. Approve stays easy to find, and stops being
          the path of least resistance. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
        {liveStrip}
        {previewUrl && !liveUrl && (
          <a href={previewUrl} target="_blank" rel="noreferrer" style={primaryBtn}>
            <ExternalLink size={14} /> Open your site in a new tab
          </a>
        )}
        {previewUrl && liveUrl && (
          // Once live, the client's own domain IS the site. This address is the
          // staging copy, and calling it "preview" without saying so reads as a
          // second, competing website.
          <a href={previewUrl} target="_blank" rel="noreferrer" style={linkBtn}>
            <ExternalLink size={14} /> Open the working copy
          </a>
        )}
        {reviewable && mode !== 'confirm-approve' && (
          <button onClick={() => { setMode('confirm-approve'); setError(null) }} style={approveBtn} disabled={working}>
            <Check size={14} /> {status === 'changes_requested' ? 'Approve as it is' : 'Approve'}
          </button>
        )}
        {canComment && mode !== 'request-changes' && (
          <button onClick={() => { setMode('request-changes'); setError(null) }} style={ghostBtn} disabled={working}>
            <MessageSquarePlus size={14} /> {openRequests > 0 ? 'Request another change' : 'Request changes'}
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
          <div style={{ color: '#475569', fontSize: 11, marginBottom: 6 }}>
            {liveUrl ? 'Working copy' : 'Preview'} — open it in a new tab for the full experience
          </div>
          <div style={{ position: 'relative', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, overflow: 'hidden', background: '#0B1120', minHeight: 180 }}>
            {/* Sits BEHIND the frame. A site sending X-Frame-Options or a
                frame-ancestors CSP renders as a blank rectangle, and so does a
                slow one: several hundred pixels of black with no explanation,
                which reads as a broken delivery rather than a thumbnail. The
                frame paints over this as soon as it loads; if it never does,
                the client gets a sentence and a way out instead of a void.
                A layer rather than onLoad detection, because a blocked
                cross-origin frame fires load for its error page too. */}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 20, textAlign: 'center' }}>
              <div style={{ color: '#64748B', fontSize: 12 }}>Loading your site…</div>
              <a href={previewUrl} target="_blank" rel="noreferrer" style={{ color: '#00CFFF', fontSize: 12, fontWeight: 700 }}>
                Not showing? Open it in a new tab
              </a>
            </div>
            <iframe
              src={previewUrl} title={liveUrl ? 'Working copy of your website' : 'Preview of your website'} loading="lazy"
              sandbox="allow-scripts allow-same-origin allow-popups"
              referrerPolicy="no-referrer"
              style={{ position: 'relative', width: '100%', height: 360, border: 0, display: 'block' }}
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
// Findable without being the path of least resistance. Approving is a
// commitment; it should not be the brightest thing on the screen.
const approveBtn = { ...baseBtn, background: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.45)', color: '#4ADE80' }
const ghostBtn = { ...baseBtn, background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.12)', color: '#CBD5E1' }
const linkBtn = { ...baseBtn, background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.12)', color: '#F1F5F9' }
const textarea = {
  width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '10px 12px',
  color: '#F1F5F9', fontSize: 13, fontFamily: 'inherit', resize: 'vertical',
}

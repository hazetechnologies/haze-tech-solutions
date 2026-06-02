// src/pages/admin/components/ClientSocialMediaTab.jsx
//
// Phase 1: Setup screen. If the client has no hsp_user_id, show an Activate
// button that creates a sub-tenant on haze-social-post and pushes the latest
// brand kit. If the client already has hsp_user_id, show an activated banner
// + a Push Brand Kit button to re-sync.
//
// Phases 2+: this file will gain Channels / Content Plans / Calendar /
// Analytics sub-screens, all driven by the same /api/website?action=hsp-proxy
// endpoint so the bearer key never lands in the browser.
import { useState, useEffect } from 'react'
import { Share2, Check, Loader2, RefreshCw, AlertTriangle } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

export default function ClientSocialMediaTab({ client, onClientUpdated }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [lastResult, setLastResult] = useState(null)
  const [platforms, setPlatforms] = useState(null)
  const [connectLink, setConnectLink] = useState(null)
  const [copied, setCopied] = useState(false)
  const [plans, setPlans] = useState(null)
  const [posts, setPosts] = useState(null)

  const activated = !!client?.hsp_user_id

  const hspProxy = async (path, method = 'GET', body) => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/website?action=hsp-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify({ path, method, body }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.message || data.error || `Server error (${res.status})`)
    return data
  }

  const openWorkspace = async (target = 'dashboard') => {
    setBusy(true); setError(null)
    try {
      // Phase 2: launch an AGENCY session that lands on THIS client via the
      // /t/<id>/ deep-link (haze-social-post middleware sets the acting_tenant
      // cookie + redirects to the target). The operator can then switch
      // clients from the in-app "Operating as" bar — no per-client logout.
      const next = `/t/${client.hsp_user_id}/${target}`
      const data = await hspProxy('/integrators/self/agency-sso-link', 'POST', { next })
      if (!data.url) throw new Error('No workspace URL returned')
      window.open(data.url, '_blank', 'noopener')
    } catch (err) {
      setError(err.message || 'Could not open workspace')
    } finally {
      setBusy(false)
    }
  }

  const loadContent = async () => {
    try {
      const [pl, po] = await Promise.all([
        hspProxy(`/tenants/${client.hsp_user_id}/content-plans`),
        hspProxy(`/tenants/${client.hsp_user_id}/posts`),
      ])
      setPlans(pl.plans || [])
      setPosts(po.posts || [])
    } catch (err) { setError(err.message) }
  }

  const loadPlatforms = async () => {
    try { const d = await hspProxy(`/tenants/${client.hsp_user_id}/connected-platforms`); setPlatforms(d.platforms || []) }
    catch (err) { setError(err.message) }
  }

  const issueConnectLink = async () => {
    setBusy(true); setError(null); setConnectLink(null); setCopied(false)
    try { const d = await hspProxy(`/tenants/${client.hsp_user_id}/connect-links`, 'POST', {}); setConnectLink(d.url) }
    catch (err) { setError(err.message || 'Could not issue link') }
    finally { setBusy(false) }
  }

  const [emailed, setEmailed] = useState(null)
  const emailConnectLink = async () => {
    setBusy(true); setError(null); setEmailed(null)
    try { const d = await hspProxy(`/tenants/${client.hsp_user_id}/connect-links/email`, 'POST', {}); setEmailed(d.to || true) }
    catch (err) { setError(err.message || 'Could not email connect link') }
    finally { setBusy(false) }
  }

  useEffect(() => { if (activated) { loadPlatforms(); loadContent() } }, [activated, client?.hsp_user_id])

  const callActivate = async () => {
    setBusy(true); setError(null); setLastResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/website?action=activate-social', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ client_id: client.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || data.error || `Server error (${res.status})`)
      setLastResult(data)
      if (onClientUpdated) await onClientUpdated()
    } catch (err) {
      setError(err.message || 'Activation failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: 'linear-gradient(135deg, rgba(0,212,255,0.15), rgba(0,153,204,0.05))', border: '1px solid rgba(0,212,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Share2 size={20} color="#00CFFF" />
        </div>
        <div>
          <h2 style={{ color: '#F1F5F9', fontSize: 18, fontWeight: 700, margin: 0 }}>Social Media</h2>
          <div style={{ color: '#64748B', fontSize: 12, marginTop: 2 }}>
            Sync this client to haze-social-post so we can run content plans and the publisher for them.
          </div>
        </div>
      </div>

      {!activated && (
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 18 }}>
          <div style={{ color: '#F1F5F9', fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Activate social media for this client</div>
          <div style={{ color: '#94A3B8', fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>
            Creates a sub-tenant on haze-social-post and pushes the latest brand kit (name, voice, palette, logo, tagline, CTA, bios, hashtags, content pillars). One-time setup — after this you'll connect their social channels and start scheduling content.
          </div>
          <button onClick={callActivate} disabled={busy} style={{
            background: busy ? 'rgba(0,212,255,0.4)' : 'linear-gradient(135deg, #00D4FF, #0099CC)',
            color: '#020817', border: 'none', borderRadius: 8, padding: '9px 18px',
            fontWeight: 700, fontSize: 14, cursor: busy ? 'not-allowed' : 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'inherit',
          }}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />}
            {busy ? 'Activating…' : 'Activate social media'}
          </button>
        </div>
      )}

      {activated && (
        <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 10, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#86EFAC', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            <Check size={14} /> Activated
          </div>
          <div style={{ color: '#94A3B8', fontSize: 12, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
            haze-social-post tenant id: {client.hsp_user_id}
          </div>
          <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
            <button onClick={callActivate} disabled={busy} style={{
              background: 'transparent', border: '1px solid rgba(255,255,255,0.12)',
              color: '#CBD5E1', borderRadius: 8, padding: '7px 14px',
              fontSize: 13, cursor: busy ? 'not-allowed' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit',
            }}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {busy ? 'Pushing…' : 'Re-push brand kit'}
            </button>
            <button onClick={() => openWorkspace('dashboard')} disabled={busy} style={{
              background: 'linear-gradient(135deg, #00D4FF, #0099CC)', color: '#020817',
              border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 700,
              cursor: busy ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit',
            }}>
              <Share2 size={13} /> Open Social Workspace
            </button>
            <span style={{ color: '#64748B', fontSize: 11 }}>
              (Use after a brand-kit regenerate to sync the latest tagline, palette, logo, etc.)
            </span>
          </div>
          <div style={{ marginTop: 18, borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 16 }}>
            <div style={{ color: '#F1F5F9', fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Channels</div>
            {platforms === null && <div style={{ color: '#64748B', fontSize: 12 }}>Loading…</div>}
            {platforms && platforms.length === 0 && (
              <div style={{ color: '#94A3B8', fontSize: 13, marginBottom: 12 }}>No channels connected yet. Send the client a connect link below.</div>
            )}
            {platforms && platforms.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {platforms.map((p, i) => (
                  <span key={i} style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#86EFAC', borderRadius: 999, padding: '4px 12px', fontSize: 12 }}>
                    {p.platform}{p.handle ? ` · @${p.handle}` : ''}
                  </span>
                ))}
              </div>
            )}
            <button onClick={issueConnectLink} disabled={busy} style={{
              background: 'transparent', border: '1px solid rgba(0,212,255,0.4)', color: '#7DD3FC',
              borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: busy ? 'not-allowed' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit',
            }}>
              <Share2 size={13} /> {busy ? 'Issuing…' : 'Issue connect link for client'}
            </button>
            <button onClick={emailConnectLink} disabled={busy} style={{
              marginLeft: 8, background: 'transparent', border: '1px solid rgba(0,212,255,0.4)', color: '#7DD3FC',
              borderRadius: 8, padding: '7px 14px', fontSize: 13, cursor: busy ? 'not-allowed' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit',
            }}>
              <Share2 size={13} /> {busy ? 'Emailing…' : 'Email connect link to client'}
            </button>
            {connectLink && (
              <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
                <input readOnly value={connectLink} onFocus={(e) => e.target.select()} style={{
                  flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 6, padding: '6px 10px', color: '#CBD5E1', fontSize: 11, fontFamily: 'ui-monospace, monospace',
                }} />
                <button onClick={() => { navigator.clipboard.writeText(connectLink); setCopied(true) }} style={{
                  background: '#00D4FF', color: '#020817', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}>{copied ? 'Copied' : 'Copy'}</button>
              </div>
            )}
            {connectLink && <div style={{ color: '#64748B', fontSize: 11, marginTop: 6 }}>Send this to the client — it expires in 5 minutes and only lets them connect their channels.</div>}
            {emailed && <div style={{ color: '#86EFAC', fontSize: 11, marginTop: 6 }}>Connect link emailed{typeof emailed === 'string' ? ` to ${emailed}` : ''} — expires in 48h.</div>}
          </div>

          <div style={{ marginTop: 18, borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ color: '#F1F5F9', fontSize: 14, fontWeight: 600 }}>Content & Calendar</div>
              <button onClick={() => openWorkspace('haze-creator')} disabled={busy} style={{
                background: 'linear-gradient(135deg, #00D4FF, #0099CC)', color: '#020817',
                border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700,
                cursor: busy ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit',
              }}>
                <Share2 size={12} /> Generate / review in workspace
              </button>
            </div>

            {plans && plans.length > 0 && (
              <div style={{ color: '#94A3B8', fontSize: 12, marginBottom: 10 }}>
                {plans.length} plan{plans.length === 1 ? '' : 's'} ·{' '}
                {plans.map((p) => `${p.name || 'Plan'} (${p.status.replace(/_/g, ' ').toLowerCase()}, ${p.post_count} posts)`).join('  ·  ')}
              </div>
            )}

            {posts === null && <div style={{ color: '#64748B', fontSize: 12 }}>Loading…</div>}
            {posts && posts.length === 0 && (
              <div style={{ color: '#94A3B8', fontSize: 13 }}>No posts yet. Use "Generate / review in workspace" to create a content plan.</div>
            )}
            {posts && posts.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
                {posts.map((p) => {
                  const when = p.scheduled_for ? new Date(p.scheduled_for).toLocaleString() : 'unscheduled'
                  const statusColor = p.status === 'PUBLISHED' ? '#86EFAC' : p.status === 'SCHEDULED' ? '#7DD3FC' : p.status === 'FAILED' || p.status === 'PARTIAL_FAILURE' ? '#FCA5A5' : '#CBD5E1'
                  return (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '8px 10px' }}>
                      <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: statusColor, textTransform: 'uppercase', width: 78 }}>{p.status.replace(/_/g, ' ')}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: '#E2E8F0', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.caption || '(no caption)'}</div>
                        <div style={{ color: '#64748B', fontSize: 10 }}>{when}{p.platforms.length ? ` · ${p.platforms.join(', ')}` : ''}</div>
                      </div>
                      {p.content_plan_id && (
                        <button onClick={() => openWorkspace(`haze-creator/plan/${p.content_plan_id}`)} disabled={busy} style={{
                          flexShrink: 0, background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#CBD5E1',
                          borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: busy ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                        }}>Open</button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, color: '#FCA5A5', fontSize: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <AlertTriangle size={14} style={{ marginTop: 1, flexShrink: 0 }} />
          <div><strong>Activation failed.</strong> {error}</div>
        </div>
      )}

      {lastResult && !error && (
        <div style={{ background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.2)', borderRadius: 8, padding: 12, color: '#7DD3FC', fontSize: 12 }}>
          {lastResult.brand_pushed
            ? 'Brand kit synced.'
            : 'Sub-tenant ready — generate a brand kit first to push it through.'}
        </div>
      )}

      <div style={{ color: '#475569', fontSize: 11, marginTop: 8, lineHeight: 1.5 }}>
        Channels (Instagram / Facebook / etc.), content plans, calendar, and analytics ship in Phases 2 and 3.
      </div>
    </div>
  )
}

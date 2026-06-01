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
import { useState } from 'react'
import { Share2, Check, Loader2, RefreshCw, AlertTriangle } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

export default function ClientSocialMediaTab({ client, onClientUpdated }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [lastResult, setLastResult] = useState(null)

  const activated = !!client?.hsp_user_id

  const openWorkspace = async () => {
    setBusy(true); setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/website?action=hsp-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ path: `/tenants/${client.hsp_user_id}/sso-link`, method: 'POST', body: { next: '/dashboard' } }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.url) throw new Error(data.message || data.error || `Server error (${res.status})`)
      window.open(data.url, '_blank', 'noopener')
    } catch (err) {
      setError(err.message || 'Could not open workspace')
    } finally {
      setBusy(false)
    }
  }

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
            <button onClick={openWorkspace} disabled={busy} style={{
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

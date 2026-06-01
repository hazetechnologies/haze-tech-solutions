// src/pages/portal/PortalSocial.jsx
// Client-facing Social page: read-only calendar + engagement, self-serve channel connect.
// All data flows through ?action=portal-social, which scopes to THIS client's tenant.
import { useEffect, useState } from 'react'
import { Share2, Loader2, AlertTriangle, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'

async function portalSocial(op, extra = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/website?action=portal-social', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
    body: JSON.stringify({ op, ...extra }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || data.error || `Error ${res.status}`)
  return data
}

export default function PortalSocial() {
  const [channels, setChannels] = useState(null)
  const [engagement, setEngagement] = useState(null)
  const [posts, setPosts] = useState(null)
  const [error, setError] = useState(null)
  const [notActivated, setNotActivated] = useState(false)
  const [connectLink, setConnectLink] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const [ch, en, po] = await Promise.all([
          portalSocial('channels'), portalSocial('engagement'), portalSocial('posts', { query: '?limit=50' }),
        ])
        setChannels(ch.platforms || [])
        setEngagement(en)
        setPosts(po.posts || [])
      } catch (err) {
        if (String(err.message).includes('not set up') || String(err.message).includes('not_activated')) setNotActivated(true)
        else setError(err.message)
      }
    })()
  }, [])

  const connect = async () => {
    setBusy(true); setError(null)
    try { const d = await portalSocial('connect-link'); if (d.url) window.open(d.url, '_blank', 'noopener'); setConnectLink(d.url || null) }
    catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  if (notActivated) {
    return (
      <div style={{ padding: 24, color: '#94A3B8', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <h1 style={{ color: '#0F172A', fontSize: 22, fontWeight: 800 }}>Social</h1>
        <p style={{ marginTop: 8 }}>Your social media workspace isn&apos;t set up yet. We&apos;ll have it ready shortly.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <h1 style={{ color: '#0F172A', fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Social</h1>
      <p style={{ color: '#64748B', fontSize: 13, marginBottom: 20 }}>Monitor your content calendar and engagement, and connect your channels.</p>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', borderRadius: 8, padding: 12, fontSize: 13, marginBottom: 16, display: 'flex', gap: 8 }}>
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      {/* Channels */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ color: '#0F172A', fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Channels</h2>
        {channels === null && <Spinner />}
        {channels && channels.length === 0 && <p style={{ color: '#64748B', fontSize: 13 }}>No channels connected yet.</p>}
        {channels && channels.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {channels.map((c, i) => (
              <span key={i} style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#047857', borderRadius: 999, padding: '4px 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Check size={12} /> {c.platform}{c.handle ? ` · @${c.handle}` : ''}
              </span>
            ))}
          </div>
        )}
        <button onClick={connect} disabled={busy} style={{ marginTop: 12, background: 'linear-gradient(135deg, #00D4FF, #0099CC)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: busy ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Share2 size={14} />} Connect a channel
        </button>
        {connectLink && <p style={{ color: '#64748B', fontSize: 11, marginTop: 6 }}>A connection window opened in a new tab. Authorize your account there.</p>}
      </section>

      {/* Engagement */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ color: '#0F172A', fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Engagement</h2>
        {engagement === null && <Spinner />}
        {engagement && (engagement.accounts || []).length === 0 && <p style={{ color: '#64748B', fontSize: 13 }}>No engagement data yet — it appears once your channels have been connected for a little while.</p>}
        {engagement && (engagement.accounts || []).length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {engagement.accounts.map((a, i) => (
              <div key={i} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>{a.platform}{a.handle ? ` · @${a.handle}` : ''}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#0099CC', marginTop: 4 }}>{a.followers != null ? a.followers.toLocaleString() : '—'}</div>
                <div style={{ fontSize: 11, color: '#64748B' }}>followers{a.engagement_rate != null ? ` · ${(a.engagement_rate).toFixed(1)}% eng` : ''}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Calendar */}
      <section>
        <h2 style={{ color: '#0F172A', fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Content calendar</h2>
        {posts === null && <Spinner />}
        {posts && posts.length === 0 && <p style={{ color: '#64748B', fontSize: 13 }}>No posts scheduled yet.</p>}
        {posts && posts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {posts.map((p) => {
              const when = p.scheduled_for ? new Date(p.scheduled_for).toLocaleString() : 'unscheduled'
              const color = p.status === 'PUBLISHED' ? '#047857' : p.status === 'SCHEDULED' ? '#0099CC' : (p.status === 'FAILED' || p.status === 'PARTIAL_FAILURE') ? '#B91C1C' : '#475569'
              return (
                <div key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'center', background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '8px 10px' }}>
                  <span style={{ flexShrink: 0, width: 78, fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase' }}>{p.status.replace(/_/g, ' ')}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#0F172A', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.caption || '(no caption)'}</div>
                    <div style={{ color: '#94A3B8', fontSize: 10 }}>{when}{p.platforms?.length ? ` · ${p.platforms.join(', ')}` : ''}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function Spinner() {
  return <div style={{ color: '#94A3B8', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}><Loader2 size={13} className="animate-spin" /> Loading…</div>
}

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useClient } from '../../lib/PortalProtectedRoute'
import { Sparkles, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import PortalBrandKitIntakeForm from './PortalBrandKitIntakeForm'

const LOGO_OPTIONS = [
  { key: 'logo_option_1', label: 'Option 1', sub: 'Design A' },
  { key: 'logo_option_2', label: 'Option 2', sub: 'Design B' },
  { key: 'logo_option_3', label: 'Option 3', sub: 'Design C' },
]

export default function PortalBrandKit() {
  const client = useClient()
  const [kit, setKit] = useState(null)
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(null) // logo_key currently being submitted
  const [error, setError] = useState(null)
  const [regenerating, setRegenerating] = useState(false)
  const pollTimer = useRef(null)

  const loadKit = useCallback(async () => {
    if (!client?.id) return
    const { data, error: fetchErr } = await supabase
      .from('brand_kits').select('*').eq('client_id', client.id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (fetchErr) { setError(fetchErr.message); setLoading(false); return }
    setKit(data)
    setLoading(false)
  }, [client?.id])

  useEffect(() => { loadKit() }, [loadKit])

  // Poll while generating
  useEffect(() => {
    if (!kit) return
    if (kit.status !== 'generating' && kit.status !== 'pending') return
    pollTimer.current = setTimeout(() => loadKit(), 4000)
    return () => { if (pollTimer.current) clearTimeout(pollTimer.current) }
  }, [kit, loadKit])

  async function approveLogo(logoKey) {
    setApproving(logoKey); setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/website?action=approve-logo', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ kit_id: kit.id, approved_logo_key: logoKey }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.message || json.error)
      await loadKit()
    } catch (e) {
      setError(e.message)
    } finally {
      setApproving(null)
    }
  }

  if (loading) return <p style={{ color: '#94A3B8' }}>Loading…</p>

  if (regenerating) {
    return <PortalBrandKitIntakeForm onStarted={() => { setRegenerating(false); setLoading(true); loadKit() }} />
  }

  if (!kit) {
    if (client?.hsp_user_id) {
      return <PortalBrandKitIntakeForm onStarted={() => { setLoading(true); loadKit() }} />
    }
    return (
      <div style={cardStyle}>
        <h2 style={h2}>Brand Kit</h2>
        <p style={{ color: '#94A3B8', fontSize: 13 }}>
          No brand kit yet. Your account manager will set one up — you'll see it here once it's ready.
        </p>
      </div>
    )
  }

  if (kit.status === 'failed') {
    return (
      <div style={cardStyle}>
        <h2 style={h2}>Brand Kit</h2>
        <div style={errorBanner}>
          <AlertCircle size={15} />
          <span>{kit.error || 'Generation failed. Please contact support.'}</span>
        </div>
        {client?.hsp_user_id && (
          <button onClick={() => setRegenerating(true)} style={{
            marginTop: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(0,212,255,0.3)',
            color: '#00D4FF', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>↻ Try again</button>
        )}
      </div>
    )
  }

  if (kit.status === 'pending' || kit.status === 'generating') {
    return (
      <div style={cardStyle}>
        <h2 style={h2}>Brand Kit</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#94A3B8', fontSize: 13, padding: '24px 0' }}>
          <Loader2 size={16} style={{ animation: 'spin 1.2s linear infinite' }} />
          <span>{kit.progress_message || 'Working on it…'}</span>
        </div>
      </div>
    )
  }

  // ── awaiting_logo_approval ──
  if (kit.status === 'awaiting_logo_approval') {
    const images = kit.assets?.images || {}
    return (
      <div style={cardStyle}>
        <h2 style={h2}>Pick your logo</h2>
        <p style={{ color: '#94A3B8', fontSize: 13, marginTop: 0, marginBottom: 18 }}>
          Three logo designs are ready. Pick your favorite — we'll then generate a matching icon, profile picture, and banners based on it.
        </p>

        {error && (
          <div style={errorBanner}><AlertCircle size={15} /><span>{error}</span></div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {LOGO_OPTIONS.map(({ key, label, sub }) => {
            const ref = images[key]
            const isApproving = approving === key
            return (
              <div key={key} style={logoCard}>
                <div style={logoImageWrap}>
                  {ref?.public_url ? (
                    <img src={ref.public_url} alt={label} style={logoImage} />
                  ) : (
                    <div style={{ color: '#475569', fontSize: 12 }}>(missing)</div>
                  )}
                </div>
                <div style={{ padding: '12px 14px' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#F1F5F9' }}>{label}</div>
                  <div style={{ fontSize: 11, color: '#64748B', marginBottom: 12 }}>{sub}</div>
                  <button
                    onClick={() => approveLogo(key)}
                    disabled={!ref?.public_url || approving !== null}
                    style={{
                      ...approveBtn,
                      opacity: !ref?.public_url || approving !== null ? 0.4 : 1,
                      cursor: !ref?.public_url || approving !== null ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isApproving ? <><Loader2 size={13} style={{ animation: 'spin 1.2s linear infinite' }} /> Approving…</>
                                  : <><CheckCircle2 size={13} /> Approve this logo</>}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── status === 'done' — show the assets ──
  const a = kit.assets || {}
  const images = a.images || {}
  return (
    <div style={cardStyle}>
      <h2 style={h2}><Sparkles size={16} style={{ display: 'inline', marginRight: 8 }} />Your Brand Kit</h2>
      <p style={{ color: '#94A3B8', fontSize: 13, marginTop: 0, marginBottom: 22 }}>
        All your social media assets and brand guide in one place. Right-click any image to save.
      </p>
      <button onClick={() => setRegenerating(true)} style={{
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(0,212,255,0.3)',
        color: '#00D4FF', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600,
        cursor: 'pointer', marginBottom: 18,
      }}>↻ Start over / regenerate</button>

      {a.voice_tone && (
        <section style={{ marginBottom: 22 }}>
          <h3 style={h3}>Voice & Tone</h3>
          <div style={{ ...textBlock, whiteSpace: 'pre-wrap' }}>{a.voice_tone}</div>
        </section>
      )}

      {a.bios && (
        <section style={{ marginBottom: 22 }}>
          <h3 style={h3}>Social Bios</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            {Object.entries(a.bios).map(([platform, bio]) => (
              <div key={platform} style={textBlock}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#00D4FF', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{platform}</div>
                <div style={{ color: '#CBD5E1', fontSize: 13, lineHeight: 1.5 }}>{bio}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {a.hashtags?.length > 0 && (
        <section style={{ marginBottom: 22 }}>
          <h3 style={h3}>Hashtags</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {a.hashtags.map((h) => (
              <span key={h} style={hashtagPill}>#{h}</span>
            ))}
          </div>
        </section>
      )}

      {a.content_pillars?.length > 0 && (
        <section style={{ marginBottom: 22 }}>
          <h3 style={h3}>Content Pillars</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            {a.content_pillars.map((p, i) => (
              <div key={i} style={textBlock}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#F1F5F9', marginBottom: 4 }}>{p.title}</div>
                <div style={{ color: '#94A3B8', fontSize: 12, lineHeight: 1.5 }}>{p.description}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {Object.keys(images).length > 0 && (
        <section>
          <h3 style={h3}>Assets</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            {Object.entries(images).filter(([key]) => !key.startsWith('logo_option_')).map(([key, ref]) => (
              <a key={key} href={ref.public_url} target="_blank" rel="noopener noreferrer" style={assetTile}>
                <div style={{ aspectRatio: '1 / 1', background: '#0F172A', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img src={ref.public_url} alt={key} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                </div>
                <div style={{ padding: '8px 10px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{key.replace(/_/g, ' ')}</div>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

const cardStyle = {
  background: '#0F172A', border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 14, padding: 28,
}
const h2 = { fontFamily: "'Orbitron', sans-serif", fontSize: 16, fontWeight: 700, color: '#F1F5F9', letterSpacing: '0.04em', marginTop: 0, marginBottom: 12 }
const h3 = { fontFamily: "'Orbitron', sans-serif", fontSize: 12, fontWeight: 700, color: '#00D4FF', letterSpacing: '0.06em', textTransform: 'uppercase', marginTop: 0, marginBottom: 10 }
const textBlock = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: 14, color: '#CBD5E1', fontSize: 13, lineHeight: 1.5 }
const errorBanner = { display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 12px', color: '#FCA5A5', fontSize: 13, marginBottom: 16 }
const logoCard = { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, overflow: 'hidden' }
const logoImageWrap = { aspectRatio: '1 / 1', background: '#0B1120', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
const logoImage = { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }
const approveBtn = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '8px 12px', background: 'linear-gradient(135deg, #00D4FF, #0099CC)', border: 'none', borderRadius: 8, color: '#020817', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }
const hashtagPill = { padding: '4px 10px', borderRadius: 999, background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.25)', color: '#00D4FF', fontSize: 12, fontWeight: 500 }
const assetTile = { display: 'block', background: '#0B1120', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, overflow: 'hidden', textDecoration: 'none', cursor: 'pointer' }

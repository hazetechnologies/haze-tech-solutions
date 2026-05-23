// src/pages/admin/components/BrandKitTab.jsx
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { trackEvent } from '../../../lib/telemetry'
import BrandKitIntakeForm from './BrandKitIntakeForm'
import BrandKitView from './BrandKitView'

const POLL_INTERVAL_MS = 2000

export default function BrandKitTab({ client }) {
  const [latestKit, setLatestKit] = useState(null)  // { id, status, progress_message, error, assets, ... }
  const [loading, setLoading] = useState(true)
  const [linkedAudit, setLinkedAudit] = useState(null)  // for Path 1 prefill detection

  // Initial load: fetch latest kit for this client + check for matching audit
  const loadInitial = useCallback(async () => {
    setLoading(true)
    const [{ data: kit }, { data: audit }] = await Promise.all([
      supabase.from('brand_kits')
        .select('*')
        .eq('client_id', client.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from('social_audits')
        .select('id, inputs, created_at')
        .filter('inputs->>email', 'eq', client.email || '')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    setLatestKit(kit ?? null)
    setLinkedAudit(audit ?? null)
    setLoading(false)
  }, [client.id, client.email])

  useEffect(() => { loadInitial() }, [loadInitial])

  // Poll while pending/generating/awaiting_logo_approval (the last keeps us
  // in sync with the client's approval — slower cadence since it can sit
  // for hours).
  useEffect(() => {
    if (!latestKit) return
    const isPolling = ['pending', 'generating', 'awaiting_logo_approval'].includes(latestKit.status)
    if (!isPolling) return
    const intervalMs = latestKit.status === 'awaiting_logo_approval' ? 10_000 : POLL_INTERVAL_MS

    let cancelled = false
    let timer

    async function poll() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch(`/api/brand-kit-status/${latestKit.id}`, {
          headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
        })
        const data = await res.json()
        if (cancelled) return
        setLatestKit(prev => ({ ...prev, ...data }))

        if (data.status === 'done') {
          trackEvent('brand_kit_completed', {
            kit_id: latestKit.id,
            duration_ms: Date.now() - new Date(latestKit.created_at).getTime(),
            client_id: client.id,
          })
          return
        }
        if (data.status === 'failed') {
          trackEvent('brand_kit_failed', {
            kit_id: latestKit.id,
            error: data.error,
            client_id: client.id,
          })
          return
        }
        timer = setTimeout(poll, intervalMs)
      } catch {
        if (!cancelled) timer = setTimeout(poll, intervalMs * 2)
      }
    }

    timer = setTimeout(poll, intervalMs)
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestKit?.id, latestKit?.status, client.id])

  // Called by intake form on successful POST
  const handleStarted = useCallback((kit_id) => {
    trackEvent('brand_kit_started', {
      client_id: client.id,
      path: linkedAudit ? 'audit_prefill' : 'cold_start',
    })
    // Optimistic: set state so polling kicks in
    setLatestKit({ id: kit_id, status: 'pending', progress_message: 'Queued…', created_at: new Date().toISOString() })
  }, [client.id, linkedAudit])

  // Regenerate: clear current kit, show intake form again (a new kit row will be created)
  const handleRegenerate = () => {
    setLatestKit(null)
  }

  // Admin picks a logo on the client's behalf — fires the banner-phase invoke.
  const [approving, setApproving] = useState(null)  // 'logo_primary' | 'logo_icon' | 'logo_monochrome' | null
  const [approveErr, setApproveErr] = useState(null)
  const handleAdminApprove = useCallback(async (logoKey) => {
    if (!latestKit?.id) return
    setApproving(logoKey)
    setApproveErr(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/website?action=approve-logo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ kit_id: latestKit.id, approved_logo_key: logoKey }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || data.error || `Server error (${res.status})`)
      trackEvent('brand_kit_admin_approved_logo', { kit_id: latestKit.id, logo_key: logoKey, client_id: client.id })
      // Optimistically move into 'generating' so the existing poll picks up banner phase
      setLatestKit(prev => ({ ...prev, status: 'generating', progress_message: 'Logo approved — generating banners…', approved_logo_asset_id: logoKey }))
    } catch (err) {
      setApproveErr(err.message || 'Failed to approve logo')
    } finally {
      setApproving(null)
    }
  }, [latestKit?.id, client.id])

  if (loading) {
    return <div style={{ color: '#64748B', fontSize: 13 }}>Loading…</div>
  }

  // No kit yet, OR user clicked Regenerate (which sets latestKit=null)
  if (!latestKit) {
    return (
      <BrandKitIntakeForm
        client={client}
        linkedAudit={linkedAudit}
        onStarted={handleStarted}
      />
    )
  }

  // Kit in progress
  if (latestKit.status === 'pending' || latestKit.status === 'generating') {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <div style={{ color: '#00CFFF', fontWeight: 600, marginBottom: 8 }}>
          Generating brand kit…
        </div>
        <div style={{ color: '#94A3B8', fontSize: 13, marginBottom: 16 }}>
          {latestKit.progress_message || 'Working…'}
        </div>
        <div style={{ color: '#475569', fontSize: 12, marginBottom: 20 }}>
          Usually takes 90-120 seconds.
        </div>
        <button
          onClick={handleRegenerate}
          style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 12px', fontSize: 11.5, color: '#94A3B8', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          ↺ Start over with different inputs
        </button>
      </div>
    )
  }

  // Awaiting client logo approval — admin can also pick on the client's behalf.
  if (latestKit.status === 'awaiting_logo_approval') {
    const images = latestKit.assets?.images || {}
    return (
      <div style={{ padding: 24 }}>
        <div style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: 10, padding: 14, color: '#FACC15', fontSize: 13, marginBottom: 18 }}>
          Logos generated. The client can approve one from their portal, or you can pick on their behalf below. Banners start as soon as one is approved.
        </div>

        {approveErr && (
          <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: 10, color: '#FCA5A5', fontSize: 12, marginBottom: 14 }}>
            {approveErr}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          {['logo_primary', 'logo_icon', 'logo_monochrome'].map((key) => {
            const ref = images[key]
            const busy = approving === key
            const otherBusy = approving !== null && approving !== key
            return (
              <div key={key} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ aspectRatio: '1 / 1', background: '#0B1120', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                  {ref?.public_url
                    ? <img src={ref.public_url} alt={key} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                    : <span style={{ color: '#475569', fontSize: 12 }}>(missing)</span>}
                </div>
                <div style={{ padding: '8px 10px 4px', fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{key.replace(/_/g, ' ')}</div>
                <div style={{ padding: '0 10px 10px' }}>
                  <button
                    onClick={() => handleAdminApprove(key)}
                    disabled={!ref?.public_url || busy || otherBusy}
                    style={{
                      width: '100%', padding: '7px 10px',
                      background: busy ? 'rgba(0,212,255,0.4)' : 'linear-gradient(135deg, #00D4FF, #0099CC)',
                      border: 'none', borderRadius: 8, color: '#020617',
                      fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                      cursor: (busy || otherBusy || !ref?.public_url) ? 'not-allowed' : 'pointer',
                      opacity: (otherBusy || !ref?.public_url) ? 0.5 : 1,
                    }}
                  >
                    {busy ? 'Approving…' : 'Pick this logo'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
          <button
            onClick={handleRegenerate}
            disabled={approving !== null}
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '7px 14px', fontSize: 12, color: '#94A3B8', cursor: approving !== null ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: approving !== null ? 0.5 : 1 }}
          >
            ↺ Start over with different inputs
          </button>
          <div style={{ marginTop: 6, fontSize: 11, color: '#475569' }}>
            (creates a new brand kit; the current logos stay on the old kit row)
          </div>
        </div>
      </div>
    )
  }

  // Failed
  if (latestKit.status === 'failed') {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: 16, color: '#FCA5A5', fontSize: 13, marginBottom: 16 }}>
          Brand kit generation failed: {latestKit.error || 'Unknown error'}
        </div>
        <button onClick={handleRegenerate} style={{ background: 'linear-gradient(135deg, #00D4FF, #0099CC)', color: '#020817', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, cursor: 'pointer' }}>
          Try again
        </button>
      </div>
    )
  }

  // Done
  return (
    <BrandKitView kit={latestKit} onRegenerate={handleRegenerate} />
  )
}

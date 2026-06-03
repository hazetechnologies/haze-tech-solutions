import { useEffect, useState, useCallback } from 'react'
import { Workflow, Check, Mail, Bell, X, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'

// Catalog of the configured notification automations. Mirrors the server-side
// registry in api/_lib/notification-registry.js (kept in sync by hand — these
// are documentation of what is wired; the source of truth is the registry).
const CATALOG = [
  { type: 'client.created',            label: 'Welcome new client',        category: 'Welcome', client: 'email + in-app',  admin: 'email + in-app', desc: 'Fires when a client is added (admin) or converted from a lead / self-signup. Admin-added clients get a set-password link.' },
  { type: 'website.intake_requested',  label: 'Intake form sent',          category: 'Status',  client: 'email + in-app',  admin: 'in-app',         desc: 'Admin activates a website project — the client is asked to complete their intake form.' },
  { type: 'website.intake_submitted',  label: 'Website intake submitted',  category: 'Status',  client: '—',               admin: 'email + in-app', desc: 'A client submits their website intake form.' },
  { type: 'website.done',              label: 'Website ready',             category: 'Status',  client: 'email + in-app',  admin: 'in-app',         desc: 'Website scaffold generation completes.' },
  { type: 'website.failed',            label: 'Website generation failed', category: 'Status',  client: '—',               admin: 'email + in-app', desc: 'Website scaffold generation fails.' },
  { type: 'brandkit.logos_ready',      label: 'Logos ready to approve',    category: 'Status',  client: 'email + in-app',  admin: 'in-app',         desc: 'Brand-kit logos are generated and awaiting client approval.' },
  { type: 'brandkit.done',             label: 'Brand kit ready',           category: 'Status',  client: 'email + in-app',  admin: 'in-app',         desc: 'Full brand kit generation completes.' },
  { type: 'invoice.paid',              label: 'Payment received',          category: 'Payment', client: 'email + in-app',  admin: 'email + in-app', desc: 'A tracked invoice is paid (Stripe).' },
  { type: 'subscription.created',      label: 'New subscription',          category: 'Payment', client: 'in-app',          admin: 'email + in-app', desc: 'A client starts a subscription (Stripe checkout).' },
]

const CAT_COLOR = { Welcome: '#4ADE80', Status: '#00CFFF', Payment: '#FCD34D' }

export default function AdminWorkflows() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [preview, setPreview] = useState(null) // { workflow, recipients } | null
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewErr, setPreviewErr] = useState(null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('notifications')
      .select('id, type, title, body, link, read_at, created_at')
      .eq('audience', 'admin')
      .order('created_at', { ascending: false })
      .limit(200)
    setItems(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const openPreview = async (workflow) => {
    setPreview({ workflow, recipients: null })
    setPreviewLoading(true)
    setPreviewErr(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/website?action=workflow-preview&type=${encodeURIComponent(workflow.type)}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || data.error || `Server error (${res.status})`)
      setPreview({ workflow, recipients: data.recipients || [] })
    } catch (e) {
      setPreviewErr(e.message)
    } finally {
      setPreviewLoading(false)
    }
  }

  const markRead = async (id) => {
    const now = new Date().toISOString()
    await supabase.from('notifications').update({ read_at: now }).eq('id', id)
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, read_at: now } : p)))
  }
  const markAll = async () => {
    const ids = items.filter((i) => !i.read_at).map((i) => i.id)
    if (!ids.length) return
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids)
    load()
  }
  const unread = items.filter((i) => !i.read_at).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div>
        <h2 style={{ color: '#F1F5F9', fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Workflow size={18} color="#00CFFF" /> Workflows &amp; Automations
        </h2>
        <p style={{ fontSize: 13, color: '#475569', margin: '4px 0 0' }}>Event-driven client + admin notifications across email and in-app. Click a workflow to view its config and preview the emails.</p>
      </div>

      {/* Catalog of active automations */}
      <div>
        <div style={{ color: '#94A3B8', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Active automations ({CATALOG.length})</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {CATALOG.map((w) => (
            <button key={w.type} onClick={() => openPreview(w)} style={{ display: 'flex', gap: 12, alignItems: 'center', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '12px 14px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', width: '100%' }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(0,212,255,0.4)')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)')}>
              <span style={{ flexShrink: 0, width: 8, height: 8, borderRadius: 999, background: '#22C55E' }} title="Active" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#F1F5F9', fontSize: 14, fontWeight: 600 }}>{w.label}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: CAT_COLOR[w.category], background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{w.category}</span>
                </div>
                <div style={{ color: '#64748B', fontSize: 12, marginTop: 2 }}>{w.desc}</div>
              </div>
              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: '#94A3B8', minWidth: 150 }}>
                <span>Client: <span style={{ color: w.client === '—' ? '#475569' : '#CBD5E1' }}>{w.client}</span></span>
                <span>Admin: <span style={{ color: w.admin === '—' ? '#475569' : '#CBD5E1' }}>{w.admin}</span></span>
              </div>
              <ChevronRight size={16} color="#475569" style={{ flexShrink: 0 }} />
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 11, color: '#475569' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Mail size={12} /> email sent when SMTP is configured (Settings → Email)</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Bell size={12} /> in-app = admin feed below + client portal bell</span>
        </div>
      </div>

      {/* Recent activity (the admin event log) */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ color: '#94A3B8', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Recent activity {unread > 0 && <span style={{ color: '#00CFFF' }}>· {unread} unread</span>}
          </div>
          {unread > 0 && <button onClick={markAll} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#CBD5E1', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Mark all read</button>}
        </div>
        {loading && <div style={{ color: '#64748B', fontSize: 13 }}>Loading…</div>}
        {!loading && items.length === 0 && <div style={{ color: '#64748B', fontSize: 13, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 16 }}>No activity yet. Events appear here as the automations above fire.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((it) => (
            <div key={it.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: it.read_at ? 'rgba(255,255,255,0.02)' : 'rgba(0,212,255,0.06)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#F1F5F9', fontSize: 14, fontWeight: it.read_at ? 500 : 700 }}>{it.title}</div>
                <div style={{ color: '#94A3B8', fontSize: 12.5, marginTop: 2 }}>{it.body}</div>
                <div style={{ color: '#475569', fontSize: 11, marginTop: 4 }}>
                  {it.type} · {new Date(it.created_at).toLocaleString()}
                  {it.link ? <> · <a href={it.link} style={{ color: '#7DD3FC' }}>{it.link}</a></> : null}
                </div>
              </div>
              {!it.read_at && (
                <button onClick={() => markRead(it.id)} title="Mark read" style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: 6, cursor: 'pointer', color: '#22C55E' }}>
                  <Check size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {preview && (
        <WorkflowPreviewModal
          workflow={preview.workflow}
          recipients={preview.recipients}
          loading={previewLoading}
          error={previewErr}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  )
}

function WorkflowPreviewModal({ workflow, recipients, loading, error, onClose }) {
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState(null)
  const hasEmail = !!(recipients && recipients.some((r) => r.emailHtml))

  const sendTest = async () => {
    setSending(true); setSendResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/website?action=send-test-email', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: workflow.type }),
      })
      const data = await res.json()
      if (!res.ok) setSendResult({ ok: false, msg: data.message || data.error || 'Failed' })
      else if (data.sent) setSendResult({ ok: true, msg: `Sent to ${data.to} — check the inbox (and spam).` })
      else setSendResult({ ok: false, msg: data.message || 'Not sent — is SMTP configured in Settings → Email?' })
    } catch (e) {
      setSendResult({ ok: false, msg: e.message })
    } finally {
      setSending(false)
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(2,8,23,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#0F172A', border: '1px solid rgba(0,212,255,0.15)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#F1F5F9', margin: 0 }}>{workflow.label}</h3>
            <div style={{ color: '#64748B', fontSize: 12, marginTop: 2, fontFamily: 'ui-monospace, monospace' }}>{workflow.type}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <div style={{ color: '#94A3B8', fontSize: 13, marginBottom: 16 }}>{workflow.desc}</div>

        {!loading && !error && hasEmail && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <button onClick={sendTest} disabled={sending} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, color: '#4ADE80', fontSize: 12, fontWeight: 600, cursor: sending ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: sending ? 0.5 : 1 }}>
              <Mail size={13} /> {sending ? 'Sending…' : 'Send test to my inbox'}
            </button>
            {sendResult && <span style={{ fontSize: 12, color: sendResult.ok ? '#86EFAC' : '#FCA5A5' }}>{sendResult.msg}</span>}
          </div>
        )}

        {loading && <div style={{ color: '#64748B', fontSize: 13 }}>Rendering preview…</div>}
        {error && <div style={{ color: '#FCA5A5', fontSize: 13, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: 12 }}>{error}</div>}

        {!loading && !error && recipients && recipients.map((r, i) => (
          <div key={i} style={{ marginBottom: 18, border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(255,255,255,0.03)' }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: r.audience === 'client' ? '#7DD3FC' : '#FCD34D' }}>{r.audience}</span>
              <span style={{ fontSize: 11, color: '#64748B' }}>{r.emailHtml ? 'email + in-app' : 'in-app only'}</span>
            </div>
            <div style={{ padding: 14 }}>
              <div style={{ fontSize: 11, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>In-app notification</div>
              <div style={{ color: '#F1F5F9', fontSize: 13, fontWeight: 600 }}>{r.title}</div>
              <div style={{ color: '#94A3B8', fontSize: 12.5, marginTop: 2 }}>{r.body}</div>
              {r.link && <div style={{ color: '#7DD3FC', fontSize: 11, marginTop: 4 }}>→ {r.link}</div>}

              {r.emailHtml && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Email preview — subject: <span style={{ color: '#CBD5E1', textTransform: 'none' }}>{r.emailSubject}</span></div>
                  <iframe title={`email-${i}`} srcDoc={r.emailHtml} style={{ width: '100%', height: 260, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, background: '#fff' }} sandbox="" />
                </div>
              )}
            </div>
          </div>
        ))}
        {!loading && !error && recipients && recipients.length === 0 && (
          <div style={{ color: '#64748B', fontSize: 13 }}>No recipients configured for this workflow.</div>
        )}
      </div>
    </div>
  )
}

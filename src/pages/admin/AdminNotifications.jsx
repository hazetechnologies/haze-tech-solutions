import { useEffect, useState, useCallback } from 'react'
import { Bell, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'

// Admin notification center. Reads audience='admin' rows via the is_admin()
// RLS policy. Doubles as the event log (every emit writes a row).
export default function AdminNotifications() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('notifications')
      .select('id, type, title, body, link, payload, read_at, created_at')
      .eq('audience', 'admin')
      .order('created_at', { ascending: false })
      .limit(200)
    setItems(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ color: '#F1F5F9', fontSize: 18, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bell size={18} color="#00CFFF" /> Notifications {unread > 0 && <span style={{ fontSize: 12, color: '#00CFFF' }}>({unread} unread)</span>}
        </h2>
        {unread > 0 && <button onClick={markAll} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', color: '#CBD5E1', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Mark all read</button>}
      </div>
      {loading && <div style={{ color: '#64748B', fontSize: 13 }}>Loading…</div>}
      {!loading && items.length === 0 && <div style={{ color: '#64748B', fontSize: 13 }}>No notifications yet.</div>}
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
  )
}

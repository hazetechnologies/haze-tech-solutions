import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// Client portal notification bell + dropdown feed. Reads the caller's own
// audience='client' rows (RLS-scoped). Polls every 60s.
export default function NotificationBell() {
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()
  const unread = items.filter((i) => !i.read_at).length

  const load = async () => {
    const { data } = await supabase
      .from('notifications')
      .select('id, title, body, link, read_at, created_at')
      .eq('audience', 'client')
      .order('created_at', { ascending: false })
      .limit(30)
    setItems(data || [])
  }

  useEffect(() => {
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const openItem = async (it) => {
    if (!it.read_at) {
      const now = new Date().toISOString()
      await supabase.from('notifications').update({ read_at: now }).eq('id', it.id)
      setItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, read_at: now } : p)))
    }
    setOpen(false)
    if (it.link) navigate(it.link)
  }

  const markAll = async () => {
    const ids = items.filter((i) => !i.read_at).map((i) => i.id)
    if (!ids.length) return
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids)
    load()
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen((o) => !o)} style={{ position: 'relative', background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8', display: 'flex', alignItems: 'center' }} aria-label="Notifications">
        <Bell size={20} />
        {unread > 0 && (
          <span style={{ position: 'absolute', top: -4, right: -4, background: '#00D4FF', color: '#020817', borderRadius: 999, fontSize: 10, fontWeight: 700, minWidth: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{unread}</span>
        )}
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 30, width: 320, maxHeight: 400, overflowY: 'auto', background: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, boxShadow: '0 16px 48px rgba(0,0,0,0.5)', zIndex: 1000, padding: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px' }}>
            <span style={{ color: '#F1F5F9', fontSize: 13, fontWeight: 700 }}>Notifications</span>
            {unread > 0 && <button onClick={markAll} style={{ background: 'none', border: 'none', color: '#00CFFF', fontSize: 11, cursor: 'pointer' }}>Mark all read</button>}
          </div>
          {items.length === 0 && <div style={{ color: '#64748B', fontSize: 12, padding: 12, textAlign: 'center' }}>No notifications</div>}
          {items.map((it) => (
            <button key={it.id} onClick={() => openItem(it)} style={{ display: 'block', width: '100%', textAlign: 'left', background: it.read_at ? 'transparent' : 'rgba(0,212,255,0.06)', border: 'none', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', marginBottom: 2, fontFamily: 'inherit' }}>
              <div style={{ color: '#E2E8F0', fontSize: 12.5, fontWeight: it.read_at ? 400 : 600 }}>{it.title}</div>
              <div style={{ color: '#94A3B8', fontSize: 11, lineHeight: 1.4 }}>{it.body}</div>
              <div style={{ color: '#475569', fontSize: 10, marginTop: 2 }}>{new Date(it.created_at).toLocaleString()}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

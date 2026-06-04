import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { Bot, Mail, MessageSquare, Users, CheckCircle, EyeOff, ShieldX, RefreshCw, AlertCircle } from 'lucide-react'

const DAY = 86400000
const dayKey = (d) => new Date(d).toISOString().slice(0, 10)

export default function ConversationsDashboard() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [m, setM] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const since7 = Date.now() - 7 * DAY
      const [chat, emails, leadsCount, leads7] = await Promise.all([
        supabase.from('chat_messages').select('session_id, role, created_at').order('created_at', { ascending: false }).limit(5000),
        supabase.from('email_autoresponses').select('source, reply_status, notes, ai_answered, created_at').order('created_at', { ascending: false }).limit(2000),
        supabase.from('leads').select('*', { count: 'exact', head: true }),
        supabase.from('leads').select('*', { count: 'exact', head: true }).gt('created_at', new Date(since7).toISOString()),
      ])
      if (chat.error) throw chat.error
      if (emails.error) throw emails.error

      const chatRows = chat.data || []
      const sessions = new Set(chatRows.map((r) => r.session_id))
      const sessions7 = new Set(chatRows.filter((r) => +new Date(r.created_at) > since7).map((r) => r.session_id))

      const er = emails.data || []
      const inbound = er.filter((r) => r.source === 'inbound')
      const note = (r) => r.notes || ''
      const answered = inbound.filter((r) => r.reply_status === 'sent' && (r.ai_answered || note(r) === 'answer')).length
      const noAck = inbound.filter((r) => note(r).startsWith('defer')).length
      const ignored = inbound.filter((r) => note(r).startsWith('ignore')).length
      const filtered = inbound.filter((r) => note(r).startsWith('skip:')).length
      const leadReplies = er.filter((r) => r.source === 'lead' && r.reply_status === 'sent').length

      // 14-day activity buckets
      const days = []
      for (let i = 13; i >= 0; i--) days.push(dayKey(Date.now() - i * DAY))
      const emailByDay = Object.fromEntries(days.map((d) => [d, 0]))
      const chatByDay = Object.fromEntries(days.map((d) => [d, 0]))
      for (const r of inbound) { const k = dayKey(r.created_at); if (k in emailByDay) emailByDay[k]++ }
      for (const r of chatRows) { const k = dayKey(r.created_at); if (k in chatByDay) chatByDay[k]++ }

      setM({
        webConversations: sessions.size,
        webConversations7: sessions7.size,
        webMessages: chatRows.length,
        inboundReceived: inbound.length,
        answered, noAck, ignored, filtered, leadReplies,
        leadsTotal: leadsCount.count ?? 0,
        leads7: leads7.count ?? 0,
        days, emailByDay, chatByDay,
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) return <div style={{ height: 200, background: 'rgba(255,255,255,0.04)', borderRadius: 14 }} />
  if (error) return <div style={styles.errorBanner}><AlertCircle size={15} /> {error}</div>
  if (!m) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ fontSize: 12, color: '#475569', margin: 0 }}>Live counts across web chat and email.</p>
        <button onClick={load} style={styles.refreshBtn}><RefreshCw size={13} /> Refresh</button>
      </div>

      <Section title="Web Chat" icon={Bot}>
        <Stat icon={MessageSquare} label="Conversations" value={m.webConversations} hint={`${m.webConversations7} in last 7 days`} color="#A78BFA" />
        <Stat icon={MessageSquare} label="Messages logged" value={m.webMessages} color="#A78BFA" />
      </Section>

      <Section title="Email" icon={Mail}>
        <Stat icon={Mail} label="Inbound handled" value={m.inboundReceived} color="#00D4FF" />
        <Stat icon={CheckCircle} label="Answered by AI" value={m.answered} hint="real FAQ answers sent" color="#4ADE80" />
        <Stat icon={EyeOff} label="Left for you" value={m.noAck} hint="no answer — kept unread" color="#FBBF24" />
        <Stat icon={ShieldX} label="Spam / notifications" value={m.ignored + m.filtered} hint="skipped automatically" color="#94A3B8" />
        <Stat icon={Mail} label="Lead replies sent" value={m.leadReplies} color="#00D4FF" />
      </Section>

      <Section title="Leads" icon={Users}>
        <Stat icon={Users} label="Total leads" value={m.leadsTotal} hint={`${m.leads7} new in 7 days`} color="#F472B6" />
      </Section>

      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Last 14 days</h3>
        <Bars days={m.days} data={m.emailByDay} label="Inbound emails" color="#00D4FF" />
        <div style={{ height: 14 }} />
        <Bars days={m.days} data={m.chatByDay} label="Web chat messages" color="#A78BFA" />
      </div>
    </div>
  )
}

function Section({ title, icon: Icon, children }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Icon size={15} color="#64748B" />
        <h3 style={styles.sectionTitle}>{title}</h3>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>{children}</div>
    </div>
  )
}

function Stat({ icon: Icon, label, value, hint, color }) {
  return (
    <div style={styles.statCard}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: color || '#94A3B8' }}>
        <Icon size={16} />
        <span style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: '#F1F5F9', marginTop: 6, lineHeight: 1 }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

function Bars({ days, data, label, color }) {
  const max = Math.max(1, ...days.map((d) => data[d] || 0))
  return (
    <div>
      <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 60 }}>
        {days.map((d) => {
          const v = data[d] || 0
          return (
            <div key={d} title={`${d}: ${v}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
              <div style={{ height: `${Math.round((v / max) * 100)}%`, minHeight: v > 0 ? 3 : 0, background: color, borderRadius: '3px 3px 0 0', opacity: 0.85 }} />
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#475569', marginTop: 4 }}>
        <span>{days[0].slice(5)}</span><span>{days[days.length - 1].slice(5)}</span>
      </div>
    </div>
  )
}

const styles = {
  sectionTitle: { fontSize: 12, fontWeight: 700, color: '#CBD5E1', letterSpacing: '0.06em', textTransform: 'uppercase', margin: 0 },
  card: { background: '#0F172A', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 20 },
  cardTitle: { fontSize: 13, fontWeight: 700, color: '#F1F5F9', margin: '0 0 16px' },
  statCard: { background: '#0F172A', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '14px 16px' },
  refreshBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#94A3B8', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" },
  errorBanner: { display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '12px 16px', color: '#FCA5A5', fontSize: 13 },
}

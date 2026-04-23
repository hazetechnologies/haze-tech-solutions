import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

function ChatWidgetInner() {
  const [sessionId] = useState(() => {
    const stored = localStorage.getItem('haze_chat_session')
    if (stored) return stored
    const id = crypto.randomUUID()
    localStorage.setItem('haze_chat_session', id)
    return id
  })
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'assistant', text: "Hey! I'm Haze, your AI assistant at Haze Tech Solutions. I can help with AI Automation, Social Media, Web Development, and SEO. What's your name and how can I help you today?" }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    const text = input.trim()
    if (!text || loading) return
    const updated = [...messages, { role: 'user', text }]
    setMessages(updated)
    setInput('')
    setLoading(true)
    try {
      const apiMsgs = updated.slice(-10).map(m => ({ role: m.role, content: m.text }))
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMsgs, sessionId }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', text: data.reply || data.error || 'Sorry, something went wrong.' }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: "Sorry, I'm having trouble connecting. Please try our contact form!" }])
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <div onClick={() => setOpen(true)} style={{
        position: 'fixed', bottom: 24, right: 24, width: 56, height: 56, borderRadius: '50%',
        background: 'linear-gradient(135deg, #00D4FF, #0099CC)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', zIndex: 2147483647, boxShadow: '0 4px 24px rgba(0,212,255,0.4)',
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#020817" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z" />
        </svg>
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 2147483647,
      width: 370, maxWidth: 'calc(100vw - 32px)', height: 500, maxHeight: 'calc(100vh - 100px)',
      background: '#0B1120', border: '1px solid rgba(0,212,255,0.15)',
      borderRadius: 16, display: 'flex', flexDirection: 'column',
      boxShadow: '0 8px 48px rgba(0,0,0,0.5)', fontFamily: "'Plus Jakarta Sans', sans-serif", overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(0,212,255,0.06)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #00D4FF, #0099CC)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#020817" strokeWidth="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#F1F5F9' }}>Haze AI</div>
            <div style={{ fontSize: 11, color: '#4ADE80' }}>Online</div>
          </div>
        </div>
        <div onClick={() => setOpen(false)} style={{ cursor: 'pointer', color: '#64748B', padding: 4 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '80%', padding: '10px 14px', borderRadius: 12, fontSize: 13, lineHeight: 1.5,
              ...(msg.role === 'user'
                ? { background: 'rgba(0,212,255,0.12)', border: '1px solid rgba(0,212,255,0.2)', color: '#F1F5F9' }
                : { background: '#1E293B', border: '1px solid rgba(255,255,255,0.06)', color: '#CBD5E1' }
              ),
            }}>
              {msg.text}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex' }}>
            <div style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 18px', color: '#64748B', fontSize: 13 }}>
              Typing...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <input
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') sendMessage() }}
          placeholder="Type a message..." disabled={loading}
          style={{ flex: 1, padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#F1F5F9', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
        />
        <div onClick={sendMessage} style={{
          width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #00D4FF, #0099CC)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
          opacity: loading || !input.trim() ? 0.4 : 1,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#020817" strokeWidth="2"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>
        </div>
      </div>
    </div>
  )
}

export default function ChatWidget() {
  return createPortal(<ChatWidgetInner />, document.body)
}

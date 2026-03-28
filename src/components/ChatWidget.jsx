import { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send, Bot, ArrowRight } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState('form') // 'form' | 'chat'
  const [lead, setLead] = useState({ name: '', email: '' })
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (open && phase === 'chat' && inputRef.current) inputRef.current.focus()
  }, [open, phase])

  const handleStartChat = async (e) => {
    e.preventDefault()
    if (!lead.name.trim() || !lead.email.trim()) return

    // Save lead to Supabase immediately
    supabase.from('leads').insert({
      name: lead.name.trim(),
      email: lead.email.trim(),
      source: 'chatbot',
      service_interest: 'General Inquiry (via Chat)',
    }).catch(console.error)

    // Start chat with greeting
    setMessages([
      { role: 'assistant', content: `Hey ${lead.name.split(' ')[0]}! I'm Haze, your AI assistant. How can I help you today? Whether you're curious about our services or ready to get started, I'm here to chat!` }
    ])
    setPhase('chat')
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg = { role: 'user', content: text }
    const updated = [...messages, userMsg]
    setMessages(updated)
    setInput('')
    setLoading(true)

    try {
      const apiMessages = updated
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content }))

      const res = await fetch('https://n8n.srv934577.hstgr.cloud/webhook/haze-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, lead }),
      })
      const data = await res.json()

      setMessages(prev => [...prev, { role: 'assistant', content: data.reply || 'Sorry, something went wrong.' }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I'm having trouble connecting right now. Please try again or reach out via our contact form!" }])
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  return (
    <>
      <style>{`
        @keyframes chatPulse { 0%,100%{box-shadow:0 0 0 0 rgba(0,207,255,0.4)} 50%{box-shadow:0 0 0 12px rgba(0,207,255,0)} }
        @keyframes chatSlideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes dotBounce { 0%,80%,100%{transform:scale(0)} 40%{transform:scale(1)} }
      `}</style>

      {/* Chat bubble */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          style={styles.bubble}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
          aria-label="Open chat"
        >
          <MessageCircle size={24} />
        </button>
      )}

      {/* Chat window */}
      {open && (
        <div style={styles.window}>
          {/* Header */}
          <div style={styles.header}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={styles.headerIcon}>
                <Bot size={18} color="#020817" />
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#F1F5F9' }}>Haze AI</div>
                <div style={{ fontSize: '11px', color: '#4ADE80', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ADE80', display: 'inline-block' }} />
                  Online
                </div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={styles.closeBtn} aria-label="Close chat">
              <X size={18} />
            </button>
          </div>

          {/* Form phase */}
          {phase === 'form' && (
            <div style={styles.formWrap}>
              <div style={styles.formCard}>
                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg, #00D4FF, #0099CC)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                    <Bot size={24} color="#020817" />
                  </div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#F1F5F9', margin: '0 0 4px' }}>Chat with Haze AI</h3>
                  <p style={{ fontSize: '12px', color: '#64748B', margin: 0 }}>Enter your info to start chatting</p>
                </div>
                <form onSubmit={handleStartChat}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                    <input
                      type="text"
                      placeholder="Your name"
                      value={lead.name}
                      onChange={e => setLead(prev => ({ ...prev, name: e.target.value }))}
                      style={styles.formInput}
                      required
                    />
                    <input
                      type="email"
                      placeholder="Your email"
                      value={lead.email}
                      onChange={e => setLead(prev => ({ ...prev, email: e.target.value }))}
                      style={styles.formInput}
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!lead.name.trim() || !lead.email.trim()}
                    style={{ ...styles.startBtn, opacity: !lead.name.trim() || !lead.email.trim() ? 0.5 : 1 }}
                  >
                    Start Chatting <ArrowRight size={14} />
                  </button>
                </form>
              </div>
              <div style={styles.footer}>Powered by Haze Tech Solutions</div>
            </div>
          )}

          {/* Chat phase */}
          {phase === 'chat' && (
            <>
              {/* Messages */}
              <div style={styles.messages}>
                {messages.map((msg, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: '10px', animation: 'chatSlideUp 0.3s ease' }}>
                    {msg.role === 'assistant' && (
                      <div style={styles.avatarBot}><Bot size={12} color="#00D4FF" /></div>
                    )}
                    <div style={msg.role === 'user' ? styles.userBubble : styles.botBubble}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                    <div style={styles.avatarBot}><Bot size={12} color="#00D4FF" /></div>
                    <div style={{ ...styles.botBubble, display: 'flex', gap: '4px', padding: '12px 16px' }}>
                      {[0, 1, 2].map(i => (
                        <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#64748B', display: 'inline-block', animation: `dotBounce 1.4s infinite ease-in-out ${i * 0.16}s` }} />
                      ))}
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div style={styles.inputArea}>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Type a message..."
                  disabled={loading}
                  style={styles.input}
                />
                <button
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
                  style={{ ...styles.sendBtn, opacity: loading || !input.trim() ? 0.4 : 1 }}
                  aria-label="Send message"
                >
                  <Send size={16} />
                </button>
              </div>

              <div style={styles.footer}>Powered by Haze Tech Solutions</div>
            </>
          )}
        </div>
      )}
    </>
  )
}

const styles = {
  bubble: {
    position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999,
    width: 56, height: 56, borderRadius: '50%',
    background: 'linear-gradient(135deg, #00D4FF, #0099CC)',
    border: 'none', color: '#020817', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 4px 24px rgba(0,212,255,0.3)',
    animation: 'chatPulse 2s infinite',
    transition: 'transform 0.2s',
  },
  window: {
    position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999,
    width: '380px', maxWidth: 'calc(100vw - 32px)', height: '520px', maxHeight: 'calc(100vh - 100px)',
    background: '#0B1120', border: '1px solid rgba(0,212,255,0.15)',
    borderRadius: '16px', display: 'flex', flexDirection: 'column',
    boxShadow: '0 8px 48px rgba(0,0,0,0.5), 0 0 40px rgba(0,212,255,0.08)',
    animation: 'chatSlideUp 0.3s ease',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    overflow: 'hidden',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '14px 16px',
    background: 'linear-gradient(135deg, rgba(0,212,255,0.1), rgba(139,92,246,0.06))',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  headerIcon: {
    width: 34, height: 34, borderRadius: '10px',
    background: 'linear-gradient(135deg, #00D4FF, #0099CC)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  closeBtn: {
    background: 'none', border: 'none', color: '#64748B', cursor: 'pointer',
    padding: '4px', borderRadius: '6px',
  },
  formWrap: {
    flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
    padding: '24px',
  },
  formCard: {
    flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
  },
  formInput: {
    width: '100%', background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px',
    padding: '12px 14px', color: '#F1F5F9', fontSize: '14px',
    fontFamily: "'Plus Jakarta Sans', sans-serif", outline: 'none', boxSizing: 'border-box',
  },
  startBtn: {
    width: '100%', padding: '12px',
    background: 'linear-gradient(135deg, #00D4FF, #0099CC)',
    border: 'none', borderRadius: '10px', color: '#020817',
    fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '14px', fontWeight: 700,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
  },
  messages: {
    flex: 1, overflowY: 'auto', padding: '16px',
    display: 'flex', flexDirection: 'column',
  },
  avatarBot: {
    width: 24, height: 24, borderRadius: '50%',
    background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginRight: '8px', flexShrink: 0, marginTop: '2px',
  },
  botBubble: {
    background: '#1E293B', border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '12px 12px 12px 4px', padding: '10px 14px',
    fontSize: '13px', color: '#CBD5E1', lineHeight: 1.5,
    maxWidth: '80%',
  },
  userBubble: {
    background: 'linear-gradient(135deg, rgba(0,212,255,0.15), rgba(0,212,255,0.08))',
    border: '1px solid rgba(0,212,255,0.2)',
    borderRadius: '12px 12px 4px 12px', padding: '10px 14px',
    fontSize: '13px', color: '#F1F5F9', lineHeight: 1.5,
    maxWidth: '80%',
  },
  inputArea: {
    display: 'flex', gap: '8px', padding: '12px 16px',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(255,255,255,0.02)',
  },
  input: {
    flex: 1, background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px',
    padding: '10px 14px', color: '#F1F5F9', fontSize: '13px',
    fontFamily: "'Plus Jakarta Sans', sans-serif", outline: 'none',
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: '10px',
    background: 'linear-gradient(135deg, #00D4FF, #0099CC)',
    border: 'none', color: '#020817', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'opacity 0.15s',
  },
  footer: {
    padding: '8px', textAlign: 'center',
    fontSize: '10px', color: '#334155',
    borderTop: '1px solid rgba(255,255,255,0.04)',
  },
}

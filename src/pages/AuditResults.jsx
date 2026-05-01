// src/pages/AuditResults.jsx
import { useEffect, useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const POLL_INTERVAL_MS = 2000
const MAX_POLL_MS = 5 * 60 * 1000
const BOOK_CALL_URL = 'https://calendar.app.google/uSe5kj6VBp1nfK4Q6'

const mdComponents = {
  h1: (props) => <h1 style={{ fontSize: '2.25rem', fontWeight: 800, margin: '0 0 1.5rem', color: '#F1F5F9', lineHeight: 1.15 }} {...props} />,
  h2: (props) => <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '2rem 0 1rem', color: '#00CFFF', borderBottom: '1px solid rgba(0,207,255,0.2)', paddingBottom: 6 }} {...props} />,
  h3: (props) => <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '1.5rem 0 0.5rem', color: '#F1F5F9' }} {...props} />,
  p:  (props) => <p style={{ margin: '0.75rem 0', color: '#CBD5E1', lineHeight: 1.65 }} {...props} />,
  strong: (props) => <strong style={{ color: '#F1F5F9', fontWeight: 700 }} {...props} />,
  em: (props) => <em style={{ color: '#94A3B8' }} {...props} />,
  ul: (props) => <ul style={{ margin: '0.75rem 0 1rem', paddingLeft: '1.25rem', color: '#CBD5E1', lineHeight: 1.65 }} {...props} />,
  ol: (props) => <ol style={{ margin: '0.75rem 0 1rem', paddingLeft: '1.25rem', color: '#CBD5E1', lineHeight: 1.65 }} {...props} />,
  li: (props) => <li style={{ margin: '0.25rem 0' }} {...props} />,
  hr: () => <hr style={{ margin: '2rem 0', border: 0, borderTop: '1px solid rgba(255,255,255,0.1)' }} />,
  table: (props) => (
    <div style={{ overflowX: 'auto', margin: '1rem 0' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }} {...props} />
    </div>
  ),
  thead: (props) => <thead style={{ background: 'rgba(0,207,255,0.08)' }} {...props} />,
  th: (props) => <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid rgba(0,207,255,0.25)', color: '#F1F5F9', fontWeight: 600 }} {...props} />,
  td: (props) => <td style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#CBD5E1' }} {...props} />,
  code: (props) => <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4, fontSize: '0.85em' }} {...props} />,
  blockquote: (props) => <blockquote style={{ margin: '1rem 0', padding: '0.5rem 1rem', borderLeft: '3px solid #00CFFF', background: 'rgba(0,207,255,0.04)', color: '#CBD5E1' }} {...props} />,
}

export default function AuditResults() {
  const { id } = useParams()
  const [state, setState] = useState({ status: 'pending', progress_message: 'Queued…' })
  const [stalled, setStalled] = useState(false)
  const startedAt = useRef(Date.now())

  useEffect(() => {
    let cancelled = false
    let timer

    async function poll() {
      try {
        const res = await fetch(`/api/social-audit-status/${id}`)
        const data = await res.json()
        if (cancelled) return
        setState(data)

        if (data.status === 'completed' || data.status === 'failed') return
        if (Date.now() - startedAt.current > MAX_POLL_MS) {
          setStalled(true)
          return
        }
        timer = setTimeout(poll, POLL_INTERVAL_MS)
      } catch {
        if (!cancelled) timer = setTimeout(poll, POLL_INTERVAL_MS * 2)
      }
    }

    poll()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [id])

  if (stalled) {
    return (
      <Container>
        <h1 style={{ color: '#F1F5F9' }}>Hang tight — your audit is taking longer than expected</h1>
        <p style={{ color: '#CBD5E1' }}>Our team has been notified. We'll email your audit to you within the next hour.</p>
        <Link to="/#contact" style={{ color: '#00CFFF' }}>Back to home</Link>
      </Container>
    )
  }

  if (state.status === 'failed') {
    return (
      <Container>
        <h1 style={{ color: '#F1F5F9' }}>We couldn't complete your audit</h1>
        <p style={{ color: '#CBD5E1' }}>{state.error}</p>
        <p style={{ color: '#CBD5E1' }}>Our team will follow up directly with a manual review.</p>
        <Link to="/#contact" style={{ color: '#00CFFF' }}>Back to home</Link>
      </Container>
    )
  }

  if (state.status === 'completed') {
    return (
      <Container>
        <article>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
            {state.report_markdown}
          </ReactMarkdown>
        </article>

        <div style={{
          marginTop: 40, padding: 28, borderRadius: 16,
          background: 'linear-gradient(135deg, rgba(0,207,255,0.08), rgba(0,207,255,0.02))',
          border: '1px solid rgba(0,207,255,0.25)',
          textAlign: 'center',
        }}>
          <h3 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#F1F5F9', margin: '0 0 0.5rem' }}>
            Want Haze Tech to execute this plan?
          </h3>
          <p style={{ color: '#CBD5E1', margin: '0 0 1.25rem' }}>
            Book a strategy call and we'll walk through the audit together.
          </p>
          <a
            href={BOOK_CALL_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              padding: '0.75rem 1.5rem',
              background: 'linear-gradient(135deg, #00D4FF, #0099CC)',
              color: '#020817',
              fontWeight: 700,
              borderRadius: 8,
              textDecoration: 'none',
              fontSize: '0.95rem',
            }}
          >
            Book a strategy call →
          </a>
        </div>
      </Container>
    )
  }

  return (
    <Container>
      <h1 style={{ color: '#F1F5F9', fontSize: '2rem', margin: '0 0 1rem' }}>Generating your social audit…</h1>
      <p style={{ color: '#CBD5E1' }}>{state.progress_message}</p>
      <ProgressList status={state.status} />
      <SkeletonBlocks />
    </Container>
  )
}

function Container({ children }) {
  return (
    <main style={{
      minHeight: '100vh',
      padding: '4rem 1.5rem',
      maxWidth: 800,
      margin: '0 auto',
      color: '#F1F5F9',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
    }}>
      {children}
    </main>
  )
}

function ProgressList({ status }) {
  const steps = [
    { key: 'fetching',  label: 'Fetching platform data' },
    { key: 'analyzing', label: 'Analyzing with AI' },
  ]
  const order = ['pending', 'fetching', 'analyzing', 'completed']
  const currentIdx = order.indexOf(status)
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: '1rem 0' }}>
      {steps.map(s => {
        const stepIdx = order.indexOf(s.key)
        const done = currentIdx > stepIdx
        const active = currentIdx === stepIdx
        return (
          <li key={s.key} style={{ padding: '0.5rem 0', color: done ? '#22c55e' : active ? '#00CFFF' : '#64748B' }}>
            {done ? '✅' : active ? '🔄' : '⚪'} {s.label}
          </li>
        )
      })}
    </ul>
  )
}

function SkeletonBlocks() {
  return (
    <div style={{ marginTop: 32 }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{
          height: 80, marginBottom: 12, borderRadius: 8,
          background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 100%)',
          backgroundSize: '200% 100%',
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
      ))}
      <style>{`@keyframes pulse { 0%,100% { background-position: 0% 0% } 50% { background-position: 100% 0% } }`}</style>
    </div>
  )
}

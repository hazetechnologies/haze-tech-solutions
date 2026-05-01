// src/pages/AuditResults.jsx
import { useEffect, useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'

const POLL_INTERVAL_MS = 2000
const MAX_POLL_MS = 5 * 60 * 1000   // 5 minutes

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
      } catch (err) {
        if (!cancelled) timer = setTimeout(poll, POLL_INTERVAL_MS * 2)
      }
    }

    poll()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [id])

  if (stalled) {
    return (
      <Container>
        <h1>Hang tight — your audit is taking longer than expected</h1>
        <p>Our team has been notified. We'll email your audit to you within the next hour.</p>
        <Link to="/#contact">Back to home</Link>
      </Container>
    )
  }

  if (state.status === 'failed') {
    return (
      <Container>
        <h1>We couldn't complete your audit</h1>
        <p>{state.error}</p>
        <p>Our team will follow up directly with a manual review.</p>
        <Link to="/#contact">Back to home</Link>
      </Container>
    )
  }

  if (state.status === 'completed') {
    return (
      <Container>
        <article className="prose prose-invert max-w-none">
          <ReactMarkdown>{state.report_markdown}</ReactMarkdown>
        </article>
        <div style={{ marginTop: 32, padding: 24, background: 'rgba(0,212,255,0.06)', borderRadius: 12 }}>
          <h3>Want Haze Tech to execute this plan?</h3>
          <Link to="/#contact" style={{ color: '#00CFFF' }}>Book a strategy call →</Link>
        </div>
      </Container>
    )
  }

  // pending / fetching / analyzing
  return (
    <Container>
      <h1>Generating your social audit…</h1>
      <p>{state.progress_message}</p>
      <ProgressList status={state.status} />
      <SkeletonBlocks />
    </Container>
  )
}

function Container({ children }) {
  return (
    <main style={{ minHeight: '100vh', padding: '4rem 1.5rem', maxWidth: 800, margin: '0 auto', color: '#F1F5F9' }}>
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
    <ul style={{ listStyle: 'none', padding: 0 }}>
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

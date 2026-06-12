// src/pages/affiliate/AffiliateDashboard.jsx
// Public-facing affiliate hub at /affiliate. Self-contained flow:
//   1. Not logged in  → login / register (Supabase auth)
//   2. Logged in, not an affiliate → "Join the Partner Program" form
//   3. Affiliate → dashboard (share link, stats, commissions, earnings)
import { useEffect, useState, useCallback } from 'react'
import { Copy, Check, DollarSign, Users, TrendingUp, LogOut, Loader2, Play, Download } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { trackEvent } from '../../lib/telemetry'

const C = { bg: '#040D1A', card: '#0B1A2E', cyan: '#00CFFF', orange: '#FF6B00', green: '#22C55E', text: '#E8F4FF', mut: '#7C93AD', line: 'rgba(255,255,255,0.08)' }
const R2 = 'https://pub-63148690e7b846428bbe77d952ec92ed.r2.dev/hts-promo'
const money = (cents) => `$${((cents || 0) / 100).toFixed(2)}`

async function authedFetch(path) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('no session')
  const res = await fetch(path, { headers: { Authorization: `Bearer ${session.access_token}` } })
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => ({})) }
}

export default function AffiliateDashboard() {
  const { user, loading: authLoading, signIn, signOut } = useAuth()
  const [stage, setStage] = useState('loading')   // loading | auth | join | dashboard
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)

  const loadAffiliate = useCallback(async () => {
    setErr(null)
    try {
      const me = await authedFetch('/api/website?action=affiliate-dashboard-data')
      if (me.status === 404) { setStage('join'); return }
      if (!me.ok) { setErr(me.json.message || 'Failed to load'); setStage('join'); return }
      setData(me.json); setStage('dashboard')
    } catch { setStage('auth') }
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (!user) { setStage('auth'); return }
    loadAffiliate()
  }, [user, authLoading, loadAffiliate])

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Plus Jakarta Sans', sans-serif", padding: '40px 20px' }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <h1 style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 22, margin: 0, letterSpacing: '0.04em' }}>
            Haze Tech <span style={{ color: C.orange }}>Partner Program</span>
          </h1>
          {user && stage !== 'auth' && (
            <button onClick={() => signOut()} style={ghostBtn}><LogOut size={14} /> Sign out</button>
          )}
        </div>

        {stage === 'loading' && <Centered><Loader2 size={26} style={{ animation: 'spin 0.8s linear infinite', color: C.cyan }} /></Centered>}
        {stage === 'auth' && <AuthForm signIn={signIn} onAuthed={loadAffiliate} />}
        {stage === 'join' && <JoinForm onJoined={loadAffiliate} />}
        {stage === 'dashboard' && data && <Dashboard data={data} />}
        {err && <p style={{ color: '#FCA5A5', fontSize: 13, marginTop: 12 }}>{err}</p>}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function Centered({ children }) {
  return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>{children}</div>
}

function AuthForm({ signIn, onAuthed }) {
  const [mode, setMode] = useState('login')   // login | register
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault(); setBusy(true); setError(null); setMsg(null)
    try {
      if (mode === 'register') {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: pw })
        if (error) { setError(error.message); return }
        trackEvent('affiliate_register', {})
        if (!data.session) { setMsg('Check your email to confirm your account, then come back and log in.'); return }
        await onAuthed()
      } else {
        const { error } = await signIn(email.trim(), pw)
        if (error) { setError(error.message); return }
        await onAuthed()
      }
    } catch { setError('Something went wrong.') } finally { setBusy(false) }
  }

  return (
    <Card>
      <h2 style={h2}>Earn 10% for every client you refer</h2>
      <p style={{ color: C.mut, fontSize: 14, marginTop: 4 }}>
        Refer a business to Haze Tech and earn <b style={{ color: C.green }}>10% of their first invoice</b> (min $50) when they become a paying client. {mode === 'login' ? 'Log in to your partner dashboard.' : 'Create your free partner account.'}
      </p>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 }}>
        <input type="email" required placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} style={input} />
        <input type="password" required minLength={6} placeholder="Password" value={pw} onChange={e => setPw(e.target.value)} style={input} />
        <button type="submit" disabled={busy} style={primaryBtn}>{busy ? 'Working…' : mode === 'login' ? 'Log in' : 'Create account'}</button>
      </form>
      {error && <p style={{ color: '#FCA5A5', fontSize: 13, marginTop: 10 }}>{error}</p>}
      {msg && <p style={{ color: C.cyan, fontSize: 13, marginTop: 10 }}>{msg}</p>}
      <p style={{ color: C.mut, fontSize: 13, marginTop: 16 }}>
        {mode === 'login' ? "New partner? " : 'Already have an account? '}
        <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); setMsg(null) }} style={linkBtn}>
          {mode === 'login' ? 'Create an account' : 'Log in'}
        </button>
      </p>
    </Card>
  )
}

function JoinForm({ onJoined }) {
  const [name, setName] = useState('')
  const [payout, setPayout] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault(); setBusy(true); setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/website?action=affiliate-signup', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || undefined, payout_method: 'paypal', payout_details: payout ? { email: payout.trim() } : undefined }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.message || 'Signup failed'); return }
      trackEvent('affiliate_joined', {})
      await onJoined()
    } catch { setError('Something went wrong.') } finally { setBusy(false) }
  }

  return (
    <Card>
      <h2 style={h2}>Join the Partner Program</h2>
      <p style={{ color: C.mut, fontSize: 14, marginTop: 4 }}>One quick step and you'll get your unique referral link.</p>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 }}>
        <label style={lbl}>Your name</label>
        <input placeholder="Jane Smith" value={name} onChange={e => setName(e.target.value)} style={input} />
        <label style={lbl}>PayPal email for payouts (optional)</label>
        <input type="email" placeholder="payouts@example.com" value={payout} onChange={e => setPayout(e.target.value)} style={input} />
        <button type="submit" disabled={busy} style={primaryBtn}>{busy ? 'Creating…' : 'Get my referral link'}</button>
      </form>
      {error && <p style={{ color: '#FCA5A5', fontSize: 13, marginTop: 10 }}>{error}</p>}
    </Card>
  )
}

function Dashboard({ data }) {
  const { affiliate, stats, totals, commissions } = data
  const [copied, setCopied] = useState(false)
  const [tab, setTab] = useState('overview')
  const copy = () => { navigator.clipboard?.writeText(affiliate.link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) }) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {[['overview', 'My Dashboard'], ['resources', 'Resources & Training']].map(([k, lab]) => (
          <button key={k} onClick={() => setTab(k)} style={{ ...tabBtn, ...(tab === k ? tabBtnOn : {}) }}>{lab}</button>
        ))}
      </div>

      {tab === 'resources' ? <Resources affiliate={affiliate} /> : (
       <>
      <Card>
        <label style={lbl}>Your referral link</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input readOnly value={affiliate.link} style={{ ...input, flex: 1 }} onFocus={e => e.target.select()} />
          <button onClick={copy} style={{ ...primaryBtn, width: 'auto', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6 }}>
            {copied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy</>}
          </button>
        </div>
        <p style={{ color: C.mut, fontSize: 12, marginTop: 8 }}>Share this link. Anyone who visits and becomes a paying client earns you a commission. Code: <b style={{ color: C.cyan }}>{affiliate.code}</b></p>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
        <Stat icon={Users} color={C.cyan} label="Referrals" value={stats.referrals} />
        <Stat icon={TrendingUp} color={C.orange} label="Became clients" value={stats.conversions} />
        <Stat icon={DollarSign} color={C.green} label="Total earned" value={money(totals.earned_cents)} />
        <Stat icon={DollarSign} color={C.mut} label="Paid out" value={money(totals.paid_cents)} />
      </div>

      <Card>
        <h2 style={{ ...h2, fontSize: 16 }}>Commissions</h2>
        <div style={{ display: 'flex', gap: 18, margin: '10px 0 16px', fontSize: 13, color: C.mut }}>
          <span>Pending: <b style={{ color: C.text }}>{money(totals.pending_cents)}</b></span>
          <span>Approved: <b style={{ color: C.text }}>{money(totals.approved_cents)}</b></span>
          <span>Paid: <b style={{ color: C.green }}>{money(totals.paid_cents)}</b></span>
        </div>
        {commissions.length === 0 ? (
          <p style={{ color: C.mut, fontSize: 14 }}>No commissions yet. Share your link to get started!</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ color: C.mut, textAlign: 'left' }}>
              <th style={th}>Date</th><th style={th}>Amount</th><th style={th}>Status</th>
            </tr></thead>
            <tbody>
              {commissions.map(c => (
                <tr key={c.id} style={{ borderTop: `1px solid ${C.line}` }}>
                  <td style={td}>{new Date(c.created_at).toLocaleDateString()}</td>
                  <td style={td}>{money(c.amount_cents)}</td>
                  <td style={td}><StatusPill status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
       </>
      )}
    </div>
  )
}

// Knowledge base: per-product brochure (PDF) + explainer video for affiliates.
const KB = [
  { name: 'AI Automation', tagline: 'Work smarter, not harder.', color: C.cyan, pdf: '/brochures/kb/hts-kb-ai-automation.pdf', video: `${R2}/hts-ai-automation-promo.mp4` },
  { name: 'Social Media Marketing', tagline: 'Grow your audience on autopilot.', color: C.orange, pdf: '/brochures/kb/hts-kb-social-media.pdf', video: `${R2}/hts-social-media-promo.mp4` },
  { name: 'Website Development', tagline: 'Sites built to convert.', color: '#A78BFA', pdf: '/brochures/kb/hts-kb-website.pdf', video: `${R2}/hts-website-promo.mp4` },
  { name: 'SEO & Digital Marketing', tagline: 'Get found. Stay found. Convert.', color: C.green, pdf: '/brochures/kb/hts-kb-seo.pdf', video: `${R2}/hts-seo-promo.mp4` },
  { name: 'Brand Identity Kits', tagline: 'A complete brand in days.', color: '#A78BFA', pdf: '/brochures/kb/hts-kb-brand-kit.pdf', video: `${R2}/hts-brand-kit-promo.mp4` },
  { name: 'Platforms We Manage', tagline: 'Everywhere your customers are.', color: C.orange, pdf: '/brochures/kb/hts-kb-platforms.pdf', video: `${R2}/hts-platforms-promo.mp4` },
  { name: 'Bundles — Save & Scale', tagline: 'Two channels, one price.', color: C.green, pdf: '/brochures/kb/hts-kb-bundles.pdf', video: `${R2}/hts-bundles-promo.mp4` },
]
const CONCEPTS = [
  { name: 'What Is AI Automation?', tagline: 'The concept, explained simply.', color: C.cyan, pdf: '/brochures/kb/hts-kb-what-is-ai-automation.pdf', video: `${R2}/hts-what-is-ai-automation-promo.mp4` },
  { name: 'Types of Websites We Build', tagline: 'The right site for the goal.', color: '#A78BFA', pdf: '/brochures/kb/hts-kb-website-types.pdf', video: `${R2}/hts-website-types-promo.mp4` },
]
const RECRUIT = [
  { name: 'Partner one-pager (PDF)', href: '/brochures/hts-partner.pdf' },
  { name: 'Partner promo video', href: `${R2}/hts-partner-promo.mp4` },
]

function Resources() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card>
        <h2 style={h2}>Learn the products</h2>
        <p style={{ color: C.mut, fontSize: 13, marginTop: 4 }}>Know what you're referring. Each guide covers what it is, how it works, who it's for, and how to pitch it. Share the videos with prospects too.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          {KB.map(k => (
            <div key={k.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 14, background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.line}`, borderRadius: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: k.color }}>{k.name}</div>
                <div style={{ fontSize: 12, color: C.mut }}>{k.tagline}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <a href={k.video} target="_blank" rel="noreferrer" style={resBtn}><Play size={14} /> Watch</a>
                <a href={k.pdf} target="_blank" rel="noreferrer" style={{ ...resBtn, background: 'rgba(0,207,255,0.1)', borderColor: 'rgba(0,207,255,0.3)', color: C.cyan }}><Download size={14} /> Brochure</a>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <h2 style={h2}>Explain the basics</h2>
        <p style={{ color: C.mut, fontSize: 13, marginTop: 4 }}>Great for prospects who are new to it — plain-language explainers you can forward directly.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          {CONCEPTS.map(k => (
            <div key={k.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 14, background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.line}`, borderRadius: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: k.color }}>{k.name}</div>
                <div style={{ fontSize: 12, color: C.mut }}>{k.tagline}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <a href={k.video} target="_blank" rel="noreferrer" style={resBtn}><Play size={14} /> Watch</a>
                <a href={k.pdf} target="_blank" rel="noreferrer" style={{ ...resBtn, background: 'rgba(0,207,255,0.1)', borderColor: 'rgba(0,207,255,0.3)', color: C.cyan }}><Download size={14} /> Brochure</a>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <h2 style={{ ...h2, fontSize: 16 }}>Recruit other partners</h2>
        <p style={{ color: C.mut, fontSize: 13, margin: '4px 0 14px' }}>Grab these to invite others into the Partner Program.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {RECRUIT.map(r => (
            <a key={r.name} href={r.href} target="_blank" rel="noreferrer" style={resBtn}><Download size={14} /> {r.name}</a>
          ))}
        </div>
      </Card>
    </div>
  )
}

function Stat({ icon: Icon, color, label, value }) {
  return (
    <div style={{ ...cardStyle, padding: 18 }}>
      <Icon size={18} color={color} />
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8 }}>{value}</div>
      <div style={{ fontSize: 12, color: C.mut }}>{label}</div>
    </div>
  )
}

function StatusPill({ status }) {
  const map = { pending: ['#FCD34D', 'rgba(245,158,11,0.15)'], approved: [C.cyan, 'rgba(0,207,255,0.12)'], paid: [C.green, 'rgba(34,197,94,0.15)'], void: [C.mut, 'rgba(148,163,184,0.12)'] }
  const [fg, bg] = map[status] || map.void
  return <span style={{ color: fg, background: bg, padding: '2px 8px', borderRadius: 6, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{status}</span>
}

const cardStyle = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 24 }
function Card({ children }) { return <div style={cardStyle}>{children}</div> }
const h2 = { fontFamily: "'Orbitron', sans-serif", fontSize: 18, margin: 0 }
const lbl = { fontSize: 12, color: C.mut, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }
const input = { background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.line}`, borderRadius: 9, padding: '11px 14px', color: C.text, fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', width: '100%' }
const primaryBtn = { background: `linear-gradient(135deg, ${C.cyan}, #0099CC)`, border: 'none', borderRadius: 9, padding: '11px 16px', color: '#020817', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer', width: '100%' }
const ghostBtn = { display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: `1px solid ${C.line}`, borderRadius: 8, padding: '7px 12px', color: C.mut, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }
const linkBtn = { background: 'none', border: 'none', color: C.cyan, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', padding: 0, textDecoration: 'underline' }
const th = { padding: '6px 8px', fontWeight: 600 }
const td = { padding: '10px 8px' }
const tabBtn = { background: 'transparent', border: `1px solid ${C.line}`, borderRadius: 9, padding: '8px 16px', color: C.mut, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
const tabBtnOn = { background: 'rgba(0,207,255,0.12)', color: C.cyan, borderColor: 'rgba(0,207,255,0.3)' }
const resBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.line}`, borderRadius: 8, padding: '8px 12px', color: C.text, fontSize: 12.5, fontWeight: 600 }

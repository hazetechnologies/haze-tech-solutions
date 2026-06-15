// src/pages/affiliate/AffiliateDashboard.jsx
// /affiliate — a full Partner Program experience:
//   • Logged out  → a marketing landing page (offer, how it works, FAQ) + login/register
//   • Logged in, not yet an affiliate → welcome + one-step join
//   • Affiliate   → a portal with Dashboard / Resources / Payouts
import { useEffect, useState, useCallback } from 'react'
import {
  Copy, Check, DollarSign, Users, TrendingUp, LogOut, Loader2, Play, Download,
  LayoutGrid, BookOpen, Wallet, Link2, ArrowRight, Gift, ShieldCheck, Zap, UserPlus,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/AuthContext'
import { trackEvent, trackSignup } from '../../lib/telemetry'
import PricingGrid from '../../components/PricingGrid'

const C = { bg: '#040D1A', card: '#0B1A2E', cyan: '#00CFFF', orange: '#FF6B00', green: '#22C55E', text: '#E8F4FF', mut: '#7C93AD', line: 'rgba(255,255,255,0.08)' }
const R2 = 'https://pub-63148690e7b846428bbe77d952ec92ed.r2.dev/hts-promo'
const LOGO = 'https://www.hazetechsolutions.com/favicon.png'
const money = (cents) => `$${((cents || 0) / 100).toFixed(2)}`

async function authedFetch(path, opts = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('no session')
  const res = await fetch(path, { ...opts, headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } })
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => ({})) }
}

function useIsMobile(bp = 820) {
  const [m, setM] = useState(typeof window !== 'undefined' && window.innerWidth < bp)
  useEffect(() => {
    const on = () => setM(window.innerWidth < bp)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [bp])
  return m
}

export default function AffiliateDashboard() {
  const { user, loading: authLoading, signIn, signOut } = useAuth()
  const [stage, setStage] = useState('loading') // loading | landing | join | portal
  const [profile, setProfile] = useState(null)
  const [data, setData] = useState(null)

  const load = useCallback(async () => {
    try {
      const me = await authedFetch('/api/website?action=affiliate-me')
      if (me.status === 404) { setStage('join'); return }
      if (!me.ok) { setStage('join'); return }
      setProfile(me.json.affiliate)
      const dash = await authedFetch('/api/website?action=affiliate-dashboard-data')
      if (dash.ok) setData(dash.json)
      setStage('portal')
    } catch { setStage('landing') }
  }, [])

  useEffect(() => {
    if (authLoading) return
    if (!user) { setStage('landing'); return }
    load()
  }, [user, authLoading, load])

  if (stage === 'loading') return <FullBleed><Centered><Loader2 size={28} style={{ animation: 'spin 0.8s linear infinite', color: C.cyan }} /></Centered></FullBleed>
  if (stage === 'landing') return <Landing signIn={signIn} onAuthed={load} />
  if (stage === 'join') return <Join onJoined={load} signOut={signOut} />
  return <Portal profile={profile} data={data} onRefresh={load} signOut={signOut} />
}

function FullBleed({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {children}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
function Centered({ children }) { return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>{children}</div> }

/* ─────────────────────────  LANDING (logged out)  ───────────────────────── */
function Landing({ signIn, onAuthed }) {
  const isMobile = useIsMobile()
  return (
    <FullBleed>
      <div style={{ background: `radial-gradient(circle at 82% -10%, rgba(0,207,255,0.16), transparent 45%), radial-gradient(circle at 0% 110%, rgba(255,107,0,0.12), transparent 42%)` }}>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: isMobile ? '22px 16px 40px' : '28px 20px 60px' }}>
          <Brandbar />
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1.15fr) minmax(320px,0.85fr)', gap: isMobile ? 26 : 40, alignItems: 'center', marginTop: 24 }}>
            {/* Hero copy */}
            <div>
              <span style={pill}>HAZE TECH PARTNER PROGRAM</span>
              <h1 style={{ fontFamily: "'Orbitron', sans-serif", fontSize: isMobile ? 30 : 44, lineHeight: 1.1, margin: '16px 0 14px', fontWeight: 800 }}>
                Refer businesses.<br /><span style={{ color: C.cyan }}>Earn real commission.</span>
              </h1>
              <p style={{ color: C.mut, fontSize: isMobile ? 15 : 16, lineHeight: 1.6, maxWidth: 520 }}>
                Introduce a business to Haze Tech and earn <b style={{ color: C.green }}>10% of their first invoice</b> when they become a paying client. Free to join, no quotas, no cap. Get a full partner account with a tracked link, marketing materials, and live earnings.
              </p>
              <div style={{ display: 'flex', gap: 26, marginTop: 24, flexWrap: 'wrap' }}>
                <HeroStat value="10%" label="of first invoice" />
                <HeroStat value="$50" label="minimum payout" />
                <HeroStat value="No cap" label="on referrals" />
              </div>
            </div>
            {/* Auth card */}
            <AuthCard signIn={signIn} onAuthed={onAuthed} />
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: isMobile ? '0 16px 50px' : '0 20px 70px' }}>
        <Section title="See how it works — in 60 seconds">
          <div style={{ maxWidth: 760, margin: '0 auto' }}>
            <video
              controls preload="metadata" playsInline poster={`${R2}/img/rec-handshake.png`}
              style={{ width: '100%', borderRadius: 16, border: `1px solid ${C.line}`, display: 'block', background: '#000' }}
            >
              <source src={`${R2}/hts-partner-promo.mp4`} type="video/mp4" />
            </video>
          </div>
        </Section>

        <Section title="How it works">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 16 }}>
            <Step n="1" icon={Link2} title="Get your link" body="Create your free account and grab your unique referral link in seconds." />
            <Step n="2" icon={ArrowRight} title="Share it" body="Send it to business owners in your network, post it, or add it to your site." />
            <Step n="3" icon={DollarSign} title="Get paid" body="When your referral becomes a paying client, your commission lands in your dashboard." />
          </div>
        </Section>

        <Section title="What you get">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px,1fr))', gap: 16 }}>
            <Perk icon={LayoutGrid} title="A real partner dashboard" body="Track your link, referrals, conversions, and every commission in real time." />
            <Perk icon={BookOpen} title="Done-for-you materials" body="Brochures and explainer videos for every service — learn them, and forward them to prospects." />
            <Perk icon={Wallet} title="Transparent payouts" body="See pending, approved, and paid commissions. Set your payout details once." />
            <Perk icon={Gift} title="10% on every client" body="No cap on how many you refer. The more you connect us with, the more you earn." />
          </div>
        </Section>

        <Section title="Questions">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px,1fr))', gap: 14 }}>
            <Faq q="What does it cost to join?" a="Nothing. It's free, with no quotas and no commitment." />
            <Faq q="How much can I earn?" a="10% of each referral's first invoice — minimum $50, with no cap on referrals." />
            <Faq q="When do I get paid?" a="Within 30 days of your referral's first cleared payment." />
            <Faq q="How are referrals tracked?" a="Your unique link tracks every visit for 30 days; you're credited when they become a paying client." />
          </div>
        </Section>

        {/* Closing CTA */}
        <div style={{ marginTop: 48, borderRadius: 18, padding: '40px 28px', textAlign: 'center', background: `linear-gradient(120deg, rgba(0,207,255,0.14), rgba(255,107,0,0.12))`, border: '1px solid rgba(0,207,255,0.3)' }}>
          <h2 style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 26, margin: 0 }}>Ready to start earning?</h2>
          <p style={{ color: C.mut, fontSize: 15, margin: '8px 0 20px' }}>Create your free partner account in under a minute. No cost, no quotas.</p>
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} style={{ ...primaryBtn, width: 'auto', padding: '13px 28px', fontSize: 15 }}>Become a partner →</button>
        </div>
      </div>
    </FullBleed>
  )
}

function AuthCard({ signIn, onAuthed }) {
  const [mode, setMode] = useState('register')
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null); const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault(); setBusy(true); setError(null); setMsg(null)
    try {
      if (mode === 'register') {
        // Our own branded, SafeLinks-safe email confirmation (not Supabase's).
        const res = await fetch('/api/website?action=affiliate-register', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), password: pw }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) { setError(json.message || 'Could not create your account.'); return }
        trackEvent('affiliate_register', {})
        trackSignup('affiliate')
        setMsg(json.emailWarning
          ? "Account created, but we couldn't send the confirmation email — contact info@hazetechsolutions.com."
          : '📧 Check your inbox — we sent a link to confirm your email. Click it, then log in here.')
      } else {
        const { error } = await signIn(email.trim(), pw)
        if (error) {
          setError(/confirm/i.test(error.message) ? 'Please confirm your email first — check your inbox for the link.' : error.message)
          return
        }
        await onAuthed()
      }
    } catch { setError('Something went wrong.') } finally { setBusy(false) }
  }

  return (
    <div style={{ ...cardStyle, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
      <h2 style={{ ...h2, fontSize: 18 }}>{mode === 'register' ? 'Become a partner' : 'Partner login'}</h2>
      <p style={{ color: C.mut, fontSize: 13, marginTop: 4 }}>{mode === 'register' ? 'Free account — start earning in minutes.' : 'Welcome back.'}</p>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 18 }}>
        <input type="email" required placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} style={input} />
        <input type="password" required minLength={6} placeholder="Password" value={pw} onChange={e => setPw(e.target.value)} style={input} />
        <button type="submit" disabled={busy} style={primaryBtn}>{busy ? 'Working…' : mode === 'register' ? 'Create my partner account' : 'Log in'}</button>
      </form>
      {error && <p style={{ color: '#FCA5A5', fontSize: 13, marginTop: 10 }}>{error}</p>}
      {msg && <p style={{ color: C.cyan, fontSize: 13, marginTop: 10 }}>{msg}</p>}
      <p style={{ color: C.mut, fontSize: 13, marginTop: 14 }}>
        {mode === 'register' ? 'Already a partner? ' : 'New here? '}
        <button onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setError(null); setMsg(null) }} style={linkBtn}>
          {mode === 'register' ? 'Log in' : 'Create an account'}
        </button>
      </p>
    </div>
  )
}

/* ─────────────────────────  JOIN (logged in, not yet affiliate)  ───────────────────────── */
function Join({ onJoined, signOut }) {
  const [name, setName] = useState(''); const [payout, setPayout] = useState('')
  const [busy, setBusy] = useState(false); const [error, setError] = useState(null)
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError(null)
    try {
      const r = await authedFetch('/api/website?action=affiliate-signup', { method: 'POST', body: JSON.stringify({ name: name.trim() || undefined, payout_method: 'paypal', payout_details: payout ? { email: payout.trim() } : undefined }) })
      if (!r.ok) { setError(r.json.message || 'Signup failed'); return }
      trackEvent('affiliate_joined', {})
      await onJoined()
    } catch { setError('Something went wrong.') } finally { setBusy(false) }
  }
  return (
    <FullBleed>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '28px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <Brandbar small />
          <button onClick={() => signOut()} style={ghostBtn}><LogOut size={14} /> Sign out</button>
        </div>
        <div style={cardStyle}>
          <span style={pill}>ONE LAST STEP</span>
          <h2 style={{ ...h2, marginTop: 14 }}>Activate your partner account</h2>
          <p style={{ color: C.mut, fontSize: 14, marginTop: 4 }}>We'll generate your unique referral link instantly.</p>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20 }}>
            <div><label style={lbl}>Your name</label><input placeholder="Jane Smith" value={name} onChange={e => setName(e.target.value)} style={{ ...input, marginTop: 6 }} /></div>
            <div><label style={lbl}>PayPal email for payouts (optional)</label><input type="email" placeholder="payouts@example.com" value={payout} onChange={e => setPayout(e.target.value)} style={{ ...input, marginTop: 6 }} /></div>
            <button type="submit" disabled={busy} style={primaryBtn}>{busy ? 'Creating…' : 'Get my referral link'}</button>
          </form>
          {error && <p style={{ color: '#FCA5A5', fontSize: 13, marginTop: 10 }}>{error}</p>}
        </div>
      </div>
    </FullBleed>
  )
}

/* ─────────────────────────  PORTAL (affiliate)  ───────────────────────── */
function Portal({ profile, data, onRefresh, signOut }) {
  const [tab, setTab] = useState('dashboard')
  const isMobile = useIsMobile()
  const pad = isMobile ? 14 : 20
  const tabs = [['dashboard', 'Dashboard', LayoutGrid], ['refer', 'Refer a Lead', UserPlus], ['pricing', 'Pricing', DollarSign], ['resources', 'Resources', BookOpen], ['payouts', 'Payouts', Wallet]]
  return (
    <FullBleed>
      {/* Portal header */}
      <div style={{ borderBottom: `1px solid ${C.line}`, background: 'rgba(11,26,46,0.6)', position: 'sticky', top: 0, zIndex: 5, backdropFilter: 'blur(8px)' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: `12px ${pad}px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
            <img src={LOGO} alt="" style={{ width: 34, height: 34, borderRadius: 8, flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 15, fontWeight: 700 }}>Partner Portal</div>
              <div style={{ fontSize: 12, color: C.mut, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Hi {profile?.name || 'there'} 👋</div>
            </div>
          </div>
          <button onClick={() => signOut()} style={{ ...ghostBtn, flexShrink: 0 }}><LogOut size={14} /> {isMobile ? '' : 'Sign out'}</button>
        </div>
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: `0 ${pad}px`, display: 'flex', gap: 4, overflowX: 'auto' }}>
          {tabs.map(([k, label, Icon]) => (
            <button key={k} onClick={() => setTab(k)} style={{ ...navTab, ...(tab === k ? navTabOn : {}), whiteSpace: 'nowrap' }}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 1000, margin: '0 auto', padding: `26px ${pad}px 60px` }}>
        {tab === 'dashboard' && <DashboardPanel data={data} onRefresh={onRefresh} />}
        {tab === 'refer' && <ReferLeadPanel link={data?.affiliate?.link} onSubmitted={onRefresh} />}
        {tab === 'pricing' && (
          <div>
            <h2 style={{ ...h2, marginBottom: 6 }}>Packages & pricing</h2>
            <p style={{ color: C.mut, fontSize: 13, margin: '0 0 22px' }}>What you're referring — quote these to prospects. You earn <b style={{ color: C.green }}>10% of their first invoice</b> (min $50) when a referral becomes a paying client.</p>
            <PricingGrid readOnly />
          </div>
        )}
        {tab === 'resources' && <ResourcesPanel />}
        {tab === 'payouts' && <PayoutsPanel profile={profile} data={data} onSaved={onRefresh} />}
      </div>
    </FullBleed>
  )
}

function DashboardPanel({ data }) {
  const [copied, setCopied] = useState(false)
  if (!data) return <Centered><Loader2 size={24} style={{ animation: 'spin 0.8s linear infinite', color: C.cyan }} /></Centered>
  const { affiliate, stats, totals, commissions } = data
  const copy = () => navigator.clipboard?.writeText(affiliate.link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) })
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card>
        <label style={lbl}>Your referral link</label>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input readOnly value={affiliate.link} style={{ ...input, flex: 1 }} onFocus={e => e.target.select()} />
          <button onClick={copy} style={{ ...primaryBtn, width: 'auto', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6 }}>{copied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy</>}</button>
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
        {commissions.length === 0 ? <p style={{ color: C.mut, fontSize: 14 }}>No commissions yet. Share your link to get started!</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ color: C.mut, textAlign: 'left' }}><th style={th}>Date</th><th style={th}>Amount</th><th style={th}>Status</th></tr></thead>
            <tbody>{commissions.map(c => (<tr key={c.id} style={{ borderTop: `1px solid ${C.line}` }}><td style={td}>{new Date(c.created_at).toLocaleDateString()}</td><td style={td}>{money(c.amount_cents)}</td><td style={td}><StatusPill status={c.status} /></td></tr>))}</tbody>
          </table>
        )}
      </Card>
    </div>
  )
}

function ReferLeadPanel({ link, onSubmitted }) {
  const SERVICES = ['AI Automation', 'Social Media Marketing', 'Website Development', 'SEO & Digital Marketing', 'Brand Identity Kit', 'Not sure / Multiple']
  const [f, setF] = useState({ business_name: '', name: '', email: '', service_interest: '', message: '' })
  const [busy, setBusy] = useState(false); const [done, setDone] = useState(false); const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError(null)
    try {
      const r = await authedFetch('/api/website?action=affiliate-submit-lead', { method: 'POST', body: JSON.stringify(f) })
      if (!r.ok) { setError(r.json.message || 'Could not submit.'); return }
      setDone(true); if (onSubmitted) onSubmitted()
    } catch { setError('Something went wrong.') } finally { setBusy(false) }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card>
        <h2 style={h2}>Refer a lead</h2>
        <p style={{ color: C.mut, fontSize: 13, marginTop: 4 }}>Know a business that needs us? Enter their details and what they're after — we'll reach out, and it's tracked to you for commission automatically.</p>
        {done ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <Check size={38} color={C.green} />
            <h3 style={{ fontSize: 16, fontWeight: 700, marginTop: 10 }}>Referral submitted 🎉</h3>
            <p style={{ color: C.mut, fontSize: 14, marginTop: 6 }}>It's in our pipeline and tracked to you. You'll earn 10% when they become a paying client.</p>
            <button onClick={() => { setDone(false); setF({ business_name: '', name: '', email: '', service_interest: '', message: '' }) }} style={{ ...primaryBtn, width: 'auto', padding: '10px 18px', marginTop: 16 }}>Refer another</button>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16, maxWidth: 480 }}>
            <div><label style={lbl}>Business name</label><input placeholder="Joe's Plumbing" value={f.business_name} onChange={e => setF({ ...f, business_name: e.target.value })} style={{ ...input, marginTop: 6 }} /></div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 180px' }}><label style={lbl}>Contact name *</label><input required placeholder="Joe Smith" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} style={{ ...input, marginTop: 6 }} /></div>
              <div style={{ flex: '1 1 180px' }}><label style={lbl}>Email *</label><input required type="email" placeholder="joe@example.com" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} style={{ ...input, marginTop: 6 }} /></div>
            </div>
            <div><label style={lbl}>What do they need?</label>
              <select value={f.service_interest} onChange={e => setF({ ...f, service_interest: e.target.value })} style={{ ...input, marginTop: 6, cursor: 'pointer' }}>
                <option value="">Select a service…</option>
                {SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Their request / notes</label><textarea rows={3} placeholder="What are they looking for?" value={f.message} onChange={e => setF({ ...f, message: e.target.value })} style={{ ...input, marginTop: 6, resize: 'vertical', fontFamily: 'inherit' }} /></div>
            <button type="submit" disabled={busy} style={{ ...primaryBtn, width: 'auto', padding: '11px 20px' }}>{busy ? 'Submitting…' : 'Submit referral'}</button>
          </form>
        )}
        {error && <p style={{ color: '#FCA5A5', fontSize: 13, marginTop: 10 }}>{error}</p>}
      </Card>
      {link && (
        <Card>
          <h2 style={{ ...h2, fontSize: 16 }}>…or just share your link</h2>
          <p style={{ color: C.mut, fontSize: 13, margin: '4px 0 10px' }}>Send your personal landing page — anyone who signs up through it is tracked to you for 30 days.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input readOnly value={link} style={{ ...input, flex: 1 }} onFocus={e => e.target.select()} />
            <button onClick={() => navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) })} style={{ ...primaryBtn, width: 'auto', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6 }}>{copied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy</>}</button>
          </div>
        </Card>
      )}
    </div>
  )
}

function PayoutsPanel({ profile, data, onSaved }) {
  const [name, setName] = useState(profile?.name || '')
  const [payout, setPayout] = useState(profile?.payout_details?.email || '')
  const [busy, setBusy] = useState(false); const [saved, setSaved] = useState(false); const [error, setError] = useState(null)
  const totals = data?.totals || {}
  async function save(e) {
    e.preventDefault(); setBusy(true); setError(null); setSaved(false)
    try {
      const r = await authedFetch('/api/website?action=affiliate-update-payout', { method: 'POST', body: JSON.stringify({ name: name.trim() || undefined, payout_method: 'paypal', payout_details: payout ? { email: payout.trim() } : undefined }) })
      if (!r.ok) { setError(r.json.message || 'Save failed'); return }
      setSaved(true); setTimeout(() => setSaved(false), 2500); await onSaved()
    } catch { setError('Something went wrong.') } finally { setBusy(false) }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 14 }}>
        <Stat icon={Wallet} color="#FCD34D" label="Pending" value={money(totals.pending_cents)} />
        <Stat icon={ShieldCheck} color={C.cyan} label="Approved" value={money(totals.approved_cents)} />
        <Stat icon={DollarSign} color={C.green} label="Paid out" value={money(totals.paid_cents)} />
      </div>
      <Card>
        <h2 style={{ ...h2, fontSize: 16 }}>Payout details</h2>
        <p style={{ color: C.mut, fontSize: 13, margin: '4px 0 16px' }}>Where we send your commissions. We pay out via PayPal within 30 days of a referral's first cleared payment.</p>
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 420 }}>
          <div><label style={lbl}>Name</label><input value={name} onChange={e => setName(e.target.value)} style={{ ...input, marginTop: 6 }} /></div>
          <div><label style={lbl}>PayPal email</label><input type="email" placeholder="payouts@example.com" value={payout} onChange={e => setPayout(e.target.value)} style={{ ...input, marginTop: 6 }} /></div>
          <button type="submit" disabled={busy} style={{ ...primaryBtn, width: 'auto', padding: '11px 20px' }}>{busy ? 'Saving…' : saved ? '✓ Saved' : 'Save payout details'}</button>
        </form>
        {error && <p style={{ color: '#FCA5A5', fontSize: 13, marginTop: 10 }}>{error}</p>}
      </Card>
      <Card>
        <h2 style={{ ...h2, fontSize: 16 }}>Account</h2>
        <div style={{ fontSize: 13, color: C.mut, lineHeight: 2, marginTop: 8 }}>
          <div>Email: <b style={{ color: C.text }}>{profile?.email}</b></div>
          <div>Referral code: <b style={{ color: C.cyan }}>{profile?.code}</b></div>
          <div>Status: <b style={{ color: C.green, textTransform: 'capitalize' }}>{profile?.status}</b></div>
          <div>Member since: <b style={{ color: C.text }}>{profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'}</b></div>
        </div>
      </Card>
    </div>
  )
}

function ResourcesPanel() {
  const group = (title, sub, items) => (
    <Card>
      <h2 style={h2}>{title}</h2>
      <p style={{ color: C.mut, fontSize: 13, marginTop: 4 }}>{sub}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
        {items.map(k => (
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
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {group('Learn the products', "Know what you're referring — and forward the videos to prospects.", KB)}
      {group('Explain the basics', 'Plain-language explainers, great for prospects new to it.', CONCEPTS)}
      <Card>
        <h2 style={{ ...h2, fontSize: 16 }}>Recruit other partners</h2>
        <p style={{ color: C.mut, fontSize: 13, margin: '4px 0 14px' }}>Grab these to invite others into the Partner Program.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {RECRUIT.map(r => (<a key={r.name} href={r.href} target="_blank" rel="noreferrer" style={resBtn}><Download size={14} /> {r.name}</a>))}
        </div>
      </Card>
    </div>
  )
}

/* ─────────────────────────  shared bits  ───────────────────────── */
function Brandbar({ small }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
      <img src={LOGO} alt="" style={{ width: small ? 32 : 40, height: small ? 32 : 40, borderRadius: 9 }} />
      <div style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 800, fontSize: small ? 15 : 18, letterSpacing: '0.02em' }}>HAZE <span style={{ color: C.orange }}>TECH</span> <span style={{ color: C.mut, fontWeight: 600 }}>· Partners</span></div>
    </div>
  )
}
function HeroStat({ value, label }) {
  return <div><div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 26, fontWeight: 800, color: C.cyan }}>{value}</div><div style={{ fontSize: 11, color: C.mut, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div></div>
}
function Section({ title, children }) {
  return <div style={{ marginTop: 46 }}><h2 style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 18, marginBottom: 18 }}>{title}</h2>{children}</div>
}
function Step({ n, icon: Icon, title, body }) {
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 22, fontWeight: 900, color: 'rgba(0,207,255,0.45)' }}>{n}</span>
        <Icon size={18} color={C.cyan} />
      </div>
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{title}</h3>
      <p style={{ fontSize: 13, color: C.mut, lineHeight: 1.5 }}>{body}</p>
    </div>
  )
}
function Perk({ icon: Icon, title, body }) {
  return (
    <div style={cardStyle}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(0,207,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}><Icon size={17} color={C.cyan} /></div>
      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{title}</h3>
      <p style={{ fontSize: 13, color: C.mut, lineHeight: 1.5 }}>{body}</p>
    </div>
  )
}
function Faq({ q, a }) {
  return <div style={cardStyle}><h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{q}</h3><p style={{ fontSize: 13, color: C.mut, lineHeight: 1.5 }}>{a}</p></div>
}
function Stat({ icon: Icon, color, label, value }) {
  return <div style={{ ...cardStyle, padding: 18 }}><Icon size={18} color={color} /><div style={{ fontSize: 24, fontWeight: 700, marginTop: 8 }}>{value}</div><div style={{ fontSize: 12, color: C.mut }}>{label}</div></div>
}
function StatusPill({ status }) {
  const map = { pending: ['#FCD34D', 'rgba(245,158,11,0.15)'], approved: [C.cyan, 'rgba(0,207,255,0.12)'], paid: [C.green, 'rgba(34,197,94,0.15)'], void: [C.mut, 'rgba(148,163,184,0.12)'] }
  const [fg, bg] = map[status] || map.void
  return <span style={{ color: fg, background: bg, padding: '2px 8px', borderRadius: 6, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{status}</span>
}
const cardStyle = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 22 }
function Card({ children }) { return <div style={cardStyle}>{children}</div> }

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

const h2 = { fontFamily: "'Orbitron', sans-serif", fontSize: 18, margin: 0 }
const lbl = { display: 'block', fontSize: 12, color: C.mut, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }
const pill = { display: 'inline-block', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.cyan, background: 'rgba(0,207,255,0.08)', border: '1px solid rgba(0,207,255,0.25)', borderRadius: 999, padding: '5px 12px' }
const input = { background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.line}`, borderRadius: 9, padding: '11px 14px', color: C.text, fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', width: '100%' }
const primaryBtn = { background: `linear-gradient(135deg, ${C.cyan}, #0099CC)`, border: 'none', borderRadius: 9, padding: '11px 16px', color: '#020817', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', cursor: 'pointer', width: '100%' }
const ghostBtn = { display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: `1px solid ${C.line}`, borderRadius: 8, padding: '7px 12px', color: C.mut, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }
const linkBtn = { background: 'none', border: 'none', color: C.cyan, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', padding: 0, textDecoration: 'underline' }
const navTab = { display: 'flex', alignItems: 'center', gap: 7, background: 'transparent', border: 'none', borderBottom: '2px solid transparent', padding: '12px 14px', color: C.mut, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }
const navTabOn = { color: C.cyan, borderBottomColor: C.cyan }
const resBtn = { display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.line}`, borderRadius: 8, padding: '8px 12px', color: C.text, fontSize: 12.5, fontWeight: 600 }
const th = { padding: '6px 8px', fontWeight: 600 }
const td = { padding: '10px 8px' }

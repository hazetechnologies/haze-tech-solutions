import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'
import { useClient } from '../../lib/PortalProtectedRoute'
import {
  LayoutDashboard, Receipt,
  LogOut, ExternalLink, ChevronRight,
} from 'lucide-react'

const NAV = [
  { to: '/portal/dashboard', label: 'Dashboard',  icon: LayoutDashboard },
  { to: '/portal/invoices',  label: 'Invoices',   icon: Receipt },
]

export default function PortalLayout() {
  const { signOut } = useAuth()
  const client = useClient()
  const navigate = useNavigate()
  const location = useLocation()

  const handleSignOut = async () => {
    await signOut()
    navigate('/portal/login')
  }

  const seg = location.pathname.replace('/portal/', '').split('/')
  const crumbs = seg.filter(Boolean).map(s =>
    s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ')
  )

  return (
    <div style={{ minHeight: '100vh', background: '#020817', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
        @keyframes spin { to { transform: rotate(360deg) } }
        .portal-nav-link { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-radius: 9px; text-decoration: none; font-size: 13.5px; font-weight: 500; color: #64748B; transition: background 0.15s, color 0.15s; }
        .portal-nav-link:hover { background: rgba(255,255,255,0.04); color: #94A3B8; }
        .portal-nav-link.active { background: rgba(0,212,255,0.1); color: #00D4FF; font-weight: 600; }
      `}</style>

      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <div>
          <div style={styles.logoWrap}>
            <span style={styles.logoText}>HAZE TECH</span>
            <span style={styles.badge}>PORTAL</span>
          </div>

          {client && (
            <div style={styles.clientInfo}>
              <div style={styles.avatar}>{(client.name || 'C')[0].toUpperCase()}</div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#F1F5F9' }}>{client.name}</div>
                <div style={{ fontSize: '11px', color: '#475569' }}>{client.company || client.email}</div>
              </div>
            </div>
          )}

          <div style={styles.divider} />

          <p style={styles.navLabel}>NAVIGATION</p>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} end className={({ isActive }) => `portal-nav-link${isActive ? ' active' : ''}`}>
                <Icon size={17} /> {label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <a href="/" target="_blank" rel="noopener noreferrer" className="portal-nav-link">
            <ExternalLink size={15} /> Main Site
          </a>
          <button onClick={handleSignOut} className="portal-nav-link" style={{ border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', color: '#EF4444', width: '100%', textAlign: 'left' }}>
            <LogOut size={15} /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div style={{ marginLeft: 240 }}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.pageTitle}>{crumbs[crumbs.length - 1] || 'Dashboard'}</h1>
            <div style={styles.breadcrumbs}>
              <span style={styles.crumb}>Portal</span>
              {crumbs.map((c, i) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ChevronRight size={12} color="#334155" />
                  <span style={{ ...styles.crumb, ...(i === crumbs.length - 1 ? { color: '#00D4FF' } : {}) }}>{c}</span>
                </span>
              ))}
            </div>
          </div>
        </header>

        <main style={styles.main}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}

const styles = {
  sidebar: {
    position: 'fixed', top: 0, left: 0, bottom: 0, width: 240,
    background: '#0B1120', borderRight: '1px solid rgba(255,255,255,0.06)',
    display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    padding: '24px 14px', zIndex: 40, overflowY: 'auto',
  },
  logoWrap: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '0 8px', marginBottom: '20px',
  },
  logoText: {
    fontFamily: "'Orbitron', sans-serif", fontSize: '15px', fontWeight: 700,
    color: '#00D4FF', letterSpacing: '0.08em',
  },
  badge: {
    fontSize: '10px', fontWeight: 700, color: '#22c55e',
    background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)',
    padding: '2px 8px', borderRadius: '6px', letterSpacing: '0.06em',
  },
  clientInfo: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '10px 8px', background: 'rgba(255,255,255,0.03)',
    borderRadius: '10px', marginBottom: '16px',
  },
  avatar: {
    width: 34, height: 34, borderRadius: '50%',
    background: 'rgba(0,212,255,0.15)', border: '1px solid rgba(0,212,255,0.3)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '14px', fontWeight: 700, color: '#00D4FF',
  },
  divider: { height: '1px', background: 'rgba(255,255,255,0.06)', margin: '4px 0 16px' },
  navLabel: {
    fontSize: '10px', fontWeight: 600, color: '#334155',
    letterSpacing: '0.08em', padding: '0 8px', marginBottom: '8px',
  },
  header: {
    position: 'sticky', top: 0, zIndex: 30,
    background: 'rgba(2,8,23,0.85)', backdropFilter: 'blur(12px)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    padding: '18px 32px',
  },
  pageTitle: {
    fontFamily: "'Orbitron', sans-serif", fontSize: '18px', fontWeight: 700,
    color: '#F1F5F9', letterSpacing: '0.04em', margin: 0,
  },
  breadcrumbs: { display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' },
  crumb: { fontSize: '12px', color: '#475569' },
  main: { padding: '28px 32px' },
}

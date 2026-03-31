import { useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'
import {
  LayoutDashboard,
  Users,
  Briefcase,
  FileText,
  Newspaper,
  UserCircle,
  Package,
  Settings,
  Building,
  HelpCircle,
  Zap,
  ExternalLink,
  LogOut,
  ChevronRight,
} from 'lucide-react'

const SIDEBAR_WIDTH = 240

const navItems = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/leads',     label: 'Leads',     icon: Users },
  { to: '/admin/portfolio', label: 'Portfolio', icon: Briefcase },
  { to: '/admin/blog',      label: 'Blog',      icon: FileText },
  { to: '/admin/press',     label: 'Press',     icon: Newspaper },
  { to: '/admin/clients',   label: 'Clients',   icon: UserCircle },
  { to: '/admin/products',  label: 'Products',  icon: Package },
  { to: '/admin/business-info', label: 'Business Info', icon: Building },
  { to: '/admin/faqs',          label: 'FAQs',          icon: HelpCircle },
  { to: '/admin/triggers',      label: 'Triggers',      icon: Zap },
  { to: '/admin/settings',      label: 'Settings',      icon: Settings },
]

const pageTitles = {
  '/admin/dashboard': 'Dashboard',
  '/admin/leads':     'Leads',
  '/admin/portfolio': 'Portfolio',
  '/admin/blog':      'Blog',
  '/admin/press':     'Press',
  '/admin/clients':   'Clients',
  '/admin/products':  'Products',
  '/admin/business-info': 'Business Info',
  '/admin/faqs':          'FAQs',
  '/admin/triggers':      'Triggers',
  '/admin/settings':      'Settings',
}

function getPageTitle(pathname) {
  return pageTitles[pathname] ?? 'Admin'
}

function getBreadcrumbs(pathname) {
  const title = pageTitles[pathname]
  if (!title) return [{ label: 'Admin', to: '/admin/dashboard' }]
  return [
    { label: 'Admin', to: '/admin/dashboard' },
    { label: title, to: pathname },
  ]
}

export default function AdminLayout() {
  const { signOut } = useAuth()
  const navigate    = useNavigate()
  const location    = useLocation()
  const [signingOut, setSigningOut] = useState(false)

  const pageTitle   = getPageTitle(location.pathname)
  const breadcrumbs = getBreadcrumbs(location.pathname)

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      await signOut()
      navigate('/admin')
    } catch {
      setSigningOut(false)
    }
  }

  return (
    <div style={styles.shell}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #020817; }
        .admin-nav-link { text-decoration: none; display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 10px; font-size: 14px; font-weight: 500; color: #94A3B8; transition: background 0.15s, color 0.15s; }
        .admin-nav-link:hover { background: rgba(0,212,255,0.06); color: #CBD5E1; }
        .admin-nav-link.active { background: rgba(0,212,255,0.12); color: #00D4FF; }
        .admin-nav-link.active svg { color: #00D4FF; }
        .admin-nav-link svg { flex-shrink: 0; }
      `}</style>

      {/* Sidebar */}
      <aside style={styles.sidebar}>
        {/* Logo */}
        <div style={styles.logoArea}>
          <div style={styles.logoMark}>
            <span style={styles.logoText}>HAZE TECH</span>
          </div>
          <span style={styles.logoBadge}>Admin</span>
        </div>

        <div style={styles.sidebarDivider} />

        {/* Nav */}
        <nav style={styles.nav}>
          <span style={styles.navSection}>Navigation</span>
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Bottom actions */}
        <div style={styles.sidebarBottom}>
          <div style={styles.sidebarDivider} />
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            style={styles.viewSiteLink}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#CBD5E1' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#64748B' }}
          >
            <ExternalLink size={15} />
            View Site
          </a>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            style={styles.signOutBtn}
            onMouseEnter={(e) => { if (!signingOut) e.currentTarget.style.background = 'rgba(239,68,68,0.12)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >
            <LogOut size={15} />
            {signingOut ? 'Signing out…' : 'Sign Out'}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div style={styles.main}>
        {/* Top header */}
        <header style={styles.header}>
          <div>
            <h1 style={styles.pageTitle}>{pageTitle}</h1>
            <nav aria-label="breadcrumb" style={styles.breadcrumbRow}>
              {breadcrumbs.map((crumb, i) => (
                <span key={crumb.to} style={styles.breadcrumbItem}>
                  {i > 0 && <ChevronRight size={12} style={{ margin: '0 4px', color: '#334155' }} />}
                  {i < breadcrumbs.length - 1 ? (
                    <NavLink to={crumb.to} style={styles.breadcrumbLink}>{crumb.label}</NavLink>
                  ) : (
                    <span style={styles.breadcrumbCurrent}>{crumb.label}</span>
                  )}
                </span>
              ))}
            </nav>
          </div>
        </header>

        {/* Page content */}
        <main style={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}

const styles = {
  shell: {
    display: 'flex',
    minHeight: '100vh',
    background: '#020817',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  },
  sidebar: {
    width: `${SIDEBAR_WIDTH}px`,
    minWidth: `${SIDEBAR_WIDTH}px`,
    background: '#0F172A',
    borderRight: '1px solid rgba(255,255,255,0.06)',
    display: 'flex',
    flexDirection: 'column',
    position: 'fixed',
    top: 0,
    left: 0,
    height: '100vh',
    overflowY: 'auto',
    overflowX: 'hidden',
    zIndex: 100,
  },
  logoArea: {
    padding: '24px 20px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoMark: {
    display: 'flex',
    alignItems: 'center',
  },
  logoText: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '15px',
    fontWeight: 700,
    color: '#00D4FF',
    letterSpacing: '0.08em',
  },
  logoBadge: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#8B5CF6',
    background: 'rgba(139,92,246,0.12)',
    border: '1px solid rgba(139,92,246,0.25)',
    borderRadius: '5px',
    padding: '2px 7px',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  sidebarDivider: {
    height: '1px',
    background: 'rgba(255,255,255,0.06)',
    margin: '0 16px',
  },
  nav: {
    padding: '16px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    flex: 1,
  },
  navSection: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#334155',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    padding: '4px 6px 10px',
  },
  sidebarBottom: {
    padding: '0 0 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  viewSiteLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 26px',
    fontSize: '13px',
    color: '#64748B',
    textDecoration: 'none',
    transition: 'color 0.15s',
    marginTop: '12px',
  },
  signOutBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 26px',
    fontSize: '13px',
    color: '#EF4444',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    fontWeight: 500,
    borderRadius: '10px',
    margin: '0 12px',
    transition: 'background 0.15s',
    width: 'calc(100% - 24px)',
  },
  main: {
    marginLeft: `${SIDEBAR_WIDTH}px`,
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
  },
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 50,
    background: 'rgba(2, 8, 23, 0.85)',
    backdropFilter: 'blur(12px)',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    padding: '18px 32px',
  },
  pageTitle: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: '18px',
    fontWeight: 700,
    color: '#F1F5F9',
    letterSpacing: '0.04em',
    marginBottom: '4px',
  },
  breadcrumbRow: {
    display: 'flex',
    alignItems: 'center',
  },
  breadcrumbItem: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '12px',
  },
  breadcrumbLink: {
    color: '#475569',
    textDecoration: 'none',
    transition: 'color 0.15s',
  },
  breadcrumbCurrent: {
    color: '#00D4FF',
  },
  content: {
    flex: 1,
    padding: '32px',
    overflowY: 'auto',
  },
}

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './lib/AuthContext'
import ProtectedRoute from './lib/ProtectedRoute'
import PortalProtectedRoute from './lib/PortalProtectedRoute'

import MainSite        from './MainSite'
import AuditPage       from './pages/AuditPage'
import AuditResults    from './pages/AuditResults'
import FreeSocialAudit from './pages/FreeSocialAudit'

import AdminLogin     from './pages/admin/AdminLogin'
import AdminLayout    from './pages/admin/AdminLayout'
import Dashboard      from './pages/admin/Dashboard'
import Leads          from './pages/admin/Leads'
import PortfolioManager from './pages/admin/PortfolioManager'
import BlogManager    from './pages/admin/BlogManager'
import PressManager   from './pages/admin/PressManager'
import ClientManager   from './pages/admin/ClientManager'
import ClientDetail    from './pages/admin/ClientDetail'
import ProductsManager from './pages/admin/ProductsManager'
import Settings           from './pages/admin/Settings'
import BusinessInfo       from './pages/admin/BusinessInfo'
import FaqManager         from './pages/admin/FaqManager'
import AutomationTriggers from './pages/admin/AutomationTriggers'
import SocialAudits       from './pages/admin/SocialAudits'
import SocialAuditDetail  from './pages/admin/SocialAuditDetail'

import BlogPage        from './pages/BlogPage'
import BlogPost        from './pages/BlogPost'

import PortalLogin     from './pages/portal/PortalLogin'
import PortalLayout    from './pages/portal/PortalLayout'
import PortalDashboard from './pages/portal/PortalDashboard'
import PortalProject   from './pages/portal/PortalProject'
import PortalInvoices  from './pages/portal/PortalInvoices'

import * as Sentry from '@sentry/react'
import SentryFallback from './components/SentryFallback'

export default function App() {
  return (
    <Sentry.ErrorBoundary fallback={({ resetError }) => <SentryFallback resetError={resetError} />}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
          {/* Public */}
          <Route path="/"       element={<MainSite />} />
          <Route path="/audit"  element={<AuditPage />} />
          <Route path="/audit/:id" element={<AuditResults />} />
          <Route path="/free-social-audit" element={<FreeSocialAudit />} />
          <Route path="/blog"   element={<BlogPage />} />
          <Route path="/blog/:slug" element={<BlogPost />} />

          {/* Admin login */}
          <Route path="/admin/login" element={<AdminLogin />} />

          {/* Redirect /admin → /admin/dashboard */}
          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />

          {/* Protected admin shell */}
          <Route path="/admin" element={
            <ProtectedRoute><AdminLayout /></ProtectedRoute>
          }>
            <Route path="dashboard"       element={<Dashboard />} />
            <Route path="leads"           element={<Leads />} />
            <Route path="portfolio"       element={<PortfolioManager />} />
            <Route path="blog"            element={<BlogManager />} />
            <Route path="press"           element={<PressManager />} />
            <Route path="clients"         element={<ClientManager />} />
            <Route path="clients/:clientId" element={<ClientDetail />} />
            <Route path="products"        element={<ProductsManager />} />
            <Route path="settings"        element={<Settings />} />
            <Route path="business-info"   element={<BusinessInfo />} />
            <Route path="faqs"            element={<FaqManager />} />
            <Route path="triggers"        element={<AutomationTriggers />} />
            <Route path="social-audits"   element={<SocialAudits />} />
            <Route path="social-audits/:id" element={<SocialAuditDetail />} />
          </Route>

          {/* Portal login */}
          <Route path="/portal/login" element={<PortalLogin />} />

          {/* Redirect /portal → /portal/dashboard */}
          <Route path="/portal" element={<Navigate to="/portal/dashboard" replace />} />

          {/* Protected client portal */}
          <Route path="/portal" element={
            <PortalProtectedRoute><PortalLayout /></PortalProtectedRoute>
          }>
            <Route path="dashboard"            element={<PortalDashboard />} />
            <Route path="projects/:projectId"  element={<PortalProject />} />
            <Route path="invoices"             element={<PortalInvoices />} />
          </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </Sentry.ErrorBoundary>
  )
}

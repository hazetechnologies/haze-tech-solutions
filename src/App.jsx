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
import AdminChatbot       from './pages/admin/AdminChatbot'
import EmailAutoResponder from './pages/admin/EmailAutoResponder'
import Conversations      from './pages/admin/Conversations'
import AutomationTriggers from './pages/admin/AutomationTriggers'
import SocialAudits       from './pages/admin/SocialAudits'
import SocialAuditDetail  from './pages/admin/SocialAuditDetail'
import AdminWorkflows     from './pages/admin/AdminWorkflows'
import AffiliatesManager   from './pages/admin/AffiliatesManager'
import AffiliateDashboard  from './pages/affiliate/AffiliateDashboard'
import AffiliateConfirm     from './pages/affiliate/AffiliateConfirm'

import BlogPage        from './pages/BlogPage'
import BlogPost        from './pages/BlogPost'
import PricingPage     from './pages/PricingPage'
import CartPage        from './pages/CartPage'

import PortalLogin          from './pages/portal/PortalLogin'
import PortalLayout         from './pages/portal/PortalLayout'
import PortalDashboard      from './pages/portal/PortalDashboard'
import PortalProject        from './pages/portal/PortalProject'
import PortalInvoices       from './pages/portal/PortalInvoices'
import AcceptInvite         from './pages/portal/AcceptInvite'
import PortalReset          from './pages/portal/PortalReset'
import PortalWebsiteIntake  from './pages/portal/PortalWebsiteIntake'
import PortalBrandKit       from './pages/portal/PortalBrandKit'
import PortalServices       from './pages/portal/PortalServices'
import PortalSocial          from './pages/portal/PortalSocial'

import * as Sentry from '@sentry/react'
import SentryFallback from './components/SentryFallback'
import useTelemetryIdentity from './hooks/useTelemetryIdentity'
import useGaPageviews from './hooks/useGaPageviews'
import useAffiliateRef from './hooks/useAffiliateRef'
import RefRedirect from './pages/RefRedirect'

function TelemetryIdentityMount() {
  useTelemetryIdentity()
  return null
}

// Inside <BrowserRouter> so useLocation() works — sends a GA4 page_view per route.
function GaPageviewMount() {
  useGaPageviews()
  return null
}

// Inside <BrowserRouter> — captures ?ref=CODE referral attribution per route.
function AffiliateRefMount() {
  useAffiliateRef()
  return null
}

export default function App() {
  return (
    <Sentry.ErrorBoundary fallback={({ resetError }) => <SentryFallback resetError={resetError} />}>
      <AuthProvider>
        <TelemetryIdentityMount />
        <BrowserRouter>
          <GaPageviewMount />
          <AffiliateRefMount />
          <Routes>
          {/* Public */}
          <Route path="/"       element={<MainSite />} />
          <Route path="/r/:code" element={<RefRedirect />} />
          <Route path="/audit"  element={<AuditPage />} />
          <Route path="/audit/:id" element={<AuditResults />} />
          <Route path="/free-social-audit" element={<FreeSocialAudit />} />
          <Route path="/portal/accept-invite" element={<AcceptInvite />} />
          <Route path="/portal/reset" element={<PortalReset />} />
          <Route path="/blog"   element={<BlogPage />} />
          <Route path="/blog/:slug" element={<BlogPost />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/cart"    element={<CartPage />} />
          <Route path="/affiliate" element={<AffiliateDashboard />} />
          <Route path="/affiliate/confirm" element={<AffiliateConfirm />} />

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
            <Route path="affiliates"      element={<AffiliatesManager />} />
            <Route path="settings"        element={<Settings />} />
            <Route path="business-info"   element={<BusinessInfo />} />
            <Route path="conversations"   element={<Conversations />} />
            {/* Old standalone pages now live as tabs under Conversations */}
            <Route path="chatbot"         element={<Navigate to="/admin/conversations?tab=web" replace />} />
            <Route path="email-responder" element={<Navigate to="/admin/conversations?tab=email" replace />} />
            <Route path="triggers"        element={<AutomationTriggers />} />
            <Route path="workflows"       element={<AdminWorkflows />} />
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
            <Route path="website-intake"       element={<PortalWebsiteIntake />} />
            <Route path="brand-kit"            element={<PortalBrandKit />} />
            <Route path="services"             element={<PortalServices />} />
            <Route path="social"               element={<PortalSocial />} />
          </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </Sentry.ErrorBoundary>
  )
}

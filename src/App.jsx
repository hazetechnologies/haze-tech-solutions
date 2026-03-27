import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './lib/AuthContext'
import ProtectedRoute from './lib/ProtectedRoute'
import PortalProtectedRoute from './lib/PortalProtectedRoute'

import MainSite       from './MainSite'
import AuditPage      from './pages/AuditPage'

import AdminLogin     from './pages/admin/AdminLogin'
import AdminLayout    from './pages/admin/AdminLayout'
import Dashboard      from './pages/admin/Dashboard'
import Leads          from './pages/admin/Leads'
import PortfolioManager from './pages/admin/PortfolioManager'
import BlogManager    from './pages/admin/BlogManager'
import PressManager   from './pages/admin/PressManager'
import ClientManager  from './pages/admin/ClientManager'
import ClientDetail   from './pages/admin/ClientDetail'

import PortalLogin     from './pages/portal/PortalLogin'
import PortalLayout    from './pages/portal/PortalLayout'
import PortalDashboard from './pages/portal/PortalDashboard'
import PortalProject   from './pages/portal/PortalProject'
import PortalInvoices  from './pages/portal/PortalInvoices'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/"       element={<MainSite />} />
          <Route path="/audit"  element={<AuditPage />} />

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
  )
}

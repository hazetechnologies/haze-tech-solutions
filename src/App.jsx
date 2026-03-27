import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './lib/AuthContext'
import ProtectedRoute from './lib/ProtectedRoute'

import MainSite       from './MainSite'
import AuditPage      from './pages/AuditPage'

import AdminLogin     from './pages/admin/AdminLogin'
import AdminLayout    from './pages/admin/AdminLayout'
import Dashboard      from './pages/admin/Dashboard'
import Leads          from './pages/admin/Leads'
import PortfolioManager from './pages/admin/PortfolioManager'
import BlogManager    from './pages/admin/BlogManager'
import PressManager   from './pages/admin/PressManager'

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

          {/* Redirect /admin → /admin/dashboard (protected) */}
          <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />

          {/* Protected admin shell */}
          <Route path="/admin" element={
            <ProtectedRoute><AdminLayout /></ProtectedRoute>
          }>
            <Route path="dashboard"  element={<Dashboard />} />
            <Route path="leads"      element={<Leads />} />
            <Route path="portfolio"  element={<PortfolioManager />} />
            <Route path="blog"       element={<BlogManager />} />
            <Route path="press"      element={<PressManager />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext'

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#020817', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid rgba(0,212,255,0.2)', borderTopColor: '#00D4FF', animation: 'spin 1s linear infinite' }} />
    </div>
  )
  return user ? children : <Navigate to="/admin/login" replace />
}

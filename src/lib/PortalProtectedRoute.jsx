import { useState, useEffect, createContext, useContext } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { supabase } from './supabase'

const ClientContext = createContext(null)
export const useClient = () => useContext(ClientContext)

export default function PortalProtectedRoute({ children }) {
  const { user, loading: authLoading } = useAuth()
  const [client, setClient] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!user) { setLoading(false); return }

    supabase
      .from('clients')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        setClient(data)
        setLoading(false)
      })
  }, [user, authLoading])

  if (authLoading || loading) return (
    <div style={{ minHeight: '100vh', background: '#020817', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid rgba(0,212,255,0.2)', borderTopColor: '#00D4FF', animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  if (!user) return <Navigate to="/portal/login" replace />
  if (!client) return <Navigate to="/portal/login" replace />

  return (
    <ClientContext.Provider value={client}>
      {children}
    </ClientContext.Provider>
  )
}

// src/hooks/useTelemetryIdentity.js
import { useEffect, useRef } from 'react'
import { useAuth } from '../lib/AuthContext'
import { identifyUser, resetIdentity } from '../lib/telemetry'

export default function useTelemetryIdentity() {
  const { user } = useAuth()
  const lastUserIdRef = useRef(null)

  useEffect(() => {
    const currentId = user?.id ?? null
    if (currentId === lastUserIdRef.current) return
    lastUserIdRef.current = currentId

    if (user?.id) {
      identifyUser({ id: user.id, email: user.email })
    } else {
      resetIdentity()
    }
  }, [user])
}

import { Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../services/supabaseClient'

interface PrivateRouteProps {
  children: ReactNode
  requireAdmin?: boolean
}

export default function PrivateRoute({
  children,
  requireAdmin = false,
}: PrivateRouteProps) {
  const [session, setSession] = useState<any>(null)
  const [isAuthorized, setIsAuthorized] = useState(!requireAdmin)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const resolveAuthorization = async (userId?: string) => {
      if (!requireAdmin || !userId) {
        if (mounted) setIsAuthorized(Boolean(userId) || !requireAdmin)
        return
      }

      const { data: profile } = await supabase
        .from('perfiles')
        .select('rol')
        .eq('id', userId)
        .maybeSingle()

      if (mounted) {
        setIsAuthorized(profile?.rol === 'admin')
      }
    }

    const syncAccess = async () => {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession()

      if (!mounted) return

      setSession(currentSession)
      await resolveAuthorization(currentSession?.user.id)

      if (mounted) {
        setLoading(false)
      }
    }

    void syncAccess()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(true)

      void resolveAuthorization(nextSession?.user.id).finally(() => {
        if (mounted) {
          setLoading(false)
        }
      })
    })

    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [requireAdmin])

  if (loading) return <p>Cargando...</p>

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return isAuthorized ? children : <Navigate to="/dashboard" replace />
}

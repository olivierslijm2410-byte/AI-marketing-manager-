import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/useAuth'

export default function OnboardingGuard({ children }) {
  const { user } = useAuth()
  const location = useLocation()
  const onOnboardingPage = location.pathname === '/onboarding'
  const [loading, setLoading] = useState(true)
  const [onboardingCompleted, setOnboardingCompleted] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadProfile() {
      setLoading(true)
      const { data } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', user.id)
        .maybeSingle()

      if (!cancelled) {
        setOnboardingCompleted(data?.onboarding_completed ?? false)
        setLoading(false)
      }
    }

    loadProfile()

    return () => {
      cancelled = true
    }
  }, [user.id, onOnboardingPage])

  if (loading) {
    return <p>Laden...</p>
  }

  if (!onboardingCompleted && !onOnboardingPage) {
    return <Navigate to="/onboarding" replace />
  }

  if (onboardingCompleted && onOnboardingPage) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

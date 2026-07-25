import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'

// Instagram stuurt bij een geweigerde autorisatie geen 'code' terug, maar
// 'error' + 'error_reason' als losse query-parameters op de callback-URL.
function getDeniedAuthMessage(errorReason) {
  if (errorReason === 'user_denied') {
    return 'Je hebt geen toestemming gegeven aan Instagram. Koppel opnieuw als je dit alsnog wilt doen.'
  }
  return 'Instagram heeft de koppeling geweigerd. Probeer het opnieuw.'
}

// Vertaalt bekende foutcodes/berichten van de Edge Function (afkomstig van de
// Instagram API) naar begrijpelijke NL-tekst. Onbekende fouten krijgen een
// nette generieke melding in plaats van rauwe API-data.
function getFriendlyApiErrorMessage(data) {
  const rawMessage = JSON.stringify(data?.details || '').toLowerCase()

  if (rawMessage.includes('not a business') || rawMessage.includes('not an instagram business')) {
    return 'Dit Instagram-account is geen Business- of Creator-account. Zet je account eerst om via Instagram-instellingen en probeer opnieuw.'
  }
  if (rawMessage.includes('code has expired') || rawMessage.includes('invalid authorization code')) {
    return 'De koppelpoging is verlopen. Klik opnieuw op "Koppel Instagram" om het nogmaals te proberen.'
  }
  if (rawMessage.includes('invalid') && rawMessage.includes('token')) {
    return 'Instagram gaf een ongeldig token terug. Probeer opnieuw te koppelen.'
  }

  return 'Koppelen met Instagram is mislukt. Probeer het opnieuw.'
}

export default function InstagramCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const hasRun = useRef(false)

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    const code = searchParams.get('code')
    const authError = searchParams.get('error')
    const errorReason = searchParams.get('error_reason')

    async function connectInstagram() {
      // Instagram stuurde een expliciete weigering terug (geen 'code')
      if (authError) {
        setError(getDeniedAuthMessage(errorReason))
        setStatus('error')
        return
      }

      if (!code) {
        setError('Geen autorisatiecode ontvangen van Instagram. Probeer opnieuw.')
        setStatus('error')
        return
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        setError('Geen geldige sessie. Log opnieuw in.')
        setStatus('error')
        return
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-callback`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ code }),
        }
      )

      const data = await response.json()

      if (!response.ok || data.error) {
        setError(getFriendlyApiErrorMessage(data))
        setStatus('error')
        return
      }

      setStatus('success')
    }

    connectInstagram()
  }, [searchParams])

  useEffect(() => {
    if (status !== 'success') return

    const timeout = setTimeout(() => {
      navigate('/dashboard/kanalen')
    }, 2000)

    return () => clearTimeout(timeout)
  }, [status, navigate])

  return (
    <div>
      <h1>Instagram koppelen</h1>
      {status === 'loading' && <p>Bezig met koppelen van je Instagram-account...</p>}
      {status === 'success' && <p>Instagram is succesvol gekoppeld. Je wordt doorgestuurd...</p>}
      {status === 'error' && (
        <div>
          <p>{error}</p>
          <button type="button" onClick={() => navigate('/dashboard/kanalen')}>
            Terug naar Kanalen
          </button>
        </div>
      )}
    </div>
  )
}

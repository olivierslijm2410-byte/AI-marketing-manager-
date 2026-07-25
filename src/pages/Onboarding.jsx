import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/useAuth'

function isValidUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export default function Onboarding() {
  const { user } = useAuth()
  const [branche, setBranche] = useState('')
  const [doelen, setDoelen] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!branche || !doelen || !websiteUrl) {
      setError('Vul alle velden in.')
      return
    }

    if (!isValidUrl(websiteUrl)) {
      setError('Vul een geldige website-URL in (bijv. https://voorbeeld.nl).')
      return
    }

    setSubmitting(true)

    const { error: upsertError } = await supabase.from('profiles').upsert({
      id: user.id,
      branche,
      doelen,
      onboarding_completed: true,
    })

    if (upsertError) {
      setSubmitting(false)
      setError(upsertError.message)
      return
    }

    // Website-URL wordt direct als channel aangemaakt (zelfde tabel/vorm als
    // een handmatige koppeling via de Kanalen-pagina), zodat er nog maar één
    // plek is waar de website-koppeling van een gebruiker staat.
    const { error: channelError } = await supabase
      .from('channels')
      .insert({ user_id: user.id, platform: 'website', website_url: websiteUrl })

    setSubmitting(false)

    if (channelError) {
      setError(channelError.message)
      return
    }

    navigate('/dashboard/kanalen')
  }

  return (
    <div>
      <h1>Vertel ons over je bedrijf</h1>
      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="branche">Branche</label>
          <input
            id="branche"
            type="text"
            value={branche}
            onChange={(e) => setBranche(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="doelen">Doelen</label>
          <textarea
            id="doelen"
            value={doelen}
            onChange={(e) => setDoelen(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="websiteUrl">Website-URL</label>
          <input
            id="websiteUrl"
            type="text"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
          />
        </div>
        {error && <p>{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Bezig met opslaan...' : 'Opslaan en verdergaan'}
        </button>
      </form>
    </div>
  )
}

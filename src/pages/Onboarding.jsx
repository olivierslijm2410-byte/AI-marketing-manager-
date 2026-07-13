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
      website_url: websiteUrl,
      onboarding_completed: true,
    })
    setSubmitting(false)

    if (upsertError) {
      setError(upsertError.message)
      return
    }

    navigate('/dashboard')
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

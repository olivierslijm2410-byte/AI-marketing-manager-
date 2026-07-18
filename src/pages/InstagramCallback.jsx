import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../context/useAuth'

export default function InstagramCallback() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const hasRun = useRef(false)

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    const code = searchParams.get('code')

    async function connectInstagram() {
      if (!code) {
        setError('Geen autorisatiecode ontvangen van Instagram.')
        setStatus('error')
        return
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-callback`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        }
      )

      const data = await response.json()

      if (!response.ok || data.error) {
        setError(data.error || 'Koppelen met Instagram is mislukt.')
        setStatus('error')
        return
      }

      const {
        access_token: accessToken,
        expires_in: expiresIn,
        instagram_user_id: instagramUserId,
      } = data

      const { data: existingChannel } = await supabase
        .from('channels')
        .select('id')
        .eq('user_id', user.id)
        .eq('platform', 'instagram')
        .maybeSingle()

      const channelData = {
        user_id: user.id,
        platform: 'instagram',
        instagram_account_id: instagramUserId,
        access_token: accessToken,
        token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
        connected_at: new Date().toISOString(),
      }

      const { error: saveError } = existingChannel
        ? await supabase.from('channels').update(channelData).eq('id', existingChannel.id)
        : await supabase.from('channels').insert(channelData)

      if (saveError) {
        setError(saveError.message)
        setStatus('error')
        return
      }

      setStatus('success')
    }

    connectInstagram()
  }, [searchParams, user.id])

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
      {status === 'error' && <p>{error}</p>}
    </div>
  )
}

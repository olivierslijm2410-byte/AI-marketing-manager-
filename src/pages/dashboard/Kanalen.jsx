import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/useAuth'

function getInstagramAuthorizeUrl() {
  const params = new URLSearchParams({
    client_id: import.meta.env.VITE_INSTAGRAM_CLIENT_ID,
    redirect_uri: import.meta.env.VITE_INSTAGRAM_REDIRECT_URI,
    response_type: 'code',
    scope: 'instagram_business_basic,instagram_business_content_publish',
  })
  return `https://www.instagram.com/oauth/authorize?${params.toString()}`
}

export default function Kanalen() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [instagramChannel, setInstagramChannel] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadInstagramChannel() {
      setLoading(true)
      const { data } = await supabase
        .from('channels')
        .select('instagram_account_id')
        .eq('user_id', user.id)
        .eq('platform', 'instagram')
        .maybeSingle()

      if (!cancelled) {
        setInstagramChannel(data)
        setLoading(false)
      }
    }

    loadInstagramChannel()

    return () => {
      cancelled = true
    }
  }, [user.id])

  function handleConnectInstagram() {
    window.location.href = getInstagramAuthorizeUrl()
  }

  return (
    <div>
      <h1>Kanalen</h1>
      <section>
        <h2>Instagram</h2>
        {loading ? (
          <p>Laden...</p>
        ) : instagramChannel ? (
          <p>Gekoppeld (account-id: {instagramChannel.instagram_account_id})</p>
        ) : (
          <button type="button" onClick={handleConnectInstagram}>
            Koppel Instagram
          </button>
        )}
      </section>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/useAuth'

// Zelfde logica als Kanalen.jsx — een koppeling is "verbroken" als het token
// letterlijk verlopen is, óf als er ná het laatste (her)koppelmoment een
// publicatie is mislukt met een auth-gerelateerde fout.
function isConnectionBroken({ tokenExpiresAt, connectedAt, latestAuthFailureAt }) {
  if (tokenExpiresAt && new Date(tokenExpiresAt) < new Date()) return true
  if (latestAuthFailureAt && connectedAt && new Date(latestAuthFailureAt) > new Date(connectedAt)) return true
  return false
}

export default function Overzicht() {
  const { user } = useAuth()
  const [instagramBroken, setInstagramBroken] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function checkInstagramConnection() {
      const { data: channel } = await supabase
        .from('channels')
        .select('id, token_expires_at, connected_at')
        .eq('user_id', user.id)
        .eq('platform', 'instagram')
        .maybeSingle()

      if (cancelled || !channel) return

      const { data: latestAuthFailure } = await supabase
        .from('posts')
        .select('last_attempted_at')
        .eq('channel_id', channel.id)
        .eq('error_code', 'token_expired')
        .order('last_attempted_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (cancelled) return

      setInstagramBroken(
        isConnectionBroken({
          tokenExpiresAt: channel.token_expires_at,
          connectedAt: channel.connected_at,
          latestAuthFailureAt: latestAuthFailure?.last_attempted_at ?? null,
        }),
      )
    }

    checkInstagramConnection()

    return () => {
      cancelled = true
    }
  }, [user.id])

  return (
    <div>
      <h1>Overzicht</h1>
      {instagramBroken && (
        <div>
          <p>⚠️ Je Instagram-koppeling werkt niet meer — geplande posts worden hierdoor niet geplaatst.</p>
          <Link to="/dashboard/kanalen">Opnieuw verbinden</Link>
        </div>
      )}
      <p>Deze pagina wordt later verder gevuld.</p>
    </div>
  )
}

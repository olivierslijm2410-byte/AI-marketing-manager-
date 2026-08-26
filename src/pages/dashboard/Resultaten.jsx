import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/useAuth'

// Fase 4, stap 9. Bewust basaal: alleen ruwe cijfers per geplaatste post,
// gesorteerd op publicatiemoment. Geen periodevergelijkingen, geen
// AI-interpretatie — dat hoort bij de volwaardige Analytics Agent (Fase 6).

function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatMetric(value) {
  // null/undefined = nog niet gesynchroniseerd, niet hetzelfde als 0
  return value === null || value === undefined ? '—' : value
}

export default function Resultaten() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [posts, setPosts] = useState([])

  useEffect(() => {
    let cancelled = false

    async function loadResults() {
      setLoading(true)
      const { data } = await supabase
        .from('posts')
        .select('id, topic, caption, published_at, reach, likes, clicks, insights_synced_at')
        .eq('user_id', user.id)
        .eq('status', 'geplaatst')
        .order('published_at', { ascending: false })

      if (!cancelled) {
        setPosts(data ?? [])
        setLoading(false)
      }
    }

    loadResults()

    return () => {
      cancelled = true
    }
  }, [user.id])

  if (loading) {
    return (
      <div>
        <h1>Resultaten</h1>
        <p>Laden...</p>
      </div>
    )
  }

  if (posts.length === 0) {
    return (
      <div>
        <h1>Resultaten</h1>
        <p>Hier verschijnen bereik, likes en bewaard-aantallen zodra je eerste content is geplaatst.</p>
      </div>
    )
  }

  return (
    <div>
      <h1>Resultaten</h1>
      <table>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Post</th>
            <th style={{ textAlign: 'left' }}>Geplaatst op</th>
            <th style={{ textAlign: 'right' }}>Bereik</th>
            <th style={{ textAlign: 'right' }}>Likes</th>
            <th style={{ textAlign: 'right' }}>Bewaard</th>
          </tr>
        </thead>
        <tbody>
          {posts.map((post) => (
            <tr key={post.id}>
              <td>{post.topic || post.caption?.slice(0, 60) || 'Zonder titel'}</td>
              <td>{formatDate(post.published_at)}</td>
              <td style={{ textAlign: 'right' }}>{formatMetric(post.reach)}</td>
              <td style={{ textAlign: 'right' }}>{formatMetric(post.likes)}</td>
              <td style={{ textAlign: 'right' }}>{formatMetric(post.clicks)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

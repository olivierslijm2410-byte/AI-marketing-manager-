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

const CONNECT_ERROR_MESSAGE = 'Koppelen mislukt, probeer opnieuw.'
const ANALYSIS_ERROR_MESSAGE = 'Website gekoppeld, analyse is mislukt.'

export default function Kanalen() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [instagramChannel, setInstagramChannel] = useState(null)

  const [websiteLoading, setWebsiteLoading] = useState(true)
  const [websiteChannel, setWebsiteChannel] = useState(null)
  const [websiteUrlInput, setWebsiteUrlInput] = useState('')
  const [websiteFormError, setWebsiteFormError] = useState('')
  // Record-creation step (channels insert) — only relevant while there is no
  // website channel yet, kept fully separate from the analysis step below so
  // an analysis failure can never be reported as a failed connect.
  const [connectStatus, setConnectStatus] = useState('idle')
  const [connectError, setConnectError] = useState('')
  // Analysis step (analyze-website call) — only relevant once a website
  // channel exists, whether just created or loaded from a previous session.
  const [analysisStatus, setAnalysisStatus] = useState('idle')
  const [analysisError, setAnalysisError] = useState('')

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

  useEffect(() => {
    let cancelled = false

    async function loadWebsiteChannel() {
      setWebsiteLoading(true)

      const { data: channel } = await supabase
        .from('channels')
        .select('id, website_url')
        .eq('user_id', user.id)
        .eq('platform', 'website')
        .maybeSingle()

      if (cancelled) return
      setWebsiteChannel(channel)

      if (channel) {
        // Restore the outcome of the most recent analysis so a refresh shows
        // the same state as right after connecting or re-analyzing.
        const { data: latestAnalysis } = await supabase
          .from('company_analyses')
          .select('status')
          .eq('channel_id', channel.id)
          .eq('user_id', user.id)
          .order('versie', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (cancelled) return

        if (latestAnalysis) {
          if (latestAnalysis.status === 'mislukt') {
            setAnalysisStatus('error')
            setAnalysisError(ANALYSIS_ERROR_MESSAGE)
          } else {
            setAnalysisStatus('success')
          }
        } else {
          // Kanaal bestaat, maar is nog nooit geanalyseerd (bijv. net
          // aangemaakt via onboarding) — start de analyse automatisch zodat
          // dit niet afhangt van een handmatige klik op "Opnieuw analyseren".
          setWebsiteLoading(false)
          runWebsiteAnalysis(channel.id, channel.website_url)
          return
        }
      }

      setWebsiteLoading(false)
    }

    loadWebsiteChannel()

    return () => {
      cancelled = true
    }
  }, [user.id])

  function handleConnectInstagram() {
    window.location.href = getInstagramAuthorizeUrl()
  }

  // Calls the analyze-website Edge Function for an existing channel, used both
  // right after connecting and for the "opnieuw analyseren" retry action.
  async function runWebsiteAnalysis(channelId, url) {
    setAnalysisStatus('analyzing')
    setAnalysisError('')

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-website`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ channel_id: channelId, url }),
        }
      )

      const data = await response.json()

      if (!response.ok || data.error) {
        setAnalysisStatus('error')
        setAnalysisError(ANALYSIS_ERROR_MESSAGE)
        return
      }

      setAnalysisStatus('success')
    } catch {
      setAnalysisStatus('error')
      setAnalysisError(ANALYSIS_ERROR_MESSAGE)
    }
  }

  async function connectWebsite() {
    const trimmedUrl = websiteUrlInput.trim()
    const isValidUrl = trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://')

    if (!trimmedUrl || !isValidUrl) {
      setWebsiteFormError('Vul een geldige URL in die begint met http:// of https://.')
      return
    }

    setWebsiteFormError('')
    setConnectStatus('connecting')
    setConnectError('')

    // This step only ever reports a connect failure. Once it succeeds, the
    // channel is created and every failure past this point belongs to the
    // analysis step instead, handled separately by runWebsiteAnalysis.
    let inserted
    try {
      const { data, error: insertError } = await supabase
        .from('channels')
        .insert({ user_id: user.id, platform: 'website', website_url: trimmedUrl })
        .select('id, website_url')
        .single()

      if (insertError || !data) {
        setConnectStatus('error')
        setConnectError(CONNECT_ERROR_MESSAGE)
        return
      }
      inserted = data
    } catch {
      setConnectStatus('error')
      setConnectError(CONNECT_ERROR_MESSAGE)
      return
    }

    setConnectStatus('idle')
    setWebsiteChannel(inserted)
    await runWebsiteAnalysis(inserted.id, inserted.website_url)
  }

  function handleWebsiteFormSubmit(event) {
    event.preventDefault()
    connectWebsite()
  }

  function handleReanalyzeWebsite() {
    if (!websiteChannel) return
    runWebsiteAnalysis(websiteChannel.id, websiteChannel.website_url)
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
      <section>
        <h2>Website</h2>
        {websiteLoading ? (
          <p>Laden...</p>
        ) : websiteChannel ? (
          <div>
            <p>Gekoppeld: {websiteChannel.website_url}</p>
            {analysisStatus === 'analyzing' && <p>Bezig met analyseren...</p>}
            {analysisStatus === 'success' && <p>Geanalyseerd</p>}
            {analysisStatus === 'error' && <p>{analysisError}</p>}
            <button
              type="button"
              onClick={handleReanalyzeWebsite}
              disabled={analysisStatus === 'analyzing'}
            >
              {analysisStatus === 'error' ? 'Probeer opnieuw' : 'Opnieuw analyseren'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleWebsiteFormSubmit}>
            <input
              type="text"
              value={websiteUrlInput}
              onChange={(event) => setWebsiteUrlInput(event.target.value)}
              placeholder="https://voorbeeld.nl"
              disabled={connectStatus === 'connecting'}
              style={{
                font: 'inherit',
                padding: '8px',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                background: 'var(--bg)',
                color: 'var(--text)',
              }}
            />
            <button type="submit" disabled={connectStatus === 'connecting'}>
              Koppel website
            </button>
            {websiteFormError && <p>{websiteFormError}</p>}
            {connectStatus === 'connecting' && <p>Bezig met koppelen...</p>}
            {connectStatus === 'error' && (
              <>
                <p>{connectError}</p>
                <button type="button" onClick={connectWebsite}>
                  Probeer opnieuw
                </button>
              </>
            )}
          </form>
        )}
      </section>
    </div>
  )
}
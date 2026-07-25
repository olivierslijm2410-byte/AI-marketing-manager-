import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/useAuth'

const ANALYSIS_ERROR_MESSAGE = 'Analyse mislukt, probeer opnieuw.'

export default function Strategie() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [websiteChannel, setWebsiteChannel] = useState(null)
  const [analysisRecord, setAnalysisRecord] = useState(null)

  // Status of the "Opnieuw analyseren" action, separate from the status
  // already stored on the loaded analysisRecord itself.
  const [analysisStatus, setAnalysisStatus] = useState('idle')
  const [analysisError, setAnalysisError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadStrategyData() {
      setLoading(true)

      const { data: channel } = await supabase
        .from('channels')
        .select('id, website_url')
        .eq('user_id', user.id)
        .eq('platform', 'website')
        .maybeSingle()

      if (cancelled) return
      setWebsiteChannel(channel)

      if (channel) {
        const { data: latestAnalysis } = await supabase
          .from('company_analyses')
          .select('id, summary_json, versie, status, created_at')
          .eq('channel_id', channel.id)
          .eq('user_id', user.id)
          .order('versie', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (cancelled) return
        setAnalysisRecord(latestAnalysis)
      }

      setLoading(false)
    }

    loadStrategyData()

    return () => {
      cancelled = true
    }
  }, [user.id])

  // Duplicated from Kanalen.jsx on purpose (see task notes) rather than shared,
  // that's a later refactor decision.
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

      setAnalysisRecord(data)
      setAnalysisStatus('success')
    } catch {
      setAnalysisStatus('error')
      setAnalysisError(ANALYSIS_ERROR_MESSAGE)
    }
  }

  function handleReanalyze() {
    if (!websiteChannel) return
    runWebsiteAnalysis(websiteChannel.id, websiteChannel.website_url)
  }

  function formatDate(isoString) {
    return new Date(isoString).toLocaleDateString('nl-NL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  const reanalyzeButton = (
    <button type="button" onClick={handleReanalyze} disabled={analysisStatus === 'analyzing'}>
      {analysisStatus === 'analyzing' ? 'Bezig met analyseren...' : 'Opnieuw analyseren'}
    </button>
  )

  function renderContent() {
    if (loading) {
      return <p>Laden...</p>
    }

    if (!websiteChannel) {
      return (
        <p>
          Er is nog geen website gekoppeld. Koppel eerst een website op de{' '}
          <Link to="/dashboard/kanalen">Kanalen-pagina</Link>, dan verschijnt hier de
          bedrijfsanalyse.
        </p>
      )
    }

    if (!analysisRecord) {
      return <p>Nog geen analyse beschikbaar voor deze website.</p>
    }

    if (analysisRecord.status === 'mislukt') {
      return (
        <div>
          <p>De laatste analysepoging is mislukt.</p>
          {reanalyzeButton}
          {analysisStatus === 'error' && <p>{analysisError}</p>}
        </div>
      )
    }

    const summary = analysisRecord.summary_json ?? {}
    const producten = summary.producten_diensten ?? []
    const usps = summary.usps ?? []

    return (
      <div
        style={{
          textAlign: 'left',
          border: '1px solid var(--border)',
          borderRadius: '4px',
          padding: '24px',
        }}
      >
        {analysisRecord.status === 'lage_zekerheid' && (
          <div
            style={{
              padding: '12px 16px',
              marginBottom: '16px',
              borderRadius: '4px',
              background: 'var(--accent-bg)',
              border: '1px solid var(--accent-border)',
            }}
          >
            <p>Lage zekerheid — de website bevatte weinig informatie.</p>
            {summary.toelichting && <p>{summary.toelichting}</p>}
          </div>
        )}

        <h2>Producten/diensten</h2>
        <ul>
          {producten.map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ul>

        <h2>Doelgroep</h2>
        <p>{summary.doelgroep}</p>

        <h2>Tone of voice</h2>
        <p>{summary.tone_of_voice}</p>

        <h2>USP&apos;s</h2>
        <ul>
          {usps.map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ul>

        <p>
          Laatste analyse: versie {analysisRecord.versie}, {formatDate(analysisRecord.created_at)}
        </p>

        {reanalyzeButton}
        {analysisStatus === 'error' && <p>{analysisError}</p>}
      </div>
    )
  }

  return (
    <div>
      <h1>Strategie</h1>
      {renderContent()}
    </div>
  )
}

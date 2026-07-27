import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/useAuth'

const ANALYSIS_ERROR_MESSAGE = 'Analyse mislukt, probeer opnieuw.'
const STRATEGY_GENERATION_ERROR_MESSAGE = 'Genereren mislukt, probeer opnieuw.'
const APPROVE_ERROR_MESSAGE = 'Goedkeuren mislukt, probeer opnieuw.'
const NOT_INFERRABLE = 'Niet af te leiden uit de website'

const cardStyle = {
  textAlign: 'left',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  padding: '24px',
}

const calendarItemStyle = {
  textAlign: 'left',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  padding: '16px',
  marginBottom: '12px',
}

const approvalBarStyle = {
  marginTop: '16px',
  paddingTop: '16px',
  borderTop: '1px solid var(--border)',
}

function isConfidenceField(field) {
  return Boolean(field) && typeof field === 'object' && !Array.isArray(field) && 'waarde' in field
}

function isProduct(item) {
  return Boolean(item) && typeof item === 'object' && !Array.isArray(item) && typeof item.naam === 'string'
}

function displayValue(waarde) {
  return waarde === null || waarde === undefined || waarde === '' ? NOT_INFERRABLE : waarde
}

function ConfidenceBadge({ confidence }) {
  if (confidence !== 'hoog' && confidence !== 'gemiddeld' && confidence !== 'laag') {
    return null
  }

  const style = {
    marginLeft: '8px',
    fontSize: '0.75em',
    color: 'var(--text)',
  }

  if (confidence === 'laag') {
    style.fontStyle = 'italic'
    style.border = '1px dotted var(--border)'
    style.borderRadius = '3px'
    style.padding = '0 5px'
  }

  return <span style={style}>{confidence}</span>
}

function ScalarField({ label, field }) {
  if (!isConfidenceField(field)) return null

  return (
    <>
      <h2>{label}</h2>
      <p>
        {displayValue(field.waarde)}
        <ConfidenceBadge confidence={field.confidence} />
      </p>
    </>
  )
}

function ConfidenceList({ label, items }) {
  if (!Array.isArray(items)) return null
  const validItems = items.filter(isConfidenceField)

  return (
    <>
      <h2>{label}</h2>
      {validItems.length === 0 ? (
        <p>{NOT_INFERRABLE}</p>
      ) : (
        <ul>
          {validItems.map((item, index) => (
            <li key={`${item.waarde}-${index}`}>
              {displayValue(item.waarde)}
              <ConfidenceBadge confidence={item.confidence} />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function ProductList({ products }) {
  if (!Array.isArray(products)) return null
  const validProducts = products.filter(isProduct)

  return (
    <>
      <h2>Producten/diensten</h2>
      {validProducts.length === 0 ? (
        <p>{NOT_INFERRABLE}</p>
      ) : (
        validProducts.map((product, index) => {
          const features = Array.isArray(product.features) ? product.features : []
          const benefits = Array.isArray(product.benefits) ? product.benefits : []

          return (
            <div key={`${product.naam}-${index}`} style={{ marginBottom: '16px' }}>
              <p style={{ fontWeight: 600 }}>
                {displayValue(product.naam)}
                <ConfidenceBadge confidence={product.confidence} />
              </p>
              {features.length > 0 && (
                <>
                  <p style={{ fontSize: '0.85em', color: 'var(--text)', margin: '4px 0 2px' }}>
                    Features
                  </p>
                  <ul>
                    {features.map((feature, featureIndex) => (
                      <li key={`${feature}-${featureIndex}`}>{feature}</li>
                    ))}
                  </ul>
                </>
              )}
              {benefits.length > 0 && (
                <>
                  <p style={{ fontSize: '0.85em', color: 'var(--text)', margin: '4px 0 2px' }}>
                    Benefits
                  </p>
                  <ul>
                    {benefits.map((benefit, benefitIndex) => (
                      <li key={`${benefit}-${benefitIndex}`}>{benefit}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )
        })
      )}
    </>
  )
}

function KlantproblemenBlock({ field }) {
  if (!isConfidenceField(field)) return null
  const items = Array.isArray(field.waarde) ? field.waarde : []

  return (
    <>
      <h2>
        Klantproblemen &amp; motivaties
        <ConfidenceBadge confidence={field.confidence} />
      </h2>
      {items.length === 0 ? (
        <p>{NOT_INFERRABLE}</p>
      ) : (
        <ul>
          {items.map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ul>
      )}
      {field.toelichting && (
        <p style={{ fontSize: '0.85em', color: 'var(--text)' }}>{field.toelichting}</p>
      )}
    </>
  )
}

function capitalize(text) {
  if (typeof text !== 'string' || text === '') return text
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function StrategyStatusLabel({ status }) {
  if (status !== 'goedgekeurd') return null

  return (
    <span
      style={{
        marginLeft: '8px',
        fontSize: '0.75em',
        color: 'var(--accent)',
        border: '1px solid var(--accent-border)',
        borderRadius: '3px',
        padding: '2px 8px',
        background: 'var(--accent-bg)',
      }}
    >
      Goedgekeurd
    </span>
  )
}

function CalendarItemCard({ item }) {
  return (
    <div style={calendarItemStyle}>
      <p style={{ fontWeight: 600 }}>{item.topic}</p>
      <p style={{ fontSize: '0.85em', color: 'var(--text)' }}>
        {item.content_pillar} · {capitalize(item.funnel_stage)} · {capitalize(item.format)} · Prioriteit{' '}
        {item.priority}
      </p>
      {item.angle && <p>{item.angle}</p>}
      {item.cta_goal && (
        <p style={{ fontSize: '0.85em', color: 'var(--text)' }}>CTA: {item.cta_goal}</p>
      )}
    </div>
  )
}

export default function Strategie() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [websiteChannel, setWebsiteChannel] = useState(null)
  const [analysisRecord, setAnalysisRecord] = useState(null)
  const [strategyVersion, setStrategyVersion] = useState(null)

  // Status of the "Opnieuw analyseren" action, separate from the status
  // already stored on the loaded analysisRecord itself.
  const [analysisStatus, setAnalysisStatus] = useState('idle')
  const [analysisError, setAnalysisError] = useState('')

  const [generateStatus, setGenerateStatus] = useState('idle')
  const [generateError, setGenerateError] = useState('')

  const [approveStatus, setApproveStatus] = useState('idle')
  const [approveError, setApproveError] = useState('')

  const [showReviseForm, setShowReviseForm] = useState(false)
  const [feedbackText, setFeedbackText] = useState('')
  const [reviseStatus, setReviseStatus] = useState('idle')
  const [reviseError, setReviseError] = useState('')

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

      const { data: latestStrategy } = await supabase
        .from('strategy_versions')
        .select('*')
        .eq('user_id', user.id)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (cancelled) return
      setStrategyVersion(latestStrategy)

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

  // Gedeeld door "Genereer strategie" en "Aanpassen": analyze-strategy geeft
  // alleen { id } terug, dus na een geslaagde call halen we de nieuwe rij zelf op.
  async function callAnalyzeStrategy(body) {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-strategy`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(body),
      }
    )

    const data = await response.json()

    if (!response.ok || data.error) {
      throw new Error(data.error || STRATEGY_GENERATION_ERROR_MESSAGE)
    }

    const { data: newStrategy, error: fetchError } = await supabase
      .from('strategy_versions')
      .select('*')
      .eq('id', data.id)
      .single()

    if (fetchError || !newStrategy) {
      throw new Error(STRATEGY_GENERATION_ERROR_MESSAGE)
    }

    return newStrategy
  }

  async function handleGenerateStrategy() {
    if (!websiteChannel) return

    setGenerateStatus('generating')
    setGenerateError('')

    try {
      const newStrategy = await callAnalyzeStrategy({ channel_id: websiteChannel.id })
      setStrategyVersion(newStrategy)
      setGenerateStatus('idle')
    } catch (err) {
      setGenerateStatus('error')
      setGenerateError(err.message || STRATEGY_GENERATION_ERROR_MESSAGE)
    }
  }

  async function handleApproveStrategy() {
    if (!strategyVersion) return

    setApproveStatus('approving')
    setApproveError('')

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/approve-strategy`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ strategy_version_id: strategyVersion.id }),
        }
      )

      const data = await response.json()

      if (!response.ok || data.error) {
        setApproveStatus('error')
        setApproveError(APPROVE_ERROR_MESSAGE)
        return
      }

      const { data: updated, error: fetchError } = await supabase
        .from('strategy_versions')
        .select('*')
        .eq('id', strategyVersion.id)
        .single()

      if (fetchError || !updated) {
        setApproveStatus('error')
        setApproveError(APPROVE_ERROR_MESSAGE)
        return
      }

      setStrategyVersion(updated)
      setApproveStatus('success')
    } catch {
      setApproveStatus('error')
      setApproveError(APPROVE_ERROR_MESSAGE)
    }
  }

  async function handleSubmitFeedback(event) {
    event.preventDefault()
    if (!websiteChannel || !strategyVersion || feedbackText.trim() === '') return

    setReviseStatus('submitting')
    setReviseError('')

    try {
      const newStrategy = await callAnalyzeStrategy({
        channel_id: websiteChannel.id,
        previous_strategy_version_id: strategyVersion.id,
        feedback_text: feedbackText.trim(),
      })
      setStrategyVersion(newStrategy)
      setReviseStatus('idle')
      setShowReviseForm(false)
      setFeedbackText('')
    } catch (err) {
      setReviseStatus('error')
      setReviseError(err.message || STRATEGY_GENERATION_ERROR_MESSAGE)
    }
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
    const isNewFormatSummary = isConfidenceField(summary.bedrijfsomschrijving)

    if (!isNewFormatSummary) {
      return (
        <div style={cardStyle}>
          <p>Verouderd analyseformaat — analyseer deze website opnieuw om de volledige analyse te zien.</p>
          <p>
            Laatste analyse: versie {analysisRecord.versie}, {formatDate(analysisRecord.created_at)}
          </p>
          {reanalyzeButton}
          {analysisStatus === 'error' && <p>{analysisError}</p>}
        </div>
      )
    }

    return (
      <div style={cardStyle}>
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

        <ScalarField label="Bedrijfsomschrijving" field={summary.bedrijfsomschrijving} />
        <ProductList products={summary.producten_diensten} />
        <ScalarField label="Doelgroep" field={summary.doelgroep} />
        <KlantproblemenBlock field={summary.klantproblemen_motivaties} />
        <ScalarField label="Waardepropositie" field={summary.waardepropositie} />
        <ConfidenceList label="USP's" items={summary.usps} />
        <ScalarField label="Positionering" field={summary.positionering} />
        <ScalarField label="Tone of voice" field={summary.tone_of_voice} />
        <ScalarField label="Merkpersoonlijkheid" field={summary.merkpersoonlijkheid} />
        <ConfidenceList label="Kernboodschappen" items={summary.kernboodschappen} />

        <p>
          Laatste analyse: versie {analysisRecord.versie}, {formatDate(analysisRecord.created_at)}
        </p>

        {reanalyzeButton}
        {analysisStatus === 'error' && <p>{analysisError}</p>}
      </div>
    )
  }

  function renderStrategySection() {
    if (loading || !websiteChannel || !analysisRecord || analysisRecord.status === 'mislukt') {
      return null
    }

    if (!strategyVersion) {
      return (
        <div style={cardStyle}>
          <p>Nog geen contentstrategie gegenereerd voor deze bedrijfsanalyse.</p>
          <button
            type="button"
            onClick={handleGenerateStrategy}
            disabled={generateStatus === 'generating'}
          >
            {generateStatus === 'generating'
              ? 'Bezig met genereren... (dit kan 10-30 seconden duren)'
              : 'Genereer strategie'}
          </button>
          {generateStatus === 'error' && <p>{generateError}</p>}
        </div>
      )
    }

    const plan = strategyVersion.plan_json ?? {}
    const calendarItems = Array.isArray(plan.calendar_items) ? plan.calendar_items : []
    const isPendingApproval = strategyVersion.status === 'wacht_op_goedkeuring'

    return (
      <div style={cardStyle}>
        <p>
          Versie {strategyVersion.version}, {formatDate(strategyVersion.created_at)}
          <StrategyStatusLabel status={strategyVersion.status} />
        </p>

        {plan.strategic_understanding && (
          <>
            <h2>Strategisch inzicht</h2>
            <p>{plan.strategic_understanding}</p>
          </>
        )}

        {plan.framework && (
          <>
            <h2>Aanpak</h2>
            <p>{plan.framework}</p>
          </>
        )}

        <h2>Contentkalender</h2>
        {calendarItems.length === 0 ? (
          <p>Geen contentitems beschikbaar.</p>
        ) : (
          calendarItems.map((item, index) => (
            <CalendarItemCard key={`${item.topic}-${index}`} item={item} />
          ))
        )}

        {isPendingApproval && (
          <div style={approvalBarStyle}>
            <p>Deze strategie wacht op je goedkeuring.</p>
            <button
              type="button"
              onClick={handleApproveStrategy}
              disabled={approveStatus === 'approving'}
            >
              {approveStatus === 'approving' ? 'Bezig...' : 'Goedkeuren'}
            </button>{' '}
            <button type="button" onClick={() => setShowReviseForm((prev) => !prev)}>
              Aanpassen
            </button>
            {approveStatus === 'error' && <p>{approveError}</p>}
            {approveStatus === 'success' && <p>Strategie goedgekeurd.</p>}

            {showReviseForm && (
              <form onSubmit={handleSubmitFeedback} style={{ marginTop: '16px' }}>
                <label htmlFor="feedback_text">Wat moet er worden aangepast?</label>
                <br />
                <textarea
                  id="feedback_text"
                  value={feedbackText}
                  onChange={(event) => setFeedbackText(event.target.value)}
                  rows={4}
                  style={{ width: '100%', marginTop: '8px' }}
                />
                <br />
                <button
                  type="submit"
                  disabled={reviseStatus === 'submitting' || feedbackText.trim() === ''}
                >
                  {reviseStatus === 'submitting'
                    ? 'Bezig met aanpassen... (dit kan 10-30 seconden duren)'
                    : 'Verstuur en genereer nieuwe versie'}
                </button>
                {reviseStatus === 'error' && <p>{reviseError}</p>}
              </form>
            )}
          </div>
        )}
      </div>
    )
  }

  const strategySection = renderStrategySection()

  return (
    <div>
      <h1>Strategie</h1>
      {renderContent()}
      {strategySection && (
        <>
          <h2>Contentplan</h2>
          {strategySection}
        </>
      )}
    </div>
  )
}

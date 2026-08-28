import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/useAuth'

// Fase 5, stap 5. UI voor de Ads Manager Agent: AI-voorstel -> goedkeuring -> (later) uitvoering.
// Geen Meta-koppeling hier (stap 3 is nog niet gebouwd), meta_campaign_id blijft leeg.

const PROPOSAL_ERROR_MESSAGE = 'Genereren van campagnevoorstel mislukt, probeer opnieuw.'
const REQUEST_APPROVAL_ERROR_MESSAGE = 'Aanvragen van goedkeuring mislukt, probeer opnieuw.'
const VIEW_APPROVAL_ERROR_MESSAGE = 'Kon de goedkeuringsaanvraag niet ophalen.'
const CONFIRM_ERROR_MESSAGE = 'Bevestigen mislukt, probeer opnieuw.'
const PAUSE_ERROR_MESSAGE = 'Pauzeren mislukt, probeer opnieuw.'
const CREATE_META_ERROR_MESSAGE = 'Aanmaken op Meta mislukt, probeer opnieuw.'
const META_SUCCESS_MESSAGE =
  "Campagne is aangemaakt op Meta en staat daar gepauzeerd — er wordt geen geld uitgegeven totdat je 'm zelf in Meta Ads Manager op actief zet."
const NOT_AVAILABLE = '—'

const cardStyle = {
  textAlign: 'left',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  padding: '16px',
  marginBottom: '12px',
}

const formStyle = {
  textAlign: 'left',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  padding: '16px',
  marginBottom: '24px',
}

const badgeStyle = {
  marginLeft: '8px',
  fontSize: '0.75em',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: '3px',
  padding: '2px 8px',
}

const accentBadgeStyle = {
  marginLeft: '8px',
  fontSize: '0.75em',
  color: 'var(--accent)',
  border: '1px solid var(--accent-border)',
  borderRadius: '3px',
  padding: '2px 8px',
  background: 'var(--accent-bg)',
}

const killSwitchWrapperStyle = {
  textAlign: 'left',
  border: '1px solid #c53030',
  borderRadius: '4px',
  padding: '16px',
  marginBottom: '24px',
  background: 'rgba(229, 72, 77, 0.08)',
}

const killSwitchButtonStyle = {
  background: '#e5484d',
  color: '#fff',
  border: '1px solid #c53030',
  borderRadius: '4px',
  padding: '10px 20px',
  fontWeight: 600,
  cursor: 'pointer',
  font: 'inherit',
}

const modalOverlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '20px',
  zIndex: 1000,
}

const modalBoxStyle = {
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  boxShadow: 'var(--shadow)',
  padding: '24px',
  maxWidth: '480px',
  width: '100%',
  maxHeight: '90vh',
  overflowY: 'auto',
  textAlign: 'left',
}

const warningBoxStyle = {
  padding: '12px 16px',
  marginTop: '16px',
  marginBottom: '16px',
  borderRadius: '4px',
  background: 'rgba(229, 72, 77, 0.08)',
  border: '1px solid #c53030',
}

const STATUS_LABELS = {
  voorstel: 'Voorstel',
  wacht_op_goedkeuring: 'Wacht op goedkeuring',
  goedgekeurd: 'Goedgekeurd',
  gepauzeerd: 'Gepauzeerd',
  afgerond: 'Afgerond',
  mislukt: 'Mislukt',
}

const OBJECTIVE_LABELS = {
  bereik: 'Bereik',
  verkeer: 'Verkeer',
  conversies: 'Conversies',
}

const EXPIRY_WARNING_MS = 2 * 60 * 1000

function capitalize(text) {
  if (typeof text !== 'string' || text === '') return text
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function formatCurrency(value, currency) {
  if (value === null || value === undefined) return NOT_AVAILABLE
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: currency || 'EUR' }).format(value)
}

function formatTargeting(targeting) {
  if (!targeting || typeof targeting !== 'object') return NOT_AVAILABLE

  const parts = []
  if (targeting.locatie) parts.push(targeting.locatie)
  if (targeting.leeftijd_min != null && targeting.leeftijd_max != null) {
    parts.push(`${targeting.leeftijd_min}-${targeting.leeftijd_max} jaar`)
  }
  if (Array.isArray(targeting.interesses) && targeting.interesses.length > 0) {
    parts.push(targeting.interesses.join(', '))
  }

  return parts.length > 0 ? parts.join(' · ') : NOT_AVAILABLE
}

async function callAdsFunction(name, body) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify(body ?? {}),
  })

  const data = await response.json().catch(() => ({}))
  return { ok: response.ok, status: response.status, data }
}

function AdStatusBadge({ status }) {
  const style = status === 'goedgekeurd' ? accentBadgeStyle : badgeStyle
  return <span style={style}>{STATUS_LABELS[status] ?? capitalize(status)}</span>
}

function ApprovalConfirmModal({ approvalInfo, onClose, onDecided, onRequestApproval }) {
  const { campaignId, campaignName, approvalToken, approvalExpiresAt, proposedValue } = approvalInfo

  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [tokenInvalid, setTokenInvalid] = useState(false)
  const [reRequestStatus, setReRequestStatus] = useState('idle')

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(interval)
  }, [])

  const expiresAtMs = approvalExpiresAt ? new Date(approvalExpiresAt).getTime() : null
  const msRemaining = expiresAtMs ? expiresAtMs - now : null
  const isExpired = msRemaining !== null && msRemaining <= 0
  const isExpiringSoon = msRemaining !== null && msRemaining > 0 && msRemaining < EXPIRY_WARNING_MS

  async function handleDecision(decision) {
    setBusy(true)
    setError('')

    const body = { campaign_id: campaignId, approval_token: approvalToken, decision }
    if (decision === 'goedkeuren') {
      body.approved_value = proposedValue
    }

    const { ok, status, data } = await callAdsFunction('confirm-ad-approval', body)

    if (!ok) {
      setBusy(false)
      setError(data.error || CONFIRM_ERROR_MESSAGE)
      if (status === 409 || status === 410) {
        setTokenInvalid(true)
      }
      return
    }

    onDecided({ campaignId, status: data.status })
  }

  async function handleRequestAgain() {
    setReRequestStatus('requesting')
    const result = await onRequestApproval({ id: campaignId, name: campaignName })
    if (!result.ok) {
      setReRequestStatus('idle')
      setError(result.error)
      return
    }
    // Bij succes opent onRequestApproval al een verse modal-instantie, dus hier niets meer te doen.
  }

  return (
    <div style={modalOverlayStyle}>
      <div style={modalBoxStyle}>
        <h2>Campagne goedkeuren</h2>

        <p style={{ fontWeight: 600, fontSize: '1.1em', marginTop: '16px' }}>{proposedValue.name}</p>
        <p style={{ marginTop: '8px' }}>
          <strong>Doel:</strong> {OBJECTIVE_LABELS[proposedValue.objective] ?? capitalize(proposedValue.objective) ?? NOT_AVAILABLE}
        </p>
        <p style={{ marginTop: '8px' }}>
          <strong>Lifetime-budget:</strong> {formatCurrency(proposedValue.lifetime_budget, 'EUR')}
        </p>
        <p style={{ marginTop: '8px' }}>
          <strong>Dagbudget:</strong> {formatCurrency(proposedValue.daily_budget, 'EUR')}
        </p>
        <p style={{ marginTop: '8px' }}>
          <strong>Targeting:</strong> {formatTargeting(proposedValue.targeting_json)}
        </p>

        {isExpiringSoon && !isExpired && (
          <div style={warningBoxStyle}>
            <p>Deze goedkeuring verloopt bijna, vraag zo nodig opnieuw aan.</p>
          </div>
        )}

        {(isExpired || tokenInvalid) && (
          <div style={warningBoxStyle}>
            {!error && <p>Dit goedkeuringstoken is verlopen.</p>}
            {error && <p>{error}</p>}
            <button
              type="button"
              onClick={handleRequestAgain}
              disabled={reRequestStatus === 'requesting'}
              style={{ marginTop: '8px' }}
            >
              {reRequestStatus === 'requesting' ? 'Bezig...' : 'Vraag opnieuw aan'}
            </button>
          </div>
        )}

        {error && !isExpired && !tokenInvalid && <p style={{ marginTop: '16px' }}>{error}</p>}

        <div style={{ marginTop: '24px' }}>
          <button
            type="button"
            onClick={() => handleDecision('goedkeuren')}
            disabled={busy || isExpired || tokenInvalid}
          >
            {busy ? 'Bezig...' : 'Goedkeuren'}
          </button>{' '}
          <button type="button" onClick={() => handleDecision('afwijzen')} disabled={busy || isExpired || tokenInvalid}>
            Afwijzen
          </button>{' '}
          <button type="button" onClick={onClose} disabled={busy}>
            Sluiten
          </button>
        </div>
      </div>
    </div>
  )
}

function AdCampaignCard({ campaign, onRequestApproval, onOpenModal, onCreateOnMeta }) {
  const [requestStatus, setRequestStatus] = useState('idle')
  const [requestError, setRequestError] = useState('')
  const [viewStatus, setViewStatus] = useState('idle')
  const [viewError, setViewError] = useState('')
  const [createStatus, setCreateStatus] = useState('idle')
  const [createError, setCreateError] = useState('')
  const [createSucceeded, setCreateSucceeded] = useState(false)

  async function handleRequestApprovalClick() {
    setRequestStatus('requesting')
    setRequestError('')
    const result = await onRequestApproval({ id: campaign.id, name: campaign.name })
    if (!result.ok) {
      setRequestStatus('error')
      setRequestError(result.error)
      return
    }
    setRequestStatus('idle')
  }

  async function handleViewApprovalClick() {
    setViewStatus('loading')
    setViewError('')

    const { data: auditRow, error } = await supabase
      .from('ads_audit_log')
      .select('approval_token, approval_expires_at, proposed_value')
      .eq('ads_campaign_id', campaign.id)
      .eq('action', 'goedkeuring_aangevraagd')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error || !auditRow) {
      setViewStatus('error')
      setViewError(VIEW_APPROVAL_ERROR_MESSAGE)
      return
    }

    setViewStatus('idle')
    onOpenModal({
      campaignId: campaign.id,
      campaignName: campaign.name,
      approvalToken: auditRow.approval_token,
      approvalExpiresAt: auditRow.approval_expires_at,
      proposedValue: auditRow.proposed_value,
    })
  }

  async function handleCreateOnMetaClick() {
    setCreateStatus('creating')
    setCreateError('')
    const result = await onCreateOnMeta(campaign)
    if (!result.ok) {
      setCreateStatus('error')
      setCreateError(result.error)
      return
    }
    setCreateStatus('idle')
    setCreateSucceeded(true)
  }

  return (
    <div style={cardStyle}>
      <p style={{ fontWeight: 600, margin: 0 }}>
        {campaign.name}
        <AdStatusBadge status={campaign.status} />
      </p>
      <p style={{ fontSize: '0.85em', color: 'var(--text)', marginTop: '4px' }}>
        {OBJECTIVE_LABELS[campaign.objective] ?? capitalize(campaign.objective) ?? NOT_AVAILABLE}
      </p>
      <p style={{ marginTop: '8px' }}>
        <strong>Lifetime-budget:</strong> {formatCurrency(campaign.lifetime_budget, campaign.currency)} ·{' '}
        <strong>Dagbudget:</strong> {formatCurrency(campaign.daily_budget, campaign.currency)}
      </p>
      <p style={{ marginTop: '4px' }}>
        <strong>Targeting:</strong> {formatTargeting(campaign.targeting_json)}
      </p>

      {campaign.status === 'voorstel' && (
        <div style={{ marginTop: '12px' }}>
          <button type="button" onClick={handleRequestApprovalClick} disabled={requestStatus === 'requesting'}>
            {requestStatus === 'requesting' ? 'Bezig...' : 'Vraag goedkeuring aan'}
          </button>
          {requestStatus === 'error' && <p>{requestError}</p>}
        </div>
      )}

      {campaign.status === 'wacht_op_goedkeuring' && (
        <div style={{ marginTop: '12px' }}>
          <button type="button" onClick={handleViewApprovalClick} disabled={viewStatus === 'loading'}>
            {viewStatus === 'loading' ? 'Bezig...' : 'Bekijk goedkeuring'}
          </button>
          {viewStatus === 'error' && <p>{viewError}</p>}
        </div>
      )}

      {campaign.status === 'goedgekeurd' && (
        <div style={{ marginTop: '12px' }}>
          <button type="button" onClick={handleCreateOnMetaClick} disabled={createStatus === 'creating'}>
            {createStatus === 'creating' ? 'Bezig...' : 'Aanmaken op Meta'}
          </button>
          {createStatus === 'error' && <p>{createError}</p>}
        </div>
      )}

      {createSucceeded && campaign.status === 'gepauzeerd' && <p style={{ marginTop: '12px' }}>{META_SUCCESS_MESSAGE}</p>}

      {campaign.status === 'mislukt' && campaign.meta_error && <p style={{ marginTop: '12px' }}>{campaign.meta_error}</p>}

      {campaign.meta_campaign_id && (
        <p style={{ marginTop: '8px', fontSize: '0.75em', color: 'var(--text)' }}>
          Meta campagne-ID: {campaign.meta_campaign_id}
        </p>
      )}
    </div>
  )
}

export default function Advertenties() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [instagramChannel, setInstagramChannel] = useState(null)
  const [posts, setPosts] = useState([])
  const [campaigns, setCampaigns] = useState([])

  const [selectedPostId, setSelectedPostId] = useState('')
  const [maxLifetimeBudgetInput, setMaxLifetimeBudgetInput] = useState('')
  const [maxDailyBudgetInput, setMaxDailyBudgetInput] = useState('')
  const [proposalStatus, setProposalStatus] = useState('idle')
  const [proposalError, setProposalError] = useState('')

  const [modalInfo, setModalInfo] = useState(null)

  const [killStep, setKillStep] = useState('idle')
  const [killError, setKillError] = useState('')
  const [killPausedCount, setKillPausedCount] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function loadData() {
      setLoading(true)

      const { data: channel } = await supabase
        .from('channels')
        .select('id')
        .eq('user_id', user.id)
        .eq('platform', 'instagram')
        .maybeSingle()

      if (cancelled) return
      setInstagramChannel(channel)

      if (channel) {
        const [{ data: channelPosts }, { data: userCampaigns }] = await Promise.all([
          supabase
            .from('posts')
            .select('id, topic, caption, status')
            .eq('channel_id', channel.id)
            .in('status', ['goedgekeurd', 'geplaatst'])
            .order('created_at', { ascending: false }),
          supabase
            .from('ads_campaigns')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false }),
        ])

        if (cancelled) return
        setPosts(channelPosts ?? [])
        setCampaigns(userCampaigns ?? [])
      }

      setLoading(false)
    }

    loadData()

    return () => {
      cancelled = true
    }
  }, [user.id])

  async function requestApproval({ id, name }) {
    const { ok, data } = await callAdsFunction('request-ad-approval', { campaign_id: id })

    if (!ok) {
      return { ok: false, error: data.error || REQUEST_APPROVAL_ERROR_MESSAGE }
    }

    setCampaigns((prev) => prev.map((c) => (c.id === id ? { ...c, status: 'wacht_op_goedkeuring' } : c)))
    setModalInfo({
      campaignId: data.campaign_id,
      campaignName: name,
      approvalToken: data.approval_token,
      approvalExpiresAt: data.approval_expires_at,
      proposedValue: data.proposed_value,
    })

    return { ok: true }
  }

  function handleApprovalDecided({ campaignId, status }) {
    setCampaigns((prev) => prev.map((c) => (c.id === campaignId ? { ...c, status } : c)))
    setModalInfo(null)
  }

  async function createOnMeta(campaign) {
    const { ok, data } = await callAdsFunction('create-meta-campaign', { campaign_id: campaign.id })

    const { data: refreshedCampaign } = await supabase.from('ads_campaigns').select('*').eq('id', campaign.id).single()

    if (refreshedCampaign) {
      setCampaigns((prev) => prev.map((c) => (c.id === campaign.id ? refreshedCampaign : c)))
    }

    if (!ok) {
      return { ok: false, error: data.error || CREATE_META_ERROR_MESSAGE }
    }

    return { ok: true }
  }

  async function handleGenerateProposal(event) {
    event.preventDefault()
    if (!instagramChannel || !selectedPostId) return

    const maxLifetimeBudget = Number(maxLifetimeBudgetInput)
    const maxDailyBudget = Number(maxDailyBudgetInput)

    if (!maxLifetimeBudget || maxLifetimeBudget <= 0 || !maxDailyBudget || maxDailyBudget <= 0) {
      setProposalStatus('error')
      setProposalError('Vul geldige budgetten in (groter dan 0).')
      return
    }
    if (maxDailyBudget > maxLifetimeBudget) {
      setProposalStatus('error')
      setProposalError('Het dagbudget mag niet hoger zijn dan het lifetime-budget.')
      return
    }

    setProposalStatus('generating')
    setProposalError('')

    const { ok, data } = await callAdsFunction('generate-ad-proposal', {
      channel_id: instagramChannel.id,
      post_id: selectedPostId,
      max_lifetime_budget: maxLifetimeBudget,
      max_daily_budget: maxDailyBudget,
    })

    if (!ok) {
      setProposalStatus('error')
      setProposalError(data.error || PROPOSAL_ERROR_MESSAGE)
      return
    }

    const { data: newCampaign, error: fetchError } = await supabase
      .from('ads_campaigns')
      .select('*')
      .eq('id', data.id)
      .single()

    if (fetchError || !newCampaign) {
      setProposalStatus('error')
      setProposalError(PROPOSAL_ERROR_MESSAGE)
      return
    }

    setCampaigns((prev) => [newCampaign, ...prev])
    setProposalStatus('idle')
    setSelectedPostId('')
    setMaxLifetimeBudgetInput('')
    setMaxDailyBudgetInput('')
  }

  async function handleConfirmPauseAll() {
    setKillStep('pausing')
    setKillError('')

    const { ok, data } = await callAdsFunction('pause-all-ad-campaigns', {})

    if (!ok) {
      setKillStep('error')
      setKillError(data.error || PAUSE_ERROR_MESSAGE)
      return
    }

    const pausedIds = data.campaign_ids ?? []
    setCampaigns((prev) => prev.map((c) => (pausedIds.includes(c.id) ? { ...c, status: 'gepauzeerd' } : c)))
    setKillPausedCount(data.paused_count ?? pausedIds.length)
    setKillStep('done')
  }

  function renderKillSwitch() {
    return (
      <div style={killSwitchWrapperStyle}>
        {killStep === 'idle' && (
          <button type="button" onClick={() => setKillStep('confirming')} style={killSwitchButtonStyle}>
            Pauzeer alle advertenties
          </button>
        )}
        {killStep === 'confirming' && (
          <div>
            <p>Weet je zeker dat je alle actieve/wachtende campagnes wilt pauzeren?</p>
            <div style={{ marginTop: '12px' }}>
              <button type="button" onClick={handleConfirmPauseAll} style={killSwitchButtonStyle}>
                Ja, pauzeer alles
              </button>{' '}
              <button type="button" onClick={() => setKillStep('idle')}>
                Annuleren
              </button>
            </div>
          </div>
        )}
        {killStep === 'pausing' && <p>Bezig met pauzeren...</p>}
        {killStep === 'done' && (
          <p>
            {killPausedCount} campagne{killPausedCount === 1 ? '' : "'s"} gepauzeerd.
          </p>
        )}
        {killStep === 'error' && (
          <div>
            <p>{killError}</p>
            <button type="button" onClick={() => setKillStep('confirming')}>
              Opnieuw proberen
            </button>
          </div>
        )}
      </div>
    )
  }

  function renderProposalForm() {
    if (posts.length === 0) {
      return (
        <div style={formStyle}>
          <p>
            Nog geen goedgekeurde of geplaatste posts beschikbaar om een advertentie op te baseren. Keur eerst
            content goed op de <Link to="/dashboard/contentkalender">Contentkalender-pagina</Link>.
          </p>
        </div>
      )
    }

    return (
      <form onSubmit={handleGenerateProposal} style={formStyle}>
        <h2>Nieuw campagnevoorstel</h2>

        <div style={{ marginTop: '12px' }}>
          <label htmlFor="ad_post_select">Post</label>
          <br />
          <select
            id="ad_post_select"
            value={selectedPostId}
            onChange={(event) => setSelectedPostId(event.target.value)}
            style={{ font: 'inherit', padding: '8px', marginTop: '4px', minWidth: '280px' }}
          >
            <option value="">Kies een post...</option>
            {posts.map((post) => (
              <option key={post.id} value={post.id}>
                {post.topic || post.caption?.slice(0, 60) || 'Zonder titel'}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginTop: '12px' }}>
          <label htmlFor="ad_max_lifetime_budget">Maximum lifetime-budget (EUR)</label>
          <br />
          <input
            id="ad_max_lifetime_budget"
            type="number"
            min="1"
            step="0.01"
            value={maxLifetimeBudgetInput}
            onChange={(event) => setMaxLifetimeBudgetInput(event.target.value)}
            style={{
              font: 'inherit',
              padding: '8px',
              marginTop: '4px',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              background: 'var(--bg)',
              color: 'var(--text)',
            }}
          />
        </div>

        <div style={{ marginTop: '12px' }}>
          <label htmlFor="ad_max_daily_budget">Maximum dagbudget (EUR)</label>
          <br />
          <input
            id="ad_max_daily_budget"
            type="number"
            min="1"
            step="0.01"
            value={maxDailyBudgetInput}
            onChange={(event) => setMaxDailyBudgetInput(event.target.value)}
            style={{
              font: 'inherit',
              padding: '8px',
              marginTop: '4px',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              background: 'var(--bg)',
              color: 'var(--text)',
            }}
          />
        </div>

        <div style={{ marginTop: '16px' }}>
          <button type="submit" disabled={proposalStatus === 'generating' || !selectedPostId}>
            {proposalStatus === 'generating' ? 'Bezig met genereren...' : 'Genereer campagnevoorstel'}
          </button>
          {proposalStatus === 'error' && <p>{proposalError}</p>}
        </div>
      </form>
    )
  }

  function renderCampaignList() {
    if (campaigns.length === 0) {
      return <p>Nog geen campagnevoorstellen. Genereer hierboven je eerste voorstel.</p>
    }

    return (
      <div>
        {campaigns.map((campaign) => (
          <AdCampaignCard
            key={campaign.id}
            campaign={campaign}
            onRequestApproval={requestApproval}
            onOpenModal={setModalInfo}
            onCreateOnMeta={createOnMeta}
          />
        ))}
      </div>
    )
  }

  function renderContent() {
    if (loading) {
      return <p>Laden...</p>
    }

    if (!instagramChannel) {
      return (
        <p>
          Er is nog geen Instagram-kanaal gekoppeld. Koppel eerst Instagram op de{' '}
          <Link to="/dashboard/kanalen">Kanalen-pagina</Link>.
        </p>
      )
    }

    return (
      <div>
        {renderProposalForm()}
        <h2>Campagnes</h2>
        {renderCampaignList()}
      </div>
    )
  }

  return (
    <div>
      <h1>Advertenties</h1>
      {renderKillSwitch()}
      {renderContent()}
      {modalInfo && (
        <ApprovalConfirmModal
          approvalInfo={modalInfo}
          onClose={() => setModalInfo(null)}
          onDecided={handleApprovalDecided}
          onRequestApproval={requestApproval}
        />
      )}
    </div>
  )
}

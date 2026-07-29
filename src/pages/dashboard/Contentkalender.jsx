import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../context/useAuth'

const GENERATE_ERROR_MESSAGE = 'Genereren mislukt, probeer opnieuw.'
const APPROVE_ERROR_MESSAGE = 'Goedkeuren mislukt, probeer opnieuw.'
const REJECT_ERROR_MESSAGE = 'Afwijzen mislukt, probeer opnieuw.'
const IMAGE_GENERATE_ERROR_MESSAGE = 'Genereren van afbeelding mislukt, probeer opnieuw.'

const cardStyle = {
  textAlign: 'left',
  border: '1px solid var(--border)',
  borderRadius: '4px',
  padding: '16px',
  marginBottom: '12px',
}

const detailStyle = {
  marginTop: '12px',
  paddingTop: '12px',
  borderTop: '1px solid var(--border)',
}

const badgeStyle = {
  marginLeft: '8px',
  fontSize: '0.75em',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: '3px',
  padding: '2px 8px',
}

const generatedImageStyle = {
  display: 'block',
  maxWidth: '400px',
  width: '100%',
  borderRadius: '4px',
  border: '1px solid var(--border)',
}

const STATUS_LABELS = {
  concept: 'Concept',
  wacht_op_goedkeuring: 'Wacht op goedkeuring',
  goedgekeurd: 'Goedgekeurd',
  afgewezen: 'Afgewezen',
}

function capitalize(text) {
  if (typeof text !== 'string' || text === '') return text
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function FunnelStageBadge({ funnelStage }) {
  if (!funnelStage) return null
  return <span style={badgeStyle}>{capitalize(funnelStage)}</span>
}

function PostStatusBadge({ status }) {
  return <span style={badgeStyle}>{STATUS_LABELS[status] ?? capitalize(status)}</span>
}

export default function Contentkalender() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [websiteChannel, setWebsiteChannel] = useState(null)
  const [posts, setPosts] = useState([])

  const [expandedPostId, setExpandedPostId] = useState(null)

  const [generateStatus, setGenerateStatus] = useState('idle')
  const [generateError, setGenerateError] = useState('')

  // '' | 'prompt' | 'image' — lokale sub-stap tijdens de generate-afbeelding-flow.
  // image_status op de post zelf is de bron van waarheid voor de rest van de UI.
  const [imageStep, setImageStep] = useState('')

  const [approveStatus, setApproveStatus] = useState('idle')
  const [approveError, setApproveError] = useState('')

  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectReasonInput, setRejectReasonInput] = useState('')
  const [rejectStatus, setRejectStatus] = useState('idle')
  const [rejectError, setRejectError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadContentkalenderData() {
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
        const { data: channelPosts } = await supabase
          .from('posts')
          .select('*')
          .eq('channel_id', channel.id)
          .order('priority', { ascending: true })

        if (cancelled) return
        setPosts(channelPosts ?? [])
      }

      setLoading(false)
    }

    loadContentkalenderData()

    return () => {
      cancelled = true
    }
  }, [user.id])

  function updatePostInState(postId, fields) {
    setPosts((prev) => prev.map((post) => (post.id === postId ? { ...post, ...fields } : post)))
  }

  function handleTogglePost(postId) {
    if (expandedPostId === postId) {
      setExpandedPostId(null)
      return
    }

    setGenerateStatus('idle')
    setGenerateError('')
    setImageStep('')
    setApproveStatus('idle')
    setApproveError('')
    setShowRejectForm(false)
    setRejectReasonInput('')
    setRejectStatus('idle')
    setRejectError('')
    setExpandedPostId(postId)
  }

  // Gedeeld door "Genereer caption" en "Afwijzen": generate-copy geeft de
  // volledige bijgewerkte velden terug, dus geen aparte re-fetch nodig.
  async function callGenerateCopy(postId) {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-copy`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ post_id: postId }),
      }
    )

    const data = await response.json()

    if (!response.ok || data.error) {
      throw new Error(GENERATE_ERROR_MESSAGE)
    }

    return data
  }

  async function handleGenerateCaption(postId) {
    setGenerateStatus('generating')
    setGenerateError('')

    try {
      const data = await callGenerateCopy(postId)
      updatePostInState(postId, { caption: data.caption, hashtags: data.hashtags, status: data.status })
      setGenerateStatus('idle')
    } catch {
      setGenerateStatus('error')
      setGenerateError(GENERATE_ERROR_MESSAGE)
    }
  }

  async function callGenerateImagePrompt(postId) {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-image-prompt`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ post_id: postId }),
      }
    )

    const data = await response.json()

    if (!response.ok || data.error) {
      throw new Error(data.reden || data.error || IMAGE_GENERATE_ERROR_MESSAGE)
    }

    return data
  }

  async function callGeneratePostImage(postId) {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-post-image`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ post_id: postId }),
      }
    )

    const data = await response.json()

    if (!response.ok || data.error) {
      throw new Error(data.reden || data.error || IMAGE_GENERATE_ERROR_MESSAGE)
    }

    return data
  }

  // Twee-staps-flow: eerst de Flux-prompt laten opstellen, dan pas de afbeelding
  // laten genereren. Bij een fout in stap 1 slaan we stap 2 over. Dezelfde functie
  // dient ook voor "opnieuw genereren"/"opnieuw proberen" — de backend overschrijft
  // (upsert) op post_id, geen aparte retry-logica nodig.
  async function handleGenerateImage(postId) {
    setImageStep('prompt')

    let promptData
    try {
      promptData = await callGenerateImagePrompt(postId)
    } catch (err) {
      setImageStep('')
      updatePostInState(postId, { image_status: 'failed', image_error: err.message })
      return
    }

    updatePostInState(postId, { image_status: promptData.image_status, image_prompt: promptData.image_prompt })
    setImageStep('image')

    try {
      const imageData = await callGeneratePostImage(postId)
      updatePostInState(postId, { image_status: imageData.image_status, image_url: imageData.image_url })
    } catch (err) {
      updatePostInState(postId, { image_status: 'failed', image_error: err.message })
    } finally {
      setImageStep('')
    }
  }

  async function handleApprovePost(postId) {
    setApproveStatus('approving')
    setApproveError('')

    try {
      const { data: updated, error } = await supabase
        .from('posts')
        .update({ status: 'goedgekeurd' })
        .eq('id', postId)
        .select()
        .single()

      if (error || !updated) {
        setApproveStatus('error')
        setApproveError(APPROVE_ERROR_MESSAGE)
        return
      }

      updatePostInState(postId, updated)
      setApproveStatus('success')
    } catch {
      setApproveStatus('error')
      setApproveError(APPROVE_ERROR_MESSAGE)
    }
  }

  async function handleSubmitRejection(event, postId) {
    event.preventDefault()
    const reason = rejectReasonInput.trim()
    if (!reason) return

    setRejectStatus('rejecting')
    setRejectError('')

    try {
      const { error: updateError } = await supabase
        .from('posts')
        .update({ rejection_reason: reason })
        .eq('id', postId)

      if (updateError) {
        setRejectStatus('error')
        setRejectError(REJECT_ERROR_MESSAGE)
        return
      }

      const data = await callGenerateCopy(postId)
      updatePostInState(postId, {
        caption: data.caption,
        hashtags: data.hashtags,
        status: data.status,
        rejection_reason: reason,
      })
      setRejectStatus('idle')
      setShowRejectForm(false)
      setRejectReasonInput('')
    } catch {
      setRejectStatus('error')
      setRejectError(REJECT_ERROR_MESSAGE)
    }
  }

  function renderImageSection(post) {
    const isBusy = imageStep !== ''
    const isGenerating = post.image_status === 'generating' || imageStep === 'prompt'

    let generatingText = 'Bezig met genereren... dit kan tot een minuut duren'
    if (imageStep === 'prompt') {
      generatingText = 'Prompt wordt gemaakt...'
    } else if (imageStep === 'image') {
      generatingText = 'Afbeelding wordt gegenereerd... dit kan tot een minuut duren'
    }

    return (
      <div style={{ marginTop: '12px' }}>
        <h3>Afbeelding</h3>

        {isGenerating ? (
          <p>{generatingText}</p>
        ) : post.image_status === 'completed' && post.image_url ? (
          <div>
            <img src={post.image_url} alt={post.topic} style={generatedImageStyle} />
            <div style={{ marginTop: '12px' }}>
              <button type="button" onClick={() => handleGenerateImage(post.id)} disabled={isBusy}>
                Opnieuw genereren
              </button>
            </div>
          </div>
        ) : post.image_status === 'failed' ? (
          <div>
            <p>{post.image_error || IMAGE_GENERATE_ERROR_MESSAGE}</p>
            <button type="button" onClick={() => handleGenerateImage(post.id)} disabled={isBusy}>
              Opnieuw proberen
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => handleGenerateImage(post.id)} disabled={isBusy}>
            Genereer afbeelding
          </button>
        )}
      </div>
    )
  }

  function renderPostDetail(post) {
    const isPendingApproval = post.status === 'wacht_op_goedkeuring'

    return (
      <div style={detailStyle}>
        <p>
          <strong>Topic:</strong> {post.topic}
        </p>
        {post.angle && (
          <p>
            <strong>Angle:</strong> {post.angle}
          </p>
        )}
        {post.hook_direction && (
          <p>
            <strong>Hook:</strong> {post.hook_direction}
          </p>
        )}
        {post.cta_goal && (
          <p>
            <strong>CTA:</strong> {post.cta_goal}
          </p>
        )}
        <p>
          <strong>Funnel stage:</strong> {capitalize(post.funnel_stage)}
        </p>
        <p>
          <strong>Content pillar:</strong> {post.content_pillar}
        </p>
        <p>
          <strong>Format:</strong> {capitalize(post.format)}
        </p>

        {!post.caption ? (
          <div style={{ marginTop: '12px' }}>
            <button
              type="button"
              onClick={() => handleGenerateCaption(post.id)}
              disabled={generateStatus === 'generating'}
            >
              {generateStatus === 'generating'
                ? 'Bezig met genereren... (dit kan 10-30 seconden duren)'
                : 'Genereer caption'}
            </button>
            {generateStatus === 'error' && <p>{generateError}</p>}
          </div>
        ) : (
          <div style={{ marginTop: '12px' }}>
            <h3>Caption</h3>
            <p style={{ whiteSpace: 'pre-wrap' }}>{post.caption}</p>
            {post.hashtags && <p style={{ fontSize: '0.85em', color: 'var(--text)' }}>{post.hashtags}</p>}

            {isPendingApproval && (
              <div style={{ marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => handleApprovePost(post.id)}
                  disabled={approveStatus === 'approving'}
                >
                  {approveStatus === 'approving' ? 'Bezig...' : 'Goedkeuren'}
                </button>{' '}
                <button type="button" onClick={() => setShowRejectForm((prev) => !prev)}>
                  Afwijzen
                </button>
                {approveStatus === 'error' && <p>{approveError}</p>}
                {approveStatus === 'success' && <p>Post goedgekeurd.</p>}

                {showRejectForm && (
                  <form
                    onSubmit={(event) => handleSubmitRejection(event, post.id)}
                    style={{ marginTop: '12px' }}
                  >
                    <label htmlFor={`rejection_reason_${post.id}`}>Wat moet er worden aangepast?</label>
                    <br />
                    <textarea
                      id={`rejection_reason_${post.id}`}
                      value={rejectReasonInput}
                      onChange={(event) => setRejectReasonInput(event.target.value)}
                      rows={3}
                      style={{ width: '100%', marginTop: '8px' }}
                    />
                    <br />
                    <button
                      type="submit"
                      disabled={rejectStatus === 'rejecting' || rejectReasonInput.trim() === ''}
                    >
                      {rejectStatus === 'rejecting'
                        ? 'Bezig met afwijzen... (dit kan 10-30 seconden duren)'
                        : 'Verstuur en genereer nieuwe caption'}
                    </button>
                    {rejectStatus === 'error' && <p>{rejectError}</p>}
                  </form>
                )}
              </div>
            )}
          </div>
        )}

        {renderImageSection(post)}
      </div>
    )
  }

  function renderPostCard(post) {
    const isExpanded = expandedPostId === post.id

    return (
      <div key={post.id} style={cardStyle}>
        <p
          style={{ fontWeight: 600, margin: 0, cursor: 'pointer' }}
          onClick={() => handleTogglePost(post.id)}
        >
          {post.topic}
          <FunnelStageBadge funnelStage={post.funnel_stage} />
          <PostStatusBadge status={post.status} />
        </p>
        {isExpanded && renderPostDetail(post)}
      </div>
    )
  }

  function renderContent() {
    if (loading) {
      return <p>Laden...</p>
    }

    if (!websiteChannel) {
      return (
        <p>
          Er is nog geen website gekoppeld. Koppel eerst een website op de{' '}
          <Link to="/dashboard/kanalen">Kanalen-pagina</Link>.
        </p>
      )
    }

    if (posts.length === 0) {
      return (
        <p>
          Nog geen contentplan goedgekeurd. Genereer en keur eerst een strategie goed op de{' '}
          <Link to="/dashboard/strategie">Strategie-pagina</Link>.
        </p>
      )
    }

    return <div>{posts.map((post) => renderPostCard(post))}</div>
  }

  return (
    <div>
      <h1>Contentkalender</h1>
      {renderContent()}
    </div>
  )
}

import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2"

// De Social Media Agent (Fase 4, stap 4). Wordt aangeroepen per post_id — door
// de cron-job (stap 6) die bepaalt welke posts aan de beurt zijn, of handmatig
// voor debugdoeleinden. Verwacht een service-role Authorization header, niet
// een individuele gebruikerssessie: dit is een server-side systeemactie, geen
// gebruikersactie. Eigenaarschap wordt daarom via de post zelf bepaald, niet
// via een JWT-vergelijking zoals bij de user-facing functies.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const GRAPH_API_VERSION = "v25.0"
const GRAPH_BASE = `https://graph.instagram.com/${GRAPH_API_VERSION}`
const CONTAINER_POLL_INTERVAL_MS = 2000
const CONTAINER_POLL_MAX_ATTEMPTS = 15

// Retry-strategie zoals afgesproken in de Fase 4-blueprint. "max" is het totaal
// aantal pogingen (dus retry_count bereikt "max" -> definitief mislukt).
const RETRY_POLICY: Record<string, { retryable: boolean; max: number }> = {
  rate_limited: { retryable: true, max: 5 },
  temporary_error: { retryable: true, max: 3 },
  token_expired: { retryable: false, max: 0 },
  missing_image: { retryable: false, max: 0 },
  missing_caption: { retryable: false, max: 0 },
  no_channel: { retryable: false, max: 0 },
  unknown_error: { retryable: true, max: 1 },
}

interface PublishPostRequest {
  post_id: string
}

interface ClaimedPost {
  id: string
  user_id: string
  channel_id: string
  caption: string | null
  hashtags: string | null
  image_url: string | null
  retry_count: number
}

interface ChannelRow {
  instagram_account_id: string | null
  access_token: string | null
  token_expires_at: string | null
}

interface MetaError {
  message?: string
  type?: string
  code?: number
  error_subcode?: number
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Meta geeft grote ID's (17+ cijfers) soms als kaal getal terug i.p.v. als
// string. JavaScript kan zulke getallen niet nauwkeurig opslaan (voorbij
// Number.MAX_SAFE_INTEGER), waardoor het laatste cijfer stilletjes kan
// afronden bij een gewone res.json(). Deze helper zet elk verdacht groot kaal
// getal in de ruwe tekst eerst om naar een string, vóór het parsen — zodat
// zulke ID's altijd exact bewaard blijven, waar in de respons ze ook staan.
// deno-lint-ignore no-explicit-any
async function safeJsonFromResponse(res: Response): Promise<any> {
  const text = await res.text()
  const safeText = text.replace(/:(-?\d{16,})(?=[,}\s])/g, ':"$1"')
  try {
    return JSON.parse(safeText)
  } catch {
    return JSON.parse(text)
  }
}

// Best-effort classificatie van Meta-foutresponses. Dit is een startpunt op
// basis van de bekendste Meta-foutcodes — verfijnen we zodra we in productie
// echte foutpatronen zien (logging via Sentry, stap 10, maakt dat zichtbaar).
function classifyMetaError(error: MetaError | undefined): keyof typeof RETRY_POLICY {
  const code = error?.code
  const type = error?.type
  if (code === 190 || type === "OAuthException") return "token_expired"
  if (code !== undefined && [4, 17, 32, 613].includes(code)) return "rate_limited"
  if (code === 1 || code === 2) return "temporary_error"
  return "unknown_error"
}

async function failAttempt(
  supabaseAdmin: SupabaseClient,
  postId: string,
  currentRetryCount: number,
  errorCode: keyof typeof RETRY_POLICY,
  errorMessage: string,
): Promise<{ final: boolean }> {
  const policy = RETRY_POLICY[errorCode]
  const nextRetryCount = currentRetryCount + 1
  const isFinal = !policy.retryable || nextRetryCount >= policy.max

  await supabaseAdmin
    .from("posts")
    .update({
      status: isFinal ? "mislukt" : "gepland",
      error_code: errorCode,
      error_message: errorMessage.slice(0, 500),
      retry_count: nextRetryCount,
      last_attempted_at: new Date().toISOString(),
      // Claim vrijgeven zodat een volgende cron-run het opnieuw mag proberen.
      // Bij definitieve mislukking maakt dit niets uit (status matcht de
      // cron-query toch niet meer), maar netjes opruimen kan geen kwaad.
      claimed_at: null,
    })
    .eq("id", postId)

  await sentryCapture({
    message: `publish-post: ${isFinal ? "definitief mislukt" : "poging mislukt, retry gepland"} (${errorCode})`,
    level: isFinal ? "error" : "warning",
    tags: { post_id: postId, error_code: errorCode },
    extra: { retry_count: nextRetryCount, error_message: errorMessage },
  })

  return { final: isFinal }
}

// Stap 10: elke publicatiepoging (geslaagd of niet) loggen naar Sentry, met
// post-id, error_code (indien van toepassing) en retry_count. Gebruikt de
// moderne envelope-API rechtstreeks (geen SDK-dependency nodig in Deno) — de
// oudere store-API is door Sentry uitgefaseerd. Logging mag de hoofdflow
// nooit breken, dus elke fout hierin wordt stil geslikt. Werkt pas zodra de
// SENTRY_DSN-secret is ingesteld; zolang die ontbreekt, no-opt dit stil.
async function sentryCapture(params: {
  message: string
  level: "info" | "warning" | "error"
  tags?: Record<string, string>
  extra?: Record<string, unknown>
}): Promise<void> {
  const dsn = Deno.env.get("SENTRY_DSN")
  if (!dsn) return

  try {
    const dsnUrl = new URL(dsn)
    const publicKey = dsnUrl.username
    const projectId = dsnUrl.pathname.replace("/", "")
    const ingestHost = dsnUrl.host
    const eventId = crypto.randomUUID().replace(/-/g, "")

    const envelopeHeader = JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString(), dsn })
    const itemHeader = JSON.stringify({ type: "event" })
    const eventPayload = JSON.stringify({
      event_id: eventId,
      timestamp: new Date().toISOString(),
      level: params.level,
      message: params.message,
      logger: "publish-post",
      platform: "other",
      tags: params.tags,
      extra: params.extra,
    })

    await fetch(`https://${ingestHost}/api/${projectId}/envelope/?sentry_key=${publicKey}&sentry_version=7`, {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope" },
      body: `${envelopeHeader}\n${itemHeader}\n${eventPayload}\n`,
    })
  } catch {
    // logging mag nooit de hoofdflow breken
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return jsonResponse({ error: "Geen Authorization header." }, 401)
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const supabaseAdmin: SupabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey)

    const { post_id }: PublishPostRequest = await req.json()
    if (!post_id) {
      return jsonResponse({ error: "post_id is verplicht." }, 400)
    }

    // Claim: alleen doorgaan als dit de rij daadwerkelijk exclusief mag
    // verwerken. Voorkomt dubbele publicatie bij overlappende cron-runs.
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from("posts")
      .update({ claimed_at: new Date().toISOString() })
      .eq("id", post_id)
      .eq("status", "gepland")
      .is("claimed_at", null)
      .select("id, user_id, channel_id, caption, hashtags, image_url, retry_count")
      .maybeSingle<ClaimedPost>()

    if (claimError) {
      return jsonResponse({ error: "Kon post niet claimen." }, 500)
    }
    if (!claimed) {
      return jsonResponse(
        { message: "Post niet beschikbaar om te claimen — al verwerkt, al geclaimd, of niet (meer) gepland." },
        200,
      )
    }

    // Extra idempotentie-check: als er om wat voor reden dan ook al een
    // platform_post_id op deze post staat, is hij al gepubliceerd. Stoppen.
    const { data: freshCheck } = await supabaseAdmin
      .from("posts")
      .select("platform_post_id")
      .eq("id", post_id)
      .maybeSingle()
    if (freshCheck?.platform_post_id) {
      return jsonResponse({ message: "Post had al een platform_post_id, niet opnieuw gepubliceerd." }, 200)
    }

    // Validaties vóór elke Meta-aanroep
    const { data: channel, error: channelError } = await supabaseAdmin
      .from("channels")
      .select("instagram_account_id, access_token, token_expires_at")
      .eq("id", claimed.channel_id)
      .maybeSingle<ChannelRow>()

    if (channelError) {
      const result = await failAttempt(supabaseAdmin, post_id, claimed.retry_count, "no_channel", "Kon kanaal niet ophalen.")
      return jsonResponse({ error: "no_channel", final: result.final }, 200)
    }
    if (!channel?.access_token || !channel.instagram_account_id) {
      const result = await failAttempt(supabaseAdmin, post_id, claimed.retry_count, "no_channel", "Geen actieve Instagram-koppeling.")
      return jsonResponse({ error: "no_channel", final: result.final }, 200)
    }
    // Bewust brede afhandeling (optie 1 uit de blueprint): elke auth-gerelateerde
    // fout bij Meta wordt hieronder ook als token_expired geclassificeerd, niet
    // alleen een letterlijk verlopen token_expires_at.
    if (channel.token_expires_at && new Date(channel.token_expires_at) < new Date()) {
      const result = await failAttempt(supabaseAdmin, post_id, claimed.retry_count, "token_expired", "Instagram-token is verlopen.")
      return jsonResponse({ error: "token_expired", final: result.final }, 200)
    }
    if (!claimed.image_url) {
      const result = await failAttempt(supabaseAdmin, post_id, claimed.retry_count, "missing_image", "Post heeft geen afbeelding.")
      return jsonResponse({ error: "missing_image", final: result.final }, 200)
    }
    if (!claimed.caption) {
      const result = await failAttempt(supabaseAdmin, post_id, claimed.retry_count, "missing_caption", "Post heeft geen caption.")
      return jsonResponse({ error: "missing_caption", final: result.final }, 200)
    }

    const accessToken = channel.access_token
    const igUserId = channel.instagram_account_id
    const caption = claimed.hashtags ? `${claimed.caption}\n\n${claimed.hashtags}` : claimed.caption

    // Media-container aanmaken
    const createRes = await fetch(
      `${GRAPH_BASE}/${igUserId}/media?${new URLSearchParams({ image_url: claimed.image_url, caption, access_token: accessToken })}`,
      { method: "POST" },
    )
    const createData = await safeJsonFromResponse(createRes)

    if (!createRes.ok || !createData.id) {
      const errorCode = classifyMetaError(createData?.error)
      const result = await failAttempt(supabaseAdmin, post_id, claimed.retry_count, errorCode, createData?.error?.message ?? "Container aanmaken mislukt.")
      return jsonResponse({ error: errorCode, final: result.final, details: createData }, 200)
    }

    const creationId = createData.id as string

    // Container-status pollen
    let statusCode = "IN_PROGRESS"
    let attempts = 0
    while (statusCode === "IN_PROGRESS" && attempts < CONTAINER_POLL_MAX_ATTEMPTS) {
      await sleep(CONTAINER_POLL_INTERVAL_MS)
      const statusRes = await fetch(`${GRAPH_BASE}/${creationId}?${new URLSearchParams({ fields: "status_code", access_token: accessToken })}`)
      const statusData = await safeJsonFromResponse(statusRes)
      statusCode = statusData.status_code ?? "ERROR"
      attempts += 1
    }

    if (statusCode !== "FINISHED") {
      const result = await failAttempt(supabaseAdmin, post_id, claimed.retry_count, "temporary_error", `Container-status: ${statusCode} na ${attempts} pogingen.`)
      return jsonResponse({ error: "temporary_error", final: result.final }, 200)
    }

    // Publiceren
    const publishRes = await fetch(
      `${GRAPH_BASE}/${igUserId}/media_publish?${new URLSearchParams({ creation_id: creationId, access_token: accessToken })}`,
      { method: "POST" },
    )
    const publishData = await safeJsonFromResponse(publishRes)

    if (!publishRes.ok || !publishData.id) {
      const errorCode = classifyMetaError(publishData?.error)
      const result = await failAttempt(supabaseAdmin, post_id, claimed.retry_count, errorCode, publishData?.error?.message ?? "Publiceren mislukt.")
      return jsonResponse({ error: errorCode, final: result.final, details: publishData }, 200)
    }

    // Succes
    await supabaseAdmin
      .from("posts")
      .update({
        status: "geplaatst",
        platform_post_id: publishData.id,
        published_at: new Date().toISOString(),
        error_code: null,
        error_message: null,
      })
      .eq("id", post_id)

    await sentryCapture({
      message: "publish-post: succesvol gepubliceerd",
      level: "info",
      tags: { post_id, error_code: "none" },
      extra: { retry_count: claimed.retry_count, instagram_media_id: publishData.id },
    })

    return jsonResponse({ success: true, instagram_media_id: publishData.id }, 200)
  } catch (err) {
    return jsonResponse({ error: "Onverwachte fout", details: String(err) }, 500)
  }
})

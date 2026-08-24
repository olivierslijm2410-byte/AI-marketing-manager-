import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2"

// LET OP: dit is bewust GEEN onderdeel van de uiteindelijke Social Media Agent.
// Dit is een eenmalige, handmatige diagnostische test om te bevestigen dat de
// volledige keten (OAuth -> token -> permissions -> account -> image_url ->
// Meta content publishing) daadwerkelijk werkt, vóórdat we de cron/retry/
// claim-locking-orchestratie bouwen. Wijzigt bewust NIETS aan de status van
// de post in de database — alleen een directe testpublicatie + het resultaat
// teruggeven, zodat de gebruiker het zelf op Instagram kan verifiëren.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const GRAPH_API_VERSION = "v21.0"
const GRAPH_BASE = `https://graph.instagram.com/${GRAPH_API_VERSION}`
const CONTAINER_POLL_INTERVAL_MS = 2000
const CONTAINER_POLL_MAX_ATTEMPTS = 15 // ~30 seconden, ruim voldoende voor een los beeld

interface TestPublishRequest {
  post_id: string
}

interface PostRow {
  id: string
  user_id: string
  channel_id: string
  caption: string | null
  hashtags: string | null
  image_url: string | null
}

interface ChannelRow {
  instagram_account_id: string | null
  access_token: string | null
  token_expires_at: string | null
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return jsonResponse({ error: "Geen geldige sessie. Log opnieuw in." }, 401)
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

    const supabaseAuthClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: userError,
    } = await supabaseAuthClient.auth.getUser()

    if (userError || !user) {
      return jsonResponse({ error: "Geen geldige sessie. Log opnieuw in." }, 401)
    }

    const supabaseAdmin: SupabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey)

    const { post_id }: TestPublishRequest = await req.json()
    if (!post_id) {
      return jsonResponse({ error: "post_id is verplicht." }, 400)
    }

    // Stap 1: post ophalen + eigenaarschap verifiëren
    const { data: post, error: postError } = await supabaseAdmin
      .from("posts")
      .select("id, user_id, channel_id, caption, hashtags, image_url")
      .eq("id", post_id)
      .eq("user_id", user.id)
      .maybeSingle<PostRow>()

    if (postError) return jsonResponse({ error: "Kon post niet ophalen." }, 500)
    if (!post) return jsonResponse({ error: "Post niet gevonden." }, 404)
    if (!post.image_url) {
      return jsonResponse({ error: "missing_image", reden: "Deze post heeft nog geen afbeelding." }, 400)
    }
    if (!post.caption) {
      return jsonResponse({ error: "missing_caption", reden: "Deze post heeft nog geen caption." }, 400)
    }

    // Stap 2: channel + token ophalen
    const { data: channel, error: channelError } = await supabaseAdmin
      .from("channels")
      .select("instagram_account_id, access_token, token_expires_at")
      .eq("id", post.channel_id)
      .eq("user_id", user.id)
      .maybeSingle<ChannelRow>()

    if (channelError) return jsonResponse({ error: "Kon kanaal niet ophalen." }, 500)
    if (!channel || !channel.access_token || !channel.instagram_account_id) {
      return jsonResponse({ error: "no_channel", reden: "Geen actieve Instagram-koppeling gevonden." }, 400)
    }
    if (channel.token_expires_at && new Date(channel.token_expires_at) < new Date()) {
      return jsonResponse(
        { error: "token_expired", reden: "Instagram-token is verlopen, koppel opnieuw via de Kanalen-pagina." },
        400,
      )
    }

    const accessToken = channel.access_token
    const igUserId = channel.instagram_account_id
    const caption = post.hashtags ? `${post.caption}\n\n${post.hashtags}` : post.caption

    // Stap 3: media-container aanmaken
    const createRes = await fetch(
      `${GRAPH_BASE}/${igUserId}/media?${new URLSearchParams({
        image_url: post.image_url,
        caption,
        access_token: accessToken,
      })}`,
      { method: "POST" },
    )
    const createData = await createRes.json()

    if (!createRes.ok || !createData.id) {
      return jsonResponse(
        { error: "container_mislukt", reden: "Meta gaf een fout terug bij het aanmaken van de media-container.", details: createData },
        502,
      )
    }

    const creationId = createData.id as string

    // Stap 4: status van de container pollen tot FINISHED (of ERROR/timeout)
    let statusCode = "IN_PROGRESS"
    let attempts = 0
    while (statusCode === "IN_PROGRESS" && attempts < CONTAINER_POLL_MAX_ATTEMPTS) {
      await sleep(CONTAINER_POLL_INTERVAL_MS)
      const statusRes = await fetch(
        `${GRAPH_BASE}/${creationId}?${new URLSearchParams({ fields: "status_code", access_token: accessToken })}`,
      )
      const statusData = await statusRes.json()
      statusCode = statusData.status_code ?? "ERROR"
      attempts += 1
    }

    if (statusCode !== "FINISHED") {
      return jsonResponse(
        { error: "container_niet_klaar", reden: `Container-status: ${statusCode} na ${attempts} pogingen.` },
        502,
      )
    }

    // Stap 5: daadwerkelijk publiceren
    const publishRes = await fetch(
      `${GRAPH_BASE}/${igUserId}/media_publish?${new URLSearchParams({
        creation_id: creationId,
        access_token: accessToken,
      })}`,
      { method: "POST" },
    )
    const publishData = await publishRes.json()

    if (!publishRes.ok || !publishData.id) {
      return jsonResponse(
        { error: "publiceren_mislukt", reden: "Meta gaf een fout terug bij het publiceren.", details: publishData },
        502,
      )
    }

    // Bewust GEEN update van posts.status/platform_post_id — dit is de handmatige
    // testfunctie, niet de productie-orchestratie. Alleen het resultaat teruggeven.
    return jsonResponse(
      { success: true, instagram_media_id: publishData.id, message: "Testpublicatie gelukt. Controleer het account op Instagram." },
      200,
    )
  } catch (err) {
    return jsonResponse({ error: "Onverwachte fout", details: String(err) }, 500)
  }
})

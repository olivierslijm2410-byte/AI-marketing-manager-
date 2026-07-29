import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const FLUX_GENERATE_URL = "https://api.bfl.ai/v1/flux-2-pro"
const FLUX_REQUEST_TIMEOUT_MS = 20_000
const FLUX_POLL_INTERVAL_MS = 2_000
const FLUX_POLL_MAX_ATTEMPTS = 30 // 30 * 2s = max 60s polling
const FLUX_IMAGE_PROVIDER = "black-forest-labs"
const FLUX_IMAGE_MODEL = "flux-2-pro"
const STORAGE_BUCKET = "post-images"

const FLUX_TERMINAL_FAILURE_STATUSES = new Set([
  "Error",
  "Request Moderated",
  "Content Moderated",
  "Task not found",
])

// Uit de officiële BFL OpenAPI-spec geverifieerd: width/height zijn integers (min 64),
// geen gedocumenteerd veelvoud-vereiste. Onbekende ratio's vallen terug op 1:1.
const ASPECT_RATIO_DIMENSIONS: Record<string, { width: number; height: number }> = {
  "1:1": { width: 1024, height: 1024 },
  "4:5": { width: 864, height: 1080 },
  "9:16": { width: 720, height: 1280 },
}
const DEFAULT_DIMENSIONS = ASPECT_RATIO_DIMENSIONS["1:1"]

interface GeneratePostImageRequest {
  post_id: string
}

interface PostRow {
  id: string
  user_id: string
  image_prompt: string | null
  image_status: string
  creative_brief: { aspect_ratio?: string } | null
}

interface FluxSubmitResponse {
  id?: string
  polling_url?: string
  cost?: number | null
}

interface FluxPollResponse {
  id?: string
  status?: string
  result?: { sample?: string } | null
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function resolveDimensions(aspectRatio: string | undefined): { width: number; height: number } {
  if (aspectRatio && ASPECT_RATIO_DIMENSIONS[aspectRatio]) {
    return ASPECT_RATIO_DIMENSIONS[aspectRatio]
  }
  console.log(`[generate-post-image] onbekende aspect_ratio ("${aspectRatio}"), val terug op 1:1 (1024x1024)`)
  return DEFAULT_DIMENSIONS
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  label: string,
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (err) {
    const isTimeout = err instanceof DOMException && err.name === "AbortError"
    throw new Error(isTimeout ? `${label}: timeout na ${timeoutMs}ms` : `${label}: netwerkfout (${String(err)})`)
  } finally {
    clearTimeout(timeoutId)
  }
}

// Best-effort: schrijft de foutstatus weg, negeert een eventuele eigen schrijffout
// (zelfde patroon als markFailed in generate-image-prompt).
async function markFailed(
  supabaseAdmin: SupabaseClient,
  postId: string,
  userId: string,
  reason: string,
): Promise<void> {
  await supabaseAdmin
    .from("posts")
    .update({ image_status: "failed", image_error: `image generation failed: ${reason}` })
    .eq("id", postId)
    .eq("user_id", userId)
}

Deno.serve(async (req) => {
  // Preflight-check afhandelen
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Authenticatie: geldige, ingelogde gebruiker vereist
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

    // Service-role client voor alle databaseoperaties (bypass RLS server-side)
    const supabaseAdmin: SupabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey)

    // Stap 1: input valideren
    const { post_id }: GeneratePostImageRequest = await req.json()
    if (!post_id) {
      return jsonResponse({ error: "post_id is verplicht." }, 400)
    }

    // Stap 2: post ophalen en eigenaarschap verifiëren
    console.log(`[generate-post-image] Stap 2: posts ophalen voor post_id=${post_id}`)
    const { data: post, error: postError } = await supabaseAdmin
      .from("posts")
      .select("id, user_id, image_prompt, image_status, creative_brief")
      .eq("id", post_id)
      .eq("user_id", user.id)
      .maybeSingle<PostRow>()

    if (postError) {
      return jsonResponse({ error: "Kon post niet ophalen." }, 500)
    }
    if (!post) {
      return jsonResponse({ error: "Post niet gevonden." }, 404)
    }

    // Stap 3: preconditie — de prompt-stap moet al gedraaid hebben
    if (post.image_status !== "generating") {
      return jsonResponse(
        {
          error:
            `Post is niet klaar voor beeldgeneratie (image_status is "${post.image_status}", verwacht "generating").`,
        },
        400,
      )
    }
    if (!post.image_prompt || post.image_prompt.trim() === "") {
      return jsonResponse(
        { error: "posts.image_prompt is leeg. Genereer eerst een prompt via generate-image-prompt." },
        400,
      )
    }

    const fluxApiKey = Deno.env.get("FLUX_API_KEY")
    if (!fluxApiKey) {
      await markFailed(supabaseAdmin, post_id, user.id, "FLUX_API_KEY ontbreekt in de functie-secrets")
      return jsonResponse({ error: "FLUX_API_KEY ontbreekt in de functie-secrets." }, 500)
    }

    // Vanaf hier is elke fout gegarandeerd een 'failed'-status, inclusief onvoorziene fouten.
    try {
      // Stap 4: aspect_ratio omrekenen naar pixels
      const { width, height } = resolveDimensions(post.creative_brief?.aspect_ratio)

      // Stap 5: Flux-generatie starten
      console.log(`[generate-post-image] Stap 5: Flux-generatie starten voor post_id=${post_id} (${width}x${height})`)
      let submitData: FluxSubmitResponse
      try {
        const submitRes = await fetchWithTimeout(
          FLUX_GENERATE_URL,
          {
            method: "POST",
            headers: { "x-key": fluxApiKey, "content-type": "application/json" },
            body: JSON.stringify({ prompt: post.image_prompt, width, height, output_format: "png" }),
          },
          FLUX_REQUEST_TIMEOUT_MS,
          "flux-start",
        )
        if (!submitRes.ok) {
          throw new Error(`Flux gaf een foutstatus terug bij het starten (${submitRes.status})`)
        }
        submitData = await submitRes.json()
      } catch (err) {
        const message = String(err instanceof Error ? err.message : err)
        console.log(`[generate-post-image] Flux-start mislukt: ${message}`)
        await markFailed(supabaseAdmin, post_id, user.id, message)
        return jsonResponse({ error: "flux_start_mislukt", reden: message }, 500)
      }

      if (!submitData.polling_url) {
        const message = "Flux gaf geen polling_url terug"
        await markFailed(supabaseAdmin, post_id, user.id, message)
        return jsonResponse({ error: "flux_start_mislukt", reden: message }, 500)
      }

      // Stap 6: pollen tot status "Ready" (of een terminale fout / timeout)
      console.log(`[generate-post-image] Stap 6: pollen gestart (max ${FLUX_POLL_MAX_ATTEMPTS} pogingen)`)
      let sampleUrl: string | null = null
      let pollFailureReason: string | null = null

      for (let attempt = 1; attempt <= FLUX_POLL_MAX_ATTEMPTS; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, FLUX_POLL_INTERVAL_MS))

        let pollData: FluxPollResponse
        try {
          const pollRes = await fetchWithTimeout(
            submitData.polling_url,
            { headers: { "x-key": fluxApiKey } },
            FLUX_REQUEST_TIMEOUT_MS,
            "flux-poll",
          )
          if (!pollRes.ok) {
            throw new Error(`Flux gaf een foutstatus terug bij het pollen (${pollRes.status})`)
          }
          pollData = await pollRes.json()
        } catch (err) {
          pollFailureReason = String(err instanceof Error ? err.message : err)
          break
        }

        console.log(`[generate-post-image] poging ${attempt}/${FLUX_POLL_MAX_ATTEMPTS}: status=${pollData.status}`)

        if (pollData.status === "Ready") {
          sampleUrl = pollData.result?.sample ?? null
          if (!sampleUrl) {
            pollFailureReason = "status Ready maar geen result.sample-URL ontvangen"
          }
          break
        }

        if (pollData.status && FLUX_TERMINAL_FAILURE_STATUSES.has(pollData.status)) {
          pollFailureReason = `Flux meldt status "${pollData.status}"`
          break
        }
        // overige statussen (Pending/Reasoning/Generating): doorgaan met pollen
      }

      if (!sampleUrl) {
        const reason = pollFailureReason ??
          `timeout: geen "Ready"-status binnen ${(FLUX_POLL_MAX_ATTEMPTS * FLUX_POLL_INTERVAL_MS) / 1000} seconden`
        console.log(`[generate-post-image] polling mislukt: ${reason}`)
        await markFailed(supabaseAdmin, post_id, user.id, reason)
        return jsonResponse({ error: "flux_generatie_mislukt", reden: reason }, 500)
      }

      // Stap 7: afbeelding direct downloaden — de sample-URL verloopt na 10 minuten
      console.log(`[generate-post-image] Stap 7: afbeelding downloaden voor post_id=${post_id}`)
      let imageBlob: Blob
      try {
        const imageRes = await fetchWithTimeout(sampleUrl, {}, FLUX_REQUEST_TIMEOUT_MS, "flux-download")
        if (!imageRes.ok) {
          throw new Error(`kon de gegenereerde afbeelding niet downloaden (${imageRes.status})`)
        }
        imageBlob = await imageRes.blob()
      } catch (err) {
        const message = String(err instanceof Error ? err.message : err)
        console.log(`[generate-post-image] download mislukt: ${message}`)
        await markFailed(supabaseAdmin, post_id, user.id, message)
        return jsonResponse({ error: "download_mislukt", reden: message }, 500)
      }

      // Stap 8: uploaden naar Supabase Storage — nooit de Flux-URL zelf opslaan
      console.log(`[generate-post-image] Stap 8: uploaden naar storage voor post_id=${post_id}`)
      const storagePath = `${user.id}/${post_id}.png`
      const { error: uploadError } = await supabaseAdmin.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, imageBlob, { contentType: "image/png", upsert: true })

      if (uploadError) {
        const message = `upload naar storage mislukt (${uploadError.message})`
        await markFailed(supabaseAdmin, post_id, user.id, message)
        return jsonResponse({ error: "upload_mislukt", reden: message }, 500)
      }

      const { data: publicUrlData } = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath)
      // Cache-busting: anders kan een CDN/browser na "opnieuw genereren" nog even de oude
      // afbeelding tonen op exact hetzelfde pad/URL.
      const publicUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`

      // Stap 9: post bijwerken met het eindresultaat
      console.log(`[generate-post-image] Stap 9: post afronden (post_id=${post_id})`)
      const { error: finalUpdateError } = await supabaseAdmin
        .from("posts")
        .update({
          image_url: publicUrl,
          image_provider: FLUX_IMAGE_PROVIDER,
          image_model: FLUX_IMAGE_MODEL,
          image_cost: submitData.cost ?? null,
          image_generated_at: new Date().toISOString(),
          image_status: "completed",
          image_error: null,
        })
        .eq("id", post_id)
        .eq("user_id", user.id)

      if (finalUpdateError) {
        const reason =
          `afbeelding gegenereerd en geüpload, maar kon de post niet bijwerken (${finalUpdateError.message})`
        await markFailed(supabaseAdmin, post_id, user.id, reason)
        return jsonResponse(
          {
            error: "Afbeelding gegenereerd en geüpload, maar kon de post niet bijwerken.",
            details: finalUpdateError.message,
          },
          500,
        )
      }

      // Stap 10: ai_usage bijwerken — best-effort, niet fataal. De kernactie (afbeelding +
      // post) is al geslaagd; een tellingsfout hier mag geen 500 opleveren (dat zou bij een
      // retry onnodig een nieuwe, betaalde Flux-call triggeren).
      const { error: usageError } = await supabaseAdmin.rpc("increment_image_usage", {
        p_user_id: user.id,
        p_cost: submitData.cost ?? 0,
        p_cost_unit: "credits",
      })
      if (usageError) {
        console.log(`[generate-post-image] kon ai_usage niet bijwerken (niet-fataal): ${usageError.message}`)
      }

      return jsonResponse(
        { id: post_id, image_status: "completed", image_url: publicUrl, image_cost: submitData.cost ?? null },
        200,
      )
    } catch (err) {
      const message = String(err instanceof Error ? err.message : err)
      console.log(`[generate-post-image] onverwachte fout: ${message}`)
      await markFailed(supabaseAdmin, post_id, user.id, `onverwachte fout: ${message}`)
      return jsonResponse({ error: "Onverwachte fout tijdens beeldgeneratie", details: message }, 500)
    }
  } catch (err) {
    return jsonResponse({ error: "Onverwachte fout", details: String(err) }, 500)
  }
})

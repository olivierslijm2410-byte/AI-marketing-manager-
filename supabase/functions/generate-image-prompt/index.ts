import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const ANTHROPIC_MODEL = "claude-sonnet-5"
const ANTHROPIC_TIMEOUT_MS = 30_000
const MAX_TOKENS = 1024

const IMAGE_PROMPT_SYSTEM_PROMPT = `Je bent een visueel art director voor social media marketingcontent.
Je taak is om een creative brief om te zetten in een scherpe,
concrete Engelstalige prompt voor een AI image-generation model (Flux).

Input die je ontvangt:
- onderwerp, kernboodschap, sfeer, format (aspect ratio), wat_niet_in_beeld
- doelgroep, tone_of_voice, branche (context van het bedrijf)

Regels:
- Schrijf de prompt ALTIJD in het Engels, ongeacht de taal van de input
- Beschrijf concreet: onderwerp, compositie, lichtinval, sfeer, kleurgebruik
- Voeg GEEN tekst-in-beeld toe tenzij expliciet gevraagd in de brief
- Respecteer wat_niet_in_beeld als harde uitsluiting, verwerk dit in een
  aparte negative_prompt
- Vermijd merknamen, logo's van concurrenten, of herkenbare bestaande
  kunstwerken/IP
- Output NIETS anders dan de gevraagde JSON — geen uitleg, geen preambule

Output uitsluitend als JSON:
{
  "prompt": "...",
  "negative_prompt": "...",
  "aspect_ratio": "..."
}`

// Fallback als de caller geen sfeer meegeeft — zelfgekozen defaults, aanpasbaar.
const FUNNEL_STAGE_SFEER: Record<string, string> = {
  awareness: "uitnodigend en nieuwsgierig makend, licht en toegankelijk",
  consideration: "vertrouwenwekkend, warm en informatief",
  conversion: "energiek, zelfverzekerd en actiegericht",
}

interface GenerateImagePromptRequest {
  post_id: string
  sfeer?: string
  wat_niet_in_beeld?: string
}

interface PostRow {
  id: string
  user_id: string
  channel_id: string
  funnel_stage: string
  format: string
  topic: string
  angle: string | null
  hook_direction: string | null
  cta_goal: string | null
}

interface CompanyAnalysisRow {
  id: string
  summary_json: Record<string, unknown>
  versie: number
  status: "compleet" | "lage_zekerheid" | "mislukt"
}

interface ProfileRow {
  branche: string | null
}

interface CreativeBrief {
  onderwerp: string
  kernboodschap: string
  sfeer: string
  format: string
  wat_niet_in_beeld: string | null
  doelgroep: string | null
  tone_of_voice: string | null
  branche: string | null
}

interface ImagePromptResult {
  prompt: string
  negative_prompt: string
  aspect_ratio: string
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

// Some models still wrap JSON in a markdown code fence despite instructions not to
function stripMarkdownFence(text: string): string {
  const trimmed = text.trim()
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  return fenceMatch ? fenceMatch[1].trim() : trimmed
}

// summary_json-velden zijn { waarde, confidence }-objecten (zie analyze-website)
function extractWaarde(field: unknown): string | null {
  if (field && typeof field === "object" && "waarde" in field) {
    const waarde = (field as { waarde: unknown }).waarde
    return typeof waarde === "string" && waarde.trim() !== "" ? waarde : null
  }
  return null
}

// kernboodschap bestaat niet als los veld — samengesteld uit angle, hook_direction, cta_goal
function buildKernboodschap(post: Pick<PostRow, "angle" | "hook_direction" | "cta_goal" | "topic">): string {
  const segments: string[] = []
  if (post.angle) segments.push(post.angle)
  if (post.hook_direction) segments.push(`hook: ${post.hook_direction}`)
  if (post.cta_goal) segments.push(`cta-doel: ${post.cta_goal}`)
  return segments.length > 0 ? segments.join(" — ") : post.topic
}

async function callClaude(
  system: string,
  userMessage: string,
  model: string,
  maxTokens: number,
  label: string,
): Promise<string> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), ANTHROPIC_TIMEOUT_MS)
  const start = Date.now()

  console.log(`[generate-image-prompt] ${label}: fetch naar Anthropic API gestart (model=${model})`)

  let res: Response
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: userMessage }],
      }),
      signal: controller.signal,
    })
  } catch (err) {
    const elapsedMs = Date.now() - start
    const isTimeout = err instanceof DOMException && err.name === "AbortError"
    console.log(
      `[generate-image-prompt] ${label}: fetch mislukt na ${elapsedMs}ms (${isTimeout ? "timeout" : "netwerkfout"})`,
    )
    if (isTimeout) {
      throw new Error(`timeout na ${ANTHROPIC_TIMEOUT_MS}ms zonder antwoord van Anthropic API`)
    }
    throw new Error(`netwerkfout bij Anthropic API (${String(err)})`)
  } finally {
    clearTimeout(timeoutId)
  }

  const elapsedMs = Date.now() - start
  console.log(`[generate-image-prompt] ${label}: fetch klaar in ${elapsedMs}ms (status ${res.status})`)

  if (!res.ok) {
    throw new Error(`Anthropic API gaf een foutstatus terug (${res.status})`)
  }

  const data = await res.json()
  const textBlock = (data?.content ?? []).find((block: { type?: string; text?: string }) => block.type === "text")
  return textBlock?.text ?? ""
}

// Best-effort: schrijft de foutstatus weg, negeert een eventuele eigen schrijffout
// (zelfde patroon als saveFailedAnalysis in analyze-website).
async function markFailed(
  supabaseAdmin: SupabaseClient,
  postId: string,
  userId: string,
  reason: string,
): Promise<void> {
  await supabaseAdmin
    .from("posts")
    .update({ image_status: "failed", image_error: `prompt generation failed: ${reason}` })
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
    const { post_id, sfeer, wat_niet_in_beeld }: GenerateImagePromptRequest = await req.json()
    if (!post_id) {
      return jsonResponse({ error: "post_id is verplicht." }, 400)
    }

    // Stap 2: post ophalen en eigenaarschap verifiëren
    console.log(`[generate-image-prompt] Stap 2: posts ophalen voor post_id=${post_id}`)
    const { data: post, error: postError } = await supabaseAdmin
      .from("posts")
      .select("id, user_id, channel_id, funnel_stage, format, topic, angle, hook_direction, cta_goal")
      .eq("id", post_id)
      .eq("user_id", user.id)
      .maybeSingle<PostRow>()

    if (postError) {
      return jsonResponse({ error: "Kon post niet ophalen." }, 500)
    }
    if (!post) {
      return jsonResponse({ error: "Post niet gevonden." }, 404)
    }

    // Stap 3: laatste bedrijfsanalyse voor dit kanaal ophalen (hoogste versie)
    console.log(`[generate-image-prompt] Stap 3: company_analyses ophalen voor channel_id=${post.channel_id}`)
    const { data: analysisRows, error: analysisError } = await supabaseAdmin
      .from("company_analyses")
      .select("id, summary_json, versie, status")
      .eq("channel_id", post.channel_id)
      .order("versie", { ascending: false })
      .limit(1)

    if (analysisError) {
      return jsonResponse({ error: "Kon bedrijfsanalyse niet ophalen." }, 500)
    }
    const latestAnalysis = (analysisRows?.[0] as CompanyAnalysisRow | undefined) ?? null
    if (!latestAnalysis) {
      return jsonResponse(
        { error: "Geen bedrijfsanalyse gevonden voor dit kanaal. Analyseer eerst de website." },
        404,
      )
    }
    if (latestAnalysis.status === "mislukt") {
      return jsonResponse(
        {
          error:
            "De laatste websiteanalyse is mislukt. Analyseer de website opnieuw voordat je een afbeelding genereert.",
        },
        400,
      )
    }

    // Stap 4: branche ophalen uit profiles (niet aanwezig in company_analyses.summary_json)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("branche")
      .eq("id", user.id)
      .maybeSingle<ProfileRow>()

    if (profileError) {
      return jsonResponse({ error: "Kon profiel niet ophalen." }, 500)
    }

    // Stap 5: creative brief samenstellen
    const creativeBrief: CreativeBrief = {
      onderwerp: post.topic,
      kernboodschap: buildKernboodschap(post),
      sfeer: sfeer && sfeer.trim() !== ""
        ? sfeer.trim()
        : (FUNNEL_STAGE_SFEER[post.funnel_stage] ?? "neutraal en merkgetrouw"),
      format: post.format,
      wat_niet_in_beeld: wat_niet_in_beeld && wat_niet_in_beeld.trim() !== "" ? wat_niet_in_beeld.trim() : null,
      doelgroep: extractWaarde(latestAnalysis.summary_json.doelgroep),
      tone_of_voice: extractWaarde(latestAnalysis.summary_json.tone_of_voice),
      branche: profile?.branche ?? null,
    }

    // Stap 6: brief opslaan en status op 'generating' zetten vóór de Claude-call
    console.log(`[generate-image-prompt] Stap 6: creative_brief opslaan, image_status -> generating (post_id=${post_id})`)
    const { error: briefUpdateError } = await supabaseAdmin
      .from("posts")
      .update({ creative_brief: creativeBrief, image_status: "generating" })
      .eq("id", post_id)
      .eq("user_id", user.id)

    if (briefUpdateError) {
      return jsonResponse({ error: "Kon creative brief niet opslaan." }, 500)
    }

    // Vanaf hier staat image_status op 'generating'. Alles hierna moet gegarandeerd naar
    // 'failed' overschakelen bij een fout — ook bij een onverwachte exceptie die niet door
    // een specifieke catch hieronder wordt opgevangen (anders blijft de post hangen).
    try {
      // Stap 7: Claude aanroepen om de brief om te zetten in een Flux-prompt
      console.log(`[generate-image-prompt] Stap 7: prompt genereren voor post_id=${post_id}`)
      const userMessage = JSON.stringify(creativeBrief)

      let rawText: string
      try {
        rawText = await callClaude(
          IMAGE_PROMPT_SYSTEM_PROMPT,
          userMessage,
          ANTHROPIC_MODEL,
          MAX_TOKENS,
          "prompt-generatie",
        )
      } catch (err) {
        const message = String(err instanceof Error ? err.message : err)
        console.log(`[generate-image-prompt] prompt-generatie mislukt: ${message}`)
        await markFailed(supabaseAdmin, post_id, user.id, message)
        return jsonResponse({ error: "prompt_generatie_mislukt", reden: message }, 500)
      }

      // Stap 8: JSON-response parsen
      let parsed: Partial<ImagePromptResult>
      try {
        parsed = JSON.parse(stripMarkdownFence(rawText))
        console.log("[generate-image-prompt] JSON-parse gelukt")
      } catch {
        const reason = "het antwoord van de AI was geen geldige JSON"
        console.log(`[generate-image-prompt] JSON-parse mislukt`)
        await markFailed(supabaseAdmin, post_id, user.id, reason)
        return jsonResponse({ error: "ongeldig_antwoord", reden: reason }, 500)
      }

      // Stap 9: verplichte velden valideren
      const missingFields = (["prompt", "negative_prompt", "aspect_ratio"] as const).filter(
        (field) => typeof parsed[field] !== "string" || parsed[field]!.trim() === "",
      )
      if (missingFields.length > 0) {
        const reason = `ontbrekende of lege velden in AI-antwoord: ${missingFields.join(", ")}`
        console.log(`[generate-image-prompt] validatie mislukt: ${reason}`)
        await markFailed(supabaseAdmin, post_id, user.id, reason)
        return jsonResponse({ error: "ongeldig_antwoord", reden: reason }, 500)
      }
      const result = parsed as ImagePromptResult

      // Stap 10: succes opslaan. image_status blijft 'generating' — Stap B (Flux) zet 'm
      // straks naar completed/failed. negative_prompt en aspect_ratio hebben geen eigen
      // kolom en gaan daarom mee in creative_brief (jsonb), naast image_prompt.
      console.log(`[generate-image-prompt] Stap 10: resultaat opslaan (post_id=${post_id})`)
      const { error: resultUpdateError } = await supabaseAdmin
        .from("posts")
        .update({
          image_prompt: result.prompt,
          creative_brief: {
            ...creativeBrief,
            negative_prompt: result.negative_prompt,
            aspect_ratio: result.aspect_ratio,
          },
        })
        .eq("id", post_id)
        .eq("user_id", user.id)

      if (resultUpdateError) {
        const reason = `kon promptresultaat niet opslaan (${resultUpdateError.message})`
        await markFailed(supabaseAdmin, post_id, user.id, reason)
        return jsonResponse({ error: "Kon het gegenereerde prompt-resultaat niet opslaan." }, 500)
      }

      return jsonResponse(
        {
          id: post_id,
          image_status: "generating",
          image_prompt: result.prompt,
          negative_prompt: result.negative_prompt,
          aspect_ratio: result.aspect_ratio,
        },
        200,
      )
    } catch (err) {
      const message = String(err instanceof Error ? err.message : err)
      console.log(`[generate-image-prompt] onverwachte fout na start van generatie: ${message}`)
      await markFailed(supabaseAdmin, post_id, user.id, `onverwachte fout: ${message}`)
      return jsonResponse({ error: "Onverwachte fout tijdens promptgeneratie", details: message }, 500)
    }
  } catch (err) {
    return jsonResponse({ error: "Onverwachte fout", details: String(err) }, 500)
  }
})

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
const MAX_CAPTION_LENGTH = 2200
// Eenvoudige, uitbreidbare lijst — case-insensitive substring-match op de caption.
const FORBIDDEN_WORDS = ["genezen", "gegarandeerd resultaat", "medisch bewezen"]

const COPY_SYSTEM_PROMPT = `Je bent een ervaren copywriter die social media captions schrijft in de tone of voice van het merk waarvoor je werkt. Je krijgt een bedrijfsanalyse en één specifiek onderdeel uit een goedgekeurd contentplan, en schrijft daar een kant-en-klare caption en bijpassende hashtags voor.

Je gebruikt tone_of_voice, positionering, merkpersoonlijkheid, kernboodschappen, klantproblemen_motivaties en doelgroep uit de bedrijfsanalyse om consistent te schrijven met het merk. Elk van deze velden heeft een confidence-niveau ("hoog", "gemiddeld" of "laag"). Bij confidence "laag", of als een veld leeg of afwezig is, behandel je dat veld niet als een hard feit — val in dat geval terug op klantproblemen_motivaties en positionering, die het meest betrouwbare houvast bieden voor waar de tekst wél op moet aansluiten.

Schrijfinstructies:
- De hook (openingszin) sluit aan bij de meegegeven hook_direction.
- De kern van de caption sluit aan bij de funnel_stage: bij "awareness" maak je nieuwsgierig, bij "consideration" maak je de voordelen concreet, bij "conversion" geef je een duidelijke reden om nu actie te ondernemen.
- De call-to-action sluit aan bij de meegegeven cta_goal.
- Je schrijft consistent in de merk-tone-of-voice.
- Je doet nooit medische of financiële claims (bijvoorbeeld genezing, gegarandeerd resultaat, beleggingsrendement).
- De caption is maximaal 2200 tekens.
- Hashtags lever je apart aan als één string: 5 tot 10 relevante hashtags, gescheiden door spaties. Geen generieke spam-hashtags (zoals #love, #instagood, #follow4follow).

Als het onderwerp te vaag of te weinig concreet is om er een zinvolle, specifieke caption voor te schrijven, schrijf dan geen caption — geef in plaats daarvan een duidelijke, bruikbare reden terug zodat de gebruiker het onderwerp kan aanscherpen.

Als je te horen krijgt dat dit een herschrijving is na afwijzing van een eerdere versie, gebruik de meegegeven reden om gericht te verbeteren — begin niet zomaar opnieuw zonder rekening te houden met die feedback.

Antwoord ALLEEN met geldige JSON, zonder markdown-codeblokken, zonder tekst eromheen, in exact een van deze twee schema's:

{ "caption": string, "hashtags": string }

of, alleen als het onderwerp te vaag is:

{ "error": "onderwerp_te_vaag", "reden": string }

De inhoud van je antwoord is altijd in het Nederlands.`

// Request body for this function
interface GenerateCopyRequest {
  post_id: string
}

interface PostRow {
  id: string
  user_id: string
  channel_id: string
  content_pillar: string
  funnel_stage: string
  format: string
  topic: string
  angle: string | null
  hook_direction: string | null
  cta_goal: string | null
  rejection_reason: string | null
}

interface CompanyAnalysisRow {
  id: string
  summary_json: Record<string, unknown>
  versie: number
  status: "compleet" | "lage_zekerheid" | "mislukt"
}

interface CopySuccessResult {
  caption: string
  hashtags: string
}

interface CopyErrorResult {
  error: string
  reden: string
}

type CopyModelResponse = CopySuccessResult | CopyErrorResult

function isCopyError(value: CopyModelResponse): value is CopyErrorResult {
  return typeof (value as CopyErrorResult).error === "string"
}

interface ValidationResult {
  valid: boolean
  code?: string
  reden?: string
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

  console.log(`[generate-copy] ${label}: fetch naar Anthropic API gestart (model=${model})`)

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
      `[generate-copy] ${label}: fetch mislukt na ${elapsedMs}ms (${isTimeout ? "timeout" : "netwerkfout"})`,
    )
    if (isTimeout) {
      throw new Error(`${label}: timeout na ${ANTHROPIC_TIMEOUT_MS}ms zonder antwoord van Anthropic API`)
    }
    throw new Error(`${label}: netwerkfout bij Anthropic API (${String(err)})`)
  } finally {
    clearTimeout(timeoutId)
  }

  const elapsedMs = Date.now() - start
  console.log(`[generate-copy] ${label}: fetch klaar in ${elapsedMs}ms (status ${res.status})`)

  if (!res.ok) {
    throw new Error(`${label}: Anthropic API gaf een foutstatus terug (${res.status})`)
  }

  const data = await res.json()
  return data?.content?.[0]?.text ?? ""
}

function buildCopyUserMessage(params: {
  companyAnalysisSummary: Record<string, unknown>
  post: PostRow
}): string {
  const parts: string[] = []

  parts.push("Bedrijfsanalyse (relevante velden, JSON):")
  parts.push(
    JSON.stringify({
      tone_of_voice: params.companyAnalysisSummary.tone_of_voice ?? null,
      positionering: params.companyAnalysisSummary.positionering ?? null,
      merkpersoonlijkheid: params.companyAnalysisSummary.merkpersoonlijkheid ?? null,
      kernboodschappen: params.companyAnalysisSummary.kernboodschappen ?? null,
      klantproblemen_motivaties: params.companyAnalysisSummary.klantproblemen_motivaties ?? null,
      doelgroep: params.companyAnalysisSummary.doelgroep ?? null,
    }),
  )
  parts.push("")
  parts.push("Contentplan-item om uit te werken (JSON):")
  parts.push(
    JSON.stringify({
      content_pillar: params.post.content_pillar,
      funnel_stage: params.post.funnel_stage,
      format: params.post.format,
      topic: params.post.topic,
      angle: params.post.angle,
      hook_direction: params.post.hook_direction,
      cta_goal: params.post.cta_goal,
    }),
  )

  if (params.post.rejection_reason) {
    parts.push("")
    parts.push(`Dit is een herschrijving na afwijzing. Reden: ${params.post.rejection_reason}`)
  }

  return parts.join("\n")
}

function buildShortenUserMessage(previousCaption: string, previousHashtags: string): string {
  return [
    `Je vorige antwoord was te lang: de caption bevatte ${previousCaption.length} tekens, het maximum is ${MAX_CAPTION_LENGTH}.`,
    "Vorig antwoord (JSON):",
    JSON.stringify({ caption: previousCaption, hashtags: previousHashtags }),
    "",
    `Herschrijf de caption zodat deze binnen ${MAX_CAPTION_LENGTH} tekens blijft, met behoud van de hook, kernboodschap en call-to-action. Antwoord opnieuw in exact hetzelfde JSON-schema.`,
  ].join("\n")
}

// Code-side QC: rule-based checks op een al geparste, geldige CopySuccessResult
function validateCaption(caption: string): ValidationResult {
  if (typeof caption !== "string" || caption.trim() === "") {
    return { valid: false, code: "caption_leeg", reden: "De gegenereerde caption is leeg." }
  }

  const lowerCaption = caption.toLowerCase()
  const forbiddenWord = FORBIDDEN_WORDS.find((word) => lowerCaption.includes(word))
  if (forbiddenWord) {
    return {
      valid: false,
      code: "verboden_taal",
      reden: `De caption bevat een niet-toegestane term ("${forbiddenWord}").`,
    }
  }

  if (caption.length > MAX_CAPTION_LENGTH) {
    return {
      valid: false,
      code: "caption_te_lang",
      reden: `De caption is ${caption.length} tekens lang, het maximum is ${MAX_CAPTION_LENGTH}.`,
    }
  }

  return { valid: true }
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
    const { post_id }: GenerateCopyRequest = await req.json()
    if (!post_id) {
      return jsonResponse({ error: "post_id is verplicht." }, 400)
    }

    // Stap 2: post ophalen en eigenaarschap verifiëren
    console.log(`[generate-copy] Stap 2: posts ophalen voor post_id=${post_id}`)
    const { data: post, error: postError } = await supabaseAdmin
      .from("posts")
      .select(
        "id, user_id, channel_id, content_pillar, funnel_stage, format, topic, angle, hook_direction, cta_goal, rejection_reason",
      )
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
    console.log(`[generate-copy] Stap 3: company_analyses ophalen voor channel_id=${post.channel_id}`)
    const { data: analysisRows, error: analysisError } = await supabaseAdmin
      .from("company_analyses")
      .select("id, summary_json, versie, status")
      .eq("channel_id", post.channel_id)
      .order("versie", { ascending: false })
      .limit(1)
    console.log(
      `[generate-copy] Stap 3: company_analyses opgehaald (${analysisRows?.length ?? 0} rij(en), fout: ${analysisError ? analysisError.message : "geen"})`,
    )

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
        { error: "De laatste websiteanalyse is mislukt. Analyseer de website opnieuw voordat je content genereert." },
        400,
      )
    }

    // Stap 4: caption + hashtags genereren, met max 1 vervolg-call als de caption te lang is
    console.log(`[generate-copy] Stap 4: caption genereren voor post_id=${post_id}`)

    const userMessage = buildCopyUserMessage({
      companyAnalysisSummary: latestAnalysis.summary_json,
      post,
    })

    let rawText: string
    try {
      rawText = await callClaude(COPY_SYSTEM_PROMPT, userMessage, ANTHROPIC_MODEL, MAX_TOKENS, "hoofdgeneratie")
    } catch (err) {
      const message = String(err instanceof Error ? err.message : err)
      console.log(`[generate-copy] hoofdgeneratie-call mislukt: ${message}`)
      return jsonResponse({ error: "generatie_mislukt", reden: message }, 500)
    }

    let parsed: CopyModelResponse
    try {
      parsed = JSON.parse(stripMarkdownFence(rawText))
      console.log("[generate-copy] JSON-parse hoofdgeneratie gelukt")
    } catch {
      console.log("[generate-copy] JSON-parse hoofdgeneratie mislukt")
      return jsonResponse(
        { error: "ongeldig_antwoord", reden: "Het antwoord van de AI was geen geldige JSON." },
        500,
      )
    }

    if (isCopyError(parsed)) {
      console.log(`[generate-copy] AI meldt: ${parsed.error} (${parsed.reden})`)
      return jsonResponse({ error: parsed.error, reden: parsed.reden }, 400)
    }

    let result: CopySuccessResult = parsed
    let validation = validateCaption(result.caption)

    if (!validation.valid && validation.code === "caption_te_lang") {
      console.log(`[generate-copy] caption te lang (${result.caption.length} tekens), vervolg-call om in te korten`)

      const shortenMessage = buildShortenUserMessage(result.caption, result.hashtags)
      let shortenRawText: string
      try {
        shortenRawText = await callClaude(COPY_SYSTEM_PROMPT, shortenMessage, ANTHROPIC_MODEL, MAX_TOKENS, "inkort-call")
      } catch (err) {
        const message = String(err instanceof Error ? err.message : err)
        console.log(`[generate-copy] inkort-call mislukt: ${message}`)
        return jsonResponse({ error: "generatie_mislukt", reden: message }, 500)
      }

      let shortenParsed: CopyModelResponse
      try {
        shortenParsed = JSON.parse(stripMarkdownFence(shortenRawText))
        console.log("[generate-copy] JSON-parse inkort-call gelukt")
      } catch {
        console.log("[generate-copy] JSON-parse inkort-call mislukt")
        return jsonResponse(
          { error: "ongeldig_antwoord", reden: "Het antwoord van de AI was geen geldige JSON." },
          500,
        )
      }

      if (isCopyError(shortenParsed)) {
        console.log(`[generate-copy] AI meldt bij inkorten: ${shortenParsed.error} (${shortenParsed.reden})`)
        return jsonResponse({ error: shortenParsed.error, reden: shortenParsed.reden }, 400)
      }

      result = shortenParsed
      validation = validateCaption(result.caption)
    }

    if (!validation.valid) {
      console.log(`[generate-copy] validatie mislukt: ${validation.code} — ${validation.reden}`)
      return jsonResponse({ error: validation.code, reden: validation.reden }, 400)
    }

    // Stap 5: post bijwerken met de goedgekeurde caption + hashtags
    console.log(`[generate-copy] Stap 5: post bijwerken (post_id=${post_id})`)
    const { error: updateError } = await supabaseAdmin
      .from("posts")
      .update({ caption: result.caption, hashtags: result.hashtags, status: "wacht_op_goedkeuring" })
      .eq("id", post_id)
      .eq("user_id", user.id)

    if (updateError) {
      return jsonResponse({ error: "Kon de post niet bijwerken." }, 500)
    }

    return jsonResponse(
      { id: post_id, caption: result.caption, hashtags: result.hashtags, status: "wacht_op_goedkeuring" },
      200,
    )
  } catch (err) {
    return jsonResponse({ error: "Onverwachte fout", details: String(err) }, 500)
  }
})

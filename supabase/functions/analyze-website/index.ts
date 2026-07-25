import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001"
const WEBSITE_FETCH_TIMEOUT_MS = 10_000
const ANTHROPIC_TIMEOUT_MS = 30_000
const MIN_WORD_COUNT = 200

const SYSTEM_PROMPT = `Je bent een scherpe marktonderzoeker en tekstanalist. Je taak is om website-tekst te analyseren en feitelijke bedrijfskennis te structureren — je bent geen marketeer en verzint geen strategie, contentplan, concurrentieanalyse, klantpersona's of customer journey. Je output blijft strikt beperkt tot het structureren van wat er over het bedrijf zelf te weten valt, niets daarboven.

Baseer je antwoord uitsluitend op wat daadwerkelijk in de tekst staat of daar redelijkerwijs logisch uit volgt. Verzin geen producten, doelgroepen, USP's of andere informatie die niet in de tekst terug te vinden is.

Voor elk veld ken je een confidence-niveau toe, op basis van drie soorten informatie:
1. "hoog" — feiten die letterlijk op de website staan (bijv. een expliciet genoemd product, een letterlijk genoemde doelgroep, een citaat over tone of voice).
2. "gemiddeld" — redelijkerwijs afgeleide inzichten die niet letterlijk in de tekst staan, maar duidelijk blijken uit de context (bijv. een klantprobleem dat impliciet blijkt uit hoe een dienst wordt aangeprezen).
3. "laag" — zwak onderbouwd giswerk, waar maar weinig van de tekst voor spreekt. Gebruik dit spaarzaam.

Als je voor een veld niets met redelijke zekerheid kan afleiden, gok dan niet: gebruik een leeg array ([]) voor lijst-velden of null voor een "waarde"-string, en ken in dat geval geen confidence "hoog" of "gemiddeld" toe.

Antwoord ALLEEN met geldige JSON in exact dit schema, zonder markdown-codeblokken of extra tekst eromheen:

{
  "bedrijfsomschrijving": { "waarde": string, "confidence": "hoog"|"gemiddeld"|"laag" },
  "producten_diensten": [
    { "naam": string, "features": string[], "benefits": string[], "confidence": "hoog"|"gemiddeld"|"laag" }
  ],
  "doelgroep": { "waarde": string, "confidence": "hoog"|"gemiddeld"|"laag" },
  "klantproblemen_motivaties": { "waarde": string[], "confidence": "hoog"|"gemiddeld"|"laag", "toelichting": string },
  "waardepropositie": { "waarde": string, "confidence": "hoog"|"gemiddeld"|"laag" },
  "usps": [
    { "waarde": string, "confidence": "hoog"|"gemiddeld"|"laag" }
  ],
  "positionering": { "waarde": string, "confidence": "hoog"|"gemiddeld"|"laag" },
  "tone_of_voice": { "waarde": string, "confidence": "hoog"|"gemiddeld"|"laag" },
  "merkpersoonlijkheid": { "waarde": string, "confidence": "hoog"|"gemiddeld"|"laag" },
  "kernboodschappen": [
    { "waarde": string, "confidence": "hoog"|"gemiddeld"|"laag" }
  ],
  "zekerheid_algemeen": "hoog" | "laag",
  "toelichting": string
}

Vul "toelichting" binnen "klantproblemen_motivaties" altijd kort in: leg uit welke passages of signalen in de tekst tot deze conclusie leidden, ook als de confidence "hoog" is — dit veld is per definitie een interpretatie.

Bepaal "zekerheid_algemeen": gebruik "laag" zodra een substantieel deel van de bovenstaande velden op giswerk berust, leeg is, of niet met redelijke zekerheid kon worden afgeleid; gebruik anders "hoog". Vul het top-level "toelichting"-veld alleen als "zekerheid_algemeen" "laag" is, en leg dan kort uit welke velden onzeker zijn en waarom; anders lege string.

De inhoud van je antwoord is altijd in het Nederlands, ongeacht de taal van de brontekst.`

// Request body for this function
interface AnalyzeWebsiteRequest {
  channel_id: string
  url: string
}

type Confidence = "hoog" | "gemiddeld" | "laag"

interface ConfidenceField {
  waarde: string | null
  confidence: Confidence
}

interface ConfidenceListItem {
  waarde: string
  confidence: Confidence
}

interface ProductAnalysis {
  naam: string
  features: string[]
  benefits: string[]
  confidence: Confidence
}

interface KlantproblemenMotivaties {
  waarde: string[]
  confidence: Confidence
  toelichting: string
}

// Schema of the AI-generated summary, stored as-is in summary_json
interface WebsiteAnalysisSummary {
  bedrijfsomschrijving: ConfidenceField
  producten_diensten: ProductAnalysis[]
  doelgroep: ConfidenceField
  klantproblemen_motivaties: KlantproblemenMotivaties
  waardepropositie: ConfidenceField
  usps: ConfidenceListItem[]
  positionering: ConfidenceField
  tone_of_voice: ConfidenceField
  merkpersoonlijkheid: ConfidenceField
  kernboodschappen: ConfidenceListItem[]
  zekerheid_algemeen: "hoog" | "laag"
  toelichting: string
}

interface CompanyAnalysisRecord {
  id: string
  user_id: string
  channel_id: string
  summary_json: WebsiteAnalysisSummary | Record<string, never>
  versie: number
  status: "compleet" | "lage_zekerheid" | "mislukt"
  created_at: string
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

// Strip HTML down to readable plain text and count words
function extractTextFromHtml(html: string): { text: string; wordCount: number } {
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, " ")
  const withoutStyles = withoutScripts.replace(/<style[\s\S]*?<\/style>/gi, " ")
  const withoutTags = withoutStyles.replace(/<[^>]+>/g, " ")
  const decoded = withoutTags
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
  const text = decoded.replace(/\s+/g, " ").trim()
  const wordCount = text === "" ? 0 : text.split(" ").length
  return { text, wordCount }
}

// Some models still wrap JSON in a markdown code fence despite instructions not to
function stripMarkdownFence(text: string): string {
  const trimmed = text.trim()
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  return fenceMatch ? fenceMatch[1].trim() : trimmed
}

async function saveFailedAnalysis(
  supabaseAdmin: SupabaseClient,
  userId: string,
  channelId: string,
  versie: number,
): Promise<void> {
  await supabaseAdmin.from("company_analyses").insert({
    user_id: userId,
    channel_id: channelId,
    summary_json: {},
    versie,
    status: "mislukt",
  })
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
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey)

    // Stap 1: input valideren
    const { channel_id, url }: AnalyzeWebsiteRequest = await req.json()

    if (!url || !channel_id) {
      return jsonResponse({ error: "url en channel_id zijn beide verplicht." }, 400)
    }

    // Voorkom dat een gebruiker een analyse aan andermans kanaal koppelt
    const { data: channel, error: channelError } = await supabaseAdmin
      .from("channels")
      .select("id")
      .eq("id", channel_id)
      .eq("user_id", user.id)
      .maybeSingle()

    if (channelError) {
      return jsonResponse({ error: "Kon kanaal niet ophalen." }, 500)
    }
    if (!channel) {
      return jsonResponse({ error: "Kanaal niet gevonden." }, 404)
    }

    // Volgende versienummer voor dit kanaal bepalen (nodig voor elk opgeslagen record,
    // ook bij mislukte pogingen hieronder)
    const { data: existingVersions, error: versionError } = await supabaseAdmin
      .from("company_analyses")
      .select("versie")
      .eq("channel_id", channel_id)
      .order("versie", { ascending: false })
      .limit(1)

    if (versionError) {
      return jsonResponse({ error: "Kon versienummer niet bepalen." }, 500)
    }
    const nextVersion = existingVersions && existingVersions.length > 0
      ? existingVersions[0].versie + 1
      : 1

    // Stap 2: website ophalen (timeout van 10 seconden)
    const websiteController = new AbortController()
    const websiteTimeoutId = setTimeout(() => websiteController.abort(), WEBSITE_FETCH_TIMEOUT_MS)

    let websiteRes: Response
    try {
      websiteRes = await fetch(url, {
        signal: websiteController.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; AIMarketingManagerBot/1.0)" },
      })
    } catch {
      clearTimeout(websiteTimeoutId)
      await saveFailedAnalysis(supabaseAdmin, user.id, channel_id, nextVersion)
      return jsonResponse(
        { error: "Website kon niet worden opgehaald (netwerkfout of timeout)." },
        502,
      )
    }
    clearTimeout(websiteTimeoutId)

    if (!websiteRes.ok) {
      await saveFailedAnalysis(supabaseAdmin, user.id, channel_id, nextVersion)
      return jsonResponse(
        { error: `Website gaf een foutstatus terug (${websiteRes.status}).` },
        502,
      )
    }

    // Stap 3: HTML naar leesbare platte tekst
    const html = await websiteRes.text()
    const { text, wordCount } = extractTextFromHtml(html)

    // Stap 4: te weinig tekst forceert later een lage zekerheid, maar de AI-call gaat door
    const forceLowConfidence = wordCount < MIN_WORD_COUNT

    // Stap 5: Anthropic API aanroepen
    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY")!
    const anthropicController = new AbortController()
    const anthropicTimeoutId = setTimeout(() => anthropicController.abort(), ANTHROPIC_TIMEOUT_MS)

    let anthropicRes: Response
    try {
      anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicApiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: text }],
        }),
        signal: anthropicController.signal,
      })
    } catch {
      clearTimeout(anthropicTimeoutId)
      await saveFailedAnalysis(supabaseAdmin, user.id, channel_id, nextVersion)
      return jsonResponse(
        { error: "AI-analyse mislukt (netwerkfout of timeout bij Anthropic API)." },
        500,
      )
    }
    clearTimeout(anthropicTimeoutId)

    if (!anthropicRes.ok) {
      await saveFailedAnalysis(supabaseAdmin, user.id, channel_id, nextVersion)
      return jsonResponse(
        { error: "AI-analyse mislukt (Anthropic API gaf een foutstatus terug)." },
        500,
      )
    }

    const anthropicData = await anthropicRes.json()
    const rawText: string = anthropicData?.content?.[0]?.text ?? ""

    // Stap 6: JSON-response parsen
    let summary: WebsiteAnalysisSummary
    try {
      summary = JSON.parse(stripMarkdownFence(rawText))
    } catch {
      await saveFailedAnalysis(supabaseAdmin, user.id, channel_id, nextVersion)
      return jsonResponse(
        { error: "Kon het AI-antwoord niet verwerken (ongeldige JSON)." },
        500,
      )
    }

    // Te weinig brontekst overschrijft altijd de zekerheid van het model
    if (forceLowConfidence) {
      summary.zekerheid_algemeen = "laag"
    }
    const status: "compleet" | "lage_zekerheid" = summary.zekerheid_algemeen === "laag"
      ? "lage_zekerheid"
      : "compleet"

    // Stap 8: nieuw record schrijven
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("company_analyses")
      .insert({
        user_id: user.id,
        channel_id,
        summary_json: summary,
        versie: nextVersion,
        status,
      })
      .select()
      .single<CompanyAnalysisRecord>()

    if (insertError || !inserted) {
      return jsonResponse({ error: "Kon de analyse niet opslaan." }, 500)
    }

    // Stap 9: opgeslagen record teruggeven
    return jsonResponse(inserted, 200)
  } catch (err) {
    return jsonResponse({ error: "Onverwachte fout", details: String(err) }, 500)
  }
})

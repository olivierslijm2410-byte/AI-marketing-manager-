import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

// Lichte QC-achtige taak, geen zware generatie — Haiku is hier voldoende en snel/goedkoop.
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001"
const ANTHROPIC_TIMEOUT_MS = 15_000
const MAX_TOKENS = 300

// Cadans tussen automatisch voorgestelde posts binnen dezelfde strategieversie.
// MVP-startpunt, later eventueel instelbaar per gebruiker.
const CADANS_DAGEN = 2
const DEFAULT_TIME = "12:00"
const DEFAULT_REASON = "Standaardtijd — AI-suggestie was niet beschikbaar, pas gerust zelf aan."

const TIME_SUGGESTION_SYSTEM_PROMPT = `Je adviseert een indicatief beste plaatsingstijdstip (uur:minuut, 24-uursnotatie) voor een Instagram-post, gebaseerd op algemene kennis over social-media-engagement en de doelgroep van het bedrijf. Dit is GEEN gepersonaliseerd advies op basis van eigen resultaten — die data bestaat nog niet voor deze gebruiker. Baseer je advies dus alleen op algemene richtlijnen (bijvoorbeeld: B2C-doelgroepen zijn vaker actief 's avonds en in het weekend, B2B-doelgroepen vaker op werkdagen overdag) en op het type content (funnel_stage, format).

Als de doelgroep-informatie leeg is, een lage confidence heeft, of te vaag is om iets zinnigs op te baseren, verzin geen specifieke doelgroep-aanname — geef dan een algemeen goed moment voor Instagram in het algemeen.

Antwoord ALLEEN met geldige JSON, zonder markdown-codeblokken, zonder tekst eromheen, in dit schema:
{ "suggested_time": "HH:MM", "reasoning": string }

De "reasoning" is één korte zin in het Nederlands, die duidelijk maakt dat dit indicatief/algemeen advies is (bijvoorbeeld door woorden als "doorgaans" of "over het algemeen" te gebruiken), niet een keiharde belofte.`

interface SuggestScheduleRequest {
  post_id: string
}

interface PostRow {
  id: string
  user_id: string
  channel_id: string
  strategy_version_id: string
  content_pillar: string
  funnel_stage: string
  format: string
  status: string
  scheduled_at: string | null
}

interface CompanyAnalysisRow {
  summary_json: Record<string, unknown>
}

interface TimeSuggestion {
  suggested_time: string
  reasoning: string
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function stripMarkdownFence(text: string): string {
  const trimmed = text.trim()
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  return fenceMatch ? fenceMatch[1].trim() : trimmed
}

async function callClaude(system: string, userMessage: string): Promise<string> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), ANTHROPIC_TIMEOUT_MS)

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
        model: ANTHROPIC_MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages: [{ role: "user", content: userMessage }],
      }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }

  if (!res.ok) {
    throw new Error(`Anthropic API gaf een foutstatus terug (${res.status})`)
  }

  const data = await res.json()
  const textBlock = (data?.content ?? []).find((block: { type?: string; text?: string }) => block.type === "text")
  return textBlock?.text ?? ""
}

function isValidTimeString(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):([0-5]\d)$/.test(value)
}

async function getTimeSuggestion(params: {
  companyAnalysisSummary: Record<string, unknown> | null
  post: PostRow
}): Promise<TimeSuggestion> {
  const userMessage = [
    "Doelgroep-informatie (JSON, kan leeg/laag-confidence zijn):",
    JSON.stringify({ doelgroep: params.companyAnalysisSummary?.doelgroep ?? null }),
    "",
    "Content-item (JSON):",
    JSON.stringify({
      content_pillar: params.post.content_pillar,
      funnel_stage: params.post.funnel_stage,
      format: params.post.format,
    }),
  ].join("\n")

  const rawText = await callClaude(TIME_SUGGESTION_SYSTEM_PROMPT, userMessage)
  const parsed = JSON.parse(stripMarkdownFence(rawText))

  if (!isValidTimeString(parsed.suggested_time) || typeof parsed.reasoning !== "string" || parsed.reasoning.trim() === "") {
    throw new Error("Ongeldig antwoordformaat van AI-tijdadvies.")
  }

  return { suggested_time: parsed.suggested_time, reasoning: parsed.reasoning }
}

// Amsterdam wall-clock tijd (jaar/maand/dag/uur/minuut) omzetten naar een correcte UTC Date,
// rekening houdend met zomer-/wintertijd. Geen precisie nodig tot op de seconde-DST-omslag zelf.
function amsterdamWallTimeToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute))
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Amsterdam",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
  const parts = dtf.formatToParts(guess).reduce<Record<string, string>>((acc, part) => {
    acc[part.type] = part.value
    return acc
  }, {})
  const asIfUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) === 24 ? 0 : Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  )
  const offsetMinutes = (asIfUtc - guess.getTime()) / 60_000
  return new Date(guess.getTime() - offsetMinutes * 60_000)
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

    const { post_id }: SuggestScheduleRequest = await req.json()
    if (!post_id) {
      return jsonResponse({ error: "post_id is verplicht." }, 400)
    }

    const { data: post, error: postError } = await supabaseAdmin
      .from("posts")
      .select("id, user_id, channel_id, strategy_version_id, content_pillar, funnel_stage, format, status, scheduled_at")
      .eq("id", post_id)
      .eq("user_id", user.id)
      .maybeSingle<PostRow>()

    if (postError) {
      return jsonResponse({ error: "Kon post niet ophalen." }, 500)
    }
    if (!post) {
      return jsonResponse({ error: "Post niet gevonden." }, 404)
    }
    if (post.status !== "goedgekeurd") {
      return jsonResponse(
        { error: "ongeldige_status", reden: "Alleen goedgekeurde posts krijgen een planningsvoorstel." },
        400,
      )
    }

    // Idempotentie: als er al een scheduled_at staat (voorstel of eigen aanpassing),
    // niet overschrijven — voorkomt dat een dubbele aanroep de gebruiker overschrijft.
    if (post.scheduled_at) {
      return jsonResponse(
        { id: post.id, scheduled_at: post.scheduled_at, message: "Post had al een planning, niet aangepast." },
        200,
      )
    }

    // Stap: voorgestelde dag bepalen via cadans t.o.v. de laatst geplande sibling-post
    const { data: latestSiblingRows, error: siblingError } = await supabaseAdmin
      .from("posts")
      .select("scheduled_at")
      .eq("strategy_version_id", post.strategy_version_id)
      .not("scheduled_at", "is", null)
      .order("scheduled_at", { ascending: false })
      .limit(1)

    if (siblingError) {
      return jsonResponse({ error: "Kon bestaande planning niet controleren." }, 500)
    }

    const now = new Date()
    let baseDate: Date
    if (latestSiblingRows && latestSiblingRows.length > 0 && latestSiblingRows[0].scheduled_at) {
      baseDate = new Date(latestSiblingRows[0].scheduled_at as string)
      baseDate.setUTCDate(baseDate.getUTCDate() + CADANS_DAGEN)
    } else {
      baseDate = new Date(now)
      baseDate.setUTCDate(baseDate.getUTCDate() + 1)
    }

    // Stap: tijdstip ophalen via lichte AI-suggestie, met nette fallback bij falen
    let suggestedTime = DEFAULT_TIME
    let reasoning = DEFAULT_REASON

    try {
      const { data: analysisRows } = await supabaseAdmin
        .from("company_analyses")
        .select("summary_json")
        .eq("channel_id", post.channel_id)
        .order("versie", { ascending: false })
        .limit(1)

      const suggestion = await getTimeSuggestion({
        companyAnalysisSummary: (analysisRows?.[0] as CompanyAnalysisRow | undefined)?.summary_json ?? null,
        post,
      })
      suggestedTime = suggestion.suggested_time
      reasoning = suggestion.reasoning
    } catch (err) {
      console.log(`[suggest-schedule] AI-tijdadvies mislukt, terugvallen op standaardtijd: ${String(err)}`)
    }

    const [hourStr, minuteStr] = suggestedTime.split(":")
    const scheduledAtUtc = amsterdamWallTimeToUtc(
      baseDate.getUTCFullYear(),
      baseDate.getUTCMonth() + 1,
      baseDate.getUTCDate(),
      Number(hourStr),
      Number(minuteStr),
    )

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("posts")
      .update({ scheduled_at: scheduledAtUtc.toISOString(), schedule_suggestion_reason: reasoning })
      .eq("id", post_id)
      .eq("user_id", user.id)
      .select("id, scheduled_at, schedule_suggestion_reason")
      .single()

    if (updateError || !updated) {
      return jsonResponse({ error: "Kon planningsvoorstel niet opslaan." }, 500)
    }

    return jsonResponse(updated, 200)
  } catch (err) {
    return jsonResponse({ error: "Onverwachte fout", details: String(err) }, 500)
  }
})

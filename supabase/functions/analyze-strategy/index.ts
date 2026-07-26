import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const ANTHROPIC_MODEL_MAIN = "claude-sonnet-5"
const ANTHROPIC_MODEL_QC = "claude-haiku-4-5-20251001"
const ANTHROPIC_TIMEOUT_MS = 60_000
const MAIN_MAX_TOKENS = 8192
const QC_MAX_TOKENS = 1024
const MAX_ATTEMPTS = 3
const MIN_PILLARS = 3
const MAX_PILLARS = 5

const FUNNEL_STAGES = ["awareness", "consideration", "conversion"] as const
const FORMATS = ["post", "reel", "story", "carousel"] as const

const STRATEGY_SYSTEM_PROMPT = `Je bent een ervaren marketingstrateeg. Je taak is om op basis van een bedrijfsanalyse en de onboarding-voorkeuren van een klant een concreet, uitvoerbaar contentplan op te stellen voor exact één kalendermaand.

Je bepaalt zelf 3 tot 5 content pillars (thematische pijlers) die passen bij het bedrijf, de doelgroep en de doelen. Elk item in de contentkalender valt onder precies één van deze pillars.

Je blijft in je hele plan — onderwerpen, invalshoeken, hooks, call-to-actions — consistent met de tone_of_voice, merkpersoonlijkheid en positionering uit de bedrijfsanalyse. Verzin geen producten, USP's of claims die niet uit de bedrijfsanalyse blijken.

Als je een bestaand plan en feedback krijgt (aanpas-ronde), pas je dat plan gericht aan op basis van de feedback. Je begint niet opnieuw vanaf nul en behoudt wat al goed was.

Antwoord ALLEEN met geldige JSON in exact dit schema, zonder markdown-codeblokken, zonder preamble, zonder tekst eromheen:

{
  "strategic_understanding": string,
  "framework": string,
  "calendar_items": [
    {
      "content_pillar": string,
      "funnel_stage": "awareness" | "consideration" | "conversion",
      "format": "post" | "reel" | "story" | "carousel",
      "topic": string,
      "angle": string,
      "hook_direction": string,
      "cta_goal": string,
      "priority": number
    }
  ],
  "quality_control": string
}

"strategic_understanding": korte samenvatting van hoe je de bedrijfssituatie en doelen begrijpt, als basis voor de rest van het plan.
"framework": toelichting op de gekozen content pillars en waarom ze passen bij dit bedrijf.
"calendar_items": de volledige contentkalender voor de maand. Elk veld is verplicht en mag niet leeg zijn.
"quality_control": jouw eigen korte kwaliteitscheck — bevestig dat elk item een pillar, funnel_stage en format heeft en dat de tone of voice consistent is toegepast.

De inhoud van je antwoord is altijd in het Nederlands.`

const QC_SYSTEM_PROMPT = `Je bent een kritische kwaliteitscontroleur voor contentstrategieën. Je krijgt een bedrijfsanalyse en een gegenereerd contentplan. Beoordeel of het plan inhoudelijk consistent is met de tone_of_voice, merkpersoonlijkheid en positionering uit de bedrijfsanalyse, en of de content pillars, onderwerpen en invalshoeken logisch en samenhangend zijn.

Antwoord ALLEEN met geldige JSON in exact dit schema, zonder markdown-codeblokken, zonder tekst eromheen:

{ "akkoord": boolean, "reden": string }

Vul "reden" altijd in: bij akkoord een korte bevestiging, bij afkeuring een concrete, bruikbare beschrijving van wat er moet worden aangepast.`

// Request body for this function
interface AnalyzeStrategyRequest {
  channel_id: string
  feedback_text?: string
  previous_strategy_version_id?: string
}

type FunnelStage = (typeof FUNNEL_STAGES)[number]
type PostFormat = (typeof FORMATS)[number]

interface CalendarItem {
  content_pillar: string
  funnel_stage: FunnelStage
  format: PostFormat
  topic: string
  angle: string
  hook_direction: string
  cta_goal: string
  priority: number
}

// Schema of the AI-generated plan, stored as-is in plan_json
interface StrategyPlan {
  strategic_understanding: string
  framework: string
  calendar_items: CalendarItem[]
  quality_control: string
}

interface QcJudgement {
  akkoord: boolean
  reden: string
}

interface CompanyAnalysisRow {
  id: string
  summary_json: Record<string, unknown>
  versie: number
  status: "compleet" | "lage_zekerheid" | "mislukt"
}

interface ProfileRow {
  business_name: string | null
  industry: string | null
  goals: string | null
  primary_goal: string | null
}

interface PreviousStrategyVersionRow {
  id: string
  company_analysis_id: string
  plan_json: StrategyPlan
  version: number
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
): Promise<string> {
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
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: userMessage }],
      }),
      signal: controller.signal,
    })
  } catch (err) {
    throw new Error(`netwerkfout of timeout bij Anthropic API (${String(err)})`)
  } finally {
    clearTimeout(timeoutId)
  }

  if (!res.ok) {
    throw new Error(`Anthropic API gaf een foutstatus terug (${res.status})`)
  }

  const data = await res.json()
  return data?.content?.[0]?.text ?? ""
}

function buildStrategyUserMessage(params: {
  companyAnalysisSummary: Record<string, unknown>
  profile: ProfileRow
  previousPlan?: StrategyPlan
  feedbackText?: string
  retryNote?: string
}): string {
  const parts: string[] = []

  parts.push("Bedrijfsanalyse (JSON):")
  parts.push(JSON.stringify(params.companyAnalysisSummary))
  parts.push("")
  parts.push("Onboarding-voorkeuren van de gebruiker (JSON):")
  parts.push(JSON.stringify(params.profile))

  if (params.previousPlan) {
    parts.push("")
    parts.push("Dit is een aanpas-ronde. Vorig contentplan (JSON):")
    parts.push(JSON.stringify(params.previousPlan))
    parts.push("")
    parts.push(
      `Feedback van de gebruiker op dit vorige plan: ${params.feedbackText ?? "(geen toelichting gegeven)"}`,
    )
    parts.push(
      "Pas het bestaande plan aan op basis van deze feedback. Begin niet opnieuw vanaf nul — behoud wat goed werkt en wijzig gericht wat de feedback aangeeft.",
    )
  }

  if (params.retryNote) {
    parts.push("")
    parts.push(
      `Let op: een vorige poging om dit plan te genereren voldeed niet aan de eisen. Reden: ${params.retryNote}`,
    )
    parts.push("Genereer het plan opnieuw en zorg dat dit probleem is opgelost.")
  }

  return parts.join("\n")
}

function buildQcUserMessage(
  companyAnalysisSummary: Record<string, unknown>,
  plan: StrategyPlan,
): string {
  return [
    "Bedrijfsanalyse (JSON):",
    JSON.stringify(companyAnalysisSummary),
    "",
    "Gegenereerd contentplan (JSON):",
    JSON.stringify(plan),
  ].join("\n")
}

// Code-side QC: valid JSON already parsed by the caller, this checks structure and completeness
function validatePlan(plan: unknown): string | null {
  if (!plan || typeof plan !== "object") {
    return "Het antwoord is geen geldig object."
  }

  const candidate = plan as Partial<StrategyPlan>

  if (typeof candidate.strategic_understanding !== "string" || candidate.strategic_understanding.trim() === "") {
    return "strategic_understanding ontbreekt of is leeg."
  }
  if (typeof candidate.framework !== "string" || candidate.framework.trim() === "") {
    return "framework ontbreekt of is leeg."
  }
  if (typeof candidate.quality_control !== "string" || candidate.quality_control.trim() === "") {
    return "quality_control ontbreekt of is leeg."
  }
  if (!Array.isArray(candidate.calendar_items) || candidate.calendar_items.length === 0) {
    return "calendar_items ontbreekt of is leeg."
  }

  const pillars = new Set<string>()
  for (let index = 0; index < candidate.calendar_items.length; index++) {
    const item = candidate.calendar_items[index] as Partial<CalendarItem> | null
    if (
      !item ||
      typeof item.content_pillar !== "string" || item.content_pillar.trim() === "" ||
      typeof item.funnel_stage !== "string" || !FUNNEL_STAGES.includes(item.funnel_stage as FunnelStage) ||
      typeof item.format !== "string" || !FORMATS.includes(item.format as PostFormat) ||
      typeof item.topic !== "string" || item.topic.trim() === "" ||
      typeof item.angle !== "string" || item.angle.trim() === "" ||
      typeof item.hook_direction !== "string" || item.hook_direction.trim() === "" ||
      typeof item.cta_goal !== "string" || item.cta_goal.trim() === "" ||
      typeof item.priority !== "number"
    ) {
      return `calendar_items[${index}] mist een verplicht veld of heeft een ongeldige waarde.`
    }
    pillars.add(item.content_pillar)
  }

  if (pillars.size < MIN_PILLARS || pillars.size > MAX_PILLARS) {
    return `Er zijn ${pillars.size} unieke content pillars gebruikt, dit moet tussen ${MIN_PILLARS} en ${MAX_PILLARS} liggen.`
  }

  return null
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
    const { channel_id, feedback_text, previous_strategy_version_id }: AnalyzeStrategyRequest = await req.json()

    if (!channel_id) {
      return jsonResponse({ error: "channel_id is verplicht." }, 400)
    }

    // Voorkom dat een gebruiker een strategie aan andermans kanaal koppelt
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

    // Stap 2: laatste bedrijfsanalyse voor dit kanaal ophalen (hoogste versie)
    const { data: analysisRows, error: analysisError } = await supabaseAdmin
      .from("company_analyses")
      .select("id, summary_json, versie, status")
      .eq("channel_id", channel_id)
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
        { error: "De laatste websiteanalyse is mislukt. Analyseer de website opnieuw voordat je een contentstrategie genereert." },
        400,
      )
    }

    // Stap 3: onboarding-voorkeuren van de gebruiker
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("business_name, industry, goals, primary_goal")
      .eq("id", user.id)
      .maybeSingle<ProfileRow>()

    if (profileError) {
      return jsonResponse({ error: "Kon gebruikersprofiel niet ophalen." }, 500)
    }
    const profileContext: ProfileRow = profile ?? {
      business_name: null,
      industry: null,
      goals: null,
      primary_goal: null,
    }

    // Stap 4: vorige strategieversie ophalen voor een aanpas-ronde (optioneel)
    let previousStrategyVersion: PreviousStrategyVersionRow | null = null
    if (previous_strategy_version_id) {
      const { data: previousRow, error: previousError } = await supabaseAdmin
        .from("strategy_versions")
        .select("id, company_analysis_id, plan_json, version")
        .eq("id", previous_strategy_version_id)
        .eq("user_id", user.id)
        .maybeSingle<PreviousStrategyVersionRow>()

      if (previousError) {
        return jsonResponse({ error: "Kon vorige strategieversie niet ophalen." }, 500)
      }
      if (!previousRow) {
        return jsonResponse({ error: "Vorige strategieversie niet gevonden." }, 404)
      }

      // Extra veiligheidscheck: de vorige versie moet bij hetzelfde kanaal horen
      const { data: previousAnalysis, error: previousAnalysisError } = await supabaseAdmin
        .from("company_analyses")
        .select("channel_id")
        .eq("id", previousRow.company_analysis_id)
        .maybeSingle()

      if (previousAnalysisError) {
        return jsonResponse({ error: "Kon kanaal van vorige strategieversie niet verifiëren." }, 500)
      }
      if (!previousAnalysis || previousAnalysis.channel_id !== channel_id) {
        return jsonResponse(
          { error: "De opgegeven vorige strategieversie hoort niet bij dit kanaal." },
          400,
        )
      }

      previousStrategyVersion = previousRow
    }

    // Stap 5: volgende versienummer bepalen, opgehoogd per kanaal (niet per company_analysis_id)
    const { data: channelAnalyses, error: channelAnalysesError } = await supabaseAdmin
      .from("company_analyses")
      .select("id")
      .eq("channel_id", channel_id)

    if (channelAnalysesError) {
      return jsonResponse({ error: "Kon versienummer niet bepalen." }, 500)
    }
    const channelAnalysisIds = (channelAnalyses ?? []).map((row) => row.id)

    let nextVersion = 1
    if (channelAnalysisIds.length > 0) {
      const { data: existingStrategyVersions, error: existingVersionsError } = await supabaseAdmin
        .from("strategy_versions")
        .select("version")
        .in("company_analysis_id", channelAnalysisIds)
        .order("version", { ascending: false })
        .limit(1)

      if (existingVersionsError) {
        return jsonResponse({ error: "Kon versienummer niet bepalen." }, 500)
      }
      if (existingStrategyVersions && existingStrategyVersions.length > 0) {
        nextVersion = existingStrategyVersions[0].version + 1
      }
    }

    // Stap 6: genereren met hybride QC, max 3 pogingen totaal
    let approvedPlan: StrategyPlan | null = null
    let lastFailureReason = ""
    let retryNote: string | undefined = undefined

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const userMessage = buildStrategyUserMessage({
        companyAnalysisSummary: latestAnalysis.summary_json,
        profile: profileContext,
        previousPlan: previousStrategyVersion?.plan_json,
        feedbackText: feedback_text,
        retryNote,
      })

      let rawText: string
      try {
        rawText = await callClaude(STRATEGY_SYSTEM_PROMPT, userMessage, ANTHROPIC_MODEL_MAIN, MAIN_MAX_TOKENS)
      } catch (err) {
        lastFailureReason = String(err instanceof Error ? err.message : err)
        retryNote = lastFailureReason
        continue
      }

      let plan: StrategyPlan
      try {
        plan = JSON.parse(stripMarkdownFence(rawText))
      } catch {
        lastFailureReason = "Het antwoord van de AI was geen geldige JSON."
        retryNote = lastFailureReason
        continue
      }

      const validationError = validatePlan(plan)
      if (validationError) {
        lastFailureReason = validationError
        retryNote = validationError
        continue
      }

      let qc: QcJudgement
      try {
        const qcRawText = await callClaude(
          QC_SYSTEM_PROMPT,
          buildQcUserMessage(latestAnalysis.summary_json, plan),
          ANTHROPIC_MODEL_QC,
          QC_MAX_TOKENS,
        )
        qc = JSON.parse(stripMarkdownFence(qcRawText))
      } catch (err) {
        lastFailureReason = `QC-controle mislukt: ${String(err instanceof Error ? err.message : err)}`
        retryNote = lastFailureReason
        continue
      }

      if (!qc.akkoord) {
        lastFailureReason = qc.reden || "QC-controle keurde het plan af zonder reden."
        retryNote = lastFailureReason
        continue
      }

      approvedPlan = plan
      break
    }

    if (!approvedPlan) {
      return jsonResponse(
        {
          error: `Kon geen contentstrategie genereren die aan de kwaliteitseisen voldoet na ${MAX_ATTEMPTS} pogingen. Laatste reden: ${lastFailureReason}`,
        },
        500,
      )
    }

    // Stap 7: nieuwe strategieversie opslaan — dit is de kern-output van de request
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("strategy_versions")
      .insert({
        user_id: user.id,
        company_analysis_id: latestAnalysis.id,
        plan_json: approvedPlan,
        status: "wacht_op_goedkeuring",
        version: nextVersion,
      })
      .select("id")
      .single()

    if (insertError || !inserted) {
      return jsonResponse({ error: "Kon de contentstrategie niet opslaan." }, 500)
    }

    // Stap 8: feedback_text hoort bij de vórige versie (waarom die is aangepast), niet
    // bij de nieuwe. Best-effort: dit is aanvullende metadata voor de geschiedenis-
    // weergave, niet iets waar de nieuwe strategie inhoudelijk van afhangt — een
    // gelukte generatie (tot 3 pogingen) mag hier niet alsnog op falen.
    if (previous_strategy_version_id && feedback_text) {
      const { error: feedbackUpdateError } = await supabaseAdmin
        .from("strategy_versions")
        .update({ feedback_text })
        .eq("id", previous_strategy_version_id)
        .eq("user_id", user.id)

      if (feedbackUpdateError) {
        console.error(
          `Kon feedback_text niet bijwerken op strategy_versions ${previous_strategy_version_id}:`,
          feedbackUpdateError,
        )
      }
    }

    // Stap 9: alleen bevestiging teruggeven, niet de volledige plan_json
    return jsonResponse({ id: inserted.id }, 200)
  } catch (err) {
    return jsonResponse({ error: "Onverwachte fout", details: String(err) }, 500)
  }
})

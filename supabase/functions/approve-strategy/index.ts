import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const FUNNEL_STAGES = ["awareness", "consideration", "conversion"] as const
const FORMATS = ["post", "reel", "story", "carousel"] as const

interface ApproveStrategyRequest {
  strategy_version_id: string
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

interface StrategyPlan {
  strategic_understanding: string
  framework: string
  calendar_items: CalendarItem[]
  quality_control: string
}

interface StrategyVersionRow {
  id: string
  user_id: string
  company_analysis_id: string
  plan_json: StrategyPlan
  status: string
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

Deno.serve(async (req) => {
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
    const { strategy_version_id }: ApproveStrategyRequest = await req.json()
    if (!strategy_version_id) {
      return jsonResponse({ error: "strategy_version_id is verplicht." }, 400)
    }

    // Stap 2: strategieversie ophalen en eigenaarschap verifiëren
    const { data: strategyVersion, error: strategyError } = await supabaseAdmin
      .from("strategy_versions")
      .select("id, user_id, company_analysis_id, plan_json, status")
      .eq("id", strategy_version_id)
      .eq("user_id", user.id)
      .maybeSingle<StrategyVersionRow>()

    if (strategyError) {
      return jsonResponse({ error: "Kon strategieversie niet ophalen." }, 500)
    }
    if (!strategyVersion) {
      return jsonResponse({ error: "Strategieversie niet gevonden." }, 404)
    }

    const calendarItems = strategyVersion.plan_json?.calendar_items ?? []
    if (!Array.isArray(calendarItems) || calendarItems.length === 0) {
      return jsonResponse({ error: "Deze strategieversie bevat geen contentplan-items." }, 400)
    }

    // Stap 3: Instagram-kanaal ophalen — posts.channel_id moet verwijzen naar
    // het kanaal waarop geplaatst wordt (Instagram), niet naar het website-kanaal
    // dat is geanalyseerd. company_analyses.channel_id is bewust NIET de bron hier.
    const { data: instagramChannel, error: channelLookupError } = await supabaseAdmin
      .from("channels")
      .select("id")
      .eq("user_id", user.id)
      .eq("platform", "instagram")
      .maybeSingle()

    if (channelLookupError) {
      return jsonResponse({ error: "Kon Instagram-kanaal niet ophalen." }, 500)
    }
    if (!instagramChannel?.id) {
      return jsonResponse(
        { error: "geen_instagram_kanaal", reden: "Koppel eerst Instagram via de Kanalen-pagina voordat je een strategie goedkeurt." },
        400,
      )
    }
    const channelId = instagramChannel.id as string

    // Stap 4: idempotentie — als er al posts bestaan voor deze strategieversie, niet opnieuw aanmaken
    const { data: existingPosts, error: existingPostsError } = await supabaseAdmin
      .from("posts")
      .select("id")
      .eq("strategy_version_id", strategy_version_id)
      .limit(1)

    if (existingPostsError) {
      return jsonResponse({ error: "Kon bestaande posts niet controleren." }, 500)
    }
    if (existingPosts && existingPosts.length > 0) {
      // Status alsnog op 'goedgekeurd' zetten voor het geval dat eerder misging,
      // maar geen dubbele posts aanmaken.
      await supabaseAdmin
        .from("strategy_versions")
        .update({ status: "goedgekeurd" })
        .eq("id", strategy_version_id)
        .eq("user_id", user.id)

      return jsonResponse(
        { message: "Posts bestonden al voor deze strategieversie. Geen nieuwe posts aangemaakt.", created: 0 },
        200,
      )
    }

    // Stap 5: strategieversie op 'goedgekeurd' zetten
    const { error: statusUpdateError } = await supabaseAdmin
      .from("strategy_versions")
      .update({ status: "goedgekeurd" })
      .eq("id", strategy_version_id)
      .eq("user_id", user.id)

    if (statusUpdateError) {
      return jsonResponse({ error: "Kon strategieversie niet goedkeuren." }, 500)
    }

    // Stap 6: per calendar_item een rij in posts aanmaken
    const rowsToInsert = calendarItems.map((item) => ({
      user_id: user.id,
      strategy_version_id: strategy_version_id,
      channel_id: channelId,
      content_pillar: item.content_pillar,
      funnel_stage: item.funnel_stage,
      format: item.format,
      topic: item.topic,
      angle: item.angle,
      hook_direction: item.hook_direction,
      cta_goal: item.cta_goal,
      priority: item.priority,
      status: "concept",
    }))

    const { data: insertedPosts, error: insertError } = await supabaseAdmin
      .from("posts")
      .insert(rowsToInsert)
      .select("id")

    if (insertError) {
      return jsonResponse({ error: "Kon posts niet aanmaken.", details: insertError.message }, 500)
    }

    return jsonResponse(
      { message: "Posts aangemaakt op basis van het goedgekeurde contentplan.", created: insertedPosts?.length ?? 0 },
      200,
    )
  } catch (err) {
    return jsonResponse({ error: "Onverwachte fout", details: String(err) }, 500)
  }
})

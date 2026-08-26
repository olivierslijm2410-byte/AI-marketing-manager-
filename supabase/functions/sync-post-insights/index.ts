import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2"

// Fase 4, stap 8. Verwerkt in één run alle geplaatste posts die aan sync toe
// zijn (geen per-post aanroep vanuit cron nodig, in tegenstelling tot
// publish-post — dit is een periodieke bulk-taak, geen event-gedreven actie).
// Bewust GEEN analytics_summaries, periodevergelijkingen of AI-interpretatie
// — dat hoort bij de latere, volwaardige Analytics Agent (Fase 6).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const GRAPH_API_VERSION = "v25.0"
const GRAPH_BASE = `https://graph.instagram.com/${GRAPH_API_VERSION}`
const SYNC_INTERVAL_HOURS = 6
const MAX_POSTS_PER_RUN = 50 // ruime marge voor MVP-schaal, voorkomt een oneindig lange run

interface DuePost {
  id: string
  platform_post_id: string
  channel_id: string
}

interface ChannelRow {
  access_token: string | null
}

interface InsightMetricValue {
  name: string
  values: { value: number }[]
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function extractMetric(data: InsightMetricValue[] | undefined, name: string): number | null {
  const metric = data?.find((m) => m.name === name)
  return metric?.values?.[0]?.value ?? null
}

// Zelfde precisiebescherming als in publish-post — zie toelichting daar.
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

    const cutoff = new Date(Date.now() - SYNC_INTERVAL_HOURS * 60 * 60 * 1000).toISOString()

    const { data: duePosts, error: duePostsError } = await supabaseAdmin
      .from("posts")
      .select("id, platform_post_id, channel_id")
      .eq("status", "geplaatst")
      .not("platform_post_id", "is", null)
      .or(`insights_synced_at.is.null,insights_synced_at.lt.${cutoff}`)
      .limit(MAX_POSTS_PER_RUN)

    if (duePostsError) {
      return jsonResponse({ error: "Kon posts niet ophalen." }, 500)
    }
    if (!duePosts || duePosts.length === 0) {
      return jsonResponse({ message: "Geen posts aan de beurt voor insights-sync.", synced: 0 }, 200)
    }

    // Kanalen (en dus tokens) per channel_id cachen binnen deze run, voorkomt
    // herhaalde identieke lookups als meerdere posts hetzelfde kanaal delen.
    const channelCache = new Map<string, string | null>()
    let syncedCount = 0
    let failedCount = 0

    for (const post of duePosts as DuePost[]) {
      let accessToken = channelCache.get(post.channel_id)
      if (accessToken === undefined) {
        const { data: channel } = await supabaseAdmin
          .from("channels")
          .select("access_token")
          .eq("id", post.channel_id)
          .maybeSingle<ChannelRow>()
        accessToken = channel?.access_token ?? null
        channelCache.set(post.channel_id, accessToken)
      }

      if (!accessToken) {
        failedCount += 1
        continue // geen token — overslaan, dit is een publicatieprobleem, geen insights-probleem
      }

      const insightsRes = await fetch(
        `${GRAPH_BASE}/${post.platform_post_id}/insights?${new URLSearchParams({
          metric: "reach,likes,saved",
          access_token: accessToken,
        })}`,
      )
      const insightsData = await safeJsonFromResponse(insightsRes)

      if (!insightsRes.ok || !insightsData.data) {
        failedCount += 1
        continue // best-effort: één mislukte post mag de rest van de run niet blokkeren
      }

      await supabaseAdmin
        .from("posts")
        .update({
          reach: extractMetric(insightsData.data, "reach"),
          likes: extractMetric(insightsData.data, "likes"),
          // "clicks"-kolom bevat bewust de "saved"-metric — Instagram levert
          // geen klik-metric voor organieke posts, saves is de dichtstbijzijnde
          // beschikbare actie-metric. Zie toelichting in Fase 4-documentatie.
          clicks: extractMetric(insightsData.data, "saved"),
          insights_synced_at: new Date().toISOString(),
        })
        .eq("id", post.id)

      syncedCount += 1
    }

    return jsonResponse({ synced: syncedCount, failed: failedCount, total: duePosts.length }, 200)
  } catch (err) {
    return jsonResponse({ error: "Onverwachte fout", details: String(err) }, 500)
  }
})

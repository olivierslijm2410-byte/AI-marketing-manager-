import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2"

// Puur diagnostisch, alleen-lezen. Geen onderdeel van de productie-flow.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return jsonResponse({ error: "Geen geldige sessie." }, 401)

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
    if (userError || !user) return jsonResponse({ error: "Geen geldige sessie." }, 401)

    const supabaseAdmin: SupabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey)

    const { data: channel, error: channelError } = await supabaseAdmin
      .from("channels")
      .select("instagram_account_id, access_token")
      .eq("user_id", user.id)
      .eq("platform", "instagram")
      .maybeSingle()

    if (channelError) return jsonResponse({ error: "Kon kanaal niet ophalen." }, 500)
    if (!channel?.access_token) return jsonResponse({ error: "Geen Instagram-koppeling gevonden." }, 400)

    const meRes = await fetch(
      `https://graph.instagram.com/v25.0/me?${new URLSearchParams({
        fields: "id,username,account_type,name",
        access_token: channel.access_token,
      })}`,
    )
    const meData = await meRes.json()

    return jsonResponse(
      {
        opgeslagen_instagram_account_id: channel.instagram_account_id,
        graph_api_me_response: meData,
        komt_overeen: meData?.id === channel.instagram_account_id,
      },
      200,
    )
  } catch (err) {
    return jsonResponse({ error: "Onverwachte fout", details: String(err) }, 500)
  }
})

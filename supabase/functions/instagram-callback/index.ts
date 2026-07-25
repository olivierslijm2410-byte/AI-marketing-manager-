import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

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

    const { code } = await req.json()

    if (!code) {
      return jsonResponse({ error: "Geen code ontvangen" }, 400)
    }

    const appId = Deno.env.get("INSTAGRAM_APP_ID")
    const appSecret = Deno.env.get("INSTAGRAM_APP_SECRET")
    const redirectUri = Deno.env.get("INSTAGRAM_REDIRECT_URI")

    // Stap 1: code omwisselen voor short-lived token
    const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: appId!,
        client_secret: appSecret!,
        grant_type: "authorization_code",
        redirect_uri: redirectUri!,
        code,
      }),
    })

    const tokenData = await tokenRes.json()

    if (!tokenRes.ok) {
      return jsonResponse({ error: "Token-uitwisseling mislukt", details: tokenData }, 400)
    }

    const { access_token: shortLivedToken, user_id: instagramUserId } = tokenData

    // Stap 2: omwisselen voor long-lived token (60 dagen)
    const longLivedRes = await fetch(
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${appSecret}&access_token=${shortLivedToken}`
    )
    const longLivedData = await longLivedRes.json()

    if (!longLivedRes.ok || !longLivedData.access_token) {
      return jsonResponse({ error: "Omwisselen naar long-lived token mislukt", details: longLivedData }, 400)
    }

    // Stap 3: zelf opslaan in channels (insert of update), token verlaat deze functie nooit
    const { data: existingChannel, error: lookupError } = await supabaseAdmin
      .from("channels")
      .select("id")
      .eq("user_id", user.id)
      .eq("platform", "instagram")
      .maybeSingle()

    if (lookupError) {
      return jsonResponse({ error: "Kon bestaand kanaal niet ophalen." }, 500)
    }

    const channelData = {
      user_id: user.id,
      platform: "instagram",
      instagram_account_id: instagramUserId,
      access_token: longLivedData.access_token,
      token_expires_at: new Date(Date.now() + longLivedData.expires_in * 1000).toISOString(),
      connected_at: new Date().toISOString(),
    }

    const { error: saveError } = existingChannel
      ? await supabaseAdmin.from("channels").update(channelData).eq("id", existingChannel.id)
      : await supabaseAdmin.from("channels").insert(channelData)

    if (saveError) {
      return jsonResponse({ error: "Kon koppeling niet opslaan." }, 500)
    }

    // Alleen niet-gevoelige info gaat terug naar de frontend
    return jsonResponse({ success: true, instagram_account_id: instagramUserId }, 200)
  } catch (err) {
    return jsonResponse({ error: "Onverwachte fout", details: String(err) }, 500)
  }
})

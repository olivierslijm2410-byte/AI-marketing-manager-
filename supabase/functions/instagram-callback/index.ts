import "jsr:@supabase/functions-js/edge-runtime.d.ts"

Deno.serve(async (req) => {
  try {
    const { code } = await req.json()

    if (!code) {
      return new Response(JSON.stringify({ error: "Geen code ontvangen" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
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
      return new Response(JSON.stringify({ error: "Token-uitwisseling mislukt", details: tokenData }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const { access_token: shortLivedToken, user_id: instagramUserId } = tokenData

    // Stap 2: omwisselen voor long-lived token (60 dagen)
    const longLivedRes = await fetch(
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${appSecret}&access_token=${shortLivedToken}`
    )
    const longLivedData = await longLivedRes.json()

    return new Response(
      JSON.stringify({
        access_token: longLivedData.access_token,
        expires_in: longLivedData.expires_in,
        instagram_user_id: instagramUserId,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: "Onverwachte fout", details: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
})
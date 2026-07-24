// Tijdelijk lokaal test-script — NIET onderdeel van de productiecode.
// Logt in bij Supabase Auth en print het access_token + de kanalen van de
// gebruiker, zodat je die kunt gebruiken om de analyze-website Edge Function
// handmatig te testen (bijv. met curl of Postman).

import { readFileSync, existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { createClient } from "@supabase/supabase-js"

// Minimale .env-loader (geen extra dependency nodig) — vult alleen variabelen
// aan die nog niet in de omgeving staan.
function loadEnvFile(path) {
  if (!existsSync(path)) return
  const contents = readFileSync(path, "utf-8")
  for (const line of contents.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eqIndex = trimmed.indexOf("=")
    if (eqIndex === -1) continue
    const key = trimmed.slice(0, eqIndex).trim()
    let value = trimmed.slice(eqIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url))
loadEnvFile(join(__dirname, "..", ".env"))

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("VITE_SUPABASE_URL en/of VITE_SUPABASE_ANON_KEY ontbreken (.env of environment).")
  process.exit(1)
}

const email = process.argv[2] || process.env.TEST_EMAIL
const password = process.argv[3] || process.env.TEST_PASSWORD

if (!email || !password) {
  console.error("Gebruik: node scripts/get-test-token.mjs <email> <wachtwoord>")
  console.error("Of zet TEST_EMAIL en TEST_PASSWORD als environment variabelen.")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
  email,
  password,
})

if (authError || !authData.session) {
  console.error("Inloggen mislukt:", authError?.message ?? "Onbekende fout")
  process.exit(1)
}

console.log("\n=== Access token (gebruik als 'Authorization: Bearer <token>') ===")
console.log(authData.session.access_token)

const { data: channels, error: channelsError } = await supabase
  .from("channels")
  .select("*")
  .eq("user_id", authData.user.id)

console.log("\n=== Kanalen van deze gebruiker ===")
if (channelsError) {
  console.error("Kon kanalen niet ophalen:", channelsError.message)
} else if (!channels || channels.length === 0) {
  console.log("Geen kanalen gevonden voor deze gebruiker.")
} else {
  for (const channel of channels) {
    console.log(JSON.stringify(channel, null, 2))
  }
}

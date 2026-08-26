@AGENTS.md

# Project: AI Marketing Manager

## Stack
- Frontend: React + Vite (React Router DOM)
- Backend/database: Supabase (Frankfurt regio)
- Hosting: Vercel
- AI: Anthropic Claude API

## Projectdocumentatie
Verkorte versies van alle 6 blauwdrukken staan in `docs/` in deze repo:
businessplan, technische-blauwdruk, ux-ui-blauwdruk, stappenplan, agent-blauwdrukken,
database-schema. Lees het relevante bestand uit `docs/` op het moment dat het nodig is
(niet automatisch laden bij elke sessie).

De volledige, uitgebreide versies staan in het Claude Project — alleen nodig bij grote
scope- of ontwerpvragen, niet voor dagelijks werk.

## Regels
- Secrets altijd via .env, nooit hardcoded in code
- Elke agent is een losse, geteste functie — zie AGENTS.md voor overzicht en status
- Bouw en test één agent tegelijk, koppel pas daarna aan de volgende
- Run altijd `npm run lint` en `npm run build` vóór een commit
- Commit-messages in het Nederlands, beschrijvend
- Geen prompts genereren via een aparte "prompt agent" — elke agent krijgt zijn eigen
  doordachte instructie ingebouwd
- Als code afwijkt van een blauwdruk (bijv. kolomnamen in Supabase): de werkende code is
  leidend. Meld de afwijking expliciet, overschrijf de blauwdruk niet stilzwijgend.
- Dit bestand (CLAUDE.md) is de ENIGE plek waar de actuele fase/status hoort te staan.
  docs/stappenplan.md en docs/technische-blauwdruk.md verwijzen ernaar in plaats van hun
  eigen status bij te houden. Zodra een stap of fase is afgerond: werk de sectie
  "Huidige fase" hieronder bij, vóór de commit.

## Huidige fase — enige bron van waarheid voor status
Fase 1 is afgerond: authenticatie, dashboard-skelet, onboardingflow én Instagram OAuth
(koppelen, token-opslag, callback) werken end-to-end.

Fase 2-3 (MVP-keten) is volledig afgerond: Content Strategy Agent, Copywriting
Agent en Image Generation Agent staan alle drie op 🟢 — backend én frontend zijn
voor alle drie klaar, end-to-end getest zowel via directe API-calls als via de
browser-UI (Strategie-pagina en Contentkalender-pagina) (zie AGENTS.md voor de
technische details per agent).

Fase 4 (Social Media Agent — automatisch publiceren + basisresultaten) is nu
volledig afgerond, alle 12 stappen uit het stappenplan doorlopen en end-to-end
getest, inclusief expliciete faalscenario's (verlopen token, ontbrekende
afbeelding, gelijktijdige cron-runs). Ná de eerste "afgerond"-melding nog een
hardening-ronde gedaan (ChatGPT-review): stale-claim recovery in de cron en een
kritiek idempotency-gat gefixt (database-update-fout ná succesvolle
Meta-publicatie kon tot een dubbele Instagram-post leiden). Zie AGENTS.md voor
de volledige technische details.

Volgende stap: Fase 5/6 (Analytics Agent, Reporting Agent, Ads Manager Agent —
zie docs/technische-blauwdruk.md, docs/stappenplan.md voor de volledige, vaste
inhoud van elke stap — status van elke stap staat alleen hier).

## Bekende afwijkingen van de blauwdrukken
- `channels`-tabel gebruikt in code: `user_id`, `platform`, `instagram_account_id`,
  `access_token`, `token_expires_at`, `connected_at`. Geen `status`-kolom (bewuste
  keuze, zie Fase 4-sectie in AGENTS.md, "optie 1"). docs/database-schema.md is
  hierop al bijgewerkt naar de echte kolommen.
- Instagram OAuth-flow (instagram-callback) bleek bij nader onderzoek al de
  correcte, actuele "Business Login for Instagram"-flow te zijn — géén migratie
  van een verouderde API nodig zoals aanvankelijk gedacht. Wel een kritieke bug
  gevonden en gefixt: Meta geeft grote ID's (17+ cijfers, account-ID's én
  media-ID's) soms als kaal getal terug i.p.v. als string, wat tot stille
  precisieverlies leidt bij een gewone `res.json()`. Zie AGENTS.md, Fase 4-sectie,
  voor de volledige toedracht en fix (`safeJsonFromResponse`-patroon).
- `posts.channel_id` wees door een bug in `approve-strategy` naar het
  website-kanaal i.p.v. het Instagram-kanaal (waar daadwerkelijk op gepubliceerd
  wordt) — gefixt, zie AGENTS.md.

## Tools & integraties — gepland, nog niet geconnect
Status: 🔴 Nog te doen | 🟢 Klaar

- Sentry (connector, error monitoring) 🟢 — geconnect, project supabase-edge-functions
  aangemaakt, DSN als secret ingesteld, logging actief in publish-post en
  sync-post-insights (zie AGENTS.md, Fase 4 stap 10)
- frontend-design (Claude Code plugin) 🔴 — nu te installeren
- webapp-testing (Anthropic example-skill) 🔴 — nu te installeren
- postiz (Claude Code plugin) 🔴 — bewust niet gebruikt voor Fase 4, zelf gebouwd
  (zie AGENTS.md voor de afweging)
- resend (Claude Code plugin) 🔴 — bij Fase 5/6
- Figma (connector) 🔴 — bij Stap 10 (naam/merk/website)
- theme-factory (Anthropic example-skill) 🔴 — bij Stap 10
- brand-guidelines (Anthropic example-skill) 🔴 — bij Stap 10
- shopify-ai-toolkit (Claude Code plugin) 🔴 — bij Stap 12 / Fase 6 (Shopify)

mcp-builder en skill-creator: los inzetten wanneer nodig, niet fase-gebonden.
canvas-design: bewust overgeslagen (te artistiek/abstract voor on-brand social content).

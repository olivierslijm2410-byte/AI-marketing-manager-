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

Fase 2-3 (MVP-keten) is nu volledig afgerond: Content Strategy Agent, Copywriting
Agent en Image Generation Agent staan alle drie op 🟢 — backend én frontend zijn
voor alle drie klaar, end-to-end getest zowel via directe API-calls als via de
browser-UI (Strategie-pagina en Contentkalender-pagina) (zie AGENTS.md voor de
technische details per agent).

Volgende stap: Fase 4 — Social Media Agent (automatisch publiceren + basisresultaten)
(zie docs/technische-blauwdruk.md, docs/stappenplan.md voor de volledige, vaste
inhoud van elke stap — status van elke stap staat alleen hier).

## Bekende afwijkingen van de blauwdrukken
- `channels`-tabel gebruikt in code: `user_id`, `platform`, `instagram_account_id`,
  `access_token`, `token_expires_at`, `connected_at`.
  docs/database-schema.md is hierop al bijgewerkt naar de echte kolommen.

## Tools & integraties — gepland, nog niet geconnect
Status: 🔴 Nog te doen | 🟢 Klaar

- Sentry (connector, error monitoring) 🔴 — nu te connecten
- frontend-design (Claude Code plugin) 🔴 — nu te installeren
- webapp-testing (Anthropic example-skill) 🔴 — nu te installeren
- postiz (Claude Code plugin) 🔴 — bij Stap 5 / Fase 4 (publiceren)
- resend (Claude Code plugin) 🔴 — bij Fase 5/6
- Figma (connector) 🔴 — bij Stap 10 (naam/merk/website)
- theme-factory (Anthropic example-skill) 🔴 — bij Stap 10
- brand-guidelines (Anthropic example-skill) 🔴 — bij Stap 10
- shopify-ai-toolkit (Claude Code plugin) 🔴 — bij Stap 12 / Fase 6 (Shopify)

mcp-builder en skill-creator: los inzetten wanneer nodig, niet fase-gebonden.
canvas-design: bewust overgeslagen (te artistiek/abstract voor on-brand social content). 
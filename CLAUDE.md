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

Fase 2 is afgerond: Website Analysis Agent volledig gebouwd en getest — backend
(analyze-website Edge Function, opslag in company_analyses), frontend-koppeling op
Kanalen.jsx (website koppelen, analyse starten/herstarten, statusweergave) én de
bedrijfsanalyse-kaart met "opnieuw analyseren" op Strategie.jsx.

Fase 3 MVP-keten (Website Analysis → Content Strategy → Copywriting) is nu volledig
werkend en getest:
- Content Strategy Agent: database-tabel strategy_versions, analyze-strategy Edge
  Function (hybride AI+QC-generatie met retry-loop en streaming) en de Strategie-pagina
  (contentplan tonen, genereren, goedkeuren, aanpassen met feedback).
- Het "exploderen" van een goedgekeurde strategy_versions-rij naar losse posts-rijen:
  approve-strategy Edge Function (posts.rejection_reason erbij voor afwijzingen).
- Copywriting Agent: generate-copy Edge Function — caption + hashtags per post op basis
  van de bedrijfsanalyse en het contentplan-item, met rule-based lengte-/taalcontrole en
  een inkort-retry. Getest op alle drie funnel-fases (awareness, consideration,
  conversion).

approve-strategy en generate-copy zijn backend-only: geen van beide is nog gekoppeld aan
de frontend (de Strategie-pagina roept approve-strategy nog niet aan bij goedkeuren, en
er is nog geen scherm dat generate-copy aanroept).

Eerstvolgende openstaande taak: Image Generation Agent — de laatste agent van Fase 3.
(zie docs/technische-blauwdruk.md, docs/stappenplan.md stap 4 voor de volledige,
vaste inhoud van elke stap — status van elke stap staat alleen hier).

Anthropic API-billing is geactiveerd (was docs/stappenplan.md stap 2) — agents kunnen
nu daadwerkelijk AI-calls uitvoeren.

## Bekende afwijkingen van de blauwdrukken
- `channels`-tabel gebruikt in code: `user_id`, `platform`, `instagram_account_id`,
  `access_token`, `token_expires_at`, `connected_at`.
  docs/database-schema.md is hierop al bijgewerkt naar de echte kolommen.
  
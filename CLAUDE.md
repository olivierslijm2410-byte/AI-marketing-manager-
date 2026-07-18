@AGENTS.md

# Project: AI Marketing Manager

## Stack
- Frontend: React + Vite (React Router DOM)
- Backend/database: Supabase (Frankfurt regio)
- Hosting: Vercel
- AI: Anthropic Claude API

## Projectdocumentatie
Alle scope- en ontwerpbeslissingen staan in het Claude Project (niet in deze repo):
businessplan, technische blauwdruk, UX/UI-blauwdruk, stappenplan, agent-blauwdrukken,
database schema blauwdruk. Bij twijfel over scope of ontwerp: raadpleeg deze documenten eerst.

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

## Huidige fase
Fase 1 is afgerond: authenticatie, dashboard-skelet, onboardingflow én Instagram OAuth
(koppelen, token-opslag, callback) werken end-to-end.

Volgende stap: Fase 2 — Website Analysis Agent + opslag bedrijfsgegevens
(zie technische blauwdruk hoofdstuk 10, stappenplan stap 3).

Let op: Anthropic API-billing activeren staat nog open — dit is een harde vereiste
vóórdat de eerste agent daadwerkelijk kan draaien (stappenplan stap 2).

## Bekende afwijkingen van de blauwdrukken
- `channels`-tabel gebruikt in code: `user_id`, `platform`, `instagram_account_id`,
  `access_token`, `token_expires_at`, `connected_at`.
  De Database Schema Blauwdruk gebruikte `type`, `status`, `external_account_id`,
  `last_synced_at` — dat document is op dit punt nog niet bijgewerkt naar de echte kolommen.
  
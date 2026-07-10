# Project: AI Marketing Manager

## Stack
- Frontend: React + Vite
- Backend/database: Supabase (Frankfurt regio)
- Hosting: Vercel
- AI: Anthropic Claude API

## Regels
- Secrets altijd via .env, nooit hardcoded in code
- Elke agent is een losse, geteste functie — zie AGENTS.md voor overzicht en status
- Bouw en test één agent tegelijk, koppel pas daarna aan de volgende
- Bij twijfel over scope: raadpleeg het businessplan en de technische blauwdruk (in het Claude Project)
- Geen prompts genereren via een aparte "prompt agent" — elke agent krijgt zijn eigen doordachte instructie ingebouwd

## Huidige fase
Fase 1: authenticatie + dashboard-skelet (zie technische blauwdruk hoofdstuk 10) 
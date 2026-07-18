# AI Marketing Manager

Nederlandstalig SaaS-platform dat kleine ondernemers (webshops, lokale dienstverleners,
freelancers/coaches) een AI-marketingmedewerker geeft: het analyseert hun bedrijf, stelt
een contentplan op, schrijft en plaatst content, en rapporteert de resultaten in gewone
taal. Gebouwd door OS Digital Commerce.

## Stack
- **Frontend**: React + Vite (React Router DOM)
- **Backend/database**: Supabase (Frankfurt regio)
- **Hosting**: Vercel
- **AI**: Anthropic Claude API

## Huidige status
Fase 1 is afgerond: authenticatie, dashboard-skelet, onboardingflow en Instagram OAuth
werken end-to-end. Volgende stap: Fase 2 — Website Analysis Agent.
Zie `CLAUDE.md` voor de meest actuele fase en coding-regels.

## Lokaal draaien

```bash
npm install
npm run dev
```

Vereiste environment-variabelen (zie projecteigenaar voor de waarden):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_INSTAGRAM_CLIENT_ID`
- `VITE_INSTAGRAM_REDIRECT_URI`

```bash
npm run build     # productie-build
npm run lint       # altijd draaien vóór een commit
npm run preview    # lokale preview van de build
```

## Documentatie in deze repo
- **CLAUDE.md** — projectinstructies voor Claude Code (stack, regels, huidige fase)
- **AGENTS.md** — overzicht van alle 14 AI-agents en hun bouwstatus
- **docs/businessplan.md** — verkort businessplan: idee, doelgroep, concurrentie, verdienmodel
- **docs/technische-blauwdruk.md** — verkorte technische architectuur en roadmap
- **docs/ux-ui-blauwdruk.md** — verkorte UX/UI-structuur van website en dashboard
- **docs/stappenplan.md** — verkort stappenplan van nu tot eerste klanten
- **docs/agent-blauwdrukken.md** — aanvulling op AGENTS.md: edge cases, kosten, samenwerkingsketen
- **docs/database-schema.md** — overzicht van de Supabase-tabellen

## Let op
De bestanden in `docs/` zijn verkorte versies. De volledige, uitgebreide documenten staan
in het Claude Project (niet in deze repo). Bij grote scope- of ontwerpvragen: raadpleeg
die volledige documenten. Bij twijfel over een detail tijdens het coderen: de bestanden
hier in `docs/` zijn meestal genoeg.

# Technische blauwdruk (verkort)

Volledige versie: Claude Project. Dit is de samenvatting voor tijdens het bouwen.

## In één zin
Gebruiker koppelt kanalen → AI analyseert en maakt content → platform plaatst en meet —
met goedkeuring van de gebruiker als tussenstap bij elke fase.

## Architectuur
- **Frontend**: React + Vite (dashboard: inloggen, kanalen koppelen, content goedkeuren, resultaten bekijken)
- **Backend**: Supabase Edge Functions (verwerkt aanvragen, roept AI-agents aan)
- **Database**: Supabase / PostgreSQL — zie `database-schema.md`
- **API-laag**: koppelingen met Instagram, AI-modellen, later andere diensten
- **AI-laag**: de agents (zie `agent-blauwdrukken.md`) — gerichte taken naar hetzelfde AI-model, geen losse chatbot
- **Bestandsopslag**: Supabase Storage (afbeeldingen, later video's)
- **Authenticatie**: Supabase Auth

## AI-architectuur — kernprincipe
Elke agent = een gerichte taak met eigen rol, invoer en verwachte uitvoer, gegeven aan
hetzelfde AI-model. De backend regelt de volgorde (eerst analyseren → strategie → content
→ plaatsen), niet één grote AI die alles zelf uitzoekt. Voor MVP zijn maar 3 agents nodig:
Website Analysis, Content Strategy, Copywriting/Image. Rest pas als deze werken.

Volledig agent-overzicht: zie `agent-blauwdrukken.md` / `AGENTS.md`.

## Gebruikersflow
Account aanmaken → onboarding (branche, doelen, website + Instagram koppelen) → website
analyseren → strategie maken + goedkeuren → content genereren → (later) advertenties →
publiceren → analyseren → optimaliseren.

## Dashboard-pagina's
Overzicht, Kanalen, Strategie, Contentkalender, Resultaten, Instellingen.
Details per pagina: zie UX/UI-blauwdruk.

## Datastromen
**MVP**: websitegegevens, social media-basisdata, gegenereerde content, basisanalytics
(bereik/likes/kliks).
**Later**: advertentiedata, verkoop-/conversiedata (Shopify/WooCommerce).
Principe: verzamel alleen wat je daadwerkelijk gebruikt (AVG).

## Integraties (bouwvolgorde)
1. Instagram/Facebook (Meta) — MVP
2. Google Analytics — later
3. Google Ads — later, na advertentiebeheer
4. TikTok — later
5. Shopify/WooCommerce — later (ROI aantonen)
6. Stripe — later (eigen abonnementen innen)
7. LinkedIn/YouTube — veel later

## Schaalbaarheid
Nu bewust simpel houden — Supabase/Vercel schalen prima tot een paar duizend gebruikers.
Wél nu al slim: limiet op AI-content per klant per maand, agents los van elkaar houden,
kosten per klant bijhouden. Zware schaal-oplossingen: pas als het echt nodig blijkt.

## Veiligheid en privacy
- Wachtwoorden via Supabase Auth (automatisch versleuteld)
- API-sleutels nooit in frontend-code, alleen in server-omgevingsvariabelen (.env)
- Privacyverklaring + verwerkersovereenkomst vóór eerste klant koppelt (AVG)
- Transparant zijn dat klantdata naar een AI-model gaat; kies AI-aanbieder die geen
  klantdata gebruikt om eigen modellen te trainen

## Roadmap (fases)
| Fase | Wat | Status |
|---|---|---|
| 1 — Fundament | Auth, dashboard-skelet, onboarding, Instagram-koppeling | 🟢 Afgerond |
| 2 — Analyse | Website Analysis Agent, opslag bedrijfsgegevens | 🔴 Volgende stap |
| 3 — Content genereren | Content Strategy, Copywriting, Image Generation Agent | 🔴 |
| 4 — Publiceren en meten | Social Media Agent, basis-analytics | 🔴 |
| 5 — Advertenties | Meta-verificatie, Ads Manager Agent, Google Ads | 🔴 |
| 6 — Optimalisatie | Analytics/Reporting verfijnen, TikTok/Shopify, video | 🔴 | 

# AI Marketing Manager — Agent Overzicht

Status: 🔴 Nog te bouwen | 🟡 In progress | 🟢 Klaar & getest

## Infrastructuur (geen agent, wel vereist voor de agents hieronder)
- Instagram OAuth-koppeling 🟢 — authorize-flow, callback edge function
  (token-uitwisseling), opslag in channels-tabel. Werkt end-to-end.
- Anthropic API-billing 🟢 — geactiveerd, agents kunnen nu daadwerkelijk AI-calls uitvoeren
- Strategie goedkeuren → posts exploderen 🟢 klaar & getest (nog geen frontend-trigger) —
  approve-strategy Edge Function zet een goedgekeurde strategy_versions-rij om in losse
  posts-rijen (status 'concept'). Backend werkt en is getest, maar de Strategie-pagina
  roept 'm nog niet aan.

## Fase 2-3 (MVP — bouwen we eerst)

### 1. Website Analysis Agent 🟢
- Doel: bedrijf en aanbod begrijpen vanuit de website
- Input: website-URL
- Output: samenvatting (producten, doelgroep, tone of voice)
- Model: Claude Haiku of Sonnet (geen zware taak, houd kosten laag)
- Volledig afgerond: backend gebouwd, gedeployed en getest (succesvol scenario +
  foutscenario, beide correct afgehandeld en opgeslagen in company_analyses),
  frontend-koppeling op Kanalen.jsx (website koppelen, analyse starten/herstarten,
  status bezig/geanalyseerd/mislukt tonen, inclusief na page refresh), en de
  bedrijfsanalyse-kaart met opnieuw-analyseren op Strategie.jsx.

### 2. Content Strategy Agent 🟢
- Doel: concreet contentplan maken
- Input: output van Website Analysis Agent
- Output: contentkalender met onderwerpen + planning
- Afhankelijk van: Website Analysis Agent
- Volledig afgerond: database-tabel strategy_versions, analyze-strategy Edge Function
  (hybride AI+QC-generatie met retry-loop, streaming voor de hoofdgeneratie om
  timeouts te voorkomen) en de Strategie-pagina (contentplan tonen, genereren,
  goedkeuren, aanpassen met feedback) — alle drie klaar en getest.

### 3. Copywriting Agent 🔴
- Doel: teksten/captions schrijven per contentstuk
- Input: één item uit het contentplan
- Output: kant-en-klare tekst
- Afhankelijk van: Content Strategy Agent
- Nog niet gestart. Het "exploderen" van een goedgekeurde strategie naar posts-rijen
  is nu gebouwd (zie approve-strategy onder Infrastructuur hierboven), maar nog niet
  vanuit de Strategie-pagina aan te roepen. Kan starten zodra die frontend-koppeling
  er is en er dus posts-rijen ontstaan om te bewerken.

### 4. Image Generation Agent 🔴
- Doel: bijpassende afbeelding maken
- Input: onderwerp/tekst van de post
- Output: gegenereerde afbeelding
- Afhankelijk van: Content Strategy Agent
- Nog niet gestart. Zelfde afhankelijkheid als Copywriting Agent hierboven.

## Fase 4-6 (later — pas na werkende MVP)

### 5. Social Media Agent 🔴 — content daadwerkelijk plaatsen
### 6. Analytics Agent 🔴 — resultaten verzamelen en interpreteren
### 7. Reporting Agent 🔴 — rapportage in gewone taal
### 8. Ads Manager Agent 🔴 — advertenties opzetten (na Meta/Google-verificatie)
### 9. Market/Competitor Research Agent 🔴 — concurrentie in kaart brengen
### 10. Video Generation Agent 🔴 — video's maken (pas bij voldoende klanten, hoge AI-kosten)

## Nieuw toegevoegd (later — focus blijft eerst op social media, zie agent-blauwdrukken)

### 11. SEO Agent 🔴 — vindbaarheid-analyse en concrete verbeterpunten
### 12. Email Marketing Agent 🔴 — nieuwsbrieven/aanbiedingen (vereist nieuwe e-mail-integratie)
### 13. Engagement/Reply Agent 🔴 — reacties op comments/DM's voorstellen (na Social Media Agent + Meta-rechten)
### 14. Sales Sync Agent 🔴 — verkoopdata koppelen aan contentresultaten (na Shopify/WooCommerce)

## Bouwvolgorde
Zie technische blauwdruk hoofdstuk 10 en agent-blauwdrukken hoofdstuk 17 voor de volledige
fasering en samenwerkingsketen tussen agents.

Nu actief: Fase 1 is afgerond (auth, dashboard-skelet, onboarding, Instagram OAuth).
Volgende stap: Fase 2 — Website Analysis Agent.

## Toekomstige ideeën (nog niet plannen, wel onthouden)
- Shopify-koppeling: conversies/verkopen uitlezen (Fase 6, voedt Sales Sync Agent)
- Automatische ad-generatie bij nieuwe productdrops (uitbreiding Ads Manager Agent, na Fase 5)

## Bedrijfsmatige zaken (regelen vóór eerste betalende klant, niet nu bouwen)
- Facturatie (Stripe/Mollie), onboarding-flow, support-kanaal
- Algemene voorwaarden, privacybeleid, verwerkersovereenkomst (SaaS-specifiek)
- Database-backups, monitoring, rate limiting/misbruik-preventie
- Beleid: wat als AI een dure fout maakt in een klant-advertentie
- BTW-aanpak voor SaaS-abonnement (anders dan margeregeling) 

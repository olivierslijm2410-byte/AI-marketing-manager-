# AI Marketing Manager — Agent Overzicht

Status: 🔴 Nog te bouwen | 🟡 In progress | 🟢 Klaar & getest

## Principe: scheiding van verantwoordelijkheden
Alleen de Social Media Agent (Fase 4) mag een publicatiestatus zetten (bv. posts.status naar
'gepland' of 'geplaatst'). Copywriting Agent en Image Generation Agent genereren uitsluitend
content en werken uitsluitend hun eigen metadata bij (caption, hashtags, image_url, statussen
zoals image_status completed/failed) — zij raken nooit een publicatie-gerelateerd veld aan. Dit
voorkomt vermenging van verantwoordelijkheden zodra Fase 4 begint.

## Infrastructuur (geen agent, wel vereist voor de agents hieronder)
- Instagram OAuth-koppeling 🟢 — authorize-flow, callback edge function
  (token-uitwisseling), opslag in channels-tabel. Werkt end-to-end.
- Anthropic API-billing 🟢 — geactiveerd, agents kunnen nu daadwerkelijk AI-calls uitvoeren
- Strategie goedkeuren → posts exploderen 🟢 klaar & getest, inclusief frontend-trigger —
  approve-strategy Edge Function zet een goedgekeurde strategy_versions-rij om in losse
  posts-rijen (status 'concept'). Wordt aangeroepen via de goedkeur-knop op de
  Strategie-pagina, end-to-end getest in de browser.

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

### 3. Copywriting Agent 🟢 klaar & getest (getest op alle drie funnel-fases: awareness, consideration, conversion)
- Doel: teksten/captions schrijven per contentstuk
- Input: één item uit het contentplan
- Output: kant-en-klare tekst
- Afhankelijk van: Content Strategy Agent
- Volledig afgerond: generate-copy Edge Function — caption + hashtags per post,
  gebaseerd op de bedrijfsanalyse (tone_of_voice, positionering, merkpersoonlijkheid,
  kernboodschappen, klantproblemen_motivaties, doelgroep) en het contentplan-item,
  met rule-based lengte-/taalcontrole en een inkort-retry bij een te lange caption.
  Inclusief frontend-trigger via de Contentkalender-pagina (caption genereren,
  goedkeuren, afwijzen met gerichte herschrijving) — end-to-end getest in de browser.
- Verder verstevigd na feedback van ChatGPT (live v7, gesynchroniseerd met de repo):
  verstevigde confidence-fallback in de prompt (bij meerdere tegelijk lage/lege
  belangrijke velden geen feiten over de klant verzinnen, algemener schrijven vanuit
  onderwerp + betrouwbare positionering), een geen_cta-validatiecheck (caption moet een
  vraagteken of een actiewoord uit CTA_ACTION_WORDS bevatten), een validateHashtags-check
  (elke hashtag moet matchen op `^#[A-Za-zÀ-ÿ0-9_]+$`, dus geen koppeltekens/leestekens/
  dubbele spaties) en een bijpassende promptinstructie zodat het model zulke hashtags al
  bij de bron vermijdt. Beide nieuwe checks falen direct (geen retry) — alleen
  caption_te_lang triggert nog de inkort-retry.

### 4. Image Generation Agent 🟢 klaar & getest (end-to-end)
- Doel: bijpassende afbeelding maken
- Input: onderwerp/tekst van de post
- Output: gegenereerde afbeelding
- Afhankelijk van: Content Strategy Agent
- Volledig afgerond: twee Edge Functions — generate-image-prompt (creative brief →
  Claude → Flux-prompt) en generate-post-image (Flux-prompt → Flux API → Supabase
  Storage). Provider: Black Forest Labs, model flux-2-pro.
- Nieuwe tabel: ai_usage (kosten-/gebruikstracking). Image-kant is actief; de koppeling
  met tekstgeneratie (Copywriting Agent) is nog niet gebouwd.
- Frontend-koppeling toegevoegd op de Contentkalender-pagina: een Afbeelding-sectie naast
  de captionsectie, met dezelfde twee-staps-flow als de backend (generate-image-prompt →
  generate-post-image) en statusweergave op basis van image_status (knop "Genereer
  afbeelding", laadindicator, afbeelding + "Opnieuw genereren", foutmelding + "Opnieuw
  proberen") — end-to-end getest in de browser.
- Bekende beperking: geen tijd-gebaseerd vangnet voor het edge-case-scenario van een
  harde procesdood tijdens generatie (zeldzaam, apart traject indien nodig — vereist
  pg_cron + een updated_at-kolom).
- Bekende onduidelijkheid: de eenheid van het image_cost/Flux-API cost-veld is nog niet
  geverifieerd tegen een concreet euro/dollar-bedrag in het BFL-dashboard.

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

Nu actief: Fase 3 (MVP-keten) volledig afgerond — Website Analysis, Content Strategy,
Copywriting en Image Generation Agent zijn alle vier klaar en end-to-end getest.
Volgende stap: Fase 4 (Social Media Agent — content daadwerkelijk plaatsen).

## Toekomstige ideeën (nog niet plannen, wel onthouden)
- Shopify-koppeling: conversies/verkopen uitlezen (Fase 6, voedt Sales Sync Agent)
- Automatische ad-generatie bij nieuwe productdrops (uitbreiding Ads Manager Agent, na Fase 5)

## Bedrijfsmatige zaken (regelen vóór eerste betalende klant, niet nu bouwen)
- Facturatie (Stripe/Mollie), onboarding-flow, support-kanaal
- Algemene voorwaarden, privacybeleid, verwerkersovereenkomst (SaaS-specifiek)
- Database-backups, monitoring, rate limiting/misbruik-preventie
- Beleid: wat als AI een dure fout maakt in een klant-advertentie
- BTW-aanpak voor SaaS-abonnement (anders dan margeregeling) 

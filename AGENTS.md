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

## Fase 4 (afgerond)

### 5. Social Media Agent 🟢 klaar & getest (end-to-end, inclusief expliciete faalscenario's)
- Doel: goedgekeurde en geplande content daadwerkelijk publiceren op Instagram, met
  betrouwbare foutafhandeling en basis-resultaten.
- Input: posts met status 'gepland' en een verstreken scheduled_at.
- Output: status 'geplaatst' met platform_post_id en published_at, of 'mislukt' met
  een duidelijke error_code na uitputting van de retry-strategie.
- Afhankelijk van: Copywriting Agent (caption/hashtags), Image Generation Agent
  (image_url), Instagram OAuth-koppeling.

**Statusmodel:**
`concept → wacht_op_goedkeuring → goedgekeurd → gepland → geplaatst`, met
zijpaden naar `afgewezen` (vanuit wacht_op_goedkeuring) en `mislukt` (vanuit
gepland, na uitputting van retries). Overgang `goedgekeurd → gepland` is hybride:
bij goedkeuring stelt het systeem automatisch een `scheduled_at`-voorstel in
(cadans van 2 dagen t.o.v. de laatst geplande sibling-post binnen dezelfde
strategieversie, plus een lichte AI-tijdsuggestie via Haiku o.b.v. algemene
richtlijnen + doelgroep — expliciet gelabeld als indicatief, niet gepersonaliseerd,
want die data bestaat pas na de eerste publicaties). Gebruiker kan het voorstel
altijd aanpassen vóór bevestiging.

**Belangrijke bug gevonden en gefixt tijdens het bouwen:** `approve-strategy` zette
`posts.channel_id` op het website-kanaal (uit `company_analyses.channel_id`) i.p.v.
het Instagram-kanaal waarop daadwerkelijk gepubliceerd wordt. Gefixt door channel_id
te bepalen via een directe lookup op `channels` (`platform = 'instagram'`), niet meer
via de bedrijfsanalyse.

**Instagram OAuth — onderzocht, geen migratie nodig:** de bestaande
`instagram-callback`-flow bleek bij nader onderzoek al de correcte, actuele
"Business Login for Instagram"-flow te zijn (endpoints `api.instagram.com/oauth/
access_token` en `graph.instagram.com/access_token` zijn niet exclusief de
uitgefaseerde Basic Display API, zoals aanvankelijk gedacht — het verschil zit in
het Meta App Dashboard-productconfiguratie en de aangevraagde scopes, niet de
URL's). Wel toegevoegd: `instagram_business_manage_insights`-scope (nodig voor
stap 8 hieronder).

**Kritieke bug gevonden en gefixt: precisieverlies bij grote Meta-ID's.** Instagram-
en accountgegevens gebruiken 17+ cijferige ID's, ruim voorbij wat JavaScript's
`number`-type nauwkeurig kan opslaan. Meta geeft zulke ID's soms als kaal getal
terug i.p.v. als string (inconsistent per endpoint), waardoor een gewone
`res.json()` het laatste cijfer stilletjes afrondt. Trof zowel het opgeslagen
Instagram-account-ID (`instagram-callback`, gefixt door het ID via een aparte
`/me`-aanroep op te halen i.p.v. via `tokenData.user_id`) als het `platform_post_id`
na publiceren (`publish-post`). Structurele fix: een `safeJsonFromResponse`-helper
in zowel `publish-post` als `sync-post-insights` die elk verdacht groot kaal getal
in de ruwe responstekst eerst naar string omzet vóór het parsen. Eén testpost van
vóór deze fix heeft een blijvend onherstelbaar `platform_post_id` (nu op NULL
gezet zodat insights-sync 'm overslaat) — de post zelf staat wel gewoon en correct
op Instagram, alleen de gekoppelde insights-sync kon niet meer worden hersteld.

**`publish-post` Edge Function** — de kern van de agent:
- Claim-locking (`UPDATE ... WHERE status='gepland' AND claimed_at IS NULL`) tegen
  dubbele publicatie bij overlappende cron-runs, plus een extra idempotentie-check
  op een reeds aanwezige `platform_post_id`. Getest met twee vrijwel gelijktijdige
  aanroepen op dezelfde post — precies één verwerkte 'm, de ander kreeg direct een
  "niet beschikbaar om te claimen"-melding terug.
- Publicatieflow: media-container aanmaken → status pollen tot FINISHED → publiceren
  via de Instagram Graph API (`graph.instagram.com/v25.0`).
- Foutclassificatie + retry-beleid: `rate_limited` (max 5, retryable), `temporary_error`
  (max 3, retryable), `token_expired`/`missing_image`/`missing_caption`/`no_channel`
  (niet retryable, direct definitief mislukt), `unknown_error` (max 1 extra poging).
  Bij een niet-definitieve mislukking gaat de status terug naar 'gepland' en wordt de
  claim vrijgegeven zodat een volgende cron-run het opnieuw probeert.
- Brede tokenfout-afhandeling (bewuste keuze, "optie 1" i.p.v. een aparte
  `channels.status`-kolom): elke auth-gerelateerde Meta-fout wordt als
  `token_expired` geclassificeerd, niet alleen een letterlijk verlopen
  `token_expires_at`.

**Cron (`pg_cron` + `pg_net`):** `publish-due-posts`, elke 5 minuten, selecteert
posts met `status='gepland' AND scheduled_at<=now() AND claimed_at IS NULL` en
roept `publish-post` per post aan (anon key als Authorization-header — voldoende
om langs de `verify_jwt`-check te komen, de daadwerkelijke database-writes lopen
via de service-role key die de functie zelf uit haar eigen omgeving haalt).

**Token expiry + reconnect-melding (UX/UI-blauwdruk 8.2):** Kanalen-pagina en
Overzicht-pagina tonen beide een ⚠️-status + directe "opnieuw verbinden"-knop
zodra de koppeling kapot is (`token_expires_at` verlopen, of een publicatie na
het laatste (her)koppelmoment mislukt is met `error_code='token_expired'`). Rest
van de Overzicht-pagina blijft bewust placeholder — hoort niet bij deze stap.

**`sync-post-insights` Edge Function (stap 8):** losse, periodieke bulk-taak
(geen cron per post zoals publish-post, verwerkt alle due posts in één run),
elke 6 uur. Haalt `reach`, `likes` en `saved` op via
`graph.instagram.com/{media-id}/insights`. Belangrijke correctie op de
oorspronkelijke aanname: Instagram levert **geen** "clicks"-metric voor organieke
posts (dat bestaat alleen bij advertenties) — de bestaande `clicks`-kolom bevat
daarom bewust de `saved`-metric (dichtstbijzijnde beschikbare actie-metric).

**Resultaten-pagina (stap 9):** basale tabel (bereik/likes/bewaard per
geplaatste post, gesorteerd op publicatiedatum). Bewust géén periodevergelijkingen,
grafieken of AI-interpretatie — dat hoort bij de volwaardige Analytics Agent
(Fase 6). Nette leeg-staat conform UX/UI-blauwdruk 8.1.

**Sentry-logging (stap 10):** project `supabase-edge-functions` in de
`ai-marketing-manager`-Sentry-organisatie. Rechtstreekse envelope-API-aanroepen
vanuit de Edge Functions (geen SDK-dependency in Deno) — de oudere store-API is
door Sentry uitgefaseerd. `publish-post` logt elke poging (geslaagd/mislukt) met
post-id, error_code en retry_count; `sync-post-insights` logt een samenvatting
per run. DSN als `SENTRY_DSN`-secret ingesteld, end-to-end geverifieerd (event
kwam daadwerkelijk aan in Sentry).

**End-to-end tests (stap 11), allemaal met resultaat bevestigd:** geldige
publicatie, verlopen token (direct mislukt, geen retry), ontbrekende afbeelding
(direct mislukt), twee gelijktijdige aanroepen op dezelfde post (geen dubbele
publicatie). Rate limit-/retry-logica geverifieerd via codeinspectie i.p.v. een
live test (een echte Meta-rate-limit forceren is te risicovol voor het
productieaccount).

**Postiz bewust niet gebruikt:** de bestaande architectuur (channels, posts, RLS,
goedkeuring/planning) was al specifiek gebouwd rond een eigen statusmodel — een
externe publishinglaag paste daar niet goed bovenop. Zelf gebouwd op de
Meta Graph API in plaats daarvan.

## Fase 5-6 (later — pas na Fase 4)
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

Nu actief: Fase 4 (Social Media Agent) volledig afgerond — automatisch publiceren,
retry/foutafhandeling, cron, token-expiry-melding, basis-insights, Resultaten-pagina
en Sentry-logging staan alle end-to-end getest.
Volgende stap: Fase 5/6 (Analytics Agent, Reporting Agent, Ads Manager Agent).

## Toekomstige ideeën (nog niet plannen, wel onthouden)
- Shopify-koppeling: conversies/verkopen uitlezen (Fase 6, voedt Sales Sync Agent)
- Automatische ad-generatie bij nieuwe productdrops (uitbreiding Ads Manager Agent, na Fase 5)

## Bedrijfsmatige zaken (regelen vóór eerste betalende klant, niet nu bouwen)
- Facturatie (Stripe/Mollie), onboarding-flow, support-kanaal
- Algemene voorwaarden, privacybeleid, verwerkersovereenkomst (SaaS-specifiek)
- Database-backups, monitoring, rate limiting/misbruik-preventie
- Beleid: wat als AI een dure fout maakt in een klant-advertentie
- BTW-aanpak voor SaaS-abonnement (anders dan margeregeling)

# AI Marketing Manager — Agent Overzicht

Status: 🔴 Nog te bouwen | 🟡 In progress | 🟢 Klaar & getest

## Fase 2-3 (MVP — bouwen we eerst)

### 1. Website Analysis Agent 🔴
- Doel: bedrijf en aanbod begrijpen vanuit de website
- Input: website-URL
- Output: samenvatting (producten, doelgroep, tone of voice)
- Model: Claude Haiku of Sonnet (geen zware taak, houd kosten laag)

### 2. Content Strategy Agent 🔴
- Doel: concreet contentplan maken
- Input: output van Website Analysis Agent
- Output: contentkalender met onderwerpen + planning
- Afhankelijk van: Website Analysis Agent

### 3. Copywriting Agent 🔴
- Doel: teksten/captions schrijven per contentstuk
- Input: één item uit het contentplan
- Output: kant-en-klare tekst
- Afhankelijk van: Content Strategy Agent

### 4. Image Generation Agent 🔴
- Doel: bijpassende afbeelding maken
- Input: onderwerp/tekst van de post
- Output: gegenereerde afbeelding
- Afhankelijk van: Content Strategy Agent

## Fase 4-6 (later — pas na werkende MVP)

### 5. Social Media Agent 🔴 — content daadwerkelijk plaatsen
### 6. Analytics Agent 🔴 — resultaten verzamelen en interpreteren
### 7. Reporting Agent 🔴 — rapportage in gewone taal
### 8. Ads Manager Agent 🔴 — advertenties opzetten (na Meta/Google-verificatie)
### 9. Market/Competitor Research Agent 🔴 — concurrentie in kaart brengen
### 10. Video Generation Agent 🔴 — video's maken (pas bij voldoende klanten, hoge AI-kosten)

## Bouwvolgorde
Zie technische blauwdruk hoofdstuk 10 voor de volledige fasering (Fase 1 t/m 6).
Nu actief: Fase 1 — authenticatie + dashboard-skelet (nog geen agents).

## Toekomstige ideeën (nog niet plannen, wel onthouden)
- Shopify-koppeling: conversies/verkopen uitlezen (Fase 6)
- Automatische ad-generatie bij nieuwe productdrops (uitbreiding Ads Manager Agent, na Fase 5)

## Bedrijfsmatige zaken (regelen vóór eerste betalende klant, niet nu bouwen)
- Facturatie (Stripe/Mollie), onboarding-flow, support-kanaal
- Algemene voorwaarden, privacybeleid, verwerkersovereenkomst (SaaS-specifiek)
- Database-backups, monitoring, rate limiting/misbruik-preventie
- Beleid: wat als AI een dure fout maakt in een klant-advertentie
- BTW-aanpak voor SaaS-abonnement (anders dan margeregeling) 
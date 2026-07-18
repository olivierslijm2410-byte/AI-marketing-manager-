# UX/UI-blauwdruk (verkort)

Volledige versie: Claude Project. Dit is de samenvatting voor tijdens het bouwen.

## UX-principes
- Vertrouwen stapsgewijs opbouwen — niets automatisch zonder goedkeuring vooraf
- Geen cijfers zonder uitleg — elk getal komt met interpretatie in gewone taal
- Platform (dashboard) = rustig en functioneel; publieke website = mag opvallen/overtuigen
- Notificaties alleen bij echte actie, geen ruis
- Desktop leidend, mobiel volwaardig alternatief

## Visuele richting (kleuren/fonts volgen pas na Fase 1 — zie businessplan)
Exclusief, minimalistisch, tech-forward, met speelse details in interactie (niet in kleur).
Publieke site = expressief/showcase (asymmetrie, scroll-reveals). Dashboard = rustig,
veel witruimte, één duidelijke actie per scherm.

## Sitemap
**Publiek**: landingspagina, hoe het werkt, prijzen, over ons, login, aanmelden, privacy.
**Platform**: onboarding (eenmalig) → Overzicht, Kanalen, Strategie, Contentkalender,
Resultaten, Instellingen.

## Dashboard-pagina's — kern per pagina
| Pagina | Kernfunctie |
|---|---|
| Overzicht | Status in één oogopslag, actie-nodig kaart bovenaan |
| Kanalen | Kanaalkaart per kanaal, koppelen/status, foutmelding bij mislukte koppeling |
| Strategie | Bedrijfsanalyse + contentplan, goedkeuren of aanpassen met feedback |
| Contentkalender | Maand/weekweergave, postkaart per item, goedkeuringsscherm in detail |
| Resultaten | Samenvattingskaarten met interpretatie, per-post detail |
| Instellingen | Account, abonnement, voorkeuren |

## Gebruikersflows (kern)
1. Aanmelden → onboarding (branche/doelen → website koppelen → Instagram koppelen)
2. Kanaal koppelen: uitleg vooraf (Business/Creator-account nodig) → OAuth → status
3. Strategie goedkeuren: bekijken → goedkeuren of aanpassen (met feedback) → herhaal
4. Content goedkeuren: openen → goedkeuren/bewerken/afwijzen → gepland → geplaatst

## Componenten (herbruikbaar)
Statusbadge, kanaalkaart, goedkeur/afwijs-knoppaar, postkaart, kalenderweergave,
actie-nodig kaart, samenvattingskaart (cijfer + interpretatie), voortgangsstepper
(onboarding), notificatiebalk, modal/goedkeuringsscherm, lege-staat illustratie,
laad-skeleton.

## States & edge cases
- Lege staten: altijd uitleg + eerstvolgende actie, nooit een kaal leeg scherm
- Koppelingsproblemen: zichtbare status + duidelijke "opnieuw verbinden"-actie
- AI-verwerking duurt lang: laadstatus met tijdsindicatie, geen kale spinner
- AI-contentlimiet bereikt: vriendelijke melding + upgrade-optie, geen abrupte blokkade

## Desktop vs. mobiel
Eén responsive systeem, geen twee losse ontwerpen. Desktop: zijbalk, side-by-side
goedkeuring. Mobiel: onderste navigatie, gestapelde weergave, contentkalender als lijst
i.p.v. maandoverzicht.

## Wat bewust nog niet vastligt
Exacte kleuren, typografie, logo, iconenstijl — pas na Fase 1 volledig functioneel af.

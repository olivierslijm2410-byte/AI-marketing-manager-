# Agent-blauwdrukken (verkort)

Volledige versie: Claude Project. Rol/input/output/status per agent staat al in
`AGENTS.md` — dit bestand vult aan met systeemprompt-richting, edge cases en
kosten-overwegingen, zodat je dat niet dubbel hoeft bij te houden.

## MVP-agents (nu relevant)

### 1. Website Analysis Agent
- **Systeemprompt-richting**: marktonderzoeker/tekstanalist, geen marketeer — blijf
  feitelijk, geen aannames verzinnen. Output in vast JSON-schema.
- **Edge cases**: website onbereikbaar → foutmelding + retry; andere taal → analyseer in
  brontaal, output blijft Nederlands; te weinig tekst → lage zekerheid aangeven.
- **Kosten**: laag — draait ~1x per koppeling.
- **Doet niet**: concurrentieanalyse, contentplan opstellen.

### 2. Content Strategy Agent
- **Systeemprompt-richting**: marketingstrateeg, consistent met tone of voice; houd
  rekening met AI-contentlimiet van het pakket.
- **Edge cases**: herhaaldelijk afgewezen plan → na X pogingen suggestie voor menselijk
  contact; onduidelijke input → vraag verduidelijking i.p.v. gokken.
- **Kosten**: laag-gemiddeld — 1x per periode + aanpassingsrondes (leg max. aantal vast).
- **Doet niet**: teksten schrijven, beelden genereren, zelfstandig beslissen zonder goedkeuring.

### 3. Copywriting Agent
- **Systeemprompt-richting**: copywriter in merk-tone of voice, geen medische/financiële
  claims, hashtags als apart veld.
- **Edge cases**: te vaag onderwerp → verduidelijking vragen; caption te lang → inkorten
  met behoud van kernboodschap.
- **Kosten**: hoog volume (per post) — dichtst bij de contentlimiet, nauw monitoren.
- **Doet niet**: plaatsen, planning/timing bepalen.

### 4. Image Generation Agent
- **Systeemprompt-richting**: visueel ontwerper passend bij onderwerp/doelgroep, geen
  tekst-in-beeld tenzij expliciet gevraagd.
- **Edge cases**: ongepast/irrelevant beeld → "opnieuw genereren"-optie.
- **Kosten**: hoog per stuk — apart meten van tekstgeneratie in de kostenlimiet.
- **Doet niet**: video genereren, plaatsen.

## Later-agents (compact overzicht)

| Agent | Belangrijkste edge case | Kosten | Doet niet |
|---|---|---|---|
| Market/Competitor Research | Weinig publieke data lokale concurrent → beperking melden, niet gokken | Laag frequent, prijzig per run (zoekwerk) | Geen contentplan/advertentie-analyse |
| Video Generation | Mislukt/duurt lang → asynchroon verwerken | Hoogste kostenpost — apart bijbetalen | Geen strategie, niet plaatsen |
| Social Media Agent | Token verlopen → notificatie + status "mislukt", geen silent failure | Geen AI-kosten, wel API rate limits | Geen content genereren, nooit zonder goedkeuring plaatsen |
| Ads Manager | Budgetoverschrijding dreigt → altijd melden vóór uitvoering | Financieel risico groot, vandaar goedkeuringsstap | Nooit zelfstandig budget verhogen |
| Analytics Agent | Te weinig data → duidelijk melden, geen vroege conclusies | Laag | Geen nieuw contentvoorstel genereren |
| Reporting Agent | Weinig verandering → eerlijk "stabiel" melden | Laag | Voert zelf geen aanpassingen door |
| SEO Agent | Site niet analyseerbaar (JS-only) → beperking melden | Laag-gemiddeld | Geen wijzigingen aan website zelf |
| Email Marketing Agent | Te kleine lijst → functie nog niet tonen | Laag (excl. e-mailtool-kosten) | Geen CRM-beheer |
| Engagement/Reply Agent | Negatieve comment → signaleren, niet zelf reageren | Kan hoog volume worden — expliciet in kostenlimiet meenemen | Nooit verzenden zonder goedkeuring |
| Sales Sync Agent | Lage ordervolumes → label als "indicatief" | Laag (excl. API-koppeling) | Geen voorraad/orderbeheer |

## Samenwerkingsketen
1. **MVP-keten**: Website Analysis → Content Strategy → Copywriting + Image (parallel) —
   strikt lineair, elke stap wacht op goedkeuring.
2. **Publicatie/meten**: Copywriting+Image → Social Media → Analytics → Reporting →
   terug naar Content Strategy voor het volgende plan.
3. **Ondersteunend, niet in hoofdketen**: Market Research (voedt Content Strategy),
   SEO (deelt input met Website Analysis), Video Generation (los toegevoegd op contentplan-item),
   Engagement/Reply (reageert los van uitgaande cyclus), Email Marketing (eigen kanaal/cadans),
   Ads Manager (parallel zodra advertentiebudget er is).

**Praktisch advies**: bouw de MVP-keten eerst volledig en test die zelf, vóór je aan de
publicatiecirkel begint.

# Database schema

Verkorte versie van de Database Schema Blauwdruk (volledige versie in het Claude Project).
Kolomtypes in PostgreSQL-notatie. Status geeft aan of de tabel al in Supabase bestaat.

## Bestaand

### profiles 🟢
| Kolom | Type | Omschrijving |
|---|---|---|
| id | uuid | PK, gelijk aan auth.users.id |
| email | text | Vanuit Supabase Auth |
| business_name | text | Onboarding |
| industry | text | Onboarding |
| goals | text | Onboarding |
| onboarding_completed | boolean | Stuurt OnboardingGuard |
| created_at | timestamptz | |
| updated_at | timestamptz | |

RLS: `auth.uid() = id`.

### channels 🟢 — LET OP: dit zijn de echte kolommen uit de code, niet het oorspronkelijke voorstel
| Kolom | Type | Omschrijving |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK → profiles.id |
| platform | text | bijv. 'instagram' |
| instagram_account_id | text | Instagram user-id |
| access_token | text | Long-lived token |
| token_expires_at | timestamptz | Vervalmoment token |
| connected_at | timestamptz | Koppelmoment |

RLS: `auth.uid() = user_id`.

> Zodra er andere kanaaltypes bijkomen (website, tiktok, ...) waarschijnlijk een `type`-
> of `platform`-generieke aanpak nodig — nu nog instagram-specifiek ingericht.

## Nog te bouwen (voorstel — pas aan zodra je de bijbehorende agent bouwt)

| Tabel | Doel | Belangrijkste kolommen |
|---|---|---|
| subscriptions | Abonnement per gebruiker | user_id, plan, status, ai_content_limit |
| ai_usage | AI-verbruik per maand | user_id, month, content_generated_count, image_generated_count, limit_reached |
| company_analyses | Output Website Analysis Agent | user_id, channel_id, summary_json, confidence_level, version |
| concurrent_analyses | Output Market/Competitor Research Agent | user_id, industry, location, summary_json |
| strategy_versions | Contentplan-versies | user_id, company_analysis_id, plan_json, status, version, feedback_text |
| posts | Individuele posts | user_id, strategy_version_id, channel_id, caption, hashtags, image_url, video_url, status, scheduled_at, published_at, platform_post_id |
| seo_reports | Output SEO Agent | user_id, channel_id, recommendations_json |
| emails | Output Email Marketing Agent | user_id, subject, body, segment, status, scheduled_at, sent_at |
| engagement_replies | Output Engagement/Reply Agent | user_id, channel_id, incoming_message, incoming_type, suggested_reply, status |
| ads_campaigns | Output Ads Manager Agent | user_id, platform, budget, status, targeting_json |
| analytics_summaries | Output Analytics Agent | user_id, period_start, period_end, metrics_json |
| reports | Output Reporting Agent | user_id, analytics_summary_id, period, summary_text, proposal_text |
| sales_correlations | Output Sales Sync Agent | user_id, period_start, period_end, revenue_data_json, correlated_posts_json |

## RLS — standaardpatroon
- SELECT/UPDATE: alleen eigen rij (`auth.uid() = user_id`)
- INSERT: meestal server-side via Edge Function (de agent schrijft weg), niet direct vanuit de frontend
- Uitzondering: `posts` en `strategy_versions` — gebruiker mag de status-kolom zelf bewerken (goedkeuren/afwijzen)
- `ai_usage`: gebruiker mag alleen lezen, nooit schrijven (voorkomt omzeilen van de contentlimiet)

Volledige toelichting, relatieoverzicht en RLS-onderbouwing: zie Database Schema Blauwdruk
in het Claude Project.

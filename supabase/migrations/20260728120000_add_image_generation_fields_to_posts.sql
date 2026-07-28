-- Image Generation Agent (Fase 3, laatste agent): velden op posts voor
-- afbeeldingsgeneratie. image_url bestond al (uit create_posts) en wordt hier
-- niet opnieuw aangemaakt.
--
-- Geen RLS-wijzigingen nodig: service_role omzeilt RLS (rolbypassrls = true),
-- en de bestaande posts_select_own policy werkt op rij-niveau, dus de
-- eigenaar kan deze nieuwe kolommen al lezen zodra ze bestaan.

alter table public.posts
  add column if not exists image_status text not null default 'not_required',
  add column if not exists image_provider text,
  add column if not exists image_model text,
  add column if not exists image_prompt text,
  add column if not exists creative_brief jsonb,
  add column if not exists image_cost numeric,
  add column if not exists image_error text,
  add column if not exists image_generated_at timestamptz;

alter table public.posts
  add constraint posts_image_status_check
  check (image_status = any (array[
    'pending'::text,
    'generating'::text,
    'completed'::text,
    'failed'::text,
    'not_required'::text
  ]));

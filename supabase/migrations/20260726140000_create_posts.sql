-- posts: losse posts geëxplodeerd uit een goedgekeurde strategy_version (Fase 3/4).
-- Gebruikt door de Copywriting Agent (caption/hashtags), Image Generation Agent
-- (image_url/video_url) en later de Social Media Agent (scheduled_at/published_at/
-- platform_post_id). Inserts gebeuren server-side (bij het "exploderen" van een
-- goedgekeurde strategie naar losse posts) via service role — net als bij
-- strategy_versions en company_analyses. Zie docs/database-schema.md.

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  strategy_version_id uuid not null references public.strategy_versions(id),
  channel_id uuid not null references public.channels(id),
  content_pillar text not null,
  funnel_stage text not null check (funnel_stage in ('awareness', 'consideration', 'conversion')),
  format text not null check (format in ('post', 'reel', 'story', 'carousel')),
  topic text not null,
  angle text,
  hook_direction text,
  cta_goal text,
  priority integer not null default 1,
  caption text,
  hashtags text,
  image_url text,
  video_url text,
  status text not null default 'concept' check (status in ('concept', 'wacht_op_goedkeuring', 'goedgekeurd', 'gepland', 'geplaatst', 'mislukt', 'afgewezen')),
  scheduled_at timestamptz,
  published_at timestamptz,
  platform_post_id text,
  created_at timestamptz not null default now()
);

alter table public.posts enable row level security;

drop policy if exists "posts_select_own" on public.posts;
create policy "posts_select_own"
  on public.posts
  for select
  using (auth.uid() = user_id);

drop policy if exists "posts_update_own" on public.posts;
create policy "posts_update_own"
  on public.posts
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

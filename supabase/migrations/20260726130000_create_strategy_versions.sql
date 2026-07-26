-- strategy_versions: contentplan-versies van de Content Strategy Agent (Fase 3).
-- Inserts gebeuren alleen server-side via de Content Strategy Edge Function
-- (service role, bypast RLS) — net als bij company_analyses. De gebruiker mag
-- wel zelf de status bijwerken (goedkeuren/afwijzen), vandaar wel een UPDATE-
-- policy maar geen INSERT-policy. Zie docs/database-schema.md.

create table if not exists public.strategy_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  company_analysis_id uuid not null references public.company_analyses(id),
  plan_json jsonb not null,
  status text not null check (status in ('concept', 'wacht_op_goedkeuring', 'goedgekeurd')),
  version integer not null default 1,
  feedback_text text,
  created_at timestamptz not null default now()
);

alter table public.strategy_versions enable row level security;

drop policy if exists "strategy_versions_select_own" on public.strategy_versions;
create policy "strategy_versions_select_own"
  on public.strategy_versions
  for select
  using (auth.uid() = user_id);

drop policy if exists "strategy_versions_update_own" on public.strategy_versions;
create policy "strategy_versions_update_own"
  on public.strategy_versions
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

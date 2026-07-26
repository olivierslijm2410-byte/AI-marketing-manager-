-- Adds primary_goal to profiles for the Content Strategy Agent (Fase 3).
-- Nullable at the database level: existing rows have no value yet, and the
-- "required" rule is enforced in the frontend for new onboarding flows, not
-- via NOT NULL here. No RLS change needed — profiles already restricts rows
-- to auth.uid() = id, and this is just a new column on that table.

alter table public.profiles
  add column if not exists primary_goal text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'profiles'
      and c.conname = 'profiles_primary_goal_check'
  ) then
    alter table public.profiles
      add constraint profiles_primary_goal_check
      check (primary_goal in ('awareness', 'leads', 'sales', 'retention'));
  end if;
end $$;

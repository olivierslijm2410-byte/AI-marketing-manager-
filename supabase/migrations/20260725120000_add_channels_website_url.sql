-- channels.website_url and its check constraint already exist in production
-- (added manually via the SQL Editor). This migration only documents that
-- change and makes it safe to (re)run on any environment, including a fresh
-- local setup where the column/constraint don't exist yet. It must not fail
-- if they already exist, and must not blindly try to recreate them.
--
-- Rule: a channel with platform = 'website' must have a website_url. Other
-- platforms are not required to leave website_url empty (the production
-- constraint doesn't enforce that either).

alter table public.channels
  add column if not exists website_url text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'channels'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%website_url%'
  ) then
    alter table public.channels
      add constraint channels_website_url_check
      check (
        (platform = 'website' and website_url is not null)
        or (platform <> 'website')
      );
  end if;
end $$;

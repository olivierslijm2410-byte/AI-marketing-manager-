-- company_analyses already exists in production (created manually via the SQL
-- Editor, with SELECT/INSERT/UPDATE/DELETE policies all using auth.uid() = user_id).
-- This migration does not recreate the table. It only tightens write access: from
-- now on, writes must go through the analyze-website Edge Function's service-role
-- client, not directly from an authenticated user.
--
-- The existing SELECT policy already matches what this project would otherwise
-- propose (auth.uid() = user_id) and is left untouched.
--
-- INSERT/UPDATE/DELETE policy names are not known here (they were named ad-hoc
-- in the SQL Editor), so they are looked up and dropped dynamically instead of
-- by a hardcoded name.
do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'company_analyses'
      and cmd in ('INSERT', 'UPDATE', 'DELETE')
  loop
    execute format('drop policy if exists %I on public.company_analyses', pol.policyname);
  end loop;
end $$;

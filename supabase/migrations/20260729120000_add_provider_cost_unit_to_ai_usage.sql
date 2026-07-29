-- Externe review vóór afsluiting Fase 3: de eenheid van image_cost/Flux-kosten was nog
-- niet vastgelegd (credits vs. iets anders, zie AGENTS.md). Dit veld legt de eenheid
-- expliciet vast per rij, zodat een toekomstige tweede provider met een ander
-- kostenmodel niet stilzwijgend dezelfde eenheid krijgt aangenomen.

alter table public.ai_usage
  add column if not exists provider_cost_unit text;

-- increment_image_usage krijgt een nieuw, verplicht p_cost_unit-argument (geen default)
-- zodat elke toekomstige caller bewust een eenheid moet meesturen. De 2-argument-versie
-- wordt eerst verwijderd, anders ontstaat een overload i.p.v. een vervanging.
drop function if exists public.increment_image_usage(uuid, numeric);

create function public.increment_image_usage(p_user_id uuid, p_cost numeric, p_cost_unit text)
returns void
language plpgsql
as $function$
begin
  insert into public.ai_usage (user_id, month, image_generated_count, total_cost, provider_cost_unit)
  values (p_user_id, date_trunc('month', now())::date, 1, coalesce(p_cost, 0), p_cost_unit)
  on conflict (user_id, month)
  do update set
    image_generated_count = ai_usage.image_generated_count + 1,
    total_cost = ai_usage.total_cost + coalesce(p_cost, 0),
    provider_cost_unit = p_cost_unit;
end;
$function$;

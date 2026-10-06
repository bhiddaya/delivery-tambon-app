
alter table public.orders add column if not exists delivered_at timestamptz;

create or replace function public.recalc_profile_rating(p_profile_id uuid)
returns void
language sql
as $$
  update public.profiles
  set rating = coalesce((select round(avg(score)::numeric, 1) from public.ratings where to_profile = p_profile_id), rating),
      updated_at = now()
  where id = p_profile_id;
$$;

create or replace view public.driver_rankings as
select p.id, p.full_name, count(r.id) as rating_count, round(avg(r.score)::numeric, 1) as avg_score
from public.profiles p
join public.ratings r on r.to_profile = p.id
where p.role = 'driver'
group by p.id, p.full_name
order by avg_score desc, rating_count desc;

create or replace view public.merchant_rankings as
select m.id as merchant_id, m.name, count(r.id) as rating_count, round(avg(r.score)::numeric, 1) as avg_score
from public.merchants m
join public.profiles p on p.id = m.profile_id
join public.ratings r on r.to_profile = p.id
group by m.id, m.name
order by avg_score desc, rating_count desc;

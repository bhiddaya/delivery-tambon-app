
-- Merchant real GPS location (captured via LINE location share on registration)
alter table public.merchants add column if not exists lat double precision;
alter table public.merchants add column if not exists lng double precision;

-- Order pickup/dropoff real GPS (pickup auto-filled from merchant; dropoff captured via LINE location share at checkout)
alter table public.orders add column if not exists pickup_lat double precision;
alter table public.orders add column if not exists pickup_lng double precision;
alter table public.orders add column if not exists dropoff_lat double precision;
alter table public.orders add column if not exists dropoff_lng double precision;

-- Driver current GPS (captured via LINE location share when going online), plus when it was last updated
alter table public.drivers add column if not exists lat double precision;
alter table public.drivers add column if not exists lng double precision;
alter table public.drivers add column if not exists location_updated_at timestamptz;

comment on column public.merchants.lat is 'Real GPS latitude captured via LINE location-share message during merchant onboarding.';
comment on column public.merchants.lng is 'Real GPS longitude captured via LINE location-share message during merchant onboarding.';
comment on column public.orders.dropoff_lat is 'Real GPS latitude for delivery destination, captured via LINE location-share message at checkout.';
comment on column public.orders.dropoff_lng is 'Real GPS longitude for delivery destination, captured via LINE location-share message at checkout.';
comment on column public.drivers.lat is 'Driver''s last known GPS latitude, captured via LINE location-share message (e.g. when toggling online).';
comment on column public.drivers.lng is 'Driver''s last known GPS longitude, captured via LINE location-share message (e.g. when toggling online).';

-- Haversine great-circle distance in km between two lat/lng points
create or replace function public.haversine_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
as $$
  select 6371 * 2 * asin(
    sqrt(
      sin(radians(lat2 - lat1) / 2) ^ 2
      + cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lng2 - lng1) / 2) ^ 2
    )
  )
  where lat1 is not null and lng1 is not null and lat2 is not null and lng2 is not null;
$$;
comment on function public.haversine_km is 'Straight-line (great-circle) distance in km between two GPS points. Used for delivery fee calc and nearest-driver matching since routing APIs (Longdo RouteService, Google Maps) are not available for this MVP.';

-- Delivery fee from distance: base fee + per-km rate, rounded to nearest baht, with a minimum fee floor
create or replace function public.calc_delivery_fee(distance_km double precision)
returns numeric
language sql
immutable
as $$
  select case
    when distance_km is null then 15::numeric  -- fallback flat fee when no coordinates available yet
    else greatest(15, round((10 + distance_km * 5)::numeric, 0))
  end;
$$;
comment on function public.calc_delivery_fee is 'MVP delivery fee formula: base 10 baht + 5 baht/km (Haversine straight-line), minimum 15 baht. Placeholder rate pending Pittaya''s real pricing decision — easy to tune in one place.';

-- Nearest available, online driver of the right vehicle type in (preferring) the same tambon
create or replace function public.find_nearest_driver(p_order_lat double precision, p_order_lng double precision, p_tambon_id uuid, p_vehicle_type text default null)
returns table (
  profile_id uuid,
  line_user_id text,
  vehicle_type text,
  distance_km double precision
)
language sql
stable
as $$
  select d.profile_id, p.line_user_id, d.vehicle_type::text, public.haversine_km(p_order_lat, p_order_lng, d.lat, d.lng) as distance_km
  from public.drivers d
  join public.profiles p on p.id = d.profile_id
  where d.is_online = true
    and d.lat is not null and d.lng is not null
    and (p_vehicle_type is null or d.vehicle_type::text = p_vehicle_type)
    and (p.tambon_id is null or p_tambon_id is null or p.tambon_id = p_tambon_id)
  order by distance_km asc nulls last
  limit 1;
$$;
comment on function public.find_nearest_driver is 'Returns the single nearest online driver (optionally filtered by vehicle_type), ranked by Haversine distance from the order origin. Used by the dispatch step to notify one specific rider instead of broadcasting to all.';

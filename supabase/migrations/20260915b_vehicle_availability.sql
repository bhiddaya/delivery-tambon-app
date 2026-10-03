-- [D33] กู้จากฐานจริง: supabase_migrations.schema_migrations version 20260915093610 (vehicle_availability)
-- ข้อความ SQL ด้านล่างตรงกับที่รันบนฐานจริงทุกตัวอักษร (md5 158adb3a3b5284645719f4035ab25cf9) — ฐานจริงมีแล้ว ไม่ต้องรันซ้ำ
--
create or replace function public.vehicle_availability()
returns table (
  vehicle_type public.vehicle_type,
  ready   int,
  offline int,
  total   int
)
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select
    d.vehicle_type,
    count(*) filter (where p.approved and d.is_online)::int,
    count(*) filter (where p.approved and not d.is_online)::int,
    count(*) filter (where p.approved)::int
  from public.drivers d
  join public.profiles p on p.id = d.profile_id
  where p.role = 'driver'
    and p.tambon_id is not null
    and p.tambon_id = public.my_tambon_id()
  group by d.vehicle_type;
$$;

revoke all on function public.vehicle_availability() from public, anon;
grant execute on function public.vehicle_availability() to authenticated;

comment on function public.vehicle_availability() is
  'จำนวนคนขับที่อนุมัติแล้วในตำบลของผู้เรียก แยกตามชนิดรถ — คืนเฉพาะตัวเลข ไม่มีตัวตนคนขับ';

-- [D33] กู้จากฐานจริง: supabase_migrations.schema_migrations version 20260926095647 (find_agri_owner_v1)
-- ข้อความ SQL ด้านล่างตรงกับที่รันบนฐานจริงทุกตัวอักษร (md5 8d504b15aaf1d03655af6463c644ce47) — ฐานจริงมีแล้ว ไม่ต้องรันซ้ำ
--
create or replace function public.find_agri_owner(p_order_lat double precision, p_order_lng double precision, p_tambon_id uuid, p_vehicle_type text default null)
returns table(profile_id uuid, line_user_id text, vehicle_type text, distance_km double precision)
language sql stable set search_path = public as $$
  -- เจ้าของรถเกษตร: ไม่ต้องออนไลน์ แต่ต้องอนุมัติแล้วและผูก LINE · ใกล้แปลงก่อน (ไม่มีพิกัดไว้ท้าย)
  select d.profile_id, p.line_user_id, d.vehicle_type::text,
         case when d.lat is not null and d.lng is not null then public.haversine_km(p_order_lat, p_order_lng, d.lat, d.lng) end as distance_km
  from public.drivers d
  join public.profiles p on p.id = d.profile_id
  where p.line_user_id is not null and p.line_user_id not like 'U_driver_sim%' and p.line_user_id not like 'TEST%'
    and coalesce(p.approved, false) = true
    and (p_vehicle_type is null or d.vehicle_type::text = p_vehicle_type)
    and (p.tambon_id is null or p_tambon_id is null or p.tambon_id = p_tambon_id)
  order by distance_km asc nulls last
  limit 1;
$$;
revoke all on function public.find_agri_owner(double precision, double precision, uuid, text) from public, anon, authenticated;

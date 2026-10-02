-- 20261002c_delivery_overview.sql — ระดับ E (ฟังก์ชัน security definer อ่านข้ามสิทธิ์ RLS)
--
-- เพื่อหน้า "ข้อมูล Delivery" บน BAVORN AI (อาจารย์อนุมัติแบบ 2 วันที่ 2 ต.ค. 69:
-- n8n คัดลอกสรุปจาก Delivery ไปเก็บที่ Hermes วันละครั้ง แสดงทั้งชื่อและจำนวน + ขนาดฐานข้อมูล)
--
-- public.delivery_overview() คืน jsonb หนึ่งก้อน:
--   generated_at, db_size_bytes, superadmins (จำนวน)
--   tambons[]: id, name, district, province, slug, is_active,
--     customers {total, with_line}
--     merchants {total, open, with_line, with_gps, with_menu, list[{name, is_open, has_line, has_gps, menu_count}]}
--     drivers   {total, approved, with_line, online, list[{name, approved, has_line, is_online, vehicle_type}]}
--     admins    {total, list[{name}]}       (role admin ที่อนุมัติแล้วของตำบลนั้น + admin_scopes)
--     web_applications_pending, orders_7d
--   tambon_applications_pending[]: id, tambon_name, district, province, applicant_name,
--     merchant_count, driver_count, created_at
-- ไม่นับข้อมูลทดสอบ (is_test). ไม่ส่งเบอร์โทร, LINE user id, PromptPay, ที่อยู่ หรือพิกัด.
--
-- สิทธิ์: เรียกได้เฉพาะ service_role (credential Supabase บวรไทยใน n8n ที่ใช้อยู่แล้ว).
-- ไม่ GRANT ให้ anon/authenticated — ผู้ใช้เว็บแอปเรียกไม่ได้ ไม่มีช่องทางใหม่ให้คนนอกอ่านข้อมูล.
--
-- แผนกู้ (๖.๖): drop function if exists public.delivery_overview();
-- ไม่แตะตารางหรือข้อมูลเดิม. idempotent: create or replace.

create or replace function public.delivery_overview()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with real_profiles as (
    select * from public.profiles where not coalesce(is_test, false)
  ),
  real_merchants as (
    select m.*, p.line_user_id is not null as has_line,
           (select count(*) from public.menu_items mi
             where mi.merchant_id = m.id and not coalesce(mi.is_hidden, false)) as menu_count
      from public.merchants m
      left join public.profiles p on p.id = m.profile_id
     where not coalesce(m.is_test, false)
  ),
  real_drivers as (
    select p.id, p.tambon_id, p.full_name, coalesce(p.approved, false) as approved,
           p.line_user_id is not null as has_line,
           coalesce(d.is_online, false) as is_online, d.vehicle_type
      from real_profiles p
      left join public.drivers d on d.profile_id = p.id
     where p.role = 'driver'
  ),
  tambon_admins as (
    select p.tambon_id, p.id, p.full_name from real_profiles p
     where p.role = 'admin' and coalesce(p.approved, false) and p.tambon_id is not null
    union
    select s.tambon_id, p.id, p.full_name from public.admin_scopes s
      join real_profiles p on p.id = s.profile_id
  )
  select jsonb_build_object(
    'generated_at', now(),
    'db_size_bytes', pg_catalog.pg_database_size(pg_catalog.current_database()),
    'superadmins', (select count(*) from real_profiles where role = 'superadmin'),
    'tambons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'district', t.district, 'province', t.province,
        'slug', t.slug, 'is_active', t.is_active,
        'customers', (select jsonb_build_object(
            'total', count(*), 'with_line', count(*) filter (where line_user_id is not null))
          from real_profiles where role = 'customer' and tambon_id = t.id),
        'merchants', (select jsonb_build_object(
            'total', count(*),
            'open', count(*) filter (where is_open),
            'with_line', count(*) filter (where has_line),
            'with_gps', count(*) filter (where lat is not null and lng is not null),
            'with_menu', count(*) filter (where menu_count > 0),
            'list', coalesce(jsonb_agg(jsonb_build_object(
                'name', name, 'is_open', is_open, 'has_line', has_line,
                'has_gps', lat is not null and lng is not null, 'menu_count', menu_count)
              order by name), '[]'::jsonb))
          from real_merchants where tambon_id = t.id),
        'drivers', (select jsonb_build_object(
            'total', count(*),
            'approved', count(*) filter (where approved),
            'with_line', count(*) filter (where has_line),
            'online', count(*) filter (where is_online),
            'list', coalesce(jsonb_agg(jsonb_build_object(
                'name', full_name, 'approved', approved, 'has_line', has_line,
                'is_online', is_online, 'vehicle_type', vehicle_type)
              order by full_name), '[]'::jsonb))
          from real_drivers where tambon_id = t.id),
        'admins', (select jsonb_build_object(
            'total', count(distinct id),
            'list', coalesce(jsonb_agg(distinct jsonb_build_object('name', full_name)), '[]'::jsonb))
          from tambon_admins where tambon_id = t.id),
        'web_applications_pending', (select count(*) from public.web_applications w
                                      where w.tambon_id = t.id and w.status = 'pending'),
        'orders_7d', (select count(*) from public.orders o
                       where o.tambon_id = t.id and not coalesce(o.is_test, false)
                         and o.created_at > now() - interval '7 days')
      ) order by t.name)
      from public.tambons t), '[]'::jsonb),
    'tambon_applications_pending', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'tambon_name', a.tambon_name, 'district', a.district, 'province', a.province,
        'applicant_name', a.applicant_name, 'merchant_count', a.merchant_count,
        'driver_count', a.driver_count, 'created_at', a.created_at) order by a.created_at)
      from public.tambon_applications a where a.status = 'pending'), '[]'::jsonb)
  );
$$;

comment on function public.delivery_overview() is
  'สรุปรายตำบลสำหรับ BAVORN AI (n8n คัดลอกไป Hermes วันละครั้ง). service_role เท่านั้น. ไม่มีเบอร์/LINE id/พิกัด.';

revoke all on function public.delivery_overview() from public, anon, authenticated;
grant execute on function public.delivery_overview() to service_role;

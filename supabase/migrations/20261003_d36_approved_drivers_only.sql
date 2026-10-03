-- [ระดับ E] D36: ไรเดอร์ที่ยังไม่อนุมัติไม่ได้รับงานจริง + ปิดการเรียก find_nearest_driver จากภายนอก
-- อาจารย์อนุมัติคำสั่ง 1689936e (3 ต.ค. 2569 07:38)
--
-- ปัญหา:
--   1. find_nearest_driver ไม่ตรวจ profiles.approved — ไรเดอร์ที่สมัครแล้วยังไม่อนุมัติ แต่ส่งตำแหน่ง (ออนไลน์)
--      จะได้งานจริงและได้รับข้อความงานทาง LINE
--   2. anon/authenticated เรียก find_nearest_driver ได้ ซึ่งคืน LINE user id ของไรเดอร์ที่ใกล้ที่สุด
--      (n8n เรียกด้วย service_role อยู่แล้ว เว็บแอปไม่ได้เรียก)
-- แก้:
--   - ออเดอร์จริงถึงเฉพาะไรเดอร์ที่อนุมัติแล้วและผูก LINE แล้ว
--   - ออเดอร์ทดสอบ (p_is_test) ยังถึงไรเดอร์ทดสอบได้แม้ยังไม่อนุมัติ (นโยบาย D28 ข้อ 4)
--   - เรียกได้เฉพาะ service_role (เหมือน find_agri_owner)
-- ไม่เปลี่ยน: ชื่อ/พารามิเตอร์/ผลลัพธ์ของฟังก์ชัน (n8n เรียกแบบเดิมได้)
-- ย้อนกลับ: สร้างฟังก์ชันเดิมจาก 20261002_test_data_dispatch.sql แล้ว grant execute ให้ anon, authenticated

create or replace function public.find_nearest_driver(p_order_lat double precision, p_order_lng double precision,
  p_tambon_id uuid, p_vehicle_type text default null, p_is_test boolean default false)
returns table(profile_id uuid, line_user_id text, vehicle_type text, distance_km double precision)
language sql stable set search_path = public as $$
  select d.profile_id, p.line_user_id, d.vehicle_type::text, public.haversine_km(p_order_lat, p_order_lng, d.lat, d.lng) as distance_km
  from public.drivers d
  join public.profiles p on p.id = d.profile_id
  where d.is_online = true
    and d.lat is not null and d.lng is not null
    and p.line_user_id is not null
    and (p_vehicle_type is null or d.vehicle_type::text = p_vehicle_type)
    and (p.tambon_id is null or p_tambon_id is null or p.tambon_id = p_tambon_id)
    -- นโยบาย D28 ข้อ 4: ออเดอร์ทดสอบถึงไรเดอร์ทดสอบเท่านั้น ออเดอร์จริงไม่ถึงไรเดอร์ทดสอบ
    and p.is_test = coalesce(p_is_test, false)
    -- D36: ออเดอร์จริงถึงเฉพาะไรเดอร์ที่แอดมินอนุมัติแล้ว
    and (coalesce(p.approved, false) or coalesce(p_is_test, false))
  order by distance_km asc nulls last
  limit 1;
$$;

revoke all on function public.find_nearest_driver(double precision, double precision, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.find_nearest_driver(double precision, double precision, uuid, text, boolean) to service_role;

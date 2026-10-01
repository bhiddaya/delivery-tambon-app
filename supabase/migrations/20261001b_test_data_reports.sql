-- 20261001b_test_data_reports.sql
--
-- D28 ขั้น 2 (ส่วนระดับ D): ข้อมูลทดสอบไม่ปนกับงานจริง — นโยบายข้อ 4 และ 7 (อนุมัติ 1 ต.ค. 2569)
-- ต้องมี 20261001_test_data_flags.sql (คอลัมน์ is_test) ก่อน
--
--   1) line_targets_for_new_order — ออเดอร์ทดสอบแจ้งเฉพาะไรเดอร์ทดสอบ, ออเดอร์จริงไม่แจ้งไรเดอร์ทดสอบ
--   2) tambon_daily_stats         — ไม่นับออเดอร์ ไรเดอร์ ร้านที่เป็นทดสอบ
--   3) admin_stats_snapshot       — ไม่นับข้อมูลทดสอบ + มีตัวเลขทดสอบแยกใน test_data
--   4) purge_stale_carts(days)     — ล้างตะกร้าที่ไม่ขยับเกิน N วัน (ค่าเริ่มต้น 7) ใช้ได้เฉพาะ service role
--      (ไม่มี pg_cron — ตัวเรียกจะผูกในขั้น 3)
--
-- ใครกระทบ (กฎ ๔.๑):
--   - Edge Function notify เรียก line_targets_for_new_order และ tambon_daily_stats
--     แต่ vault ยังไม่มี notify_secret/notify_url (ตรวจ 1 ต.ค.) → เส้นทางแจ้งงานใหม่ผ่านฐานข้อมูลปิดอยู่;
--     ไรเดอร์ได้รับแจ้งจาก workflow n8n LINE OA v2 — ต้องแยกออเดอร์ทดสอบใน workflow ด้วย (ขั้น 3)
--   - admin_stats_snapshot: สิทธิ์เดิม (รวม anon) ไม่เปลี่ยนในไฟล์นี้ — แยกเป็นงาน D35 (ระดับ E)
--   - ตอนนี้ไม่มีข้อมูลทดสอบที่ยังเปิดอยู่ ตัวเลขจึงเท่าเดิม ยกเว้นยอดรวมไม่นับออเดอร์ #87 #98
--
-- แผนกู้ (กฎ ๖.๖): ฟังก์ชันอ่านอย่างเดียว (ยกเว้น purge_stale_carts) — ถ้าผิด เขียน migration
-- ถัดไปด้วยนิยามเดิม (อยู่ใน pg_get_functiondef ก่อน apply / ประวัติ git) ไม่มีข้อมูลเสียหาย;
-- purge_stale_carts ยังไม่มีใครเรียกจนกว่าจะผูกในขั้น 3
--
-- รันซ้ำได้: create or replace ทั้งหมด; create or replace คงสิทธิ์ (grant) เดิมไว้

-- 1) ผู้รับแจ้งงานใหม่ --------------------------------------------------------
create or replace function public.line_targets_for_new_order(p_order_id bigint)
 returns table(line_user_id text)
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select p.line_user_id
  from public.orders o
  join public.profiles p on p.tambon_id = o.tambon_id
  where o.id = p_order_id
    and p.role = 'driver'
    and coalesce(p.approved, false)
    and p.line_user_id is not null
    -- ไม่ส่งหาคนสั่งเอง เผื่อลูกค้าเป็นไรเดอร์ด้วย
    and p.id <> o.customer_id
    -- นโยบาย D28 ข้อ 4: ออเดอร์ทดสอบถึงไรเดอร์ทดสอบเท่านั้น ออเดอร์จริงไม่ถึงไรเดอร์ทดสอบ
    and p.is_test = o.is_test;
$function$;

-- 2) สรุปรายวันต่อตำบล -------------------------------------------------------
create or replace function public.tambon_daily_stats()
 returns table(tambon_id uuid, tambon_name text, orders_today bigint, delivered_today bigint,
               pending_now bigint, drivers_online bigint, drivers_total bigint,
               merchants_open bigint, waiting_approval bigint)
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  with day_start as (
    select (date_trunc('day', (now() at time zone 'Asia/Bangkok')) at time zone 'Asia/Bangkok') as ts
  )
  select
    t.id,
    t.name,
    count(o.id) filter (where o.created_at >= (select ts from day_start)),
    count(o.id) filter (where o.created_at >= (select ts from day_start)
                          and o.status = 'delivered'),
    count(o.id) filter (where o.status = 'pending'),
    (select count(*) from public.drivers d
       join public.profiles dp on dp.id = d.profile_id
      where dp.tambon_id = t.id and d.is_online and coalesce(dp.approved, false) and not dp.is_test),
    (select count(*) from public.profiles dp
      where dp.tambon_id = t.id and dp.role = 'driver' and coalesce(dp.approved, false) and not dp.is_test),
    (select count(*) from public.merchants m
      where m.tambon_id = t.id and m.is_open and not m.is_test),
    (select count(*) from public.profiles ap
      where ap.tambon_id = t.id and not coalesce(ap.approved, false)
        and ap.role in ('driver', 'merchant') and not ap.is_test)
  from public.tambons t
  -- นโยบาย D28 ข้อ 4: ไม่นับออเดอร์ทดสอบ
  left join public.orders o on o.tambon_id = t.id and not o.is_test
  where t.is_active
  group by t.id, t.name
  order by t.name;
$function$;

-- 3) สถิติแอดมิน ---------------------------------------------------------------
create or replace function public.admin_stats_snapshot()
 returns jsonb
 language sql
 stable
as $function$
  select jsonb_build_object(
    'generated_at', now(),
    'orders_total', (select count(*) from public.orders where not is_test),
    'orders_today', (select count(*) from public.orders where not is_test and created_at >= date_trunc('day', now())),
    'orders_by_status', (select coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb) from (select status, count(*) cnt from public.orders where not is_test group by status) s),
    'orders_by_type', (select coalesce(jsonb_object_agg(type, cnt), '{}'::jsonb) from (select type, count(*) cnt from public.orders where not is_test group by type) t),
    'merchants_total', (select count(*) from public.merchants where not is_test),
    'merchants_pending_approval', (select count(*) from public.profiles where role = 'merchant' and approved = false and not is_test),
    'drivers_total', (select count(*) from public.drivers d where not exists (select 1 from public.profiles p where p.id = d.profile_id and p.is_test)),
    'drivers_pending_approval', (select count(*) from public.profiles where role = 'driver' and approved = false and not is_test),
    'drivers_online_now', (select count(*) from public.drivers d where d.is_online = true and not exists (select 1 from public.profiles p where p.id = d.profile_id and p.is_test)),
    'job_seekers_total', (select count(*) from public.job_seekers),
    'profiles_by_role', (select coalesce(jsonb_object_agg(role, cnt), '{}'::jsonb) from (select role, count(*) cnt from public.profiles where not is_test group by role) p),
    'places_total', (select count(*) from public.places),
    'recent_orders', (
      select coalesce(jsonb_agg(o), '[]'::jsonb) from (
        select id, type, status, price, created_at from public.orders where not is_test order by created_at desc limit 5
      ) o
    ),
    -- นโยบาย D28 ข้อ 4: ข้อมูลทดสอบแสดงแยก ไม่ปนในตัวเลขข้างบน
    'test_data', jsonb_build_object(
      'orders', (select count(*) from public.orders where is_test),
      'profiles', (select count(*) from public.profiles where is_test),
      'merchants', (select count(*) from public.merchants where is_test))
  );
$function$;

-- 4) ล้างตะกร้าค้าง (นโยบายข้อ 7) ---------------------------------------------
create or replace function public.purge_stale_carts(p_days integer default 7)
 returns integer
 language plpgsql
 security definer
 set search_path = ''
as $function$
declare
  v_count integer;
begin
  delete from public.carts
   where updated_at < now() - make_interval(days => greatest(coalesce(p_days, 7), 1));
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function public.purge_stale_carts(integer) from public, anon, authenticated;
grant execute on function public.purge_stale_carts(integer) to service_role;

-- 20260905_notification_helpers.sql
--
-- ตัวช่วยสำหรับระบบแจ้งเตือน (Edge Function `notify` และ n8n เรียกใช้)
--
-- ทั้งสามฟังก์ชันเป็น SECURITY DEFINER เพราะต้องอ่านข้ามตำบล/ข้ามผู้ใช้
-- ซึ่ง RLS ปกติจะปิดกั้นไว้ จึงต้อง revoke จาก anon/authenticated ให้หมด
-- แล้ว grant ให้ service_role อย่างเดียว — มีแต่ Edge Function ที่ถือ
-- secret key เท่านั้นที่เรียกได้ ไม่ใช่เบราว์เซอร์ของผู้ใช้
--
-- search_path ถูกปักหมุดไว้ (public, pg_temp) กันการ hijack ผ่าน schema ปลอม

-- ── 1. ไรเดอร์ที่ควรได้รับแจ้งเตือน เมื่อมีออเดอร์ใหม่ ─────────────────
create or replace function public.line_targets_for_new_order(p_order_id bigint)
returns table (line_user_id text)
language sql stable security definer set search_path = public, pg_temp
as $$
  select p.line_user_id
  from public.orders o
  join public.profiles p on p.tambon_id = o.tambon_id
  where o.id = p_order_id
    and p.role = 'driver'
    and coalesce(p.approved, false)
    and p.line_user_id is not null
    -- ไม่ส่งหาคนสั่งเอง เผื่อลูกค้าเป็นไรเดอร์ด้วย
    and p.id <> o.customer_id;
$$;

-- ── 2. ตัวแทนตำบล / ผู้ดูแล ที่ควรได้รับสรุปรายวัน ───────────────────
-- รวมทั้ง admin ที่ผูกกับตำบลนั้น และผู้ที่มี admin_scopes ครอบตำบลนั้น
-- (tambon_id is null = ขอบเขตทั้งประเทศ เช่น superadmin/ผู้ช่วย)
create or replace function public.line_targets_for_tambon_admin(p_tambon_id uuid)
returns table (line_user_id text)
language sql stable security definer set search_path = public, pg_temp
as $$
  select distinct p.line_user_id
  from public.profiles p
  where p.line_user_id is not null
    and (
      (p.role = 'admin' and coalesce(p.approved, false) and p.tambon_id = p_tambon_id)
      or exists (select 1 from public.admin_scopes s
                  where s.profile_id = p.id
                    and (s.tambon_id = p_tambon_id or s.tambon_id is null))
    );
$$;

-- ── 3. ตัวเลขสรุปรายวัน ต่อหนึ่งตำบล ─────────────────────────────────
-- "วันนี้" นับตามเวลาไทย ไม่ใช่ UTC — ไม่งั้นตัวเลขในสรุปตอนเย็น
-- จะไม่ตรงกับที่ตัวแทนตำบลเห็นบนหน้าจอ ซึ่งทำให้เขาเลิกเชื่อรายงาน
create or replace function public.tambon_daily_stats()
returns table (
  tambon_id uuid,
  tambon_name text,
  orders_today bigint,
  delivered_today bigint,
  pending_now bigint,
  drivers_online bigint,
  drivers_total bigint,
  merchants_open bigint,
  waiting_approval bigint
)
language sql stable security definer set search_path = public, pg_temp
as $$
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
      where dp.tambon_id = t.id and d.is_online and coalesce(dp.approved, false)),
    (select count(*) from public.profiles dp
      where dp.tambon_id = t.id and dp.role = 'driver' and coalesce(dp.approved, false)),
    (select count(*) from public.merchants m
      where m.tambon_id = t.id and m.is_open),
    (select count(*) from public.profiles ap
      where ap.tambon_id = t.id and not coalesce(ap.approved, false)
        and ap.role in ('driver', 'merchant'))
  from public.tambons t
  left join public.orders o on o.tambon_id = t.id
  where t.is_active
  group by t.id, t.name
  order by t.name;
$$;

-- ── สิทธิ์: service_role เท่านั้น ────────────────────────────────────
revoke all on function public.line_targets_for_new_order(bigint) from public, anon, authenticated;
revoke all on function public.line_targets_for_tambon_admin(uuid) from public, anon, authenticated;
revoke all on function public.tambon_daily_stats() from public, anon, authenticated;

grant execute on function public.line_targets_for_new_order(bigint) to service_role;
grant execute on function public.line_targets_for_tambon_admin(uuid) to service_role;
grant execute on function public.tambon_daily_stats() to service_role;

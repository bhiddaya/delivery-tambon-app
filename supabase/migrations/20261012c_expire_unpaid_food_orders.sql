-- ระดับ E (ข้อมูลออเดอร์ / งานตั้งเวลา): ยกเลิกออเดอร์อาหาร/ของแห้งที่ไม่ชำระเงินภายใน 15 นาทีโดยอัตโนมัติ
--
-- อาจารย์สั่ง 12 ต.ค. 2569: "ออเดอร์ที่สั่งแล้วเกิน 15 นาที ให้ยกเลิกอัตโนมัติ" · เลือกใช้เฉพาะอาหาร/ของแห้ง (type = food)
--   งานเรียกรถ / จ้างรถเกษตร / พัสดุ ไม่ถูกยกเลิกอัตโนมัติ (ต้องรอตัวแทนตั้งราคาและนัดวัน)
--
-- ยกเลิกเฉพาะใบที่ "ยังไม่มีเงินเข้าระบบเลย": status = pending, ยังไม่ยืนยันรับเงิน, ยังไม่ส่งสลิป,
--   ยังไม่มีไรเดอร์ และร้านยังไม่รับ — ใบที่ส่งสลิปแล้วรอตัวแทนตรวจ จะไม่ถูกแตะ
-- ล็อกแถวด้วย FOR UPDATE SKIP LOCKED แล้วตรวจเงื่อนไขซ้ำ กันชนกับการส่งสลิปในจังหวะเดียวกัน
-- trigger trg_log_order_status_change เพิ่มแถว order_events ให้แล้ว ฟังก์ชันนี้ใส่เหตุผลในแถวนั้น
--
-- แผนกู้ (ย้อนกลับ):
--   select cron.unschedule('expire-unpaid-food-orders');
--   drop function if exists public.expire_unpaid_food_orders(integer);
--   (ออเดอร์ที่ยกเลิกไปแล้วไม่คืนสถานะอัตโนมัติ — ดูรายการได้จาก order_events.note ขึ้นต้น 'ยกเลิกอัตโนมัติ')
-- IDEMPOTENT: รันซ้ำได้

create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.expire_unpaid_food_orders(p_minutes integer default 15)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ids bigint[];
begin
  with stale as (
    select id from public.orders
     where type = 'food'
       and status = 'pending'
       and customer_paid_at is null
       and slip_submitted_at is null
       and driver_id is null
       and merchant_accepted_at is null
       and created_at < now() - make_interval(mins => greatest(p_minutes, 5))
     for update skip locked
  ), done as (
    update public.orders o set status = 'cancelled'
      from stale where o.id = stale.id
    returning o.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from done;

  if cardinality(v_ids) > 0 then
    update public.order_events e
       set note = format('ยกเลิกอัตโนมัติ: ไม่ชำระเงินภายใน %s นาที', greatest(p_minutes, 5))
     where e.id in (select max(id) from public.order_events
                     where order_id = any(v_ids) and status = 'cancelled' group by order_id);
  end if;
  return cardinality(v_ids);
end;
$function$;

revoke all on function public.expire_unpaid_food_orders(integer) from public, anon, authenticated;

-- ทุก 1 นาที (cron.schedule ชื่อเดิมจะถูกแทนที่ จึงรันซ้ำได้)
select cron.schedule('expire-unpaid-food-orders', '* * * * *', $$select public.expire_unpaid_food_orders(15)$$);

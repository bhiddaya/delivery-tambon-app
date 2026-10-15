-- อาจารย์สั่ง 15 ต.ค. 2569: ออเดอร์ที่ไม่มีไรเดอร์รับภายใน 15 นาที → ยกเลิกอัตโนมัติ
-- (แทนที่ข้อยกเว้นงานเกษตร (agri_service) ของ 13 ต.ค. — คำสั่งล่าสุดของเจ้าของมาก่อน)
--
-- ยกเลิกเมื่อ status = pending, ยังไม่มีไรเดอร์, ไม่ใช่งานจองล่วงหน้า (scheduled_date), เกิน 15 นาที และเป็น
--   1) ออเดอร์ทดสอบ (is_test) ทุกประเภท รวมที่ "จ่ายแล้ว" — ไม่มีเงินจริงเกี่ยวข้อง หรือ
--   2) ออเดอร์จริงประเภทบริการ ride / parcel / agri_service ที่ยังไม่มีการจ่ายเงินหรือส่งสลิป
-- ไม่ยกเลิกเอง: อาหารจริงที่จ่ายเงินแล้ว (ต้องคืนเงิน ตัวแทนตำบลตัดสินใจ — แจ้งเตือนค้างเกิน 24 ชม. เดิมยังทำงาน)
--   และอาหารจริงที่ยังไม่จ่าย ซึ่ง expire_unpaid_food_orders(15) ดูแลอยู่แล้ว
create or replace function public.expire_unassigned_orders(p_minutes integer default 15)
returns integer language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  v_ids bigint[];
begin
  with stale as (
    select id from public.orders
     where status = 'pending' and driver_id is null and scheduled_date is null
       and created_at < now() - make_interval(mins => greatest(p_minutes, 5))
       and (is_test
            or (type in ('ride', 'parcel', 'agri_service') and customer_paid_at is null and slip_submitted_at is null))
     for update skip locked
  ), done as (
    update public.orders o set status = 'cancelled' from stale where o.id = stale.id returning o.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from done;

  if cardinality(v_ids) > 0 then
    update public.order_events e
       set note = format('ยกเลิกอัตโนมัติ: ไม่มีไรเดอร์รับงานภายใน %s นาที', greatest(p_minutes, 5))
     where e.id in (select max(id) from public.order_events
                     where order_id = any(v_ids) and status = 'cancelled' group by order_id);
  end if;
  return cardinality(v_ids);
end;
$function$;
revoke all on function public.expire_unassigned_orders(integer) from public, anon, authenticated;

select cron.unschedule('expire-unassigned-rides');
select cron.schedule('expire-unassigned-orders', '* * * * *', $$select public.expire_unassigned_orders(15)$$);
-- ย้อนกลับ: select cron.unschedule('expire-unassigned-orders');
--          select cron.schedule('expire-unassigned-rides', '* * * * *', $$select public.expire_unassigned_rides(15)$$);

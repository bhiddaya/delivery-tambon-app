-- อาจารย์ยืนยัน 13 ต.ค. 2569: งานเรียกรถ (ride) ที่ไม่มีไรเดอร์รับภายใน 15 นาที → ยกเลิกอัตโนมัติ
-- (ตัวอย่าง #165 ค้าง 28 ชม.) · ไม่รวมงานจองล่วงหน้า (scheduled_date) และงานเกษตร (agri_service)
create or replace function public.expire_unassigned_rides(p_minutes integer default 15)
returns integer language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  v_ids bigint[];
begin
  with stale as (
    select id from public.orders
     where type = 'ride' and status = 'pending' and driver_id is null and scheduled_date is null
       and created_at < now() - make_interval(mins => greatest(p_minutes, 5))
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
revoke all on function public.expire_unassigned_rides(integer) from public, anon, authenticated;

select cron.schedule('expire-unassigned-rides', '* * * * *', $$select public.expire_unassigned_rides(15)$$);
-- ย้อนกลับ: select cron.unschedule('expire-unassigned-rides');

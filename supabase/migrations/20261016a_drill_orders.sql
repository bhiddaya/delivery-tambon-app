-- อาจารย์สั่ง 16 ต.ค. 2569: ปุ่ม "ออเดอร์ซ้อม" เฉพาะเจ้าของ ให้ร้านค้า/ไรเดอร์/ตัวแทนตำบลจริงได้ยินเสียงใน PWA
-- (แทน LINE OA ที่ยังใช้ไม่ได้) โดยไม่นับเป็นออเดอร์จริง
--
-- ออเดอร์ทดสอบ (is_test) คนจริงมองไม่เห็นโดยออกแบบ จึงเพิ่ม is_drill = ออเดอร์ทดสอบที่คนจริงมองเห็นได้
--   is_drill บังคับให้ is_test = true เสมอ จึงไม่ถูกนับยอด/รายงาน/ค่าส่งไรเดอร์ (settlements)/คืนเงิน/LINE หาร้านจริง
--   และระบบยกเลิกอัตโนมัติ 15 นาทีเก็บให้เองเหมือนออเดอร์ทดสอบอื่น (expire_unassigned_orders)
-- ส่วนที่แก้: 1) คอลัมน์ is_drill  2) ฟังก์ชันส่งออเดอร์ซ้อม (เฉพาะ superadmin)  3) agent_dashboard ให้รายการ "ออเดอร์ที่ต้องติดตาม" มีออเดอร์ซ้อม
--   (ตัวเลขสรุปทั้งหมดยังไม่นับออเดอร์ทดสอบ) · หน้าไรเดอร์แก้ที่โค้ดเว็บ

alter table public.orders add column if not exists is_drill boolean not null default false;
alter table public.orders drop constraint if exists orders_drill_is_test;
alter table public.orders add constraint orders_drill_is_test check (not is_drill or is_test);

create or replace function public.admin_send_drill_order(p_kind text default 'food', p_merchant_id uuid default null, p_tambon_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare v_customer uuid; v_tambon uuid; v_merchant uuid; v_id bigint;
begin
  if not public.is_superadmin() then raise exception 'เฉพาะส่วนกลางเท่านั้น' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('food', 'ride') then raise exception 'ชนิดออเดอร์ซ้อมไม่ถูกต้อง' using errcode = '22023'; end if;
  select id into v_customer from public.profiles
   where role = 'customer' and is_test and approved and suspended_at is null order by created_at limit 1;
  if v_customer is null then raise exception 'ไม่มีบัญชีลูกค้าทดสอบ' using errcode = '22023'; end if;
  if p_kind = 'food' then
    -- ร้านจริงเท่านั้น (ร้านทดสอบมีทางทดสอบอยู่แล้ว) · ร้านปิดอยู่ trigger guard_food_shop_hours จะปฏิเสธเอง
    select m.id, m.tambon_id into v_merchant, v_tambon from public.merchants m where m.id = p_merchant_id and not m.is_test;
    if v_merchant is null then raise exception 'ไม่พบร้านจริงนี้' using errcode = '22023'; end if;
  else
    select t.id into v_tambon from public.tambons t where t.id = p_tambon_id;
    if v_tambon is null then raise exception 'ไม่พบตำบลนี้' using errcode = '22023'; end if;
  end if;
  -- อาหาร: ตั้งเป็นจ่ายแล้วเพื่อให้ไรเดอร์เห็นด้วย (ไม่มีเงินจริง) · เรียกรถ: ไรเดอร์เห็นทันทีอยู่แล้ว
  insert into public.orders (type, status, tambon_id, customer_id, merchant_id, pickup, dropoff, note, is_test, is_drill, customer_paid_at)
  values (p_kind::public.order_type, 'pending', v_tambon, v_customer, v_merchant, 'ออเดอร์ซ้อม', 'ออเดอร์ซ้อม — ไม่ต้องทำจริง',
          'ซ้อมเสียงแจ้งเตือน ไม่ต้องเตรียมของหรือส่งจริง', true, true, case when p_kind = 'food' then now() end)
  returning id into v_id;
  if p_kind = 'food' then
    insert into public.order_items (order_id, name, qty, price) values (v_id, 'ออเดอร์ซ้อม (ไม่ต้องทำจริง)', 1, 0);
  end if;
  return jsonb_build_object('order_id', v_id);
end $function$;
revoke all on function public.admin_send_drill_order(text, uuid, uuid) from public, anon;
grant execute on function public.admin_send_drill_order(text, uuid, uuid) to authenticated;

-- agent_dashboard: เหมือนเดิมทุกอย่าง ยกเว้นรายการ orders ที่ใส่ออเดอร์ซ้อมด้วย (not is_test or is_drill) และส่ง is_drill ให้หน้าเว็บติดป้าย
create or replace function public.agent_dashboard(p_tambon_id uuid, p_status text default 'open'::text, p_offset integer default 0)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare result jsonb; day_start timestamptz:=date_trunc('day',now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok';
begin
 if not public.agent_dashboard_access(p_tambon_id) then raise exception 'พื้นที่นี้ไม่มีสิทธิ์ กรุณาเข้าสู่ระบบด้วยรหัสผ่าน' using errcode='42501'; end if;
 if p_status not in ('open','todo','doing','waiting','done') or p_status is null or p_offset is null or p_offset<0 or p_offset>1000000 then raise exception 'ตัวกรองไม่ถูกต้อง' using errcode='22023'; end if;
 select jsonb_build_object(
   'area',jsonb_build_object('id',t.id,'name',t.name,'slug',t.slug,'intake_blocked',t.intake_blocked),
   'counts',jsonb_build_object(
     'today_orders',(select count(*) from public.orders where tambon_id=t.id and not is_test and created_at>=day_start),
     'active_orders',(select count(*) from public.orders where tambon_id=t.id and not is_test and status in ('pending','accepted','in_progress')),
     'delivered_today',(select count(*) from public.orders where tambon_id=t.id and not is_test and status='delivered' and delivered_at>=day_start),
     'awaiting_payment',(select count(*) from public.orders where tambon_id=t.id and not is_test and status not in ('delivered','cancelled') and payment_method<>'เงินสดปลายทาง' and customer_paid_at is null),
     'pending_payouts',(select count(*) from public.settlements where tambon_id=t.id and paid_out_at is null),
     'payout_amount',(select coalesce(sum(amount),0) from public.settlements where tambon_id=t.id and paid_out_at is null),
     'shops',(select count(*) from public.merchants where tambon_id=t.id and not is_test),
     'open_shops',(select count(*) from public.merchants m where m.tambon_id=t.id and not m.is_test and public.shop_is_open(m.id)),
     'online_drivers',(select count(*) from public.profiles p join public.drivers d on d.profile_id=p.id where p.tambon_id=t.id and not p.is_test and p.approved and p.suspended_at is null and d.is_online),
     'pending_members',(select count(*) from public.profiles p where p.tambon_id=t.id and not p.is_test and not p.approved and p.role in ('driver','merchant')),
     'open_messages',(select count(*) from public.messages m where not m.is_test and (m.to_tambon_id=t.id or m.from_tambon_id=t.id) and m.status not in ('closed','resolved'))),
   'tasks',coalesce((select jsonb_agg(to_jsonb(w) order by w.updated_at desc) from (select * from public.agent_work_items where tambon_id=t.id and (case when p_status='open' then status<>'done' else status=p_status end) order by updated_at desc,id limit 100 offset p_offset) w),'[]'::jsonb),
   'task_counts',(select jsonb_build_object('todo',count(*) filter(where status='todo'),'doing',count(*) filter(where status='doing'),'waiting',count(*) filter(where status='waiting'),'done',count(*) filter(where status='done')) from public.agent_work_items where tambon_id=t.id),
   'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from (select id,task_id,action,status,note,created_at from public.agent_work_events where tambon_id=t.id order by created_at desc limit 50) e),'[]'::jsonb),
   'orders',coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at) from (select id,type,status,customer_paid_at is not null as paid,payment_method<>'เงินสดปลายทาง' as needs_payment,merchant_accepted_at is not null as shop_accepted,food_ready_at is not null as food_ready,driver_id is not null as driver_assigned,is_drill,created_at from public.orders where tambon_id=t.id and (not is_test or is_drill) and status in ('pending','accepted','in_progress') order by created_at limit 20) o),'[]'::jsonb)
 ) into result from public.tambons t where t.id=p_tambon_id;
 return result;
end;
$function$;

-- ย้อนกลับ: agent_dashboard เป็นรุ่นก่อนหน้า (เงื่อนไข "and not is_test" ในรายการ orders ไม่มี is_drill) ·
--   drop function public.admin_send_drill_order(text, uuid, uuid) · ลบแถว is_drill ทิ้ง (delete ได้เฉพาะ service role) แล้ว drop constraint/คอลัมน์ is_drill

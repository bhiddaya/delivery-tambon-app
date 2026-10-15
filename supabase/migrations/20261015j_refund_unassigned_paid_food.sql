-- อาจารย์สั่ง 15 ต.ค. 2569: อาหารจริงที่จ่ายเงินแล้ว ถ้าไม่มีไรเดอร์รับเกิน 15 นาที → ยกเลิกและคืนเงิน
--
-- ระบบโอนเงินคืนเองไม่ได้ (ลูกค้าโอนพร้อมเพย์ + สลิป ตัวแทนตำบลเป็นคนยืนยันและถือเงิน) จึงทำให้ครบเท่าที่ระบบทำได้:
--   1) ยกเลิกออเดอร์ + บันทึกยอดที่ต้องคืนใน order_refunds ใน "ครั้งเดียวกัน" (พังก็ไม่ยกเลิก เงินไม่หาย)
--   2) แจ้งลูกค้าและตัวแทนตำบล (+ผู้ดูแลกลาง) ทาง LINE ผ่าน n8n (action refund_due)
--   3) ตัวแทนกด "โอนคืนแล้ว" ที่หน้างานตำบล เมื่อโอนเงินให้ลูกค้าเสร็จ (agent_refund_done)
-- นับ 15 นาทีจากเวลาที่ตัวแทนยืนยันเงิน (customer_paid_at) เพราะการหาไรเดอร์เริ่มตอนนั้น
-- ออเดอร์ทดสอบ (is_test) ไม่มีเงินจริง ยกเลิกเฉยๆ ไม่สร้างรายการคืนเงิน

create table if not exists public.order_refunds (
  order_id bigint primary key references public.orders(id) on delete restrict,
  tambon_id uuid not null references public.tambons(id),
  amount numeric not null check (amount >= 0),
  payment_method text,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'done')),
  created_at timestamptz not null default now(),
  refunded_at timestamptz,
  refunded_by uuid references public.profiles(id),
  note text
);
alter table public.order_refunds enable row level security;
revoke all on table public.order_refunds from anon, authenticated;  -- เข้าถึงผ่านฟังก์ชันด้านล่างเท่านั้น

create or replace function public.expire_unassigned_orders(p_minutes integer default 15)
returns integer language plpgsql security definer
set search_path to 'public', 'vault', 'extensions', 'pg_temp' as $function$
declare
  v_min integer := greatest(p_minutes, 5);
  v_ids bigint[];
  v_refund bigint[];
  v_secret text; v_url text; r bigint;
begin
  with stale as (
    select id from public.orders
     where status = 'pending' and driver_id is null and scheduled_date is null
       and coalesce(customer_paid_at, created_at) < now() - make_interval(mins => v_min)
       and (is_test
            or (type in ('ride', 'parcel', 'agri_service') and customer_paid_at is null and slip_submitted_at is null)
            or (type = 'food' and customer_paid_at is not null))
     for update skip locked
  ), done as (
    update public.orders o set status = 'cancelled' from stale where o.id = stale.id
    returning o.id, o.tambon_id, o.is_test, o.type, o.customer_paid_at, o.payment_method
  ), refunds as (
    insert into public.order_refunds (order_id, tambon_id, amount, payment_method, reason)
    select d.id, d.tambon_id, public.order_customer_total(o2), d.payment_method,
           format('ไม่มีไรเดอร์รับงานภายใน %s นาที', v_min)
      from done d join public.orders o2 on o2.id = d.id
     where not d.is_test and d.type = 'food' and d.customer_paid_at is not null
    on conflict (order_id) do nothing
    returning order_id
  )
  select (select coalesce(array_agg(id), '{}') from done), (select coalesce(array_agg(order_id), '{}') from refunds)
    into v_ids, v_refund;

  if cardinality(v_ids) > 0 then
    update public.order_events e
       set note = format('ยกเลิกอัตโนมัติ: ไม่มีไรเดอร์รับงานภายใน %s นาที', v_min)
     where e.id in (select max(id) from public.order_events
                     where order_id = any(v_ids) and status = 'cancelled' group by order_id);
  end if;

  if cardinality(v_refund) > 0 then
    begin
      select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_secret' limit 1;
      select decrypted_secret into v_url from vault.decrypted_secrets where name = 'notify_url' limit 1;
      if v_secret is not null and v_url is not null then
        foreach r in array v_refund loop
          perform net.http_post(url := v_url,
            headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
            body := jsonb_build_object('action', 'refund_due', 'order_id', r), timeout_milliseconds := 5000);
        end loop;
      end if;
    exception when others then
      raise warning 'refund notice failed: %', sqlerrm;  -- แจ้งเตือนพังไม่กระทบการยกเลิก/บันทึกยอดคืน
    end;
  end if;
  return cardinality(v_ids);
end;
$function$;
revoke all on function public.expire_unassigned_orders(integer) from public, anon, authenticated;

-- ข้อความ LINE แจ้งคืนเงิน (n8n เรียกด้วยสิทธิ์ service_role เหมือน line_new_order_notice)
create or replace function public.line_refund_notice(p_order_id bigint) returns jsonb
language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $function$
declare
  o public.orders%rowtype; r public.order_refunds%rowtype; t public.tambons%rowtype;
  v_line text; v_phone text; v_name text; v_agents jsonb; v_amt text;
  v_base constant text := 'https://delivery-tambon-app-v3.vercel.app';
begin
  select * into r from public.order_refunds where order_id = p_order_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_refund'); end if;
  select * into o from public.orders where id = p_order_id;
  select * into t from public.tambons where id = o.tambon_id;
  select line_user_id, phone, full_name into v_line, v_phone, v_name from public.profiles where id = o.customer_id;
  select coalesce(jsonb_agg(x.line_user_id), '[]'::jsonb) into v_agents from public.line_targets_for_tambon_admin(o.tambon_id) x;
  v_amt := to_char(r.amount, 'FM999,999,990.##');
  return jsonb_build_object(
    'ok', true, 'order_id', o.id, 'is_test', o.is_test,
    'customer_line', v_line,
    'customer_text', '❌ ออเดอร์ #' || o.id || ' ถูกยกเลิก เพราะยังไม่มีไรเดอร์รับงาน' || E'\n'
        || 'ตัวแทนตำบลจะโอนเงิน ' || v_amt || ' บาท คืนให้ครับ ขออภัยในความไม่สะดวก',
    'agent_to', v_agents,
    'agent_text', '💸 ต้องคืนเงินลูกค้า ออเดอร์ #' || o.id || E'\nพื้นที่: ' || coalesce(t.name, '-')
        || E'\nยอดคืน ' || v_amt || ' บาท (' || coalesce(r.payment_method, '-') || ')'
        || E'\nลูกค้า: ' || coalesce(v_name, '-') || coalesce(' โทร ' || v_phone, '')
        || E'\nสาเหตุ: ' || r.reason
        || E'\nโอนคืนแล้วกด "โอนคืนแล้ว" ที่หน้างานตำบล: ' || v_base || '/admin/workspace' || coalesce('?t=' || t.slug, ''));
end $function$;
revoke all on function public.line_refund_notice(bigint) from public, anon, authenticated;
grant execute on function public.line_refund_notice(bigint) to service_role;

-- หน้างานตำบล: รายการที่ต้องคืนเงิน (ค้าง + ที่คืนแล้วใน 7 วัน)
create or replace function public.agent_refunds(p_tambon_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $function$
begin
  if not public.agent_dashboard_access(p_tambon_id) then raise exception 'ไม่มีสิทธิ์ในพื้นที่นี้' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'order_id', r.order_id, 'amount', r.amount, 'payment_method', r.payment_method, 'reason', r.reason,
             'status', r.status, 'created_at', r.created_at, 'refunded_at', r.refunded_at,
             'customer', p.full_name, 'phone', p.phone)
           order by (r.status = 'pending') desc, r.created_at desc)
      from (select * from public.order_refunds
             where tambon_id = p_tambon_id and (status = 'pending' or refunded_at > now() - interval '7 days')
             order by created_at desc limit 50) r
      join public.orders o on o.id = r.order_id
      left join public.profiles p on p.id = o.customer_id), '[]'::jsonb);
end $function$;

create or replace function public.agent_refund_done(p_order_id bigint, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $function$
declare v_tambon uuid;
begin
  select tambon_id into v_tambon from public.order_refunds where order_id = p_order_id;
  if not found then raise exception 'ไม่พบรายการคืนเงิน' using errcode = '22023'; end if;
  if not public.agent_dashboard_access(v_tambon) then raise exception 'ไม่มีสิทธิ์ในพื้นที่นี้' using errcode = '42501'; end if;
  update public.order_refunds
     set status = 'done', refunded_at = coalesce(refunded_at, now()), refunded_by = coalesce(refunded_by, auth.uid()),
         note = left(nullif(btrim(coalesce(p_note, '')), ''), 200)
   where order_id = p_order_id;
  return jsonb_build_object('ok', true);
end $function$;
revoke all on function public.agent_refunds(uuid), public.agent_refund_done(bigint, text) from public, anon;
grant execute on function public.agent_refunds(uuid), public.agent_refund_done(bigint, text) to authenticated;

-- ย้อนกลับ: คืนฟังก์ชัน expire_unassigned_orders เป็นรุ่น 20261015i (ไม่มีส่วนอาหารจ่ายแล้ว)
-- ตาราง order_refunds เก็บไว้ ห้ามลบถ้ามีรายการ pending

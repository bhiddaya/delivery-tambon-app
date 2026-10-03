-- [D33] กู้จากฐานจริง: supabase_migrations.schema_migrations version 20260916005143 (central_account_functions)
-- ข้อความ SQL ด้านล่างตรงกับที่รันบนฐานจริงทุกตัวอักษร (md5 a5169e1ee5a8c085f13190e924874181) — ฐานจริงมีแล้ว ไม่ต้องรันซ้ำ
--
-- ยอดที่ตัวแทนยังไม่ได้โอนออก
create or replace function public.tambon_float(p_tambon uuid)
returns numeric
language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce(sum(amount), 0)
  from public.settlements
  where tambon_id = p_tambon and paid_out_at is null;
$$;

-- กำหนดเวลาโอนออก: รอบตัดของวันนี้ ถ้าเลยแล้วเป็นรอบพรุ่งนี้
create or replace function public.next_payout_due(p_tambon uuid)
returns timestamptz
language sql stable security definer set search_path = public, pg_temp
as $$
  select case
    when (now() at time zone 'Asia/Bangkok')::time < t.payout_cutoff_time
      then (((now() at time zone 'Asia/Bangkok')::date + t.payout_cutoff_time) at time zone 'Asia/Bangkok')
    else (((now() at time zone 'Asia/Bangkok')::date + 1 + t.payout_cutoff_time) at time zone 'Asia/Bangkok')
  end
  from public.tambons t where t.id = p_tambon;
$$;

-- ปรับธงหยุดรับงานตามยอดค้างเทียบเงินค้ำ
create or replace function public.refresh_intake_block(p_tambon uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_float numeric;
  v_deposit numeric;
  v_overdue int;
begin
  select public.tambon_float(p_tambon) into v_float;
  select deposit_amount into v_deposit from public.tambons where id = p_tambon;

  select count(*) into v_overdue
  from public.settlements
  where tambon_id = p_tambon and paid_out_at is null and due_at < now();

  if v_overdue > 0 then
    update public.tambons
      set intake_blocked = true,
          intake_blocked_reason = 'มีรายการค้างจ่ายเลยกำหนดโอนออก ' || v_overdue || ' รายการ'
      where id = p_tambon;
  elsif v_float > v_deposit then
    update public.tambons
      set intake_blocked = true,
          intake_blocked_reason = 'ยอดค้างจ่าย ' || round(v_float) || ' บาท เกินเงินค้ำประกัน ' || round(v_deposit) || ' บาท'
      where id = p_tambon;
  else
    update public.tambons
      set intake_blocked = false, intake_blocked_reason = null
      where id = p_tambon;
  end if;
end;
$$;

-- ลูกค้ายืนยันว่าโอนเข้าบัญชีกลางแล้ว — บันทึกและสร้างรายการค้างจ่ายในคำสั่งเดียว
create or replace function public.confirm_customer_payment(p_order_id bigint, p_slip_url text default null)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  o public.orders%rowtype;
  v_due timestamptz;
  v_driver_amount numeric;
  v_merchant_profile uuid;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'ไม่พบออเดอร์'; end if;
  if o.customer_id <> auth.uid() then raise exception 'ยืนยันได้เฉพาะเจ้าของออเดอร์'; end if;
  if o.customer_paid_at is not null then raise exception 'ออเดอร์นี้ยืนยันการจ่ายไปแล้ว'; end if;
  if o.status <> 'delivered' then raise exception 'ยืนยันการจ่ายได้หลังได้รับของแล้วเท่านั้น'; end if;

  update public.orders
    set customer_paid_at = now(), customer_slip_url = p_slip_url
    where id = p_order_id;

  select public.next_payout_due(o.tambon_id) into v_due;

  -- ส่วนของร้าน = ค่าสินค้า
  if o.merchant_id is not null and coalesce(o.items_subtotal, 0) > 0 then
    select m.profile_id into v_merchant_profile from public.merchants m where m.id = o.merchant_id;
    if v_merchant_profile is not null then
      insert into public.settlements (order_id, tambon_id, payee_profile_id, payee_role, amount, due_at)
      values (o.id, o.tambon_id, v_merchant_profile, 'merchant', o.items_subtotal, v_due)
      on conflict (order_id, payee_profile_id) do nothing;
    end if;
  end if;

  -- ส่วนของไรเดอร์ = ค่าส่ง ยกเว้นงานเรียกรถที่ค่าโดยสารอยู่ในช่อง price
  v_driver_amount := case when o.type = 'ride' then coalesce(o.price, 0) else coalesce(o.delivery_fee, 0) end;
  if o.driver_id is not null and v_driver_amount > 0 then
    insert into public.settlements (order_id, tambon_id, payee_profile_id, payee_role, amount, due_at)
    values (o.id, o.tambon_id, o.driver_id, 'driver', v_driver_amount, v_due)
    on conflict (order_id, payee_profile_id) do nothing;
  end if;

  perform public.refresh_intake_block(o.tambon_id);
end;
$$;

-- ตัวแทนโอนออกแล้ว
create or replace function public.mark_payout_sent(p_settlement_id bigint, p_slip_url text default null)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare s public.settlements%rowtype;
begin
  select * into s from public.settlements where id = p_settlement_id for update;
  if not found then raise exception 'ไม่พบรายการ'; end if;
  if not public.can_admin_tambon(s.tambon_id) then raise exception 'ทำได้เฉพาะตัวแทนของตำบลนี้'; end if;
  if s.paid_out_at is not null then raise exception 'รายการนี้โอนออกไปแล้ว'; end if;

  update public.settlements
    set paid_out_at = now(), paid_out_slip_url = p_slip_url
    where id = p_settlement_id;

  perform public.refresh_intake_block(s.tambon_id);
end;
$$;

-- ผู้รับยืนยันว่าได้เงินแล้ว
create or replace function public.confirm_payout_received(p_settlement_id bigint)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare s public.settlements%rowtype;
begin
  select * into s from public.settlements where id = p_settlement_id for update;
  if not found then raise exception 'ไม่พบรายการ'; end if;
  if s.payee_profile_id <> auth.uid() then raise exception 'ยืนยันได้เฉพาะเจ้าของรายการ'; end if;
  if s.paid_out_at is null then raise exception 'ตัวแทนยังไม่ได้โอนออก'; end if;

  update public.settlements set confirmed_at = now() where id = p_settlement_id;
end;
$$;

-- กันการสั่งงานเมื่อตำบลถูกระงับ — กันที่ฐาน ไม่ใช่ที่หน้าเว็บ
create or replace function public.block_orders_when_intake_blocked()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_blocked boolean; v_reason text;
begin
  select intake_blocked, intake_blocked_reason into v_blocked, v_reason
  from public.tambons where id = new.tambon_id;
  if coalesce(v_blocked, false) then
    raise exception 'ตำบลนี้หยุดรับออเดอร์ชั่วคราว: %', coalesce(v_reason, 'ยอดค้างจ่ายเกินกำหนด');
  end if;
  return new;
end;
$$;

drop trigger if exists orders_block_when_intake_blocked on public.orders;
create trigger orders_block_when_intake_blocked
  before insert on public.orders
  for each row execute function public.block_orders_when_intake_blocked();

revoke all on function public.tambon_float(uuid) from public, anon;
revoke all on function public.next_payout_due(uuid) from public, anon;
revoke all on function public.refresh_intake_block(uuid) from public, anon;
revoke all on function public.confirm_customer_payment(bigint, text) from public, anon;
revoke all on function public.mark_payout_sent(bigint, text) from public, anon;
revoke all on function public.confirm_payout_received(bigint) from public, anon;

grant execute on function public.tambon_float(uuid) to authenticated;
grant execute on function public.confirm_customer_payment(bigint, text) to authenticated;
grant execute on function public.mark_payout_sent(bigint, text) to authenticated;
grant execute on function public.confirm_payout_received(bigint) to authenticated;

-- 20261003d_customer_slip_verification.sql
--
-- D41 ขั้น 2 (ระดับ F — เงิน): ลูกค้าโอนเข้าพร้อมเพย์ของตำบลแล้วส่งสลิป ตัวแทนตำบลตรวจยอดเข้าบัญชีเอง
-- อาจารย์อนุมัติ "D41 ขั้น 2 แบบตัวแทนตรวจเอง" 3 ต.ค. 2569
--
-- ปัญหาเดิม: confirm_customer_payment ให้ลูกค้ากดยืนยันเองแล้วสร้างยอดค้างโอน (settlements) ทันที
-- ไม่มีใครเทียบกับเงินที่เข้าบัญชีจริง ลูกค้าที่ไม่ได้โอนก็ทำให้ตัวแทนต้องจ่ายร้าน/ไรเดอร์ได้
--
-- ใหม่:
--   1. submit_payment_slip   ลูกค้า (เว็บ) หรือ n8n (LINE, service_role) แนบสลิปของออเดอร์ที่ส่งถึงแล้ว
--   2. verify_customer_payment  ตัวแทนของตำบลนั้นยืนยันว่าเงินเข้าแล้ว → สร้าง settlements (ที่เดียวที่สร้าง)
--   3. reject_customer_payment  ตัวแทนแจ้งว่าไม่พบยอด พร้อมเหตุผล ลูกค้าส่งสลิปใหม่ได้
--   4. confirm_customer_payment  ถอนสิทธิ์จาก authenticated (ไม่มีผู้เรียกในเว็บ/n8n ตรวจ 3 ต.ค.)
--   5. orders_guard_payment_fields  ผู้ใช้แก้ช่องการชำระเงินตรงไม่ได้ (เดิม RLS ให้ลูกค้าแก้ทุกช่องของออเดอร์ตัวเอง)
--   6. bucket payment-slips แบบไม่เปิดสาธารณะ: ลูกค้าเห็นของตัวเอง ตัวแทนเห็นของตำบลตัวเอง
--
-- ตรรกะสร้าง settlements ยกมาจาก 20261001c ทุกบรรทัด (รวมเงื่อนไข is_test) เปลี่ยนแค่ผู้เรียก
-- แผนกู้: migration ถัดไป grant execute confirm_customer_payment คืนให้ authenticated
--   และ drop trigger orders_guard_payment_fields — ไม่มีข้อมูลเสียหาย คอลัมน์ใหม่เป็น null ได้ทั้งหมด
-- รันซ้ำได้

-- ── 1. คอลัมน์ ──────────────────────────────────────────────────────────
alter table public.orders
  add column if not exists slip_submitted_at timestamptz,
  add column if not exists payment_verified_by uuid references public.profiles(id),
  add column if not exists payment_rejected_at timestamptz,
  add column if not exists payment_reject_reason text;

comment on column public.orders.customer_slip_url is 'path ใน bucket payment-slips (<tambon_id>/<order_id>-<เวลา>.<ext>)';
comment on column public.orders.customer_paid_at is 'เวลาที่ตัวแทนตำบลยืนยันว่าเงินเข้าบัญชีตำบลแล้ว (D41 ขั้น 2)';

-- ยอดที่ลูกค้าโอน = ผลรวม settlements ที่จะเกิด (ค่าสินค้าให้ร้าน + ส่วนของไรเดอร์)
create or replace function public.order_customer_total(p_order public.orders)
returns numeric
language sql immutable set search_path = ''
as $$
  select coalesce(p_order.items_subtotal, 0)
       + case when p_order.type = 'ride' then coalesce(p_order.price, 0)
              else coalesce(p_order.delivery_fee, 0) end;
$$;

-- ── 2. กันผู้ใช้แก้ช่องการชำระเงินตรง ─────────────────────────────────
-- ไม่ใช่ security definer: current_user คือผู้เรียกจริง
-- ฟังก์ชัน security definer ด้านล่างทำงานเป็น postgres และ n8n ใช้ service_role จึงผ่านได้
create or replace function public.orders_guard_payment_fields()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.customer_paid_at := null;
    new.customer_slip_url := null;
    new.slip_submitted_at := null;
    new.payment_verified_by := null;
    new.payment_rejected_at := null;
    new.payment_reject_reason := null;
    new.payment_ref := null;
    return new;
  end if;
  if new.customer_paid_at      is distinct from old.customer_paid_at
  or new.customer_slip_url     is distinct from old.customer_slip_url
  or new.slip_submitted_at     is distinct from old.slip_submitted_at
  or new.payment_verified_by   is distinct from old.payment_verified_by
  or new.payment_rejected_at   is distinct from old.payment_rejected_at
  or new.payment_reject_reason is distinct from old.payment_reject_reason
  or new.payment_ref           is distinct from old.payment_ref then
    raise exception 'ข้อมูลการชำระเงินแก้ได้ผ่านการส่งสลิปและการตรวจของตัวแทนตำบลเท่านั้น'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ใช้ do-block แทน drop ... if exists เพื่อไม่ให้มี NOTICE (เครื่องมือ MCP ค้างเมื่อได้ NOTICE)
do $$
begin
  if exists (select 1 from pg_trigger where tgname = 'orders_guard_payment_fields'
              and tgrelid = 'public.orders'::regclass) then
    drop trigger orders_guard_payment_fields on public.orders;
  end if;
end $$;
create trigger orders_guard_payment_fields
  before insert or update on public.orders
  for each row execute function public.orders_guard_payment_fields();

-- ── 3. ลูกค้าหรือ n8n แนบสลิป ─────────────────────────────────────────
create or replace function public.submit_payment_slip(p_order_id bigint, p_slip_path text)
returns void
language plpgsql security definer set search_path = 'public', 'pg_temp'
as $$
declare
  o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'ไม่พบออเดอร์'; end if;

  if auth.uid() is not null then
    if o.customer_id <> auth.uid() then raise exception 'ส่งสลิปได้เฉพาะเจ้าของออเดอร์'; end if;
  elsif coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'ไม่มีสิทธิ์ส่งสลิป';
  end if;

  if o.status <> 'delivered' then raise exception 'ส่งสลิปได้หลังได้รับของแล้วเท่านั้น'; end if;
  if o.customer_paid_at is not null then raise exception 'ออเดอร์นี้ตัวแทนยืนยันรับเงินแล้ว'; end if;
  if p_slip_path is null
     or p_slip_path not like o.tambon_id::text || '/' || o.id::text || '-%'
     or p_slip_path like '%..%' then
    raise exception 'ที่อยู่ไฟล์สลิปไม่ถูกต้อง';
  end if;

  update public.orders
     set customer_slip_url = p_slip_path,
         slip_submitted_at = now(),
         payment_rejected_at = null,
         payment_reject_reason = null,
         payment_method = 'พร้อมเพย์'
   where id = p_order_id;
end;
$$;

-- ── 4. ตัวแทนยืนยันรับเงิน → สร้าง settlements ─────────────────────────
create or replace function public.verify_customer_payment(p_order_id bigint)
returns void
language plpgsql security definer set search_path = 'public', 'pg_temp'
as $$
declare
  o public.orders%rowtype;
  v_due timestamptz;
  v_driver_amount numeric;
  v_merchant_profile uuid;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'ไม่พบออเดอร์'; end if;
  if not public.can_admin_tambon(o.tambon_id) then raise exception 'ยืนยันได้เฉพาะตัวแทนของตำบลนี้'; end if;
  -- ตัวแทนที่สั่งเองต้องให้ส่วนกลางยืนยัน กันยืนยันเงินของตัวเอง
  if o.customer_id = auth.uid() and not public.is_superadmin() then
    raise exception 'ออเดอร์ของท่านเองต้องให้ส่วนกลางยืนยัน';
  end if;
  if o.customer_paid_at is not null then raise exception 'ออเดอร์นี้ยืนยันรับเงินไปแล้ว'; end if;
  if o.slip_submitted_at is null then raise exception 'ลูกค้ายังไม่ได้ส่งสลิป'; end if;
  if o.status <> 'delivered' then raise exception 'ยืนยันได้หลังส่งของถึงแล้วเท่านั้น'; end if;

  update public.orders
     set customer_paid_at = now(),
         payment_verified_by = auth.uid(),
         payment_rejected_at = null,
         payment_reject_reason = null
   where id = p_order_id;

  -- ยกมาจาก confirm_customer_payment (20261001c): ออเดอร์ทดสอบไม่สร้างยอดค้างจ่าย
  if not o.is_test then
    select public.next_payout_due(o.tambon_id) into v_due;

    if o.merchant_id is not null and coalesce(o.items_subtotal, 0) > 0 then
      select m.profile_id into v_merchant_profile from public.merchants m where m.id = o.merchant_id;
      if v_merchant_profile is not null then
        insert into public.settlements (order_id, tambon_id, payee_profile_id, payee_role, amount, due_at)
        values (o.id, o.tambon_id, v_merchant_profile, 'merchant', o.items_subtotal, v_due)
        on conflict (order_id, payee_profile_id) do nothing;
      end if;
    end if;

    v_driver_amount := case when o.type = 'ride' then coalesce(o.price, 0) else coalesce(o.delivery_fee, 0) end;
    if o.driver_id is not null and v_driver_amount > 0 then
      insert into public.settlements (order_id, tambon_id, payee_profile_id, payee_role, amount, due_at)
      values (o.id, o.tambon_id, o.driver_id, 'driver', v_driver_amount, v_due)
      on conflict (order_id, payee_profile_id) do nothing;
    end if;
  end if;

  perform public.refresh_intake_block(o.tambon_id);
end;
$$;

-- ── 5. ตัวแทนแจ้งไม่พบยอด ─────────────────────────────────────────────
create or replace function public.reject_customer_payment(p_order_id bigint, p_reason text)
returns void
language plpgsql security definer set search_path = 'public', 'pg_temp'
as $$
declare
  o public.orders%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'ไม่พบออเดอร์'; end if;
  if not public.can_admin_tambon(o.tambon_id) then raise exception 'ทำได้เฉพาะตัวแทนของตำบลนี้'; end if;
  if o.customer_paid_at is not null then raise exception 'ออเดอร์นี้ยืนยันรับเงินไปแล้ว'; end if;
  if o.slip_submitted_at is null then raise exception 'ลูกค้ายังไม่ได้ส่งสลิป'; end if;
  if char_length(v_reason) < 3 then raise exception 'กรุณาระบุเหตุผลให้ลูกค้าทราบ'; end if;

  update public.orders
     set payment_rejected_at = now(),
         payment_reject_reason = left(v_reason, 300)
   where id = p_order_id;
end;
$$;

-- ── 6. สิทธิ์ ─────────────────────────────────────────────────────────
revoke all on function public.submit_payment_slip(bigint, text) from public, anon;
grant execute on function public.submit_payment_slip(bigint, text) to authenticated, service_role;

revoke all on function public.verify_customer_payment(bigint) from public, anon;
grant execute on function public.verify_customer_payment(bigint) to authenticated;

revoke all on function public.reject_customer_payment(bigint, text) from public, anon;
grant execute on function public.reject_customer_payment(bigint, text) to authenticated;

-- ลูกค้ายืนยันเองไม่ได้อีกต่อไป (ไม่มีผู้เรียกในเว็บหรือ n8n ตรวจ 3 ต.ค. 69)
revoke execute on function public.confirm_customer_payment(bigint, text) from authenticated;

-- ── 7. ที่เก็บสลิป (ไม่เปิดสาธารณะ) ───────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-slips', 'payment-slips', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- เลขออเดอร์จากชื่อไฟล์ <order_id>-<เวลา>.<ext> · ชื่อผิดรูปแบบคืน null (ไม่ throw ใน policy)
create or replace function public.slip_order_id(p_name text)
returns bigint
language sql immutable set search_path = ''
as $$
  select nullif(substring(storage.filename(p_name) from '^([0-9]{1,18})-'), '')::bigint;
$$;

do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
              and policyname = 'payment_slips_read') then
    drop policy payment_slips_read on storage.objects;
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
              and policyname = 'payment_slips_customer_insert') then
    drop policy payment_slips_customer_insert on storage.objects;
  end if;
end $$;
create policy payment_slips_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-slips'
    and exists (
      select 1 from public.orders o
       where o.id = public.slip_order_id(name)
         and (storage.foldername(name))[1] = o.tambon_id::text
         and (o.customer_id = auth.uid() or public.can_admin_tambon(o.tambon_id))
    )
  );

create policy payment_slips_customer_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-slips'
    and exists (
      select 1 from public.orders o
       where o.id = public.slip_order_id(name)
         and (storage.foldername(name))[1] = o.tambon_id::text
         and o.customer_id = auth.uid()
         and o.status = 'delivered'
         and o.customer_paid_at is null
    )
  );
-- ไม่มี policy update/delete: ผู้ใช้แก้หรือลบสลิปที่ส่งแล้วไม่ได้ (ส่งใหม่เป็นไฟล์ใหม่)

-- 20261003g_tambon_agent_actions.sql — ระดับ E (สิทธิ์) + ระดับ F (อัตราส่วนแบ่งเงิน)
--
-- หลังบ้านตัวแทนตำบล ระยะ 2 (D47) — อาจารย์อนุมัติ 3 ต.ค. 2569 ตามข้อตกลง:
--   ตัวแทนอนุมัติ/ระงับร้านและไรเดอร์เองได้ · เห็นเบอร์ลูกค้าได้ · ได้ส่วนแบ่งจากค่าคอมและค่าขนส่ง
--   อัตราแล้วแต่ข้อตกลงของแต่ละตำบล ส่วนกลางเป็นผู้กรอก ค่าเริ่มต้น 0% · ส่วนกลางยกเลิกตัวแทนได้เสมอ
--
-- 1. tambons.agent_share_commission_pct / agent_share_delivery_pct (0–100, ค่าเริ่มต้น 0)
--    แก้ได้เฉพาะส่วนกลาง (ขยาย tambons_central_fields_guard) ผ่าน admin_set_agent_share
--    ระยะนี้เก็บอัตราและแสดงประมาณการเท่านั้น ยังไม่หักจาก settlements
-- 2. profiles.suspended_at / suspended_reason / suspended_by — ระงับ = approved false + เหตุผล
--    เพื่อให้ทุกจุดที่ตรวจ approved (RLS รับงาน, แจ้งงาน LINE, รายการร้าน) หยุดทันทีโดยไม่ต้องแก้ทีละจุด
--    profiles_suspension_guard: ผู้ใช้แก้ช่องระงับตรงไม่ได้ และอนุมัติคนที่ถูกระงับซ้ำไม่ได้ (ต้องกดคืนสิทธิ์)
--    merchants_suspension_guard: ร้านของคนที่ถูกระงับเปิดร้านเองไม่ได้
-- 3. ฟังก์ชันของตัวแทน (security definer ตรวจ can_admin_tambon ทุกครั้ง + บันทึก admin_actions):
--    admin_assign_order, admin_cancel_order, admin_set_suspended, admin_set_shop_open
--    และของส่วนกลาง: admin_set_agent_share
--
-- แผนกู้: drop ฟังก์ชันและ trigger ใหม่, คืน tambons_central_fields_guard ตาม 20261003b
--   คอลัมน์ใหม่ปล่อยไว้ได้ (null/0 ไม่กระทบระบบเดิม) · ไม่มีข้อมูลเดิมถูกแก้
-- ไม่ใช้ drop ... if exists (MCP ค้างเมื่อได้ NOTICE) · รันซ้ำได้

-- ── 1. อัตราส่วนแบ่งตัวแทน ─────────────────────────────────────────────
alter table public.tambons
  add column if not exists agent_share_commission_pct numeric(5,2) not null default 0,
  add column if not exists agent_share_delivery_pct numeric(5,2) not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tambons_agent_share_range') then
    alter table public.tambons add constraint tambons_agent_share_range check (
      agent_share_commission_pct between 0 and 100 and agent_share_delivery_pct between 0 and 100);
  end if;
end $$;

comment on column public.tambons.agent_share_commission_pct is
  'ส่วนแบ่งตัวแทนตำบล % ของค่าคอมจากค่าสินค้า — ส่วนกลางกรอกตามข้อตกลงตำบล (D47)';
comment on column public.tambons.agent_share_delivery_pct is
  'ส่วนแบ่งตัวแทนตำบล % ของส่วนแพลตฟอร์มจากค่าขนส่ง — ส่วนกลางกรอกตามข้อตกลงตำบล (D47)';

create or replace function public.tambons_central_fields_guard()
returns trigger
language plpgsql set search_path to 'public', 'pg_temp'
as $function$
begin
  -- security invoker (ตั้งใจ): current_user = authenticated/anon เมื่อแก้ผ่าน API ของผู้ใช้
  -- ส่วนการแก้จากฟังก์ชัน security definer ของระบบ current_user คือเจ้าของฟังก์ชัน จึงไม่ถูกตรวจ
  if current_user in ('authenticated', 'anon') and not public.has_national_scope() then
    if new.is_active is distinct from old.is_active
       or new.opened_at is distinct from old.opened_at
       or new.deposit_amount is distinct from old.deposit_amount
       or new.slug is distinct from old.slug
       or new.agent_share_commission_pct is distinct from old.agent_share_commission_pct
       or new.agent_share_delivery_pct is distinct from old.agent_share_delivery_pct then
      raise exception 'เปิด/ปิดบริการ เงินค้ำประกัน ลิงก์ตำบล และส่วนแบ่งตัวแทน แก้ได้เฉพาะส่วนกลาง' using errcode = '42501';
    end if;
  end if;
  return new;
end $function$;

-- ── 2. ระงับสิทธิ์ ───────────────────────────────────────────────────
alter table public.profiles
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_reason text,
  add column if not exists suspended_by uuid references public.profiles(id) on delete set null;

create or replace function public.profiles_suspension_guard()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.suspended_at := null;
    new.suspended_reason := null;
    new.suspended_by := null;
    return new;
  end if;
  if new.suspended_at is distinct from old.suspended_at
  or new.suspended_reason is distinct from old.suspended_reason
  or new.suspended_by is distinct from old.suspended_by then
    raise exception 'การระงับ/คืนสิทธิ์ทำผ่านปุ่มในหลังบ้านตัวแทนเท่านั้น' using errcode = '42501';
  end if;
  if old.suspended_at is not null and coalesce(new.approved, false) and not coalesce(old.approved, false) then
    raise exception 'บัญชีนี้ถูกระงับอยู่ — ใช้ปุ่ม คืนสิทธิ์ แทนการอนุมัติ' using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
begin
  if exists (select 1 from pg_trigger where tgname = 'profiles_suspension_guard'
              and tgrelid = 'public.profiles'::regclass) then
    drop trigger profiles_suspension_guard on public.profiles;
  end if;
end $$;
create trigger profiles_suspension_guard
  before insert or update on public.profiles
  for each row execute function public.profiles_suspension_guard();

create or replace function public.merchants_suspension_guard()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.is_open and (tg_op = 'INSERT' or not old.is_open)
     and exists (select 1 from public.profiles p where p.id = new.profile_id and p.suspended_at is not null) then
    raise exception 'ร้านนี้ถูกระงับอยู่ เปิดร้านไม่ได้จนกว่าตัวแทนตำบลจะคืนสิทธิ์' using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
begin
  if exists (select 1 from pg_trigger where tgname = 'merchants_suspension_guard'
              and tgrelid = 'public.merchants'::regclass) then
    drop trigger merchants_suspension_guard on public.merchants;
  end if;
end $$;
create trigger merchants_suspension_guard
  before insert or update on public.merchants
  for each row execute function public.merchants_suspension_guard();

-- ── 3. ฟังก์ชันของตัวแทนตำบล ──────────────────────────────────────────
-- มอบงานที่ยังไม่มีคนรับให้ไรเดอร์ในตำบลเดียวกันที่อนุมัติแล้ว
create or replace function public.admin_assign_order(p_order_id bigint, p_driver_id uuid)
returns void
language plpgsql security definer set search_path = 'public', 'pg_temp'
as $$
declare
  o public.orders%rowtype;
  d public.profiles%rowtype;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'ไม่พบออเดอร์'; end if;
  if not public.can_admin_tambon(o.tambon_id) then raise exception 'ทำได้เฉพาะตัวแทนของตำบลนี้'; end if;
  if o.status <> 'pending' or o.driver_id is not null then raise exception 'ออเดอร์นี้มีคนรับแล้วหรือไม่อยู่ในสถานะรอคนรับ'; end if;
  select * into d from public.profiles where id = p_driver_id;
  if not found or d.role <> 'driver' or not coalesce(d.approved, false) or d.suspended_at is not null
     or d.tambon_id is distinct from o.tambon_id then
    raise exception 'เลือกได้เฉพาะไรเดอร์ที่อนุมัติแล้วของตำบลนี้';
  end if;

  update public.orders set driver_id = p_driver_id, status = 'accepted' where id = p_order_id;
  insert into public.admin_actions (actor_id, target_id, action, note)
  values (auth.uid(), p_driver_id, 'order.assign', format('มอบออเดอร์ #%s ให้ %s', o.id, d.full_name));
end;
$$;

-- ยกเลิกออเดอร์พร้อมเหตุผล (ไม่ลบ ตาม D28) · ออเดอร์ที่ยืนยันรับเงินแล้วยกเลิกไม่ได้
create or replace function public.admin_cancel_order(p_order_id bigint, p_reason text)
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
  if o.status = 'cancelled' then raise exception 'ออเดอร์นี้ยกเลิกไปแล้ว'; end if;
  if o.customer_paid_at is not null then raise exception 'ออเดอร์นี้ยืนยันรับเงินแล้ว ยกเลิกไม่ได้ — ติดต่อส่วนกลาง'; end if;
  if char_length(v_reason) < 5 then raise exception 'กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร'; end if;

  update public.orders set status = 'cancelled' where id = p_order_id;
  -- trg_log_order_status_change เพิ่มแถว order_events แล้ว ใส่เหตุผลให้แถวนั้น
  update public.order_events set note = left('ยกเลิกโดยตัวแทนตำบล: ' || v_reason, 500)
   where id = (select max(id) from public.order_events where order_id = p_order_id and status = 'cancelled');
  insert into public.admin_actions (actor_id, target_id, action, note)
  values (auth.uid(), o.customer_id, 'order.cancel', left(format('ยกเลิกออเดอร์ #%s เหตุผล: %s', o.id, v_reason), 1000));
end;
$$;

-- ระงับ/คืนสิทธิ์ร้านหรือไรเดอร์ในตำบลที่ดูแล · ตัวแทนด้วยกันและตัวเองทำไม่ได้ (ส่วนกลางถอดตัวแทนผ่าน tambon_admin_revoke)
create or replace function public.admin_set_suspended(p_profile_id uuid, p_suspend boolean, p_reason text)
returns void
language plpgsql security definer set search_path = 'public', 'pg_temp'
as $$
declare
  t public.profiles%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into t from public.profiles where id = p_profile_id for update;
  if not found then raise exception 'ไม่พบบัญชี'; end if;
  if not public.can_admin_tambon(t.tambon_id) then raise exception 'ทำได้เฉพาะตัวแทนของตำบลนี้'; end if;
  if t.id = auth.uid() then raise exception 'ระงับบัญชีตัวเองไม่ได้'; end if;
  if t.role not in ('driver', 'merchant') then raise exception 'ระงับได้เฉพาะร้านค้าและไรเดอร์'; end if;
  if exists (select 1 from public.admin_scopes s where s.profile_id = t.id) and not public.is_superadmin() then
    raise exception 'บัญชีนี้เป็นตัวแทนตำบล ต้องให้ส่วนกลางจัดการ';
  end if;

  if p_suspend then
    if t.suspended_at is not null then raise exception 'บัญชีนี้ถูกระงับอยู่แล้ว'; end if;
    if char_length(v_reason) < 5 then raise exception 'กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร'; end if;
    update public.profiles
       set approved = false, suspended_at = now(), suspended_reason = left(v_reason, 300), suspended_by = auth.uid()
     where id = t.id;
    update public.drivers set is_online = false where profile_id = t.id;
    update public.merchants set is_open = false where profile_id = t.id;
    insert into public.admin_actions (actor_id, target_id, action, note)
    values (auth.uid(), t.id, 'profile.suspend', left(format('ระงับ %s (%s) เหตุผล: %s', t.full_name, t.role, v_reason), 1000));
  else
    if t.suspended_at is null then raise exception 'บัญชีนี้ไม่ได้ถูกระงับ'; end if;
    update public.profiles
       set approved = true, suspended_at = null, suspended_reason = null, suspended_by = null
     where id = t.id;
    insert into public.admin_actions (actor_id, target_id, action, note)
    values (auth.uid(), t.id, 'profile.restore',
            left(format('คืนสิทธิ์ %s (%s)%s', t.full_name, t.role,
                        case when v_reason <> '' then ' หมายเหตุ: ' || v_reason else '' end), 1000));
  end if;
end;
$$;

-- เปิด/ปิดร้านชั่วคราวโดยตัวแทน (ร้านที่ถูกระงับเปิดไม่ได้)
create or replace function public.admin_set_shop_open(p_merchant_id uuid, p_open boolean)
returns void
language plpgsql security definer set search_path = 'public', 'pg_temp'
as $$
declare
  m public.merchants%rowtype;
begin
  select * into m from public.merchants where id = p_merchant_id for update;
  if not found then raise exception 'ไม่พบร้าน'; end if;
  if not public.can_admin_tambon(m.tambon_id) then raise exception 'ทำได้เฉพาะตัวแทนของตำบลนี้'; end if;
  if p_open and exists (select 1 from public.profiles p where p.id = m.profile_id and p.suspended_at is not null) then
    raise exception 'ร้านนี้ถูกระงับอยู่ ต้องคืนสิทธิ์ก่อน';
  end if;
  if m.is_open = p_open then return; end if;
  update public.merchants set is_open = p_open where id = m.id;
  insert into public.admin_actions (actor_id, target_id, action, note)
  values (auth.uid(), m.profile_id, case when p_open then 'shop.open' else 'shop.close' end,
          format('%s ร้าน %s', case when p_open then 'เปิด' else 'ปิดชั่วคราว' end, m.name));
end;
$$;

-- ส่วนกลางกรอกอัตราส่วนแบ่งตัวแทนตามข้อตกลงของตำบล
create or replace function public.admin_set_agent_share(p_tambon_id uuid, p_commission_pct numeric, p_delivery_pct numeric)
returns void
language plpgsql security definer set search_path = 'public', 'pg_temp'
as $$
declare
  t public.tambons%rowtype;
begin
  if not public.is_superadmin() then raise exception 'ส่วนแบ่งตัวแทนกำหนดได้เฉพาะส่วนกลาง'; end if;
  if p_commission_pct is null or p_delivery_pct is null
     or p_commission_pct not between 0 and 100 or p_delivery_pct not between 0 and 100 then
    raise exception 'อัตราต้องอยู่ระหว่าง 0 ถึง 100';
  end if;
  select * into t from public.tambons where id = p_tambon_id for update;
  if not found then raise exception 'ไม่พบตำบล'; end if;
  update public.tambons
     set agent_share_commission_pct = round(p_commission_pct, 2),
         agent_share_delivery_pct = round(p_delivery_pct, 2)
   where id = t.id;
  insert into public.admin_actions (actor_id, target_id, action, note)
  values (auth.uid(), null, 'tambon.agent_share',
          format('ตั้งส่วนแบ่งตัวแทน %s: ค่าคอม %s%% (เดิม %s%%) · ค่าขนส่ง %s%% (เดิม %s%%)', t.name,
                 round(p_commission_pct, 2), t.agent_share_commission_pct,
                 round(p_delivery_pct, 2), t.agent_share_delivery_pct));
end;
$$;

-- ── 4. สิทธิ์ ─────────────────────────────────────────────────────────
revoke all on function public.admin_assign_order(bigint, uuid) from public, anon;
grant execute on function public.admin_assign_order(bigint, uuid) to authenticated;
revoke all on function public.admin_cancel_order(bigint, text) from public, anon;
grant execute on function public.admin_cancel_order(bigint, text) to authenticated;
revoke all on function public.admin_set_suspended(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_suspended(uuid, boolean, text) to authenticated;
revoke all on function public.admin_set_shop_open(uuid, boolean) from public, anon;
grant execute on function public.admin_set_shop_open(uuid, boolean) to authenticated;
revoke all on function public.admin_set_agent_share(uuid, numeric, numeric) from public, anon;
grant execute on function public.admin_set_agent_share(uuid, numeric, numeric) to authenticated;
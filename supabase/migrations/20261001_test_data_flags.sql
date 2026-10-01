-- 20261001_test_data_flags.sql
--
-- D28 ขั้น 1: ทำให้นโยบายข้อมูลทดสอบ (อนุมัติ 1 ต.ค. 2569) เป็นกฎที่ฐานข้อมูลบังคับเอง (กฎ ๘.๖)
-- ระดับ F (แตะแถวข้อมูลจริง + เปลี่ยนพฤติกรรมการลบ) — อาจารย์อนุมัติในบทสนทนา 1 ต.ค. 2569
--
-- ทำอะไร:
--   1) is_test (default false) ใน orders, profiles, merchants
--      complaints มี is_test อยู่แล้ว ใช้ชื่อเดียวกันเพื่อไม่ให้มีสองชื่อ
--   2) ออเดอร์ใหม่จากลูกค้าหรือร้านที่เป็นทดสอบ ถูกติดป้าย is_test อัตโนมัติ (นโยบายข้อ 2)
--   3) ติดป้ายออเดอร์ #87 และ #98 ว่าเป็นทดสอบ (อาจารย์ยืนยัน 1 ต.ค. — ทั้งสองยกเลิกแล้ว)
--   4) ห้ามลบออเดอร์ถาวร (นโยบายข้อ 5) — ต้องตั้งค่าในรายการเดียวกันครบสามค่า:
--        set local delivery.allow_order_delete = 'on';
--        set local delivery.delete_actor = '<profiles.id ของ superadmin ที่อนุมัติ>';
--        set local delivery.delete_reason = '<เหตุผลอย่างน้อย 10 ตัวอักษร>';
--      ทุกการลบถูกบันทึกใน admin_actions (action = 'order.delete')
--      หมายเหตุ: ก่อนหน้านี้ออเดอร์ประมาณ 96 รายการถูกลบโดยไม่มีบันทึก (ข้อมูลทดสอบทั้งหมด ตามที่อาจารย์ยืนยัน)
--
-- ใครกระทบ (กฎ ๔.๑):
--   - ไม่มีฟังก์ชันในฐานข้อมูลและไม่มีโค้ดใน src/ ที่ลบออเดอร์ (ตรวจ 1 ต.ค.)
--   - RLS ไม่มี policy DELETE บน orders อยู่แล้ว ผู้ใช้ผ่าน API ลบไม่ได้แต่เดิม
--   - ผู้ที่ถือ service key (n8n) ถ้ามี node ที่ลบออเดอร์ จะ error หลังจากนี้
--     — ข้อมูลไม่หาย และ workflow แจ้งเตือนเมื่อพังจะส่งอีเมล
--   - ยังไม่มีบัญชีหรือร้านทดสอบ จึงยังไม่มีออเดอร์ใหม่ถูกติดป้ายจนกว่าจะสร้าง
--   - ยังไม่ได้แยกการแจ้ง LINE ของออเดอร์ทดสอบ (นโยบายข้อ 4) — ต้องทำก่อนสร้างบัญชีทดสอบ (ขั้น 2/3)
--
-- ข้อจำกัด: trigger ไม่ทำงานกับ TRUNCATE; anon/authenticated ยังมีสิทธิ์ TRUNCATE บน orders
-- (API เรียก TRUNCATE ไม่ได้) — การเพิกถอนสิทธิ์เป็นงานระดับ E แยกต่างหาก
--
-- แผนกู้ (กฎ ๖.๖ — แก้เดินหน้า ไม่ถอย):
--   - ถ้ากันลบไปขวางงานที่จำเป็น: ใช้การตั้งค่าสามค่าข้างบนเฉพาะรายการนั้น
--     หรือ migration ถัดไปปรับเงื่อนไขของ public.orders_guard_delete()
--   - คอลัมน์ is_test ห้ามลบ (กฎ ๖.๔/๖.๖.๔) — ถ้าไม่ใช้แล้วให้เลิกอ่านก่อน
--   - ติดป้าย #87/#98 ผิด: update orders set is_test = false where id in (87, 98);
--
-- รันซ้ำได้ (กฎ ๖.๒): add column if not exists, create or replace, drop trigger if exists

-- 1) ป้ายข้อมูลทดสอบ -------------------------------------------------------
alter table public.orders    add column if not exists is_test boolean not null default false;
alter table public.profiles  add column if not exists is_test boolean not null default false;
alter table public.merchants add column if not exists is_test boolean not null default false;

comment on column public.orders.is_test is
  'ข้อมูลทดสอบ (นโยบาย D28) — ไม่นับในรายงาน สรุป อันดับ ยอดชำระ; ติดอัตโนมัติเมื่อลูกค้าหรือร้านเป็นทดสอบ';
comment on column public.profiles.is_test is 'บัญชีทดสอบ (นโยบาย D28) — ออเดอร์ของบัญชีนี้เป็นทดสอบเสมอ';
comment on column public.merchants.is_test is 'ร้านทดสอบ (นโยบาย D28) — ออเดอร์ของร้านนี้เป็นทดสอบเสมอ';

-- 2) ติดป้ายออเดอร์ใหม่อัตโนมัติ ---------------------------------------------
create or replace function public.orders_mark_test()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.is_test and (
       exists (select 1 from public.profiles p  where p.id = new.customer_id and p.is_test)
    or exists (select 1 from public.merchants m where m.id = new.merchant_id and m.is_test)) then
    new.is_test := true;
  end if;
  return new;
end;
$$;

revoke all on function public.orders_mark_test() from public, anon, authenticated;

drop trigger if exists orders_mark_test on public.orders;
create trigger orders_mark_test
  before insert on public.orders
  for each row execute function public.orders_mark_test();

-- 3) ออเดอร์ทดสอบที่มีอยู่ (อาจารย์ยืนยัน 1 ต.ค. 2569) ------------------------
update public.orders set is_test = true where id in (87, 98) and not is_test;

-- 4) ห้ามลบออเดอร์ถาวร + บันทึกทุกการลบ --------------------------------------
create or replace function public.orders_guard_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  uuid;
  v_reason text := btrim(coalesce(current_setting('delivery.delete_reason', true), ''));
begin
  if coalesce(current_setting('delivery.allow_order_delete', true), '') <> 'on' then
    raise exception 'ห้ามลบออเดอร์ถาวร (นโยบาย D28 ข้อ 5) — ให้ยกเลิกพร้อมเหตุผลแทน หรือขออนุมัติเจ้าของ'
      using errcode = '42501';
  end if;

  v_actor := coalesce(auth.uid(),
                      nullif(current_setting('delivery.delete_actor', true), '')::uuid);
  if v_actor is null or not exists (
       select 1 from public.profiles p where p.id = v_actor and p.role = 'superadmin') then
    raise exception 'การลบออเดอร์ต้องระบุผู้อนุมัติที่เป็น superadmin (delivery.delete_actor)'
      using errcode = '42501';
  end if;
  if char_length(v_reason) < 10 then
    raise exception 'การลบออเดอร์ต้องมีเหตุผลอย่างน้อย 10 ตัวอักษร (delivery.delete_reason)'
      using errcode = '22023';
  end if;

  insert into public.admin_actions (actor_id, target_id, action, note)
  values (v_actor, null, 'order.delete',
          left(format('order #%s (%s, %s, is_test=%s) — %s',
                      old.id, old.type, old.status, old.is_test, v_reason), 1000));
  return old;
end;
$$;

revoke all on function public.orders_guard_delete() from public, anon, authenticated;

drop trigger if exists orders_guard_delete on public.orders;
create trigger orders_guard_delete
  before delete on public.orders
  for each row execute function public.orders_guard_delete();

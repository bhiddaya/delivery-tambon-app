-- [D33] กู้จากฐานจริง: supabase_migrations.schema_migrations version 20260916013100 (payment_reference_numbers)
-- ข้อความ SQL ด้านล่างตรงกับที่รันบนฐานจริงทุกตัวอักษร (md5 9e614878468208e06908640ba86c3aa8) — ฐานจริงมีแล้ว ไม่ต้องรันซ้ำ
--
-- เลขอ้างอิงต่อออเดอร์ — ทำตั้งแต่ตอนนี้เพื่อให้กระทบยอดย้อนหลังได้เสมอ
--
-- ทำไมต้องมี: เงินที่โอนเข้าบัญชีกลางไม่มีอะไรบอกว่าเป็นของออเดอร์ไหน
-- ถ้าไม่มีเลขอ้างอิง พอมีสองคนโอนยอดเท่ากันในนาทีเดียวกัน ก็แยกไม่ออกตลอดกาล
-- และวันหน้าที่ต่อ API ธนาคาร (QR พร้อมเลขอ้างอิง + webhook) จะใช้เลขนี้จับคู่ได้ทันที
--
-- รูปแบบ: BT + base36 ของ id เติมศูนย์ให้ครบ 6 หลัก + อักขระตรวจสอบ  เช่น BT00001XK
-- ตั้งใจใช้เฉพาะ A-Z 0-9 ตัวใหญ่ ความยาวคงที่ 9 ตัว เพราะช่องอ้างอิงของธนาคารไทย
-- ส่วนใหญ่รับเฉพาะตัวอักษรและตัวเลข ไม่รับขีดหรือช่องว่าง

create or replace function public.base36(p bigint)
returns text language plpgsql immutable
as $$
declare
  d text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  n bigint := p;
  result text := '';
begin
  if n is null then return null; end if;
  if n = 0 then return '0'; end if;
  while n > 0 loop
    result := substr(d, (n % 36)::int + 1, 1) || result;
    n := n / 36;
  end loop;
  return result;
end $$;

create or replace function public.make_ref(p_prefix text, p_id bigint)
returns text language plpgsql immutable
as $$
declare
  d text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  body text;
  acc int := 0;
  i int;
begin
  if p_id is null then return null; end if;
  body := lpad(public.base36(p_id), 6, '0');
  -- ถ่วงน้ำหนักตามตำแหน่ง จับได้ทั้งพิมพ์ผิดตัวเดียวและสลับตำแหน่งสองตัวติดกัน
  for i in 1..length(body) loop
    acc := acc + (position(substr(body, i, 1) in d) - 1) * i;
  end loop;
  return p_prefix || body || substr(d, (acc % 36) + 1, 1);
end $$;

alter table public.orders
  add column if not exists payment_ref text
  generated always as (public.make_ref('BT', id)) stored;

alter table public.settlements
  add column if not exists payout_ref text
  generated always as (public.make_ref('PO', id)) stored;

create unique index if not exists orders_payment_ref_idx on public.orders (payment_ref);
create unique index if not exists settlements_payout_ref_idx on public.settlements (payout_ref);

comment on column public.orders.payment_ref is
  'เลขอ้างอิงให้ลูกค้าใส่ตอนโอน และให้ธนาคารส่งกลับมาใน webhook เพื่อจับคู่ออเดอร์';
comment on column public.settlements.payout_ref is
  'เลขอ้างอิงของการโอนออกให้ร้าน/ไรเดอร์ ใช้กระทบยอดขาจ่าย';

-- ทดสอบระบบผู้แนะนำบนฐานทดลองในเครื่อง (ห้ามรันบนฐานจริง: สร้างตารางจำลองของ Supabase)
-- รัน: bash supabase/tests/run-referral-test.sh
\set ON_ERROR_STOP on

-- ── จำลองส่วนที่ migration ใช้จาก Supabase/ฐานเดิม ─────────────────────────
create role anon; create role authenticated;
create schema auth;
create table auth.users (id uuid primary key, raw_app_meta_data jsonb not null default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table public.tambons (id uuid primary key, name text, agent_share_commission_pct numeric not null default 0);
create table public.profiles (id uuid primary key, role text not null default 'customer', full_name text,
  approved boolean not null default true, line_user_id text unique, suspended_at timestamptz, promptpay_id text, tambon_id uuid);
create table public.merchants (id uuid primary key, profile_id uuid references public.profiles(id), tambon_id uuid);
create table public.orders (id bigint primary key, status text, tambon_id uuid, customer_id uuid, merchant_id uuid,
  items_subtotal numeric, is_test boolean not null default false, is_drill boolean not null default false,
  customer_paid_at timestamptz, delivered_at timestamptz, updated_at timestamptz not null default now());
create table public.order_refunds (order_id bigint primary key);
create function public.is_superadmin() returns boolean language sql stable as
  $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin') $$;
create function public.is_admin() returns boolean language sql stable as
  $$ select exists (select 1 from public.profiles where id = auth.uid() and role in ('superadmin', 'admin')) $$;
create function public.can_admin_tambon(t uuid) returns boolean language sql stable as
  $$ select exists (select 1 from public.profiles where id = auth.uid() and (role = 'superadmin' or (role = 'admin' and tambon_id = t))) $$;

\i /mig/20261021000000_referral_revenue_share.sql

-- ── ข้อมูลทดสอบ ───────────────────────────────────────────────────────
-- A = ผู้แนะนำ, S = ร้านที่ A ชวน, B = ผู้ซื้อที่ A ชวน, D = ผู้ซื้อไม่มีผู้แนะนำ, C = ผู้แนะนำอีกคน, Z = ส่วนกลาง
insert into public.tambons values ('00000000-0000-0000-0000-0000000000a1', 'ตำบลทดสอบ', 10);
insert into public.tambons values ('00000000-0000-0000-0000-0000000000a2', 'ตำบลไม่ตั้งอัตรา', 0);
insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a', '{"line_user_id":"Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'),
  ('00000000-0000-0000-0000-00000000000b', '{"line_user_id":"Ubbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}'),
  ('00000000-0000-0000-0000-00000000000c', '{"line_user_id":"Ucccccccccccccccccccccccccccccccc"}'),
  ('00000000-0000-0000-0000-00000000000d', '{"line_user_id":"Udddddddddddddddddddddddddddddddd"}'),
  ('00000000-0000-0000-0000-000000000005', '{"line_user_id":"U55555555555555555555555555555555"}');
insert into public.profiles (id, role, full_name, line_user_id) values
  ('00000000-0000-0000-0000-00000000000a', 'customer', 'ผู้แนะนำ A', 'Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
  ('00000000-0000-0000-0000-00000000000c', 'customer', 'ผู้แนะนำ C', 'Ucccccccccccccccccccccccccccccccc'),
  ('00000000-0000-0000-0000-00000000000d', 'customer', 'ลูกค้า D', 'Udddddddddddddddddddddddddddddddd'),
  ('00000000-0000-0000-0000-0000000000ff', 'superadmin', 'ส่วนกลาง Z', null),
  ('00000000-0000-0000-0000-0000000000ee', 'admin', 'ตัวแทนตำบลอื่น', null);
update public.profiles set tambon_id = '00000000-0000-0000-0000-0000000000a2' where id = '00000000-0000-0000-0000-0000000000ee';

create function pg_temp.as_user(u text) returns void language sql as $$ select set_config('test.uid', u, false) $$;
create function pg_temp.check(ok boolean, what text) returns void language plpgsql as
  $$ begin if not ok then raise exception 'ไม่ผ่าน: %', what; end if; raise notice 'ผ่าน: %', what; end $$;

-- ผู้แนะนำขอรหัส
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select (public.referral_me()->>'code') as code_a \gset
select pg_temp.check(:'code_a' ~ '^[A-HJ-NP-Z2-9]{6}$', 'A ได้รหัสแนะนำ 6 ตัว');
select pg_temp.check(public.referral_me()->>'code' = :'code_a', 'ขอซ้ำได้รหัสเดิม');
select pg_temp.check(public.referral_claim(:'code_a')->>'error' = 'self', 'ชวนตัวเองไม่ได้');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select (public.referral_me()->>'code') as code_c \gset

-- คนใหม่ (ยังไม่มีโปรไฟล์) เปิดลิงก์ของ A
select pg_temp.as_user('00000000-0000-0000-0000-000000000005');
select pg_temp.check(public.referral_claim('ZZZZZZ')->>'error' = 'bad_code', 'รหัสผิดถูกปฏิเสธ');
select pg_temp.check((public.referral_claim(lower(:'code_a'))->>'ok')::boolean, 'S ผูกกับ A ได้ (ตัวพิมพ์เล็กก็ได้)');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check((public.referral_claim(:'code_a')->>'ok')::boolean, 'B ผูกกับ A ได้');
select pg_temp.check(public.referral_claim(:'code_c')->>'same' = 'false', 'B เปลี่ยนเป็น C ไม่ได้ (ผู้แนะนำคนแรกเท่านั้น)');
select pg_temp.check((select referrer_id from public.referral_claims where line_user_id = 'Ubbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')
  = '00000000-0000-0000-0000-00000000000a', 'B ยังผูกกับ A');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.check(public.referral_claim(:'code_a')->>'error' = 'already_member', 'สมาชิกเดิม (D) ผูกย้อนหลังไม่ได้');

-- สมัครและอนุมัติ: ร้าน S รออนุมัติก่อน · B ลูกค้าอนุมัติทันที
insert into public.profiles (id, role, full_name, approved, line_user_id) values
  ('00000000-0000-0000-0000-000000000005', 'merchant', 'ร้าน S', false, 'U55555555555555555555555555555555'),
  ('00000000-0000-0000-0000-00000000000b', 'customer', 'ลูกค้า B', true, 'Ubbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
select pg_temp.check((select starts_at is null from public.referral_claims where line_user_id = 'U55555555555555555555555555555555'),
  'ร้านยังไม่อนุมัติ ยังไม่เริ่มนับสิทธิ์');
update public.profiles set approved = true where id = '00000000-0000-0000-0000-000000000005';
select pg_temp.check((select expires_at = starts_at + interval '12 months' from public.referral_claims
  where line_user_id = 'U55555555555555555555555555555555'), 'อนุมัติแล้วได้สิทธิ์ 12 เดือน');
-- ย้อนวันอนุมัติ 2 เดือนเพื่อให้ออเดอร์เดือนก่อนอยู่ในสิทธิ์
update public.referral_claims set starts_at = starts_at - interval '2 months', expires_at = expires_at - interval '2 months';
insert into public.merchants values ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000a1');

-- อัตรา: GP 10% · หัก admin 10 + ระบบ 10 + โอน/ภาษี 5 + สำรอง 5 + ตัวแทน 10 (ของตำบล) = 40% → สุทธิ 60% (ตรงตัวอย่างในกติกา)
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$ begin perform public.referral_set_rates('00000000-0000-0000-0000-0000000000a1', 10, 10, 10, 5, 5, '2026-01-01');
  raise exception 'ไม่ผ่าน: ผู้ใช้ทั่วไปตั้งอัตราได้'; exception when raise_exception then
  if sqlerrm like 'ไม่ผ่าน%' then raise; end if; raise notice 'ผ่าน: ผู้ใช้ทั่วไปตั้งอัตราไม่ได้'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ff');
select public.referral_set_rates('00000000-0000-0000-0000-0000000000a1', 10, 10, 10, 5, 5, '2026-01-01');

-- ตัวแทนตำบลตั้งอัตรา GP ของตำบลตัวเองได้ (แต่ละตำบลตัดสินใจเอง) แต่ตั้งของตำบลอื่นไม่ได้
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ee');
select public.referral_set_gp('00000000-0000-0000-0000-0000000000a2', 8);
select pg_temp.check((select gp_pct = 8 and starts_on is null from public.referral_tambon_rates
  where tambon_id = '00000000-0000-0000-0000-0000000000a2'), 'ตัวแทนตั้ง GP ตำบลตัวเองได้ (ยังไม่มีวันเริ่ม = ยังไม่คำนวณ)');
do $$ begin perform public.referral_set_gp('00000000-0000-0000-0000-0000000000a1', 50);
  raise exception 'ไม่ผ่าน: ตัวแทนตั้ง GP ตำบลอื่นได้'; exception when raise_exception then
  if sqlerrm like 'ไม่ผ่าน%' then raise; end if; raise notice 'ผ่าน: ตัวแทนตั้ง GP ตำบลอื่นไม่ได้'; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ff');

-- ออเดอร์เดือนก่อน (เวลาไทย กลางเดือน)
select (date_trunc('month', now() at time zone 'Asia/Bangkok') - interval '1 month')::date as last_month \gset
create function pg_temp.mid() returns timestamptz language sql as
  $$ select ((date_trunc('month', now() at time zone 'Asia/Bangkok') - interval '1 month' + interval '14 days')::timestamp at time zone 'Asia/Bangkok') $$;
insert into public.orders (id, status, tambon_id, customer_id, merchant_id, items_subtotal, is_test, customer_paid_at, delivered_at) values
  (1, 'delivered', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a5', 10000, false, pg_temp.mid(), pg_temp.mid()),
  (2, 'delivered', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a5', 9999, true, pg_temp.mid(), pg_temp.mid()),
  (3, 'delivered', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a5', 9999, false, pg_temp.mid(), pg_temp.mid()),
  (4, 'delivered', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-0000000000a5', 500, false, pg_temp.mid(), pg_temp.mid()),
  (5, 'cancelled', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a5', 9999, false, pg_temp.mid(), pg_temp.mid()),
  (6, 'delivered', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a5', 9999, false, null, pg_temp.mid());
insert into public.order_refunds values (3);

-- ออเดอร์ 1: GP 1,000 → สุทธิ 600 → ผู้แนะนำผู้ขาย 180 + ผู้แนะนำผู้ซื้อ 240 (A ทั้งคู่)
-- ออเดอร์ 4: GP 50 → สุทธิ 30 → ผู้แนะนำผู้ขาย 9 · ผู้ซื้อ D ไม่มีผู้แนะนำ → 12 ไป บวร
-- ไม่นับ: 2 ทดสอบ, 3 คืนเงิน, 5 ยกเลิก, 6 ยังไม่จ่าย
select public.referral_month_report(:'last_month') as rep \gset
select pg_temp.check((:'rep'::jsonb->'tambons'->0->>'orders')::int = 2, 'นับ 2 ออเดอร์ (ไม่นับทดสอบ/คืนเงิน/ยกเลิก/ยังไม่จ่าย)');
select pg_temp.check((:'rep'::jsonb->'tambons'->0->>'net_gp')::numeric = 630, 'ค่า GP สุทธิ 630');
select pg_temp.check((:'rep'::jsonb->'tambons'->0->>'seller_share')::numeric = 189, 'ผู้แนะนำผู้ขาย 189');
select pg_temp.check((:'rep'::jsonb->'tambons'->0->>'buyer_share')::numeric = 240, 'ผู้แนะนำผู้ซื้อ 240');
select pg_temp.check((:'rep'::jsonb->'tambons'->0->>'bavorn')::numeric = 201, 'บวร 201 (30% + ส่วนที่ไม่มีผู้แนะนำ)');
select pg_temp.check(:'rep'::jsonb->>'closed' = 'false', 'ยังไม่ปิดยอด = ประมาณการ');

-- ตัวแทนตำบลอื่นไม่เห็นตำบลนี้ · ผู้ใช้ทั่วไปดูรายงานไม่ได้
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ee');
select pg_temp.check(jsonb_array_length(public.referral_month_report(:'last_month')->'tambons') = 0, 'ตัวแทนตำบลอื่นไม่เห็นยอดตำบลนี้');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$ begin perform public.referral_month_report(current_date); raise exception 'ไม่ผ่าน: ลูกค้าดูรายงานได้';
  exception when raise_exception then if sqlerrm like 'ไม่ผ่าน%' then raise; end if; raise notice 'ผ่าน: ลูกค้าดูรายงานไม่ได้'; end $$;

-- ปิดยอด: A สะสม 429 ≥ 100 → มีรายการจ่าย
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ff');
do $$ begin perform public.referral_close_month(current_date); raise exception 'ไม่ผ่าน: ปิดเดือนปัจจุบันได้';
  exception when raise_exception then if sqlerrm like 'ไม่ผ่าน%' then raise; end if; raise notice 'ผ่าน: ปิดเดือนที่ยังไม่จบไม่ได้'; end $$;
select pg_temp.check((public.referral_close_month(:'last_month')->>'earnings')::int = 3, 'ปิดยอดได้ 3 รายการส่วนแบ่ง');
do $$ begin perform public.referral_close_month((date_trunc('month', now() at time zone 'Asia/Bangkok') - interval '1 month')::date);
  raise exception 'ไม่ผ่าน: ปิดซ้ำได้';
  exception when raise_exception then if sqlerrm like 'ไม่ผ่าน%' then raise; end if; raise notice 'ผ่าน: ปิดเดือนเดิมซ้ำไม่ได้'; end $$;
select pg_temp.check((select amount from public.referral_payouts where referrer_id = '00000000-0000-0000-0000-00000000000a') = 429,
  'A ถึงเกณฑ์จ่าย 429 บาท');
select pg_temp.check(public.referral_month_report(:'last_month')->>'closed' = 'true', 'รายงานแสดงว่าปิดแล้ว');

-- ผู้แนะนำเห็นยอดตัวเอง
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check((public.referral_me()->>'earned')::numeric = 429 and (public.referral_me()->>'payable')::numeric = 429
  and (public.referral_me()->>'referred')::int = 2, 'A เห็นยอด 429 และคนที่ชวน 2 คน');

-- ยอดต่ำกว่า 100 ยกไปเดือนถัดไป: C ไม่มียอด → ไม่มีรายการจ่าย
select pg_temp.check(not exists (select 1 from public.referral_payouts where referrer_id = '00000000-0000-0000-0000-00000000000c'),
  'ยอดไม่ถึง 100 ไม่มีรายการจ่าย');

-- หมดสิทธิ์ 12 เดือน: ออเดอร์หลังหมดสิทธิ์ไม่นับให้ผู้แนะนำ
update public.referral_claims set expires_at = now() - interval '1 day';
insert into public.orders (id, status, tambon_id, customer_id, merchant_id, items_subtotal, customer_paid_at, delivered_at) values
  (7, 'delivered', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000a5', 10000, now(), now());
select pg_temp.check((public.referral_me()->>'this_month')::numeric = 0, 'หมดสิทธิ์แล้วไม่ได้ส่วนแบ่ง');

-- ตัดสิทธิ์: รายการที่ยังไม่จ่ายถูกระงับ
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ff');
select public.referral_ban('00000000-0000-0000-0000-00000000000a', 'ทดสอบทุจริต');
select pg_temp.check(not exists (select 1 from public.referral_payouts where referrer_id = '00000000-0000-0000-0000-00000000000a'),
  'ตัดสิทธิ์แล้วระงับยอดที่ยังไม่จ่าย');
select pg_temp.as_user('00000000-0000-0000-0000-000000000099');
select pg_temp.check(public.referral_claim(:'code_a')->>'error' = 'line_login_required', 'ต้องล็อกอิน LINE ก่อน');

-- ตารางอ่านตรงไม่ได้ (RLS ไม่มี policy)
grant usage on schema public to authenticated; grant select on public.referral_earnings to authenticated;
set role authenticated;
select pg_temp.check((select count(*) from public.referral_earnings) = 0, 'อ่านตาราง referral_earnings ตรงไม่ได้');
reset role;
\echo 'ทดสอบระบบผู้แนะนำผ่านทั้งหมด'

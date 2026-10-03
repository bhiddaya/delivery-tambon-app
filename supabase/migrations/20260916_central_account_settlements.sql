-- [D33] กู้จากฐานจริง: supabase_migrations.schema_migrations version 20260916005042 (central_account_settlements)
-- ข้อความ SQL ด้านล่างตรงกับที่รันบนฐานจริงทุกตัวอักษร (md5 142848c8f33da0d4754b5bbe66f69502) — ฐานจริงมีแล้ว ไม่ต้องรันซ้ำ
--
-- ๑. ตำบล: บัญชีกลาง เงินค้ำประกัน เวลาตัดรอบ ธงหยุดรับงาน
alter table public.tambons
  add column if not exists settlement_promptpay_id text,
  add column if not exists settlement_account_name text,
  add column if not exists deposit_amount numeric not null default 0,
  add column if not exists payout_cutoff_time time not null default '21:00',
  add column if not exists intake_blocked boolean not null default false,
  add column if not exists intake_blocked_reason text;

comment on column public.tambons.deposit_amount is
  'เงินค้ำประกันที่ตัวแทนวางไว้ = เพดานยอดค้างจ่ายสูงสุดที่ยอมให้เกิดได้';

-- ๒. ใบสมัครตัวแทน: หลักฐานการวางค้ำ
alter table public.tambon_applications
  add column if not exists deposit_amount numeric,
  add column if not exists deposit_slip_url text,
  add column if not exists deposit_received_at timestamptz,
  add column if not exists settlement_promptpay_id text;

-- ๓. ออเดอร์: ลูกค้าจ่ายเข้าบัญชีกลางเมื่อไร
alter table public.orders
  add column if not exists customer_paid_at timestamptz,
  add column if not exists customer_slip_url text;

-- ๔. บัญชีค้างจ่าย — หนึ่งแถวต่อหนึ่งผู้รับต่อหนึ่งออเดอร์
create table if not exists public.settlements (
  id                bigint generated always as identity primary key,
  created_at        timestamptz not null default now(),
  order_id          bigint  not null references public.orders(id) on delete cascade,
  tambon_id         uuid    not null references public.tambons(id),
  payee_profile_id  uuid    not null references public.profiles(id),
  payee_role        text    not null check (payee_role in ('merchant','driver')),
  amount            numeric not null check (amount > 0),
  due_at            timestamptz not null,
  paid_out_at       timestamptz,
  paid_out_slip_url text,
  confirmed_at      timestamptz,
  unique (order_id, payee_profile_id)
);

comment on table public.settlements is
  'ยอดที่ตัวแทนตำบลค้างจ่ายให้ร้านและไรเดอร์ หลังลูกค้าโอนเข้าบัญชีกลางแล้ว';

create index if not exists settlements_open_idx
  on public.settlements (tambon_id, paid_out_at, due_at);
create index if not exists settlements_payee_idx
  on public.settlements (payee_profile_id, confirmed_at);

alter table public.settlements enable row level security;

-- ผู้รับเห็นของตัวเอง แอดมินของตำบลเห็นทั้งตำบล — ไม่มีใครเขียนตรง ๆ ได้
drop policy if exists settlements_select_scoped on public.settlements;
create policy settlements_select_scoped on public.settlements
  for select to authenticated
  using (payee_profile_id = auth.uid() or public.can_admin_tambon(tambon_id));

grant select on public.settlements to authenticated;

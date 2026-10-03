-- [D33] กู้จากฐานจริง: supabase_migrations.schema_migrations version 20260915101350 (demand_signals)
-- ข้อความ SQL ด้านล่างตรงกับที่รันบนฐานจริงทุกตัวอักษร (md5 70d37ee5f74eba60fe5f3882c2458f6f) — ฐานจริงมีแล้ว ไม่ต้องรันซ้ำ
--
create table if not exists public.demand_signals (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  tambon_id   uuid references public.tambons(id) on delete set null,
  profile_id  uuid references public.profiles(id) on delete set null,
  kind        text not null check (kind in ('search_miss','vehicle_missing','service_open')),
  value       text not null,
  detail      jsonb not null default '{}'::jsonb
);

comment on table public.demand_signals is
  'สิ่งที่ลูกค้าอยากได้แต่ระบบยังให้ไม่ได้ — ใช้ตัดสินว่าควรไปชวนใครมาเปิดร้าน/ขับรถ';

create index if not exists demand_signals_tambon_kind_idx
  on public.demand_signals (tambon_id, kind, created_at desc);

alter table public.demand_signals enable row level security;

drop policy if exists demand_signals_insert_self on public.demand_signals;
create policy demand_signals_insert_self on public.demand_signals
  for insert to authenticated
  with check (profile_id is null or profile_id = auth.uid());

drop policy if exists demand_signals_select_admin on public.demand_signals;
create policy demand_signals_select_admin on public.demand_signals
  for select to authenticated
  using (public.can_admin_tambon(tambon_id));

grant select, insert on public.demand_signals to authenticated;

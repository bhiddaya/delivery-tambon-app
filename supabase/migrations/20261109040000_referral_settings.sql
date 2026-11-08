-- ค่าแนะนำ (ส่วนแบ่งรายได้หลังหักค่าใช้จ่ายต่อเดือน) เก็บที่เดียวเป็นแหล่งความจริง
-- หน้าบ้าน (ฟอร์มสมัคร) บอท และหลังบ้าน อ่านค่าจาก public.line_referral_terms() ตัวนี้
--
-- ออกแบบ:
--   * เก็บเป็นแถวต่อการเปลี่ยนแปลง (append-only) ค่าที่ใช้ได้คือแถวที่ effective_from <= now() ล่าสุด
--   * สัดส่วนรวมต้องเท่ากับ 100 เสมอ
--   * เขียนได้เฉพาะ superadmin ผ่าน RLS, อ่านผ่าน RPC ที่ให้เฉพาะ service_role

create table if not exists public.referral_settings (
  id uuid primary key default gen_random_uuid(),
  seller_referrer_pct integer not null check (seller_referrer_pct >= 0 and seller_referrer_pct <= 100),
  buyer_referrer_pct integer not null check (buyer_referrer_pct >= 0 and buyer_referrer_pct <= 100),
  community_pct integer not null check (community_pct >= 0 and community_pct <= 100),
  effective_from timestamptz not null default now(),
  note text,
  approved_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint referral_settings_total_100 check (seller_referrer_pct + buyer_referrer_pct + community_pct = 100)
);

create index if not exists referral_settings_effective_idx on public.referral_settings (effective_from desc);

alter table public.referral_settings enable row level security;

drop policy if exists referral_settings_select on public.referral_settings;
create policy referral_settings_select on public.referral_settings for select to authenticated
  using (true);

drop policy if exists referral_settings_insert on public.referral_settings;
create policy referral_settings_insert on public.referral_settings for insert to authenticated
  with check (public.is_superadmin());

revoke update, delete on public.referral_settings from public, anon, authenticated;
grant select, insert on public.referral_settings to authenticated;

-- ค่าที่ใช้ได้ ณ ตอนนี้
create or replace function public.line_referral_terms()
returns jsonb
language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce(
    (select jsonb_build_object(
        'seller_referrer_pct', r.seller_referrer_pct,
        'buyer_referrer_pct', r.buyer_referrer_pct,
        'community_pct', r.community_pct,
        'effective_from', r.effective_from)
       from public.referral_settings r
      where r.effective_from <= now()
      order by r.effective_from desc, r.created_at desc
      limit 1),
    jsonb_build_object('missing', true));
$$;

revoke all on function public.line_referral_terms() from public, anon, authenticated;
grant execute on function public.line_referral_terms() to service_role;

-- ค่าเริ่มต้นตามที่หน้าแอปแสดงอยู่ (30 / 40 / 30)
insert into public.referral_settings (seller_referrer_pct, buyer_referrer_pct, community_pct, note)
select 30, 40, 30, 'ค่าเริ่มต้นจากหน้าเลือกพื้นที่ของท่าน'
where not exists (select 1 from public.referral_settings);

-- ย้อนกลับ: drop function public.line_referral_terms(); drop table public.referral_settings;

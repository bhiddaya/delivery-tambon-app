-- ============================================================
-- เปิดตำบลใหม่: ใบขอเปิด → ส่วนกลางอนุมัติ → ข้อมูลประจำตำบล
-- ============================================================

-- ---------- ฟังก์ชันตรวจสิทธิ์ ----------
-- SECURITY DEFINER เพื่อให้อ่าน profiles ได้โดยไม่ต้องพึ่ง policy ของ profiles
-- (ป้องกัน policy เรียกวนกันเอง) และ pin search_path กัน schema ปลอม
create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'superadmin'
  );
$$;

create or replace function public.is_tambon_admin(t uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.approved, false)
      and p.tambon_id = t
  );
$$;

revoke all on function public.is_superadmin() from public;
revoke all on function public.is_tambon_admin(uuid) from public;
grant execute on function public.is_superadmin() to authenticated;
grant execute on function public.is_tambon_admin(uuid) to authenticated;

-- ---------- 1) เนื้อหาเฉพาะตำบล (ตัวแทนตำบลแก้เองได้) ----------
alter table public.tambons
  add column if not exists intro               text,
  add column if not exists announcement        text,
  add column if not exists cover_url           text,
  add column if not exists contact_line        text,
  add column if not exists contact_phone       text,
  add column if not exists delivery_fee_base   numeric(10,2),
  add column if not exists delivery_fee_per_km numeric(10,2),
  add column if not exists is_active           boolean not null default false,
  add column if not exists opened_at           timestamptz;

comment on column public.tambons.is_active is
  'เปิดให้บริการจริงแล้วหรือยัง — อนุมัติแล้วแต่ยังไม่พร้อม (ยังไม่มีร้าน/ไรเดอร์) ให้เป็น false';

-- ตำบลนำร่องที่ใช้งานอยู่แล้ว ให้คงสถานะเปิด
update public.tambons
   set is_active = true,
       opened_at = coalesce(opened_at, created_at)
 where is_active = false
   and created_at < now();

-- หน้าสาธารณะต้องอ่านคอลัมน์ใหม่ได้ (GRANT ระดับคอลัมน์ ไม่ยกให้อัตโนมัติ)
grant select (intro, announcement, cover_url, contact_line, contact_phone,
              delivery_fee_base, delivery_fee_per_km, is_active, opened_at)
  on public.tambons to anon, authenticated;

-- ---------- 2) ข้อมูลประจำตำบล ----------
create table if not exists public.tambon_profiles (
  tambon_id         uuid primary key references public.tambons(id) on delete cascade,

  local_gov_name    text,        -- เทศบาลตำบล / อบต. ชื่อเต็ม
  local_gov_website text,

  population        integer check (population is null or population >= 0),
  households        integer check (households is null or households >= 0),
  villages          integer check (villages   is null or villages   >= 0),
  area_sqkm         numeric(10,2) check (area_sqkm is null or area_sqkm > 0),

  main_economy      text,        -- เศรษฐกิจหลัก
  culture           text,        -- วัฒนธรรม / วิถีชุมชน

  attractions       jsonb not null default '[]'::jsonb,  -- แหล่งท่องเที่ยว [{name, description, lat, lng}]
  traditions        jsonb not null default '[]'::jsonb,  -- ประเพณี [{name, month, description}]
  products          jsonb not null default '[]'::jsonb,  -- สินค้าชุมชน/OTOP

  budget_year       integer check (budget_year is null or budget_year between 2500 and 2700),
  budget_total      numeric(14,2) check (budget_total is null or budget_total >= 0),

  -- ที่มาของตัวเลขแต่ละช่อง เช่น {"population": {"label": "...", "url": "...", "as_of": "2568"}}
  -- บังคับให้ระบุที่มา เพราะตัวเลขประชากร/งบประมาณจะถูกเผยแพร่สู่สาธารณะ
  sources           jsonb not null default '{}'::jsonb,

  updated_by        uuid references public.profiles(id),
  updated_at        timestamptz not null default now()
);

comment on table public.tambon_profiles is
  'ข้อมูลประจำตำบล — ประชากร เศรษฐกิจ วัฒนธรรม ประเพณี แหล่งท่องเที่ยว งบประมาณ. ทุกตัวเลขต้องมีที่มาใน sources';

-- ให้ตำบลที่มีอยู่แล้วมีแถวว่างรออยู่
insert into public.tambon_profiles (tambon_id)
select t.id from public.tambons t
where not exists (select 1 from public.tambon_profiles p where p.tambon_id = t.id);

alter table public.tambon_profiles enable row level security;

revoke all on public.tambon_profiles from anon, authenticated;
grant select on public.tambon_profiles to anon, authenticated;
grant insert, update on public.tambon_profiles to authenticated;

drop policy if exists tambon_profiles_public_read on public.tambon_profiles;
create policy tambon_profiles_public_read
  on public.tambon_profiles for select
  to anon, authenticated
  using (true);

drop policy if exists tambon_profiles_write on public.tambon_profiles;
create policy tambon_profiles_write
  on public.tambon_profiles for update
  to authenticated
  using (public.is_superadmin() or public.is_tambon_admin(tambon_id))
  with check (public.is_superadmin() or public.is_tambon_admin(tambon_id));

drop policy if exists tambon_profiles_insert on public.tambon_profiles;
create policy tambon_profiles_insert
  on public.tambon_profiles for insert
  to authenticated
  with check (public.is_superadmin() or public.is_tambon_admin(tambon_id));

-- ---------- 3) ใบขอเปิดตำบล ----------
create table if not exists public.tambon_applications (
  id                   uuid primary key default gen_random_uuid(),

  tambon_name          text not null,
  district             text not null,
  province             text not null,
  tambon_code          text,          -- รหัสตำบลราชการ ถ้าผู้สมัครทราบ

  applicant_name       text not null,
  applicant_phone      text not null,
  applicant_line       text,
  applicant_profile_id uuid references public.profiles(id),

  merchant_count       integer check (merchant_count is null or merchant_count >= 0),
  driver_count         integer check (driver_count   is null or driver_count   >= 0),
  details              jsonb not null default '{}'::jsonb,

  pdpa_consent         boolean not null default false,

  status               text not null default 'pending'
                       check (status in ('pending','approved','rejected')),
  review_note          text,
  reviewed_by          uuid references public.profiles(id),
  reviewed_at          timestamptz,
  created_tambon_id    uuid references public.tambons(id),

  created_at           timestamptz not null default now()
);

comment on table public.tambon_applications is
  'ใบขอเปิดตำบลใหม่ — ส่วนกลาง (superadmin) เป็นผู้อนุมัติผ่าน approve_tambon_application()';

create index if not exists tambon_applications_status_idx
  on public.tambon_applications (status, created_at desc);

-- กันยื่นซ้ำ: ตำบลเดียวกันมีใบที่รอพิจารณาได้ใบเดียว
create unique index if not exists tambon_applications_pending_uniq
  on public.tambon_applications (tambon_name, district, province)
  where status = 'pending';

alter table public.tambon_applications enable row level security;

revoke all on public.tambon_applications from anon, authenticated;
grant insert on public.tambon_applications to anon, authenticated;
grant select, update on public.tambon_applications to authenticated;

-- ยื่นได้โดยไม่ต้องมีบัญชี เพราะคนจากตำบลที่ยังไม่เปิดจะสมัครสมาชิกไม่ได้
-- บังคับให้ยินยอม PDPA และเริ่มที่สถานะ pending เสมอ
drop policy if exists tambon_applications_submit on public.tambon_applications;
create policy tambon_applications_submit
  on public.tambon_applications for insert
  to anon, authenticated
  with check (
    pdpa_consent = true
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and created_tambon_id is null
  );

-- อ่านได้เฉพาะส่วนกลาง หรือเจ้าของใบสมัครเอง
drop policy if exists tambon_applications_read on public.tambon_applications;
create policy tambon_applications_read
  on public.tambon_applications for select
  to authenticated
  using (public.is_superadmin() or applicant_profile_id = auth.uid());

drop policy if exists tambon_applications_review on public.tambon_applications;
create policy tambon_applications_review
  on public.tambon_applications for update
  to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

-- ---------- 4) อนุมัติ = สร้างตำบล + ปิดใบสมัคร ในขั้นตอนเดียว ----------
-- ทำเป็นฟังก์ชันเพื่อให้เป็น atomic — ไม่มีทางเกิดกรณี "สร้างตำบลแล้วแต่ใบสมัครยังค้าง"
create or replace function public.approve_tambon_application(
  app_id       uuid,
  tambon_slug  text,
  review_note  text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  a       public.tambon_applications;
  new_id  uuid;
begin
  if not public.is_superadmin() then
    raise exception 'อนุมัติได้เฉพาะส่วนกลางเท่านั้น' using errcode = '42501';
  end if;

  select * into a from public.tambon_applications where id = app_id for update;
  if not found then
    raise exception 'ไม่พบใบสมัครนี้' using errcode = 'P0002';
  end if;
  if a.status <> 'pending' then
    raise exception 'ใบสมัครนี้ถูกพิจารณาไปแล้ว (%)', a.status using errcode = '22023';
  end if;
  if tambon_slug is null or btrim(tambon_slug) = '' then
    raise exception 'ต้องระบุ slug ของตำบล' using errcode = '22023';
  end if;

  -- สร้างแบบ "ยังไม่เปิดบริการ" เสมอ — อนุมัติแล้วไม่ได้แปลว่าพร้อมใช้งาน
  -- ตัวแทนตำบลต้องเติมข้อมูลและมีร้าน/ไรเดอร์ก่อน ส่วนกลางจึงค่อยเปิด is_active
  insert into public.tambons (name, district, province, code, slug, is_active)
  values (a.tambon_name, a.district, a.province, a.tambon_code, btrim(tambon_slug), false)
  returning id into new_id;

  insert into public.tambon_profiles (tambon_id) values (new_id);

  update public.tambon_applications
     set status            = 'approved',
         reviewed_by       = auth.uid(),
         reviewed_at       = now(),
         review_note       = approve_tambon_application.review_note,
         created_tambon_id = new_id
   where id = app_id;

  return new_id;
end;
$$;

revoke all on function public.approve_tambon_application(uuid, text, text) from public, anon;
grant execute on function public.approve_tambon_application(uuid, text, text) to authenticated;

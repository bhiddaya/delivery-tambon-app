-- [D33] กู้จากฐานจริง: supabase_migrations.schema_migrations version 20260926100350 (places_ai_source_v1)
-- ข้อความ SQL ด้านล่างตรงกับที่รันบนฐานจริงทุกตัวอักษร (md5 ce940eda0c7990529920954be545dc68) — ฐานจริงมีแล้ว ไม่ต้องรันซ้ำ
--
alter table public.places
  add column if not exists source text not null default 'manual',
  add column if not exists source_url text,
  add column if not exists ai_confidence numeric,
  add column if not exists verified boolean not null default false,
  add column if not exists note text,
  add column if not exists updated_at timestamptz not null default now();
create unique index if not exists places_tambon_cat_name_uq on public.places (tambon_id, category, name);
comment on column public.places.source is 'manual = แอดมินใส่ · deepseek_web = DeepSeek ค้นเว็บ + Jev ตรวจ';
comment on column public.places.verified is 'แอดมินตำบลยืนยันแล้ว (ข้อมูลจาก AI เริ่มที่ false และแสดงป้ายยังไม่ยืนยัน)';

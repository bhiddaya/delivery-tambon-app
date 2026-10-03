-- [D33] กู้จากฐานจริง: supabase_migrations.schema_migrations version 20260926013026 (complaints_service_v1)
-- ข้อความ SQL ด้านล่างตรงกับที่รันบนฐานจริงทุกตัวอักษร (md5 ebf520c42d2095ccdf9ef93a31a6b941) — ฐานจริงมีแล้ว ไม่ต้องรันซ้ำ
--
-- Complaint / public-issue reporting service (LINE OA บวรไทย super app)
-- Access only via service role (n8n). RLS on, no policies: anon/authenticated cannot read or write.
create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  ticket_no text not null unique,
  line_user_id text not null,
  tambon_id uuid references public.tambons(id),
  subject text,
  place text,
  occurred_on text,
  detail text not null,
  agency_hint text,
  disclose_identity boolean not null default false,
  reporter_name text,
  reporter_phone text,
  category text,
  urgency text,
  ai_summary text,
  suggested_agency text,
  status text not null default 'received'
    check (status in ('received','reviewing','forwarded','answered','closed','rejected')),
  source text not null default 'line',
  is_test boolean not null default false,
  raw_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.complaints is 'เรื่องร้องเรียน/แจ้งเรื่องจากประชาชนผ่าน LINE OA · ข้อมูลอ่อนไหว: ตัวตนผู้แจ้งเห็นได้เฉพาะผู้ดูแล · เข้าถึงผ่าน service role (n8n) เท่านั้น';

create table public.complaint_updates (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id),
  status text not null,
  note text,
  is_public boolean not null default true,
  created_by text not null default 'system',
  created_at timestamptz not null default now()
);

create index complaints_line_user_idx on public.complaints (line_user_id, created_at desc);
create index complaint_updates_complaint_idx on public.complaint_updates (complaint_id, created_at);

create or replace function public.complaints_touch_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
create trigger complaints_touch before update on public.complaints
  for each row execute function public.complaints_touch_updated_at();

alter table public.complaints enable row level security;
alter table public.complaint_updates enable row level security;
revoke all on public.complaints, public.complaint_updates from anon, authenticated;

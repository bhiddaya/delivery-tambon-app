-- 20260909_admin_actions_audit.sql
--
-- บันทึกการกระทำของผู้ดูแลที่กระทบบัญชีคนอื่น
--
-- ตัวแรกที่ใช้คือ "ตัวแทนตำบลตั้งรหัสชั่วคราวให้ผู้ใช้" ซึ่งเป็นอำนาจที่
-- เท่ากับสวมเป็นคนนั้นได้ จำเป็นต่อชุมชนที่คนส่วนใหญ่ไม่มีอีเมล แต่ต้องมี
-- ร่องรอยเสมอ — อำนาจแบบนี้ที่ไม่มีบันทึกคือสิ่งที่ทำให้ระบบชุมชนพัง

create table if not exists public.admin_actions (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  target_id uuid references public.profiles(id) on delete set null,
  action text not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists admin_actions_target_idx on public.admin_actions (target_id, created_at desc);
create index if not exists admin_actions_actor_idx on public.admin_actions (actor_id, created_at desc);

alter table public.admin_actions enable row level security;

-- อ่านได้เฉพาะการกระทำของตัวเอง หรือของผู้ดูแลที่อยู่ในขอบเขตของเรา
drop policy if exists admin_actions_select on public.admin_actions;
create policy admin_actions_select on public.admin_actions
  for select to authenticated
  using (actor_id = auth.uid() or public.can_admin_profile(actor_id));

-- ตั้งใจไม่มี policy สำหรับ insert/update/delete
-- เขียนได้เฉพาะฝั่งเซิร์ฟเวอร์ที่ถือ service_role เท่านั้น
-- ผู้ดูแลจึงลบร่องรอยของตัวเองไม่ได้ ซึ่งเป็นหัวใจของการมีตารางนี้

grant select on public.admin_actions to authenticated;

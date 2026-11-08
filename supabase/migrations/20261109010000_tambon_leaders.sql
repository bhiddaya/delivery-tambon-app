-- แกนนำเครือข่ายประจำตำบล (อสม., ผู้นำท้องถิ่น, ตัวแทนวัด/โรงเรียน ฯลฯ)
--
-- ออกแบบ (ร่าง ยังไม่ได้ apply):
--   * ไม่เพิ่ม role ใน user_role — แกนนำเป็นรายชื่อรับข่าวสาร ไม่ได้เข้าระบบจัดการ
--   * ตัวตนใช้ profiles เดิม (มี line_user_id, phone, full_name อยู่แล้ว) ไม่สร้างตารางคนซ้ำ
--   * ตำบลอ้างอิง public.tambons(id) เดิม (uuid) ไม่ใช่ตารางใหม่
--   * สิทธิ์ดูและแก้ใช้ can_admin_tambon() เดิม (ส่วนกลาง / ตัวแทนที่อนุมัติของตำบลนั้น)
--   * is_active คือแกนนำเปิด-ปิดรับข่าวเอง แยกจาก profiles.suspended_at (พักบัญชี)

create table if not exists public.tambon_leaders (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  tambon_id uuid not null references public.tambons(id) on delete cascade,
  role_type text not null,            -- เช่น 'อสม.', 'ผู้นำท้องถิ่น', 'ตัวแทนวัด', 'ตัวแทนโรงเรียน'
  is_active boolean not null default true,
  note text,
  registered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- คนหนึ่งคนมีแถวเดียวต่อตำบล (กันลงทะเบียนซ้ำ)
  constraint tambon_leaders_profile_tambon_key unique (profile_id, tambon_id)
);

-- ค้นรายชื่อแกนนำของตำบลหนึ่ง (unique ข้างบนคลุมการค้นตาม profile_id แล้ว)
create index if not exists tambon_leaders_tambon_idx on public.tambon_leaders (tambon_id);

alter table public.tambon_leaders enable row level security;

-- อ่าน: ตัวแทนเห็นเฉพาะแกนนำของตำบลตัวเอง ส่วนกลางเห็นทั้งหมด แกนนำเห็นแถวของตัวเอง
drop policy if exists tambon_leaders_select_scoped on public.tambon_leaders;
create policy tambon_leaders_select_scoped on public.tambon_leaders for select to authenticated
  using (profile_id = auth.uid() or public.can_admin_tambon(tambon_id));

-- เขียน/แก้/ลบ: เฉพาะคนที่ดูแลตำบลนั้นได้
drop policy if exists tambon_leaders_write_scoped on public.tambon_leaders;
create policy tambon_leaders_write_scoped on public.tambon_leaders for all to authenticated
  using (public.can_admin_tambon(tambon_id))
  with check (public.can_admin_tambon(tambon_id));

-- แกนนำลงทะเบียนตัวเองจาก LIFF ได้ — เฉพาะแถวของตัวเอง และบัญชีต้องไม่ถูกพักสิทธิ์
-- policy แบบ permissive จึงรวมกับของตัวแทนได้ ไม่กระทบสิทธิ์ตัวแทน
-- ไม่เปิด update/delete ให้แกนนำ: ปิดรับข่าวหรือถอนชื่อยังต้องให้ตัวแทนตำบลทำ
drop policy if exists tambon_leaders_insert_self on public.tambon_leaders;
create policy tambon_leaders_insert_self on public.tambon_leaders for insert to authenticated
  with check (
    profile_id = auth.uid()
    and exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.suspended_at is null)
  );

grant select, insert, update, delete on public.tambon_leaders to authenticated;

-- ย้อนกลับ: drop table public.tambon_leaders;

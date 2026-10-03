-- 20261003h_tambon_page_content.sql — ระดับ E (สิทธิ์แก้เนื้อหาหน้าตำบล)
--
-- หน้าตำบล /t/<slug> (D50) — อาจารย์อนุมัติข้อ 1–4 เมื่อ 3 ต.ค. 2569:
--   1. ตัวแทนแก้เนื้อหาหน้าตำบลเองได้ (แนะนำตำบล ประกาศ ติดต่อ รูปปก ข้อมูลตำบล สินค้าเด่น)
--   2. ก่อนเปิดบริการแสดง "เร็ว ๆ นี้" + ชวนสมัครร้าน/ไรเดอร์ · เปิดแล้วแสดงปุ่มสั่ง
--   3. ปุ่มสั่งผ่าน LINE และสมัครเป็นร้าน/ไรเดอร์ของตำบลนี้
--   4. ประกาศ/ข่าวสั้นของตำบลที่ตัวแทนโพสต์ได้
--
-- ฐานข้อมูลที่ต้องเปลี่ยน (ข้อ 2–3 เป็นหน้าเว็บอย่างเดียว):
--   ก. tambon_profiles: สิทธิ์แก้เดิมใช้ is_tambon_admin (เฉพาะ role admin ประจำตำบล) จึงไม่ครอบคลุม
--      ตัวแทนที่ส่วนกลางแต่งตั้งผ่าน admin_scopes → เปลี่ยนเป็น can_admin_tambon (รวมส่วนกลางด้วย)
--      ส่วน tambons.intro/announcement/contact_*/cover_url ตัวแทนแก้ได้อยู่แล้ว (tambons_write_scoped)
--   ข. tambon_posts ใหม่: ประกาศ/ข่าวของตำบล — คนทั่วไปอ่านได้เฉพาะที่เผยแพร่แล้ว
--      ตัวแทนของตำบลนั้นเขียน/แก้/ซ่อน/ลบได้
--   ค. bucket tambon-media (สาธารณะ): รูปปกและรูปประกอบ ตัวแทนอัปโหลดได้เฉพาะโฟลเดอร์ <tambon_id>/
--
-- แผนกู้: คืน policy tambon_profiles เป็น is_superadmin() or is_tambon_admin(tambon_id),
--   drop table tambon_posts, ลบ policy ของ tambon-media · ข้อมูลเดิมไม่ถูกแก้
-- ไม่ใช้ drop ... if exists (MCP ค้างเมื่อได้ NOTICE) · รันซ้ำได้

-- ── ก. tambon_profiles ให้ตัวแทนที่ได้รับแต่งตั้งแก้ได้ ─────────────────
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tambon_profiles'
              and policyname = 'tambon_profiles_write') then
    drop policy tambon_profiles_write on public.tambon_profiles;
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tambon_profiles'
              and policyname = 'tambon_profiles_insert') then
    drop policy tambon_profiles_insert on public.tambon_profiles;
  end if;
end $$;

create policy tambon_profiles_write on public.tambon_profiles
  for update to authenticated
  using (public.can_admin_tambon(tambon_id))
  with check (public.can_admin_tambon(tambon_id));

create policy tambon_profiles_insert on public.tambon_profiles
  for insert to authenticated
  with check (public.can_admin_tambon(tambon_id));

-- ── ข. ประกาศ/ข่าวของตำบล ───────────────────────────────────────────
create table if not exists public.tambon_posts (
  id bigint generated always as identity primary key,
  tambon_id uuid not null references public.tambons(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 120),
  body text not null default '' check (char_length(body) <= 2000),
  image_url text check (image_url is null or char_length(image_url) <= 500),
  is_published boolean not null default true,
  pinned boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tambon_posts_tambon_idx on public.tambon_posts (tambon_id, pinned desc, created_at desc);

alter table public.tambon_posts enable row level security;

do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tambon_posts'
              and policyname = 'tambon_posts_public_read') then
    drop policy tambon_posts_public_read on public.tambon_posts;
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'tambon_posts'
              and policyname = 'tambon_posts_agent_all') then
    drop policy tambon_posts_agent_all on public.tambon_posts;
  end if;
  if exists (select 1 from pg_trigger where tgname = 'trg_tambon_posts_updated'
              and tgrelid = 'public.tambon_posts'::regclass) then
    drop trigger trg_tambon_posts_updated on public.tambon_posts;
  end if;
end $$;

create policy tambon_posts_public_read on public.tambon_posts
  for select to anon, authenticated
  using (is_published);

create policy tambon_posts_agent_all on public.tambon_posts
  for all to authenticated
  using (public.can_admin_tambon(tambon_id))
  with check (public.can_admin_tambon(tambon_id));

create trigger trg_tambon_posts_updated
  before update on public.tambon_posts
  for each row execute function public.set_updated_at();

grant select on public.tambon_posts to anon, authenticated;
grant insert, update, delete on public.tambon_posts to authenticated;

comment on table public.tambon_posts is 'ประกาศ/ข่าวสั้นของตำบลบนหน้า /t/<slug> — ตัวแทนตำบลโพสต์ (D50)';

-- ── ค. รูปปกและรูปประกอบของหน้าตำบล ─────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tambon-media', 'tambon-media', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
              and policyname = 'tambon_media_public_read') then
    drop policy tambon_media_public_read on storage.objects;
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
              and policyname = 'tambon_media_agent_write') then
    drop policy tambon_media_agent_write on storage.objects;
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
              and policyname = 'tambon_media_agent_update') then
    drop policy tambon_media_agent_update on storage.objects;
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
              and policyname = 'tambon_media_agent_delete') then
    drop policy tambon_media_agent_delete on storage.objects;
  end if;
end $$;

create policy tambon_media_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'tambon-media');

-- โฟลเดอร์แรกต้องเป็น id ของตำบลที่ผู้ใช้ดูแล (เทียบเป็นข้อความ ไม่ cast เพื่อไม่ให้ชื่อผิดรูปแบบทำ policy พัง)
create policy tambon_media_agent_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'tambon-media'
    and exists (select 1 from public.tambons t
                 where t.id::text = (storage.foldername(name))[1] and public.can_admin_tambon(t.id))
  );

create policy tambon_media_agent_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'tambon-media'
    and exists (select 1 from public.tambons t
                 where t.id::text = (storage.foldername(name))[1] and public.can_admin_tambon(t.id))
  );

create policy tambon_media_agent_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'tambon-media'
    and exists (select 1 from public.tambons t
                 where t.id::text = (storage.foldername(name))[1] and public.can_admin_tambon(t.id))
  );
-- รองรับลูกค้าที่เข้ามาทาง LINE OA โดยไม่ต้องผ่าน Supabase Auth signup
alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles alter column id set default gen_random_uuid();
alter table public.profiles add column if not exists line_user_id text unique;
create index if not exists profiles_line_user_id_idx on public.profiles(line_user_id);

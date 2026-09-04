-- ค้นบัญชีเดิมจาก LINE user id — ใช้โดย Edge Function `line-login` เท่านั้น
--
-- ทำไมต้องมีฟังก์ชันนี้ แทนที่จะให้ Edge Function ยิงถาม auth.users ตรง ๆ:
-- schema `auth` ไม่ได้เปิดผ่าน PostgREST และ Admin API มีแต่ listUsers
-- ที่ต้องไล่ทีละหน้า (ช้าลงเรื่อย ๆ ตามจำนวนผู้ใช้)
--
-- ลำดับการค้นสำคัญ:
--   1. profiles.line_user_id ก่อน — รองรับคนที่สมัครด้วยเบอร์ไว้แล้ว
--      แล้วค่อยผูก LINE ทีหลัง จะได้เข้าบัญชีเดิม ไม่ใช่ได้บัญชีที่สอง
--   2. ถ้าไม่เจอ ค่อยดูอีเมลแฝง <lineUserId>@line.invalid ซึ่งเป็นบัญชี
--      ที่ Edge Function สร้างเองเมื่อผู้ใช้เข้าด้วย LINE ครั้งแรก
--
-- security definer เพราะต้องอ่าน auth.users
-- และถอนสิทธิ์จากทุกคนยกเว้น service_role เพราะฟังก์ชันนี้บอกได้ว่า
-- "อีเมลนี้มีบัญชีอยู่ไหม" ซึ่งไม่ควรให้ใครถามได้จากฝั่งเบราว์เซอร์
create or replace function public.auth_user_id_for_line(
  p_line_user_id text,
  p_alias_email text
)
returns uuid
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select coalesce(
    (select p.id from public.profiles p
      where p.line_user_id = p_line_user_id
      limit 1),
    (select u.id from auth.users u
      where lower(u.email) = lower(p_alias_email)
      limit 1)
  );
$$;

revoke all on function public.auth_user_id_for_line(text, text) from public;
revoke all on function public.auth_user_id_for_line(text, text) from anon, authenticated;
grant execute on function public.auth_user_id_for_line(text, text) to service_role;

-- 20260909_line_lookup_requires_auth_user.sql
--
-- auth_user_id_for_line() คืน id ของโปรไฟล์ที่ไม่มีบัญชี auth ได้ ซึ่งทำให้ล็อกอินพัง
--
-- เกิดจริงเมื่อ 2026-09-09: ผู้ใช้ 4 คนล็อกอิน LINE สำเร็จตั้งแต่ 5 ก.ย. แต่ไม่เคย
-- ถูกผูก line_user_id เลย เพราะโปรไฟล์ข้อมูลตัวอย่างที่สร้างไว้เมื่อ 28-29 ส.ค.
-- ถือ LINE user ID จริงของพวกเขาไว้ (คงเก็บมาจาก webhook ของ LINE OA)
-- ฟังก์ชันค้น profiles.line_user_id ก่อน จึงคืน id ของโปรไฟล์ตัวอย่างนั้นกลับมา
--
-- อาการที่เห็นใน log: PUT /auth/v1/admin/users/<id> ตอบ 404 "User not found"
-- แต่ session ยังออกได้ เพราะ generateLink ใช้อีเมล ไม่ใช่ id — ล็อกอินจึง "สำเร็จ"
-- ทั้งที่ไม่มีอะไรถูกผูก และไม่มี error ให้ใครเห็น
--
-- แก้: สาขาแรกต้องจับคู่เฉพาะโปรไฟล์ที่มีบัญชี auth จริงเท่านั้น
-- โปรไฟล์ที่ไม่มีบัญชี auth ล็อกอินไม่ได้อยู่แล้ว จึงไม่ควรเป็นคำตอบของฟังก์ชันนี้
--
-- แผนกู้: ถ้าผิด ให้ create or replace กลับเป็นรุ่นเดิมที่ไม่มี join
-- (ไม่ต้องถอย migration — ฟังก์ชันเขียนทับได้ ไม่มีข้อมูลเสียหาย)
--
-- ⚠️ migration นี้อย่างเดียวไม่พอ ต้องล้าง line_user_id ออกจากโปรไฟล์ตัวอย่างด้วย
-- เพราะมี unique index `profiles_line_user_id_key` — ตราบใดที่โปรไฟล์ตัวอย่าง
-- ยังถือค่าไว้ โปรไฟล์จริงก็เขียนค่าเดียวกันไม่ได้
-- การล้างข้อมูลนั้นทำแยกเป็นคำสั่งข้อมูล ไม่ใส่ไว้ในไฟล์นี้ เพราะเป็นการแก้ข้อมูล
-- เฉพาะกิจของ production ชุดนี้ ไม่ใช่โครงสร้างที่ทุก deployment ต้องมี

create or replace function public.auth_user_id_for_line(p_line_user_id text, p_alias_email text)
returns uuid
language sql stable security definer set search_path = public, auth, pg_temp
as $$
  select coalesce(
    -- ผูกไว้แล้วกับบัญชีจริง — ต้องมีแถวใน auth.users ด้วย ไม่ใช่แค่มีโปรไฟล์
    (select p.id
       from public.profiles p
       join auth.users u on u.id = p.id
      where p.line_user_id = p_line_user_id
      limit 1),
    -- ยังไม่ผูก — หาด้วยอีเมลแฝงที่คำนวณจาก LINE user id
    (select u.id
       from auth.users u
      where lower(u.email) = lower(p_alias_email)
      limit 1));
$$;

revoke all on function public.auth_user_id_for_line(text, text) from public;
revoke all on function public.auth_user_id_for_line(text, text) from anon, authenticated;
grant execute on function public.auth_user_id_for_line(text, text) to service_role;

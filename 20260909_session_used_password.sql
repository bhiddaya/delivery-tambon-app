-- 20260909_session_used_password.sql
--
-- "หลังบ้านต้องเข้าด้วยรหัสผ่าน" — ตัดสินที่ฐานข้อมูล ไม่ใช่ที่หน้าเว็บ
--
-- นโยบายของโครงการ (เจ้าของกำหนด 2026-09-09):
--   เข้าด้วยเบอร์/อีเมล → เห็นหลังบ้านของตัวเองได้ (ไรเดอร์ ร้านค้า admin superadmin)
--   เข้าด้วย LINE      → ทุกคนเข้าได้ แต่เห็นเฉพาะหน้าบ้าน
--
-- เหตุผล: การกดปุ่ม LINE ครั้งเดียวคือปัจจัยที่อ่อนกว่ารหัสผ่าน มือถือที่ปลดล็อกอยู่
-- แล้วถูกหยิบไปกดก็เข้าได้ หน้าที่มีเงิน ราคาสินค้า และการรับงาน จึงควรขอรหัสผ่าน
--
-- วิธีรู้ว่า session นี้เข้ามาด้วยวิธีไหน: GoTrue บันทึกไว้ที่ auth.mfa_amr_claims
-- ต่อหนึ่ง session — 'password' คือเข้าด้วยเบอร์/อีเมล ส่วน 'otp' คือทาง LINE
-- (ระบบนี้ออก session ของ LINE ด้วย verifyOtp จึงถูกบันทึกเป็น otp)
--
-- อ่านจากตารางจริง ไม่อ่าน amr ใน JWT เพราะตารางคือความจริง ส่วน JWT คือสำเนา
--
-- ⚠️ ตอนนี้บังคับใช้ที่ guard ฝั่งเซิร์ฟเวอร์ของหน้า /driver /merchant /admin เท่านั้น
-- ยังไม่ได้ล็อกที่ RLS — คนที่เปิด devtools เป็นและถือ session จาก LINE ยังยิง API
-- ตรงเพื่อจัดการข้อมูล "ของตัวเอง" ได้ ไม่ใช่ของคนอื่น การล็อก RLS เป็นงานถัดไป
-- และต้องแยก commit ตามกฎ ๑๐.๓
--
-- แผนกู้: drop ฟังก์ชันนี้แล้วเอาเงื่อนไขออกจาก guard ฝั่งแอป
-- ไม่มีข้อมูลใดถูกแก้ ถอยได้ทันที

-- คืนสามค่า ไม่ใช่สอง:
--   true  = เข้าด้วยรหัสผ่าน
--   false = เข้าด้วยวิธีอื่น (ปุ่ม LINE)
--   null  = ดูไม่ออก เพราะ JWT ไม่มี claim `session_id`
--
-- ที่ต้องแยก null ออกมา เพราะยังไม่ได้ยืนยันกับ session จริงว่า JWT มี session_id
-- เสมอ ถ้าตอบ false ในกรณีนั้น ไรเดอร์ ร้านค้า และตัวแทนตำบลจะถูกล็อกออกจาก
-- หน้าของตัวเองพร้อมกันหมด — ข้อจำกัดใหม่ไม่ควรพังระบบที่ทำงานอยู่แล้ว
-- ฝั่งแอปจึงปล่อยผ่านเมื่อได้ null พร้อมเขียน log ไว้ให้เห็น
--
-- เมื่อยืนยันแล้วว่าอ่าน session_id ได้เสมอ ให้เขียน migration ตัวถัดไป
-- เปลี่ยน null เป็น false (ไม่ต้องถอยไฟล์นี้)

create or replace function public.session_used_password()
returns boolean
language sql stable security definer set search_path = auth, public, pg_temp
as $$
  select case
    when nullif(auth.jwt() ->> 'session_id', '') is null then null
    else exists (
      select 1
      from auth.mfa_amr_claims c
      where c.session_id = (auth.jwt() ->> 'session_id')::uuid
        and c.authentication_method = 'password'
    )
  end;
$$;

revoke all on function public.session_used_password() from public;
grant execute on function public.session_used_password() to authenticated;

comment on function public.session_used_password() is
  'true = เข้าด้วยรหัสผ่าน · false = เข้าด้วยวิธีอื่น (LINE) · null = ดูไม่ออก (JWT ไม่มี session_id)';

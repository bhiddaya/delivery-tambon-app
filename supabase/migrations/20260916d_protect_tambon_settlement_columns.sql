-- [D33] กู้จากฐานจริง: supabase_migrations.schema_migrations version 20260916005555 (protect_tambon_settlement_columns)
-- ข้อความ SQL ด้านล่างตรงกับที่รันบนฐานจริงทุกตัวอักษร (md5 5da3d29ddb35142847acdbe4de99a18c) — ฐานจริงมีแล้ว ไม่ต้องรันซ้ำ
--
-- ตาราง tambons เปิดให้อ่านได้แม้ยังไม่ล็อกอิน (หน้า /t/<slug> ใช้)
-- แต่เลขพร้อมเพย์บัญชีกลางเป็นเบอร์โทรของตัวแทน และเงินค้ำประกันเป็นข้อมูลภายใน
-- ไม่ควรเปิดให้คนทั่วอินเทอร์เน็ตอ่าน — ตัดสิทธิ์ระดับคอลัมน์ของ anon ทิ้ง
-- (RLS คุมว่าเห็นแถวไหน ส่วน GRANT คุมว่าเห็นคอลัมน์ไหน คนละชั้นกัน)
revoke select (
  settlement_promptpay_id,
  settlement_account_name,
  deposit_amount,
  intake_blocked_reason
) on public.tambons from anon;

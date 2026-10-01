-- 20261002b_mark_sim_accounts_test.sql
--
-- D28: ติดป้ายบัญชีจำลองเดิมเป็นบัญชีทดสอบ (นโยบายข้อ 3) — ระดับ F (แตะแถวข้อมูลจริง)
-- อาจารย์อนุมัติ 2 ต.ค. 2569 (decision 0fcab7e3)
-- ต้องมี 20261001_test_data_flags.sql (profiles.is_test) ก่อน
--
-- บัญชีที่ติดป้าย (ตรวจ 2 ต.ค.): บัญชี LINE ที่ขึ้นต้นด้วย 'TEST' หรือ 'U_driver_sim' ซึ่งเป็นรูปแบบที่ใช้ทดสอบมาก่อน
--   - ลูกค้า 1 บัญชี (TEST-food…, สร้าง 26 ก.ย.) ไม่มีออเดอร์ ไม่มีตะกร้า
--   - ไรเดอร์ 1 บัญชี (U_driver_sim…, สร้าง 1 ก.ย., ยังไม่อนุมัติ) มีออเดอร์ทดสอบเดิม 1 รายการ
--
-- ใครกระทบ (กฎ ๔.๑):
--   - ไรเดอร์จำลองจะได้รับเฉพาะงานทดสอบ (find_nearest_driver / line_targets_for_new_order แยกตาม is_test แล้ว)
--   - ลูกค้าจำลองจะเห็นเฉพาะร้านทดสอบใน food_flow และออเดอร์ใหม่ของบัญชีนี้ถูกติดป้ายทดสอบอัตโนมัติ
--   - ตัวเลขรายงาน/สถิติแอดมินไม่นับ 2 บัญชีนี้ (ย้ายไปอยู่ใน test_data)
--   - ไม่แตะออเดอร์เดิม (ออเดอร์ที่เหลือ #87 #98 เป็นทดสอบอยู่แล้ว)
--
-- แผนกู้ (กฎ ๖.๖): ถ้าติดป้ายผิด
--   update public.profiles set is_test = false
--    where line_user_id like 'TEST%' or line_user_id like 'U_driver_sim%';
--
-- รันซ้ำได้: อัปเดตเฉพาะแถวที่ยังไม่ติดป้าย

update public.profiles
   set is_test = true
 where (line_user_id like 'TEST%' or line_user_id like 'U_driver_sim%')
   and not is_test;

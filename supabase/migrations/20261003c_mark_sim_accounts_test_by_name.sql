-- 20261003c_mark_sim_accounts_test_by_name.sql — ใช้กับฐานจริงแล้ว version 20261003065646
-- อาจารย์อนุมัติ 3 ต.ค. 2569
--
-- ปัญหา: 20261002b_mark_sim_accounts_test.sql ติดป้ายบัญชีทดสอบจาก line_user_id ('TEST%' / 'U_driver_sim%')
--   แต่บัญชีจำลอง "[ทดสอบจำลอง] ... รอบสิบเก้า" (สร้าง 1 ก.ย.) ไม่มี line_user_id จึงหลุด
--   ไรเดอร์จำลองถูกนับเป็นไรเดอร์จริงที่อนุมัติแล้ว และมีพิกัดอยู่
-- แก้: ติดป้ายจากชื่อที่ขึ้นต้นด้วย [ทดสอบจำลอง] — พบ 2 บัญชี (ลูกค้า 1 ไรเดอร์ 1) ไม่มีออเดอร์ผูกอยู่
-- ย้อนกลับ: update public.profiles set is_test = false where full_name like '[ทดสอบจำลอง]%';
update public.profiles
   set is_test = true
 where full_name like '[ทดสอบจำลอง]%'
   and not is_test;

-- เพิ่มบทบาท "ส่วนกลาง" (superadmin)
--
-- ต่างจาก admin ตรงที่ admin = ตัวแทนตำบล ผูกกับตำบลเดียว (profiles.tambon_id)
-- ส่วน superadmin เห็นและอนุมัติได้ทุกตำบล
--
-- แยกเป็น migration ของตัวเองเพราะ PostgreSQL ไม่ยอมให้ "ใช้" ค่า enum ใหม่
-- ใน transaction เดียวกับที่เพิ่มค่านั้น — policy ที่อ้างถึง 'superadmin'
-- จึงต้องอยู่ใน migration ถัดไป
alter type public.user_role add value if not exists 'superadmin';

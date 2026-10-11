-- ระดับ E (โครงสร้างข้อมูล): คำบรรยายเมนูสั้น ๆ ให้ร้านใส่ แสดงใต้ชื่อเมนูในหน้าสั่งอาหาร LINE และหน้าร้านบนเว็บ
--
-- เป็นช่องว่างได้ เมนูเดิมไม่ต้องแก้ แสดงเหมือนเดิมจนกว่าร้านจะใส่คำบรรยาย
-- สิทธิ์: anon / authenticated มีสิทธิ์ระดับตารางบน menu_items อยู่แล้ว คอลัมน์ใหม่จึงอยู่ใต้ RLS เดิม
--   (anon อ่านได้เฉพาะเมนูร้านที่เปิด, เขียนได้เฉพาะเจ้าของร้าน/แอดมินผ่าน menu_items_write_scoped)
--
-- แผนกู้ (ย้อนกลับ): alter table public.menu_items drop column if exists description;
-- IDEMPOTENT: รันซ้ำได้

alter table public.menu_items add column if not exists description text;

alter table public.menu_items drop constraint if exists menu_items_description_length;
alter table public.menu_items add constraint menu_items_description_length
  check (description is null or char_length(description) <= 200);

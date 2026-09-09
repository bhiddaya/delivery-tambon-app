-- 20260909_menu_photos_storage_rules.sql
--
-- เปิดให้ร้านอัปโหลดรูปเมนูได้ โดยเขียนได้เฉพาะโฟลเดอร์ของร้านตัวเอง
--
-- ก่อนหน้านี้ storage.objects เปิด RLS ไว้แต่ไม่มี policy สักข้อ แปลว่า
-- ไม่มีใครอัปโหลดได้เลยนอกจากฝั่งเซิร์ฟเวอร์ที่ถือ service_role
--
-- โครงสร้าง path ที่บังคับ: <merchant_id>/<ชื่อไฟล์>
-- โฟลเดอร์ชั้นแรกต้องเป็น id ของร้านที่ผู้เรียกเป็นเจ้าของ ตรวจที่ฐานข้อมูล
-- ไม่ใช่ที่หน้าเว็บ — หน้าเว็บส่ง path อะไรมาก็ได้ จึงเชื่อไม่ได้
--
-- ทดสอบแล้ว: สวมเป็นเจ้าของร้าน A แล้วลองสองกรณี
--   โฟลเดอร์ของตัวเอง → ผ่าน · โฟลเดอร์ของร้าน B → ไม่ผ่าน
--
-- แผนกู้: drop policy ทั้งสี่ข้อ แล้วคืน file_size_limit/allowed_mime_types
-- เป็น null ไม่มีข้อมูลใดถูกแก้ ถอยได้ทันที

-- จำกัดชนิดและขนาดไฟล์ที่ระดับ bucket
--
-- เดิมทั้งสองค่าเป็น null = อัปอะไรก็ได้ ขนาดเท่าไรก็ได้ ซึ่งแปลว่าใครที่
-- สมัครบัญชีได้ก็เอาวิดีโอ 2GB มาฝากไว้ใน quota ของโครงการได้
-- ด่านนี้อยู่ที่เซิร์ฟเวอร์ของ Supabase เอง เลี่ยงไม่ได้แม้แก้โค้ดหน้าเว็บ
update storage.buckets
   set file_size_limit   = 5242880,  -- 5 MB
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'menu-photos';

-- อ่านได้ทุกคน — ลูกค้าต้องเห็นรูปอาหารก่อนตัดสินใจสั่ง และหน้าร้านสาธารณะ
-- ก็เปิดให้คนที่ยังไม่ล็อกอินดูได้อยู่แล้ว
drop policy if exists menu_photos_public_read on storage.objects;
create policy menu_photos_public_read on storage.objects
  for select
  using (bucket_id = 'menu-photos');

-- เขียนได้เฉพาะเจ้าของร้าน (และแอดมินที่ดูแลร้านนั้น) ในโฟลเดอร์ของร้านเอง
drop policy if exists menu_photos_owner_insert on storage.objects;
create policy menu_photos_owner_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'menu-photos'
    and exists (
      select 1 from public.merchants m
      where m.id::text = (storage.foldername(name))[1]
        and (m.profile_id = auth.uid() or public.can_admin_profile(m.profile_id))
    )
  );

-- อัปทับรูปเดิมของตัวเอง
drop policy if exists menu_photos_owner_update on storage.objects;
create policy menu_photos_owner_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'menu-photos'
    and exists (
      select 1 from public.merchants m
      where m.id::text = (storage.foldername(name))[1]
        and (m.profile_id = auth.uid() or public.can_admin_profile(m.profile_id))
    )
  );

-- ลบรูปของตัวเอง เช่นตอนเปลี่ยนรูปใหม่
drop policy if exists menu_photos_owner_delete on storage.objects;
create policy menu_photos_owner_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'menu-photos'
    and exists (
      select 1 from public.merchants m
      where m.id::text = (storage.foldername(name))[1]
        and (m.profile_id = auth.uid() or public.can_admin_profile(m.profile_id))
    )
  );

-- ลูกค้าที่ล็อกอิน LINE แล้วกด "ดูร้าน" ร้านที่ปิดอยู่ได้หน้าว่าง (13 ต.ค. 2569)
-- 20261012b ให้ anon เห็นร้านที่ปิด แต่ authenticated ยังเห็นเฉพาะ is_open = true
-- → ให้ authenticated เห็นเหมือน anon (ไม่ใช่ร้านทดสอบ) การสั่งยังถูกกันด้วย shop_is_open ใน RPC
alter policy merchants_select_scoped on public.merchants
  using ((not is_test) or (profile_id = auth.uid()) or can_admin_profile(profile_id));

-- ย้อนกลับ:
-- alter policy merchants_select_scoped on public.merchants
--   using (((is_open = true) and (not is_test)) or (profile_id = auth.uid()) or can_admin_profile(profile_id));

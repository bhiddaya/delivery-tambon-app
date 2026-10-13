-- LLP ทดสอบ (13 ต.ค. 2569): ลูกค้าทดสอบ (profiles.is_test) เปิดหน้าร้านทดสอบได้
-- customer_food_review จับคู่ merchants.is_test = profiles.is_test อยู่แล้ว · ออเดอร์ทดสอบไม่สร้าง settlements ไม่แจ้งตัวแทน
-- ร้านทดสอบที่ใช้: "ร้านทดสอบ LLP" 1d2eee12-a587-4a09-ad5a-98749668a56e (คลองกุ่ม) สร้างด้วย execute_sql ไม่อยู่ในไฟล์นี้
alter policy merchants_select_scoped on public.merchants
  using ((not is_test) or (profile_id = auth.uid()) or can_admin_profile(profile_id)
    or (is_test and exists (select 1 from public.profiles x where x.id = auth.uid() and x.is_test)));

-- ย้อนกลับ: กลับไปใช้ 20261013a_signed_in_read_closed_shops.sql

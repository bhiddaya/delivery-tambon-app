-- ระดับ E (สิทธิ์ / RLS): ผู้ไม่ล็อกอินเห็นร้านที่ปิดอยู่และเมนูของร้านนั้นได้ (อ่านอย่างเดียว)
--
-- เหตุผล: หน้าสั่งอาหารใน LINE (/liff) ต้องแสดงร้านที่ปิดแบบจาง ๆ ให้ดูเมนู รูป ราคา และลองใส่ตะกร้าได้
--   ตามที่อาจารย์อนุมัติ 12 ต.ค. 2569 — การสั่งยังถูกปฏิเสธเมื่อร้านปิด (customer_food_review / ทริกเกอร์เดิม)
--
-- ขอบเขต: ร้านทดสอบยังซ่อนเหมือนเดิม (NOT is_test) · เมนูยังต้องพร้อมขายและไม่พักขาย · ไม่เปิดสิทธิ์เขียนใด ๆ
--   หน้าอื่นที่อ่านด้วย anon (/delivery, /t/[slug]) กรอง is_open = true เองอยู่แล้ว
--
-- แผนกู้ (ย้อนกลับ):
--   drop policy if exists merchants_select_public_open on public.merchants;
--   create policy merchants_select_public_open on public.merchants for select to anon using (is_open = true and not is_test);
--   drop policy if exists menu_items_select_public_open on public.menu_items;
--   create policy menu_items_select_public_open on public.menu_items for select to anon using (
--     is_available and not coalesce(is_hidden, false)
--     and exists (select 1 from public.merchants m where m.id = menu_items.merchant_id and m.is_open));
-- IDEMPOTENT: รันซ้ำได้

drop policy if exists merchants_select_public_open on public.merchants;
create policy merchants_select_public_open on public.merchants
  for select to anon
  using (not is_test);

drop policy if exists menu_items_select_public_open on public.menu_items;
create policy menu_items_select_public_open on public.menu_items
  for select to anon
  using (
    is_available
    and not coalesce(is_hidden, false)
    -- RLS ของ merchants กรองให้ anon เหลือเฉพาะร้านที่ไม่ใช่ร้านทดสอบ
    and exists (select 1 from public.merchants m where m.id = menu_items.merchant_id)
  );

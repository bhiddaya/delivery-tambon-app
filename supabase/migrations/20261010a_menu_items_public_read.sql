-- ระดับ E (สิทธิ์ / RLS): ให้คนที่ยังไม่ล็อกอินอ่านเมนูของร้านที่เปิดอยู่ได้ (ชื่อ ราคา รูป)
--
-- เหตุผล: หน้าร้านสาธารณะ /shop/[id] ต้องโชว์เมนู รูป ราคา ก่อนล็อกอิน
--   anon มีสิทธิ์ SELECT ระดับคอลัมน์บน menu_items อยู่แล้วทั้ง 8 คอลัมน์ ขาดแค่ policy ระดับแถว
--   (ตอนนี้มีแต่ menu_items_select_authenticated สำหรับ authenticated)
--
-- ขอบเขต: เฉพาะแถวที่ is_available และไม่ is_hidden และเป็นของร้านที่ anon มองเห็นได้
--   subquery บน merchants ถูก RLS ของ merchants กรองให้ anon เหลือเฉพาะร้านที่เปิดและไม่ใช่ร้านทดสอบ
--   (merchants_select_public_open: is_open = true AND NOT is_test) — policy นี้จึงไม่ต้องอ้าง is_test
--   ซึ่ง anon ไม่มีสิทธิ์อ่านคอลัมน์นั้น และไม่เปิดสิทธิ์เขียนใด ๆ
--
-- แผนกู้ (ย้อนกลับ): drop policy if exists menu_items_select_public_open on public.menu_items;
-- IDEMPOTENT: รันซ้ำได้

drop policy if exists menu_items_select_public_open on public.menu_items;

create policy menu_items_select_public_open on public.menu_items
  for select to anon
  using (
    is_available
    and not coalesce(is_hidden, false)
    and exists (
      select 1 from public.merchants m
      where m.id = menu_items.merchant_id
        and m.is_open
    )
  );

-- 20260910_search_menu.sql
--
-- ค้นหาสินค้า/เมนู จากชื่อ — ใช้ตอบคำถามในแชท LINE OA
--
-- ทำไมต้องเป็นฟังก์ชัน ไม่ใช่ query ตรง ๆ จากแอป:
-- webhook ของ LINE ไม่มี session ของผู้ใช้ (คนทักมายังไม่ได้สมัครก็ได้) จึงคุยกับ
-- ฐานข้อมูลในฐานะ anon เท่านั้น แต่ตอนนี้ menu_items เปิดให้อ่านเฉพาะ authenticated
-- ถ้าไม่ทำอะไรเลย การค้นหาในแชทจะคืนผลว่าง "ไม่พบ" ทุกคำ โดยไม่มี error ให้เห็น
--
-- ทางเลือกที่ไม่เลือก:
--   1) เปิด policy ให้ anon อ่าน menu_items ทั้งตาราง — กว้างเกินจำเป็น
--      anon จะอ่านได้แม้เมนูของร้านที่ปิดอยู่ และเมนูที่ร้านสั่งซ่อนไว้
--   2) ใช้ service key ในฝั่ง webhook — ให้อำนาจระดับข้ามทุก RLS
--      เพื่อทำงานอ่านอย่างเดียวชิ้นเดียว ไม่คุ้มความเสี่ยง
--
-- ที่เลือก: ฟังก์ชันเดียวที่คืนเฉพาะสิ่งที่แชทต้องใช้ตอบ
--   - ร้านที่เปิดอยู่เท่านั้น (is_open)
--   - สินค้าที่ยังขายและไม่ถูกซ่อน (is_available, not is_hidden)
--   - คืนเฉพาะคอลัมน์ที่ต้องแสดง ไม่คืนทั้งแถว
-- เท่ากับประกาศว่า "เมนูของร้านที่เปิดอยู่ = ข้อมูลสาธารณะ" ซึ่งตรงกับความจริง
-- ของร้านค้าอยู่แล้ว (ป้ายเมนูหน้าร้านก็ใครเดินผ่านก็อ่านได้)
--
-- ⚠️ เรื่องที่ต้องรู้: ภาษาไทยไม่มีช่องว่างระหว่างคำ Postgres จึงตัดคำไทยไม่ได้
-- full-text search จึงใช้ไม่ได้จริง ต้องใช้ ilike ซึ่งเป็นการค้นแบบ "สตริงย่อย"
-- ผลข้างเคียงที่ยอมรับ: ค้น "ชา" จะเจอ "ถ่านไบโอชาร์" ด้วย
-- ที่จำนวนสินค้าระดับตำบล ilike เร็วกว่า full-text อยู่แล้ว จึงไม่ต้องรีบแก้
--
-- แผนกู้: drop function public.search_menu(uuid, text);
-- ไม่มีข้อมูลเสียหาย ฟังก์ชันอ่านอย่างเดียว

create or replace function public.search_menu(
  p_query text,
  p_tambon uuid default null
)
returns table (
  merchant_id uuid,
  merchant_name text,
  merchant_category text,
  item_id uuid,
  item_name text,
  price numeric,
  photo_url text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.id, m.name, m.category, mi.id, mi.name, mi.price, mi.photo_url
    from public.menu_items mi
    join public.merchants m on m.id = mi.merchant_id
   where m.is_open
     and mi.is_available
     and not mi.is_hidden
     and (p_tambon is null or m.tambon_id = p_tambon)
     and length(btrim(p_query)) >= 2
     and mi.name ilike '%' || btrim(p_query) || '%'
   order by mi.price asc, mi.name asc
   limit 30;
$$;

revoke all on function public.search_menu(text, uuid) from public;
grant execute on function public.search_menu(text, uuid) to anon, authenticated, service_role;

comment on function public.search_menu(text, uuid) is
  'ค้นชื่อสินค้า/เมนูของร้านที่เปิดอยู่ ใช้ตอบในแชท LINE OA — อ่านอย่างเดียว คืนเฉพาะข้อมูลที่แสดงหน้าร้าน';

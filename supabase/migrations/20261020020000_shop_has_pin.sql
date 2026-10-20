-- ร้านที่ยังไม่ปักหมุด (lat/lng ว่าง) คิดค่าส่งไม่ได้ การสั่งจึงไปตกตอนสรุปยอด (food_chat_quote ตอบ shop_no_pin)
-- หน้ารายการร้าน /liff และหน้าเมนูร้านต้องรู้ก่อนลูกค้าใส่ตะกร้า แต่ anon อ่านคอลัมน์ lat,lng ไม่ได้ (ไม่เปิดพิกัดร้าน)
-- จึงคืนแค่ว่ามีหมุดหรือไม่ · ไม่แตะ shop_is_open และกติกาการสั่งเดิม
create or replace function public.shop_has_pin(p_merchant_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select m.lat is not null and m.lng is not null from public.merchants m where m.id = p_merchant_id), false);
$$;

revoke all on function public.shop_has_pin(uuid) from public;
grant execute on function public.shop_has_pin(uuid) to anon, authenticated, service_role;

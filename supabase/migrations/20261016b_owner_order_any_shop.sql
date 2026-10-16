-- อาจารย์สั่ง 16 ต.ค. 2569: ให้บัญชีเจ้าของ (superadmin) สั่งอาหารผ่าน LINE ได้ทุกร้านเหมือนลูกค้า
-- สาเหตุ: หลังย้าย LINE ของเจ้าของมาบัญชี superadmin (15 ต.ค.) liff_order ปฏิเสธ role_fixed_tambon
--   เมื่อบัญชีที่ไม่ใช่ customer สั่งร้านนอกตำบลของตัวเอง (กฎของร้านค้า/ไรเดอร์: สั่งได้เฉพาะตำบลตัวเอง)
-- แก้: superadmin ได้รับยกเว้นเหมือน customer · ออเดอร์ใช้ตำบลของร้าน และ customer_id = บัญชี superadmin เอง
--   (ไม่ย้ายตำบลของบัญชี superadmin เพราะส่วน elsif เดิมแก้เฉพาะ customer)
-- แก้ด้วยการแทนที่เงื่อนไขเดียวในนิยามฟังก์ชันเดิม ถ้าหาเงื่อนไขไม่เจอ (ฟังก์ชันถูกแก้ไปแล้ว) จะหยุดทันทีไม่เปลี่ยนอะไร

do $patch$
declare
  d text := pg_get_functiondef('public.liff_order(text, text)'::regprocedure);
  old_cond constant text := $o$v_role is distinct from 'customer' and v_ptambon is distinct from v_shop.tambon_id then$o$;
  new_cond constant text := $n$v_role not in ('customer', 'superadmin') and v_ptambon is distinct from v_shop.tambon_id then$n$;
begin
  if position(old_cond in d) = 0 then
    raise exception 'liff_order: เงื่อนไข role_fixed_tambon เดิมไม่พบ ยกเลิกการแก้';
  end if;
  execute replace(d, old_cond, new_cond);
end
$patch$;

-- ย้อนกลับ: แทนที่เงื่อนไขกลับเป็น v_role is distinct from 'customer' and v_ptambon is distinct from v_shop.tambon_id then (ด้วยวิธีเดียวกัน)

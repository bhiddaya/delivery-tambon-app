-- ค้นเมนูแบบใกล้เคียง สำหรับสั่งอาหารด้วยเสียงใน LINE (เจ้าของอนุมัติ 18 พ.ย. 2569)
--
-- Whisper ฟังชื่ออาหารผิดบ่อย (ข้าว→เข้า, ไก่→ไกล) แต่ food_flow('search') ค้นแบบ ilike ตรงตัว จึงตอบ "ไม่พบรายการ"
-- ค้นตรงตัวก่อนเหมือนเดิม ถ้าไม่เจอเลยในพื้นที่นั้น ใช้ pg_trgm word_similarity >= 0.4 เรียงจากใกล้สุด
-- ทดสอบกับเมนูจริง: แกงสม→แกงส้ม, คั่วกริ้ง→คั่วกลิ้ง, ลาบเต้าหู→ลาบเต้าหู้, ผัดวุ้นเส้นสองจาน→ผัดวุ้นเส้น, คำไม่เกี่ยว→ไม่พบ
--
-- แก้เฉพาะเงื่อนไขค้นใน food_flow โดยแทนข้อความในนิยามปัจจุบัน (หยุดทั้ง migration ถ้าหาไม่เจอ)
-- create or replace จาก pg_get_functiondef คงสิทธิ์ execute เดิม (postgres, service_role)
-- food_flow ตั้ง search_path = public, pg_temp จึงต้องเรียก extensions.word_similarity

do $patch$
declare
  d text := pg_get_functiondef('public.food_flow(text,text,text)'::regprocedure);
  old_cond text := $old$               and mi.name ilike '%' || btrim(p_arg) || '%'
             order by mi.price asc, mi.name asc
$old$;
  new_cond text := $new$               and (mi.name ilike '%' || btrim(p_arg) || '%'
                    -- ponytail: สแกนเมนูในพื้นที่เดียวโดยไม่มีดัชนี trigram เพิ่มดัชนีเมื่อเมนูต่อตำบลเป็นพันรายการ
                    or (not exists (select 1 from public.menu_items x join public.merchants y on y.id = x.merchant_id
                                     where public.shop_open_at(y.is_open,y.hours_enabled,y.opening_hours) and y.is_test = v_is_test and y.tambon_id = v_tambon
                                       and x.is_available and not coalesce(x.is_hidden, false)
                                       and x.name ilike '%' || btrim(p_arg) || '%')
                        and greatest(extensions.word_similarity(btrim(p_arg), mi.name), extensions.word_similarity(mi.name, btrim(p_arg))) >= 0.4))
             order by greatest(extensions.word_similarity(btrim(p_arg), mi.name), extensions.word_similarity(mi.name, btrim(p_arg))) desc, mi.price asc, mi.name asc
$new$;
begin
  if position(old_cond in d) = 0 then
    raise exception 'food_flow search block not found; not patched';
  end if;
  execute replace(d, old_cond, new_cond);
end
$patch$;

-- ย้อนกลับ: สลับ old_cond กับ new_cond ในบล็อกด้านบนแล้วรันอีกครั้ง

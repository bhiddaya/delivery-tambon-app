-- ค้นเมนูแบบใกล้เคียง: เทียบแบบตัดวรรณยุกต์และไม้หันอากาศด้วย (เจ้าของอนุมัติ 18 พ.ย. 2569)
--
-- ต่อจาก 20261118083348_food_search_fuzzy: Whisper ฟังคั่วกลิ้งเป็น "ควะกลิง" คะแนนเดิมได้ 0.15 ไม่ถึงเกณฑ์ 0.4
-- ตัดตัว ่ ้ ๊ ๋ ์ ั ็ ออกจากทั้งสองข้างก่อนเทียบ แล้วใช้คะแนนที่ดีที่สุดระหว่างแบบเดิมกับแบบตัดเครื่องหมาย
-- จึงได้ผลเท่าเดิมหรือดีกว่าเสมอ ทดสอบกับเมนูจริง: ควะกลิง→คั่วกลิ้ง 0.15→0.50, แกงสม→แกงส้ม 1.00, คำไม่เกี่ยว 0
--
-- แทนข้อความในนิยามปัจจุบันของ food_flow (หยุดทั้ง migration ถ้าหาไม่เจอ) สิทธิ์ execute เดิมคงอยู่

do $patch$
declare
  d text := pg_get_functiondef('public.food_flow(text,text,text)'::regprocedure);
  old_expr text := $old$greatest(extensions.word_similarity(btrim(p_arg), mi.name), extensions.word_similarity(mi.name, btrim(p_arg)))$old$;
  new_expr text := $new$greatest(extensions.word_similarity(btrim(p_arg), mi.name), extensions.word_similarity(mi.name, btrim(p_arg)),
                          extensions.word_similarity(translate(btrim(p_arg), 'ผ่้๊๋์ั็', 'ผ'), translate(mi.name, 'ผ่้๊๋์ั็', 'ผ')),
                          extensions.word_similarity(translate(mi.name, 'ผ่้๊๋์ั็', 'ผ'), translate(btrim(p_arg), 'ผ่้๊๋์ั็', 'ผ')))$new$;
begin
  if (length(d) - length(replace(d, old_expr, ''))) / length(old_expr) <> 2 then
    raise exception 'food_flow similarity expression not found twice; not patched';
  end if;
  execute replace(d, old_expr, new_expr);
end
$patch$;

-- ย้อนกลับ: สลับ old_expr กับ new_expr ในบล็อกด้านบนแล้วรันอีกครั้ง

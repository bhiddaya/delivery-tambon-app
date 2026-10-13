-- ต่อจาก 20261013g: food_chat_quote (สรุปยอด/ยืนยัน) จับคู่ is_test อีกชั้น → ให้ผู้ทดสอบ LLP สั่งร้านทดสอบได้
-- ทดสอบ rollback แล้ว: สรภณ review+confirm ได้ออเดอร์ is_test · ใจสุข/อาจารย์ review ผ่าน
do $$
declare d text;
begin
  d := pg_get_functiondef('public.food_chat_quote(text)'::regprocedure);
  if position('select id,coalesce(is_test,false) as is_test,tambon_id,role into p' in d) = 0
     or position('and mm.is_test=coalesce(p.is_test,false) and owner.approved' in d) = 0 then
    raise exception 'food_chat_quote: expected text not found';
  end if;
  d := replace(d, 'select id,coalesce(is_test,false) as is_test,tambon_id,role into p',
                  'select id,coalesce(is_test,false) as is_test,tambon_id,role,llp_tester into p');
  d := replace(d, 'and mm.is_test=coalesce(p.is_test,false) and owner.approved',
                  'and (mm.is_test=coalesce(p.is_test,false) or (mm.is_test and p.llp_tester)) and owner.approved');
  execute d;
end $$;
-- ย้อนกลับ: update profiles set llp_tester=false; แล้ว replace ข้อความกลับ (หรือ alter table profiles drop column llp_tester หลังคืนฟังก์ชัน)

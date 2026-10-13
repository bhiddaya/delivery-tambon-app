-- อาจารย์อนุมัติ 13 ต.ค. 2569: ผู้ทดสอบ LLP (profiles.llp_tester) สั่งร้านทดสอบได้ โดยบัญชีจริงทำงานเหมือนเดิม
-- (ตั้ง is_test กับไรเดอร์/ตัวแทนจริงไม่ได้ — ไรเดอร์ is_test ได้แค่งานทดสอบ) · ออเดอร์จากร้านทดสอบยังเป็น is_test (orders_mark_test)
alter table public.profiles add column if not exists llp_tester boolean not null default false;

do $$
declare
  d text;
begin
  d := pg_get_functiondef('public.customer_food_review(uuid,jsonb,jsonb,text)'::regprocedure);
  if position('and mm.is_test=p.is_test;' in d) = 0 then raise exception 'customer_food_review: is_test match not found'; end if;
  execute replace(d, 'and mm.is_test=p.is_test;', 'and (mm.is_test=p.is_test or (mm.is_test and p.llp_tester));');

  d := pg_get_functiondef('public.shop_is_open(uuid)'::regprocedure);
  if position('me.is_test and me.tambon_id=m.tambon_id' in d) = 0 then raise exception 'shop_is_open: tester clause not found'; end if;
  execute replace(d, 'me.is_test and me.tambon_id=m.tambon_id', '(me.is_test or me.llp_tester) and me.tambon_id=m.tambon_id');
end $$;

alter policy merchants_select_scoped on public.merchants
  using ((not is_test) or (profile_id = auth.uid()) or can_admin_profile(profile_id)
    or (is_test and exists (select 1 from public.profiles x where x.id = auth.uid() and (x.is_test or x.llp_tester))));

update public.profiles set llp_tester = true
 where id in ('2f74155b-151a-427a-b160-2096ab315667',  -- ใจสุข ธรรมชาติอโศก (ตัวแทนคลองกุ่ม, LINE)
              '3cb41bda-c0d5-48e7-be9d-b6b24f01f3ff',  -- สรภณ (ไรเดอร์คลองกุ่ม, LINE)
              'eef769ae-0a92-483f-a42e-291077d94f07'); -- Pittaya Sittichoti (ลูกค้า, LINE ของอาจารย์)
-- คืนบัญชีอาจารย์เป็นลูกค้าจริง (สั่งร้านจริงได้) — ยังสั่งร้านทดสอบได้ผ่าน llp_tester
update public.profiles set is_test = false where id = 'eef769ae-0a92-483f-a42e-291077d94f07';

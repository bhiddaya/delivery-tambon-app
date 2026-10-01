-- Dry run ของ supabase/migrations/20261002_test_data_dispatch.sql (D28 ขั้น 3 ส่วนฐานข้อมูล)
-- รันในธุรกรรมเดียวต่อจากเนื้อหา migration (วางสองไฟล์ต่อกันใน SQL editor)
-- จบด้วย error โดยตั้งใจ ทุกอย่างจึงย้อนกลับ ข้อความ error คือผลตรวจพร้อมค่าที่คาด
-- ข้อมูลจริงยังไม่มีไรเดอร์ออนไลน์ ร้านทดสอบ หรือคะแนน จึงจัดข้อมูลเองในธุรกรรมนี้ (ย้อนกลับทั้งหมด)
-- ผลบนฐานข้อมูลจริง 2 ต.ค. 2569: ผ่าน 25/25 ข้อ (ย้อนกลับแล้ว ตรวจซ้ำว่าไม่มีอะไรค้าง)
do $t$
declare
  tb uuid; d_real uuid; d_test uuid; m_real uuid; m_test uuid; item_test uuid; item_name text;
  c_test uuid; o bigint; st text; r jsonb; out text := '';
begin
  -- ไรเดอร์จริง (อนุมัติแล้ว) + ไรเดอร์ทดสอบที่อยู่ใกล้กว่า
  select p.id, p.tambon_id into d_real, tb from public.drivers d join public.profiles p on p.id = d.profile_id
   where coalesce(p.approved, false) and not p.is_test order by p.created_at limit 1;
  select d.profile_id into d_test from public.drivers d where d.profile_id <> d_real order by d.profile_id limit 1;
  update public.profiles set line_user_id = coalesce(line_user_id, 'dryrun-drv-real') where id = d_real;
  update public.profiles set is_test = true, approved = true, tambon_id = tb,
         line_user_id = coalesce(line_user_id, 'dryrun-drv-test') where id = d_test;
  update public.drivers set is_online = true, lat = 13.7000, lng = 100.6000, vehicle_type = 'motorcycle' where profile_id = d_real;
  update public.drivers set is_online = true, lat = 13.7001, lng = 100.6001, vehicle_type = 'motorcycle' where profile_id = d_test;

  -- 1) หาไรเดอร์ (เรียกแบบ named args 4 ตัวเหมือน n8n ตอนนี้)
  out := out||'nearest, real order (4 args): '||
    ((select profile_id from public.find_nearest_driver(p_order_lat => 13.7001, p_order_lng => 100.6001, p_tambon_id => tb, p_vehicle_type => null)) = d_real)||' (expect true = real driver)'||E'\n';
  out := out||'nearest, test order: '||
    ((select profile_id from public.find_nearest_driver(p_order_lat => 13.7001, p_order_lng => 100.6001, p_tambon_id => tb, p_vehicle_type => null, p_is_test => true)) = d_test)||' (expect true = test driver)'||E'\n';
  out := out||'agri, real order: '||
    coalesce(((select profile_id from public.find_agri_owner(p_order_lat => 13.7, p_order_lng => 100.6, p_tambon_id => tb, p_vehicle_type => 'motorcycle')) = d_real)::text, 'none')||' (expect true)'||E'\n';
  out := out||'agri, test order: '||
    coalesce(((select profile_id from public.find_agri_owner(p_order_lat => 13.7, p_order_lng => 100.6, p_tambon_id => tb, p_vehicle_type => 'motorcycle', p_is_test => true)) = d_test)::text, 'none')||' (expect true)'||E'\n';
  out := out||'old 4-arg versions left: '||(select count(*) from pg_proc where proname in ('find_nearest_driver','find_agri_owner') and pronargs = 4)||' (expect 0)'||E'\n';

  -- ร้านจริง + ร้านทดสอบ
  select m.id into m_real from public.merchants m where m.is_open and not m.is_test
     and exists (select 1 from public.menu_items mi where mi.merchant_id = m.id and mi.is_available and not coalesce(mi.is_hidden,false))
   order by (select count(*) from public.menu_items mi where mi.merchant_id = m.id) desc limit 1;
  select m.id into m_test from public.merchants m where m.is_open and m.id <> m_real
     and exists (select 1 from public.menu_items mi where mi.merchant_id = m.id and mi.is_available and not coalesce(mi.is_hidden,false))
   limit 1;
  update public.merchants set is_test = true where id = m_test;
  select mi.id, mi.name into item_test, item_name from public.menu_items mi
   where mi.merchant_id = m_test and mi.is_available and not coalesce(mi.is_hidden,false) limit 1;

  -- 2) ค้นสินค้า
  out := out||'search_menu shows test shop item: '||
    (select count(*) from public.search_menu(item_name, null) s where s.merchant_id = m_test)||' (expect 0)'||E'\n';

  -- 3) สั่งอาหาร: ลูกค้าจริง (ยังไม่มีโปรไฟล์) และบัญชีทดสอบ
  insert into public.profiles(role, full_name, line_user_id, tambon_id, is_test)
  values ('customer', 'dryrun test customer', 'dryrun-cust-test', tb, true) returning id into c_test;

  r := public.food_flow('shops', 'dryrun-cust-real', null);
  out := out||'real user shops include test shop: '||
    (select count(*) from jsonb_array_elements(r->'shops') s where (s->>'id')::uuid = m_test)||' (expect 0)'||E'\n';
  out := out||'real user shops include real shop: '||
    (select count(*) from jsonb_array_elements(r->'shops') s where (s->>'id')::uuid = m_real)||' (expect 1)'||E'\n';
  r := public.food_flow('shops', 'dryrun-cust-test', null);
  out := out||'test user shops only test: '||
    (select coalesce(bool_and((s->>'id')::uuid = m_test), false) from jsonb_array_elements(r->'shops') s)||' (expect true)'||E'\n';
  out := out||'real user opens test shop menu: '||(public.food_flow('menu', 'dryrun-cust-real', m_test::text)->>'error')||' (expect shop_closed)'||E'\n';
  out := out||'real user adds test item: '||(public.food_flow('add', 'dryrun-cust-real', item_test::text)->>'error')||' (expect item_unavailable)'||E'\n';
  r := public.food_flow('search', 'dryrun-cust-real', item_name);
  out := out||'real user search finds test item: '||
    (select count(*) from jsonb_array_elements(r->'items') i where (i->>'shop_id')::uuid = m_test)||' (expect 0)'||E'\n';
  r := public.food_flow('search', 'dryrun-cust-test', item_name);
  out := out||'test user search finds test item: '||
    ((select count(*) from jsonb_array_elements(r->'items') i where (i->>'shop_id')::uuid = m_test) > 0)||' (expect true)'||E'\n';
  out := out||'test user adds test item: '||(public.food_flow('add', 'dryrun-cust-test', item_test::text)->>'ok')||' (expect true)'||E'\n';
  r := public.food_flow('checkout', 'dryrun-cust-test', null);
  out := out||'test checkout ok: '||(r->>'ok')||' (expect true)'||E'\n';
  out := out||'test checkout order is_test: '||(select is_test from public.orders where id = (r->>'order_id')::bigint)||' (expect true)'||E'\n';

  -- 4) อันดับ (ยังไม่มีคะแนนจริง — ตรวจว่า view ใช้งานได้และกรองทดสอบ)
  out := out||'rankings readable: '||((select count(*) from public.driver_rankings) >= 0 and (select count(*) from public.merchant_rankings) >= 0)||' (expect true)'||E'\n';
  out := out||'rankings filter is_test: '||(pg_get_viewdef('public.driver_rankings'::regclass) like '%is_test%' and pg_get_viewdef('public.merchant_rankings'::regclass) like '%is_test%')||' (expect true)'||E'\n';

  -- 5) event ซ้ำ
  insert into public.orders (type, tambon_id, customer_id) values ('food', tb, c_test) returning id into o;
  update public.orders set status = 'cancelled' where id = o;
  out := out||'status change events: '||(select count(*) from public.order_events where order_id = o)||' (expect 2)'||E'\n';
  begin insert into public.order_events(order_id, status, note) values (o, 'cancelled', 'manual duplicate'); st := 'inserted';
  exception when others then st := sqlstate; end;
  out := out||'manual duplicate cancelled: '||st||' (expect 23505)'||E'\n';
  update public.order_events set note = 'เหตุผลการยกเลิก (dry run)' where order_id = o and status = 'cancelled';
  out := out||'note on existing row updated: '||(select note is not null from public.order_events where order_id = o and status = 'cancelled')||' (expect true)'||E'\n';

  -- สิทธิ์
  out := out||'find_agri_owner anon/auth/service: '||has_function_privilege('anon','public.find_agri_owner(double precision,double precision,uuid,text,boolean)','execute')
    ||'/'||has_function_privilege('authenticated','public.find_agri_owner(double precision,double precision,uuid,text,boolean)','execute')
    ||'/'||has_function_privilege('service_role','public.find_agri_owner(double precision,double precision,uuid,text,boolean)','execute')||' (expect false/false/true)'||E'\n';
  out := out||'food_flow anon: '||has_function_privilege('anon','public.food_flow(text,text,text)','execute')||' (expect false)'||E'\n';
  out := out||'search_menu anon: '||has_function_privilege('anon','public.search_menu(text,uuid)','execute')||' (expect true, unchanged)'||E'\n';
  out := out||'find_nearest_driver service: '||has_function_privilege('service_role','public.find_nearest_driver(double precision,double precision,uuid,text,boolean)','execute')||' (expect true)'||E'\n';

  raise exception E'DRY RUN (rolled back)\n%', out;
end $t$;

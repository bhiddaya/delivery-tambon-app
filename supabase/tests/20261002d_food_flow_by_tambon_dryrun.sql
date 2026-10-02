-- Dry run for 20261002d_food_flow_by_tambon.sql. Run in ONE transaction right after the migration
-- text; it always ends with an error on purpose, so everything (fixtures included) rolls back.
do $t$
declare
  bung uuid := (select id from public.tambons where slug = 'bungmai-warin-ubon');
  nawa uuid := (select id from public.tambons where slug = 'nawa-min');
  owner uuid; shop uuid; item uuid; merch_line text := 'Udryrun_merchant_000000000000001';
  cust_bung text := 'Udryrun_cust_bung_00000000000001';
  newbie text := 'Udryrun_newbie_000000000000000001';
  newbie2 text := 'Udryrun_newbie_000000000000000002';
  r jsonb; n int; out text := '';
begin
  -- fixtures: นวมินทร์ เปิดบริการชั่วคราว + ร้านจริง 1 ร้าน 1 เมนู; ลูกค้าบุ่งไหม 1 คน
  update public.tambons set is_active = true where id = nawa;
  insert into public.profiles(role, full_name, line_user_id, tambon_id, approved)
    values ('merchant', 'ร้านทดลอง dry run', merch_line, nawa, true) returning id into owner;
  update public.profiles set approved = true where id = owner;  -- trigger ตั้งร้านใหม่เป็นรออนุมัติ
  insert into public.merchants(profile_id, tambon_id, name, category, is_open)
    values (owner, nawa, 'ร้านนวมินทร์ dry run', 'อาหาร', true) returning id into shop;
  insert into public.menu_items(merchant_id, name, price, is_available)
    values (shop, 'ข้าวผัดดรายรัน', 50, true) returning id into item;
  insert into public.profiles(role, full_name, line_user_id, tambon_id)
    values ('customer', 'ลูกค้าบุ่งไหม dry run', cust_bung, bung);

  r := public.food_flow('shops', cust_bung);
  select count(*) into n from jsonb_array_elements(r->'shops') s where (s->>'id')::uuid = shop;
  out := out || '1 ลูกค้าบุ่งไหม เห็นร้านนวมินทร์: ' || n || ' (expect 0) · ok=' || (r->>'ok') || ' tambon=' || coalesce(r->>'tambon','-') || E'\n';

  r := public.food_flow('shops', newbie);
  out := out || '2 ผู้ใช้ใหม่ (2 ตำบลเปิด): ' || coalesce(r->>'error','ok') || ' tambons=' || jsonb_array_length(r->'tambons') || ' (expect need_tambon, 2)' || E'\n';

  r := public.food_flow('set_tambon', newbie, 'nawa-min');
  select count(*) into n from jsonb_array_elements(r->'shops') s where (s->>'id')::uuid = shop;
  out := out || '3 set_tambon nawa-min: ok=' || (r->>'ok') || ' เห็นร้าน=' || n || ' tambon_set=' || coalesce(r->>'tambon_set','-')
      || ' profile=' || (select count(*) from public.profiles where line_user_id = newbie and tambon_id = nawa and role = 'customer') || ' (expect true, 1, นวมินทร์, 1)' || E'\n';

  r := public.food_flow('search', cust_bung, 'ข้าวผัดดรายรัน');
  out := out || '4a ลูกค้าบุ่งไหมค้นเมนูนวมินทร์: ' || jsonb_array_length(r->'items') || ' (expect 0)' || E'\n';
  r := public.food_flow('search', newbie, 'ข้าวผัดดรายรัน');
  out := out || '4b ลูกค้านวมินทร์ค้น: ' || jsonb_array_length(r->'items') || ' (expect 1)' || E'\n';

  r := public.food_flow('menu', cust_bung, shop::text);
  out := out || '5 ลูกค้าบุ่งไหมเปิดเมนูร้านนวมินทร์: ' || coalesce(r->>'error','ok') || ' (expect shop_closed)' || E'\n';
  r := public.food_flow('add', cust_bung, item::text);
  out := out || '5b ลูกค้าบุ่งไหมใส่ตะกร้าเมนูนวมินทร์: ' || coalesce(r->>'error','ok') || ' (expect item_unavailable)' || E'\n';

  r := public.food_flow('add', newbie, item::text);
  out := out || '6 ลูกค้านวมินทร์ใส่ตะกร้า: ' || coalesce(r->>'error','ok') || ' count=' || coalesce(r->'cart'->>'count','-') || ' (expect ok, 1)' || E'\n';
  r := public.food_flow('checkout', newbie);
  out := out || '6b สั่ง: ' || coalesce(r->>'error','ok') || ' order tambon นวมินทร์=' ||
      coalesce((select (o.tambon_id = nawa)::text from public.orders o where o.id = (r->>'order_id')::bigint), '-') || ' (expect ok, true)' || E'\n';

  -- ตะกร้าข้ามตำบลที่ค้างอยู่ก่อน migration: checkout ต้องปฏิเสธ
  insert into public.carts(line_user_id, merchant_id, items) values (cust_bung, shop, jsonb_build_array(jsonb_build_object('id', item, 'qty', 1)))
    on conflict (line_user_id) do update set merchant_id = excluded.merchant_id, items = excluded.items;
  r := public.food_flow('checkout', cust_bung);
  out := out || '7 checkout ตะกร้าข้ามตำบล: ' || coalesce(r->>'error','ok') || ' (expect shop_closed)' || E'\n';

  r := public.food_flow('set_tambon', merch_line, 'bungmai-warin-ubon');
  out := out || '8 ร้านค้าเปลี่ยนตำบล: ' || coalesce(r->>'error','ok') || ' (expect role_fixed_tambon)' || E'\n';

  -- ปิดนวมินทร์กลับ: ลูกค้านวมินทร์ต้องเลือกตำบลใหม่, ตั้งตำบลที่ปิดไม่ได้
  update public.tambons set is_active = false where id = nawa;
  r := public.food_flow('shops', newbie);
  out := out || '9 ตำบลถูกปิด: ' || coalesce(r->>'error','ok') || ' (expect need_tambon)' || E'\n';
  r := public.food_flow('set_tambon', newbie2, 'nawa-min');
  out := out || '10 set_tambon ตำบลที่ยังไม่เปิด: ' || coalesce(r->>'error','ok') || ' (expect tambon_unavailable)' || E'\n';

  -- เหลือตำบลเปิดตำบลเดียว: ผู้ใช้ใหม่ใช้ได้เลยแบบเดิม และไม่สร้างบัญชี
  r := public.food_flow('shops', newbie2);
  out := out || '11 ผู้ใช้ใหม่ (1 ตำบลเปิด): ok=' || (r->>'ok') || ' tambon=' || coalesce(r->>'tambon','-')
      || ' profile=' || (select count(*) from public.profiles where line_user_id = newbie2) || ' (expect true, บุ่งไหม, 0)' || E'\n';

  r := public.food_flow('tambons', newbie2);
  out := out || '12 tambons: ' || jsonb_array_length(r->'tambons') || ' (expect 1)' || E'\n';
  out := out || '13 anon/authenticated execute: ' || has_function_privilege('anon','public.food_flow(text,text,text)','execute')
      || '/' || has_function_privilege('authenticated','public.food_flow(text,text,text)','execute') || ' (expect false/false)' || E'\n';

  raise exception E'DRY RUN (rolled back)\n%', out;
end $t$;

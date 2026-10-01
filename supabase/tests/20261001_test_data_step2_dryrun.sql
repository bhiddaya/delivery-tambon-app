-- Dry run ของ 20261001b_test_data_reports.sql + 20261001c_test_orders_no_settlement.sql (D28 ขั้น 2)
-- รันในธุรกรรมเดียวต่อจากเนื้อหาทั้งสอง migration (วางสามไฟล์ต่อกันใน SQL editor)
-- จบด้วย error โดยตั้งใจ ทุกอย่างจึงย้อนกลับ ข้อความ error คือผลตรวจพร้อมค่าที่คาด
-- ผลบนฐานข้อมูลจริง 1 ต.ค. 2569: ผ่าน 19/19 ข้อ (ย้อนกลับแล้ว ตรวจซ้ำว่าไม่มีอะไรค้าง)
do $t$
declare
  tb uuid; cust uuid; drv uuid; drv_t uuid; o_real bigint; o_test bigint; o_d_real bigint; o_d_test bigint;
  n int; n0 int; s0 jsonb; s1 jsonb; d0 record; d1 record; out text := '';
begin
  -- ข้อมูลจริงมีไรเดอร์อนุมัติแล้วคนเดียวและยังไม่มี LINE (1 ต.ค.) จึงจัดข้อมูลเองในธุรกรรมนี้:
  -- ไรเดอร์จริงได้ line_user_id ชั่วคราว, ไรเดอร์อีกคนกลายเป็นไรเดอร์ทดสอบที่อนุมัติแล้ว (ย้อนกลับทั้งหมด)
  select id, tambon_id into drv, tb from public.profiles
   where role='driver' and coalesce(approved,false) and not is_test order by created_at limit 1;
  select id into drv_t from public.profiles where role='driver' and id <> drv order by created_at limit 1;
  select id into cust from public.profiles where role='customer' and tambon_id=tb order by created_at limit 1;
  if cust is null then select id into cust from public.profiles where role='customer' order by created_at limit 1; end if;
  update public.profiles set line_user_id = coalesce(line_user_id, 'dryrun-line-real') where id = drv;
  update public.profiles set tambon_id = tb, approved = true, is_test = true,
         line_user_id = coalesce(line_user_id, 'dryrun-line-test') where id = drv_t;

  s0 := public.admin_stats_snapshot();
  select * into d0 from public.tambon_daily_stats() where tambon_id = tb;

  insert into public.orders (type, tambon_id, customer_id) values ('food', tb, cust) returning id into o_real;
  insert into public.orders (type, tambon_id, customer_id, is_test) values ('food', tb, cust, true) returning id into o_test;

  -- 1) ผู้รับแจ้ง
  if drv_t is not null then
    out := out||'real order → test driver listed: '||
      (select count(*) from public.line_targets_for_new_order(o_real) x
        join public.profiles p on p.line_user_id = x.line_user_id where p.id = drv_t)||' (expect 0)'||E'\n';
    out := out||'real order → real driver listed: '||
      (select count(*) from public.line_targets_for_new_order(o_real) x
        join public.profiles p on p.line_user_id = x.line_user_id where p.id = drv)||' (expect 1)'||E'\n';
    out := out||'test order → targets all test: '||
      (select coalesce(bool_and(p.is_test), true) from public.line_targets_for_new_order(o_test) x
        join public.profiles p on p.line_user_id = x.line_user_id)||' (expect true)'||E'\n';
    out := out||'test order → test driver listed: '||
      (select count(*) from public.line_targets_for_new_order(o_test) x
        join public.profiles p on p.line_user_id = x.line_user_id where p.id = drv_t)||' (expect 1)'||E'\n';
  else
    out := out||'only one approved driver in tambon — target split checked with one driver'||E'\n';
    out := out||'test order targets (no test drivers): '||(select count(*) from public.line_targets_for_new_order(o_test))||' (expect 0)'||E'\n';
  end if;

  -- 2) สรุปรายวัน: ออเดอร์จริง +1, ออเดอร์ทดสอบไม่นับ; ไรเดอร์ทดสอบไม่นับ
  select * into d1 from public.tambon_daily_stats() where tambon_id = tb;
  out := out||'daily orders_today delta: '||(d1.orders_today - d0.orders_today)||' (expect 1)'||E'\n';
  out := out||'daily pending_now delta: '||(d1.pending_now - d0.pending_now)||' (expect 1)'||E'\n';
  out := out||'daily drivers_total excludes test driver: '||
    ((select count(*) from public.profiles where tambon_id=tb and role='driver' and coalesce(approved,false))
     - d1.drivers_total)||' (expect 1)'||E'\n';

  -- 3) สถิติแอดมิน
  s1 := public.admin_stats_snapshot();
  out := out||'admin orders_total delta: '||((s1->>'orders_total')::int - (s0->>'orders_total')::int)||' (expect 1)'||E'\n';
  out := out||'admin test_data.orders delta: '||((s1#>>'{test_data,orders}')::int - (s0#>>'{test_data,orders}')::int)||' (expect 1)'||E'\n';
  out := out||'admin recent_orders has test order: '||
    (select count(*) from jsonb_array_elements(s1->'recent_orders') e where (e->>'id')::bigint = o_test)||' (expect 0)'||E'\n';

  -- 4) ล้างตะกร้า
  insert into public.carts (line_user_id, merchant_id, items, updated_at)
  values ('dryrun-old', null, '[]', now() - interval '8 days'),
         ('dryrun-new', null, '[]', now() - interval '1 day');
  n := public.purge_stale_carts();
  out := out||'purge removed dryrun-old: '||(not exists (select 1 from public.carts where line_user_id='dryrun-old'))||' (expect true)'||E'\n';
  out := out||'purge kept dryrun-new: '||(exists (select 1 from public.carts where line_user_id='dryrun-new'))||' (expect true)'||E'\n';
  out := out||'purge rows (info, includes real carts older than 7 days): '||n||E'\n';
  out := out||'anon can run purge: '||has_function_privilege('anon','public.purge_stale_carts(integer)','execute')||' (expect false)'||E'\n';
  out := out||'authenticated can run purge: '||has_function_privilege('authenticated','public.purge_stale_carts(integer)','execute')||' (expect false)'||E'\n';
  out := out||'service_role can run purge: '||has_function_privilege('service_role','public.purge_stale_carts(integer)','execute')||' (expect true)'||E'\n';

  -- 5) ยืนยันจ่ายเงิน: ออเดอร์จริงสร้างยอดค้างจ่าย ออเดอร์ทดสอบไม่สร้าง
  insert into public.orders (type, tambon_id, customer_id, driver_id, status, delivery_fee)
  values ('food', tb, cust, drv, 'delivered', 20) returning id into o_d_real;
  insert into public.orders (type, tambon_id, customer_id, driver_id, status, delivery_fee, is_test)
  values ('food', tb, cust, drv, 'delivered', 20, true) returning id into o_d_test;
  perform set_config('request.jwt.claims', json_build_object('sub', cust, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', cust::text, true);
  select count(*) into n0 from public.settlements;
  perform public.confirm_customer_payment(o_d_real, null);
  perform public.confirm_customer_payment(o_d_test, null);
  out := out||'real order settlements: '||(select count(*) from public.settlements where order_id=o_d_real)||' (expect 1)'||E'\n';
  out := out||'test order settlements: '||(select count(*) from public.settlements where order_id=o_d_test)||' (expect 0)'||E'\n';
  out := out||'test order marked paid: '||(select customer_paid_at is not null from public.orders where id=o_d_test)||' (expect true)'||E'\n';

  raise exception E'DRY RUN (rolled back)\n%', out;
end $t$;

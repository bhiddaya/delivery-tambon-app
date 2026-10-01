-- Dry run ของ supabase/migrations/20261001_test_data_flags.sql (D28 ขั้น 1)
-- รันในธุรกรรมเดียวต่อจากเนื้อหา migration (เช่น วางทั้งสองไฟล์ใน SQL editor)
-- จบด้วย error โดยตั้งใจ ทุกอย่างจึงย้อนกลับ ข้อความ error คือผลตรวจพร้อมค่าที่คาด
-- ผลบนฐานข้อมูลจริง 1 ต.ค. 2569: ผ่านทุกข้อ (ย้อนกลับแล้ว ตรวจซ้ำว่าไม่มีอะไรค้าง)
do $t$
declare
  cust uuid; cust2 uuid; tb uuid; sa uuid; o1 bigint; o2 bigint; n int; st text; out text := ''; q0 int; q1 int;
begin
  select id, tambon_id into cust, tb from public.profiles where role='customer' and tambon_id is not null order by created_at limit 1;
  select id into cust2 from public.profiles where role='customer' and tambon_id = tb and id <> cust order by created_at limit 1;
  select id into sa from public.profiles where role='superadmin' limit 1;
  select count(*) into n from public.orders where id in (87,98) and is_test; out := out||'87/98 marked: '||n||' (expect 2)'||E'\n';
  update public.orders set is_test = true where id in (87, 98) and not is_test;  -- รันซ้ำได้
  select count(*) into q0 from net.http_request_queue;
  update public.profiles set is_test = true where id = cust;
  insert into public.orders (type, tambon_id, customer_id) values ('food', tb, cust) returning id into o1;
  insert into public.orders (type, tambon_id, customer_id) values ('food', tb, cust2) returning id into o2;
  select count(*) into q1 from net.http_request_queue;
  out := out||'test customer order is_test: '||(select is_test from public.orders where id=o1)||' (expect true)'||E'\n';
  out := out||'normal customer order is_test: '||(select is_test from public.orders where id=o2)||' (expect false)'||E'\n';
  out := out||'notify queued (rolled back, info): '||(q1-q0)||E'\n';
  begin delete from public.orders where id = o2; st := 'deleted'; exception when others then st := sqlstate; end;
  out := out||'delete without flag: '||st||' (expect 42501)'||E'\n';
  perform set_config('delivery.allow_order_delete','on',true);
  begin delete from public.orders where id = o2; st := 'deleted'; exception when others then st := sqlstate; end;
  out := out||'delete with flag, no actor: '||st||' (expect 42501)'||E'\n';
  perform set_config('delivery.delete_actor', cust::text, true);
  begin delete from public.orders where id = o2; st := 'deleted'; exception when others then st := sqlstate; end;
  out := out||'delete with non-superadmin actor: '||st||' (expect 42501)'||E'\n';
  perform set_config('delivery.delete_actor', sa::text, true);
  perform set_config('delivery.delete_reason','short',true);
  begin delete from public.orders where id = o2; st := 'deleted'; exception when others then st := sqlstate; end;
  out := out||'delete short reason: '||st||' (expect 22023)'||E'\n';
  perform set_config('delivery.delete_reason','dry run: ลบออเดอร์ทดสอบที่สร้างในธุรกรรมนี้',true);
  select count(*) into n from public.admin_actions;
  begin delete from public.orders where id = o2; st := 'deleted'; exception when others then st := sqlstate; end;
  out := out||'delete full: '||st||' (expect deleted)'||E'\n';
  out := out||'admin_actions added: '||((select count(*) from public.admin_actions) - n)||' (expect 1)'||E'\n';
  raise exception E'DRY RUN (rolled back)\n%', out;
end $t$;

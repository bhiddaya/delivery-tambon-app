-- Dry run for 20261003_d36_approved_drivers_only.sql. Run in ONE transaction right after the migration
-- text; it always ends with an error on purpose, so everything (fixtures included) rolls back.
do $t$
declare
  bung uuid := (select id from public.tambons where slug = 'bungmai-warin-ubon');
  ok_p uuid; new_p uuid; test_p uuid; r record; out text := ''; n int;
begin
  -- ปิดออนไลน์ไรเดอร์จริงทุกคนก่อน (ภายในธุรกรรมนี้) เพื่อให้ผลขึ้นกับ fixture เท่านั้น
  update public.drivers set is_online = false;
  insert into public.profiles(role, full_name, line_user_id, tambon_id, approved)
    values ('driver', 'dry run ไรเดอร์อนุมัติแล้ว', 'Udryrun_driver_ok_00000000000001', bung, true) returning id into ok_p;
  update public.profiles set approved = true where id = ok_p;
  insert into public.profiles(role, full_name, line_user_id, tambon_id, approved)
    values ('driver', 'dry run ไรเดอร์ยังไม่อนุมัติ', 'Udryrun_driver_new_0000000000001', bung, false) returning id into new_p;
  update public.profiles set approved = false where id = new_p;
  insert into public.profiles(role, full_name, line_user_id, tambon_id, approved, is_test)
    values ('driver', 'dry run ไรเดอร์ทดสอบ', 'TEST_dryrun_driver_000000000001', bung, false, true) returning id into test_p;
  update public.profiles set approved = false, is_test = true where id = test_p;
  -- ไรเดอร์ยังไม่อนุมัติอยู่ใกล้กว่า (ระยะ 0) ไรเดอร์อนุมัติแล้วอยู่ห่างออกไป
  insert into public.drivers(profile_id, vehicle_type, is_online, lat, lng) values
    (new_p, 'motorcycle', true, 15.20, 104.80),
    (ok_p, 'motorcycle', true, 15.25, 104.85),
    (test_p, 'motorcycle', true, 15.20, 104.80);

  select * into r from public.find_nearest_driver(15.20, 104.80, bung, 'motorcycle', false);
  out := out || '1 ออเดอร์จริง ได้ไรเดอร์: ' || coalesce(case r.profile_id when ok_p then 'อนุมัติแล้ว' when new_p then 'ยังไม่อนุมัติ' when test_p then 'ทดสอบ' else 'อื่น' end, 'ไม่มี') || ' (expect อนุมัติแล้ว)' || E'\n';

  update public.drivers set is_online = false where profile_id = ok_p;
  select count(*) into n from public.find_nearest_driver(15.20, 104.80, bung, 'motorcycle', false);
  out := out || '2 เหลือแต่ไรเดอร์ยังไม่อนุมัติออนไลน์: ' || n || ' คน (expect 0)' || E'\n';

  select * into r from public.find_nearest_driver(15.20, 104.80, bung, 'motorcycle', true);
  out := out || '3 ออเดอร์ทดสอบ ได้ไรเดอร์: ' || coalesce(case r.profile_id when test_p then 'ทดสอบ' when new_p then 'ยังไม่อนุมัติ' else 'อื่น' end, 'ไม่มี') || ' (expect ทดสอบ)' || E'\n';

  update public.drivers set is_online = true where profile_id = ok_p;
  update public.profiles set line_user_id = null where id = ok_p;
  select count(*) into n from public.find_nearest_driver(15.20, 104.80, bung, 'motorcycle', false);
  out := out || '4 ไรเดอร์อนุมัติแล้วแต่ไม่ผูก LINE: ' || n || ' คน (expect 0)' || E'\n';

  out := out || '5 execute anon/authenticated/service_role: '
    || has_function_privilege('anon', 'public.find_nearest_driver(double precision,double precision,uuid,text,boolean)', 'execute') || '/'
    || has_function_privilege('authenticated', 'public.find_nearest_driver(double precision,double precision,uuid,text,boolean)', 'execute') || '/'
    || has_function_privilege('service_role', 'public.find_nearest_driver(double precision,double precision,uuid,text,boolean)', 'execute')
    || ' (expect false/false/true)' || E'\n';
  raise exception E'DRY RUN (rolled back)\n%', out;
end $t$;

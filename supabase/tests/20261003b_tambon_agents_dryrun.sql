-- Dry run for 20261003b_tambon_agents.sql. Run in ONE transaction right after the migration text;
-- it always ends with an error on purpose, so everything (fixtures included) rolls back.
do $t$
declare
  sa uuid := (select id from public.profiles where role = 'superadmin' order by created_at limit 1);
  bung uuid := (select id from public.tambons where slug = 'bungmai-warin-ubon');
  nawa uuid := (select id from public.tambons where slug = 'nawa-min');
  agent uuid; app uuid; newt uuid; g1 uuid; g2 uuid; n int; st text; out text := '';
  fee0 numeric := (select delivery_fee_base from public.tambons where slug = 'bungmai-warin-ubon');
begin
  insert into public.profiles(role, full_name, line_user_id, tambon_id)
    values ('merchant', 'dry run ตัวแทน', 'Udryrun_agent_00000000000000001', bung) returning id into agent;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  g1 := public.tambon_admin_grant(agent, bung, 'dry run');
  g2 := public.tambon_admin_grant(agent, bung, 'ซ้ำ');
  out := out || '1 ส่วนกลางแต่งตั้ง (ซ้ำได้ id เดิม): ' || (g1 = g2) || ' (expect true)' || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub', agent, 'role', 'authenticated')::text, true);
  out := out || '2 ตัวแทนดูแลบุ่งไหม/นวมินทร์: ' || public.can_admin_tambon(bung) || '/' || public.can_admin_tambon(nawa) || ' (expect true/false)' || E'\n';
  update public.tambons set delivery_fee_base = 25 where id = bung; get diagnostics n = row_count;
  out := out || '3 ตัวแทนตั้งค่าส่งตำบลตัวเอง: ' || n || ' แถว (expect 1)' || E'\n';
  begin update public.tambons set is_active = false where id = bung; st := 'ok'; exception when others then st := sqlstate; end;
  out := out || '4 ตัวแทนปิดบริการเอง: ' || st || ' (expect 42501)' || E'\n';
  begin update public.tambons set deposit_amount = 0 where id = bung; st := 'ok'; exception when others then st := sqlstate; end;
  out := out || '5 ตัวแทนแก้เงินค้ำประกัน: ' || st || ' (expect 42501 หรือ ok ถ้าค่าเท่าเดิม)' || E'\n';
  begin update public.tambons set deposit_amount = 999 where id = bung; st := 'ok'; exception when others then st := sqlstate; end;
  out := out || '5b ตัวแทนเปลี่ยนเงินค้ำประกัน: ' || st || ' (expect 42501)' || E'\n';
  update public.tambons set delivery_fee_base = 25 where id = nawa; get diagnostics n = row_count;
  out := out || '6 ตัวแทนแก้ตำบลอื่น: ' || n || ' แถว (expect 0)' || E'\n';
  begin perform public.tambon_admin_grant(agent, nawa, 'ตั้งตัวเอง'); st := 'ok'; exception when others then st := sqlstate; end;
  out := out || '7 ตัวแทนแต่งตั้งเอง: ' || st || ' (expect 42501)' || E'\n';
  begin perform public.refresh_intake_block(bung); st := 'ok'; exception when others then st := sqlstate; end;
  out := out || '8 งานระบบ refresh_intake_block ในนามตัวแทน: ' || st || ' (expect ok)' || E'\n';

  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  update public.tambons set is_active = is_active, deposit_amount = deposit_amount + 1 where id = nawa; get diagnostics n = row_count;
  out := out || '9 ส่วนกลางแก้เงินค้ำประกัน: ' || n || ' แถว (expect 1)' || E'\n';
  out := out || '10 ถอด: ' || public.tambon_admin_revoke(agent, bung, 'dry run') || ' (expect true)' || E'\n';
  perform set_config('request.jwt.claims', json_build_object('sub', agent, 'role', 'authenticated')::text, true);
  update public.tambons set delivery_fee_base = 30 where id = bung; get diagnostics n = row_count;
  out := out || '11 หลังถอด ตัวแทนแก้ตำบล: ' || n || ' แถว (expect 0)' || E'\n';

  perform set_config('role', 'postgres', true);
  insert into public.tambon_applications(tambon_name, district, province, applicant_name, applicant_phone, applicant_profile_id)
    values ('dry run ตำบลทดสอบ', 'อำเภอทดสอบ', 'จังหวัดทดสอบ', 'ผู้สมัคร dry run', '0000000000', agent) returning id into app;
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', sa, 'role', 'authenticated')::text, true);
  newt := public.approve_tambon_application(app_id => app, tambon_slug => 'dryrun-test-tambon', review_note => 'dry run', p_make_applicant_admin => true);
  select count(*) into n from public.admin_scopes where profile_id = agent and tambon_id = newt;
  out := out || '12 อนุมัติใบเปิดตำบล + ตั้งผู้สมัครเป็นตัวแทน: ' || n || ' (expect 1)' || E'\n';

  perform set_config('role', 'postgres', true);
  select count(*) into n from public.admin_actions where target_id = agent and action like 'tambon_admin.%';
  out := out || '13 บันทึก admin_actions: ' || n || ' (expect 3 = grant บุ่งไหม, revoke, grant ตำบลใหม่)' || E'\n';
  out := out || '14 anon execute grant/approve: ' || has_function_privilege('anon','public.tambon_admin_grant(uuid,uuid,text)','execute')
     || '/' || has_function_privilege('anon','public.approve_tambon_application(uuid,text,text,boolean)','execute') || ' (expect false/false)' || E'\n';
  raise exception E'DRY RUN (rolled back)\n%', out;
end $t$;

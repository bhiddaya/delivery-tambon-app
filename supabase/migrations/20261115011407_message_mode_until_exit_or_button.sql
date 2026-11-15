CREATE OR REPLACE FUNCTION public.message_flow(p_user text, p_input text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_in text := btrim(coalesce(p_input, ''));
  v_prof record; v_sess public.message_sessions;
  v_hq boolean; v_scope uuid[]; v_agent boolean; v_role text; v_tambon uuid; v_tname text;
  v_parts text[]; v_act text; v_arg text; v_d jsonb; v_m public.messages; v_orig public.messages;
  v_to_label text; v_btns jsonb; v_warn boolean; v_ticket text; v_recips text[];
  v_push jsonb := '[]'::jsonb; v_text text; v_aud text[]; v_can boolean; v_nick text; v_real text;
  v_list text; v_res jsonb;
begin
  if v_in like 'msg|%' then
    v_parts := string_to_array(v_in, '|'); v_act := v_parts[2]; v_arg := v_parts[3];
  elsif v_in = 'ส่งข้อความ' then v_act := 'start';
  elsif v_in = 'ติดตามข้อความ' then v_act := 'mine';
  elsif v_in = 'กล่องข้อความ' then v_act := 'inbox';
  elsif v_in ~ '^ตั้งชื่อแสดง\s' then v_act := 'nick'; v_arg := btrim(regexp_replace(v_in, '^ตั้งชื่อแสดง\s*', ''));
  end if;

  select * into v_sess from public.message_sessions where line_user_id = p_user;

  -- สอนคำตอบ: superadmin พิมพ์ "สอนคำตอบ" หรือ "สอน" เปล่า ๆ แล้วได้วิธีสอนแบบสั้น (ไม่ใช่เรื่องข้อความ และจบร่างที่ค้างอยู่)
  if v_in in ('สอน','สอนคำตอบ') and (
       exists (select 1 from public.staff_line_accounts s where s.line_user_id = p_user and s.level = 'superadmin')
    or exists (select 1 from public.profiles p where p.line_user_id = p_user and p.role = 'superadmin')) then
    update public.message_sessions set step = null, draft = '{}'::jsonb, updated_at = now() where line_user_id = p_user;
    return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text',
      'สอนคำตอบผ่าน LINE' || E'\n' ||
      'พิมพ์: สอนคำตอบ : คำถาม/คำตอบ' || E'\n' ||
      'ตัวอย่าง: สอนคำตอบ : ตลาดนัดวันไหน/ตลาดนัดเปิดทุกวันพุธ 16:00-20:00' || E'\n' ||
      'คำตอบที่สอนจะรออนุมัติ กดอนุมัติในการ์ดที่บอทส่งกลับ' || E'\n' ||
      'ดูรายการที่รอสอน: พิมพ์ คำถามรอสอน'));
  end if;

  -- ร่างข้อความที่ค้างอยู่ (พิมพ์เรื่อง/ตอบ/เหตุผล) ต้องไม่กลืนคำสั่งของบริการอื่น เช่น "เพิ่มสินค้า":
  -- จบร่างเดิมแล้วคืน handled=false ให้ LINE OA หลักทำงานตามปกติ
  if v_sess.step is not null and v_act is null and public._is_service_command(p_user, v_in) then
    update public.message_sessions set step = null, draft = '{}'::jsonb, updated_at = now() where line_user_id = p_user;
    return jsonb_build_object('ok', true, 'handled', false);
  end if;

  if v_act is null and (v_in like 'dir|%' or v_sess.step = 'await_dnote') then
    return public.directive_flow(p_user, p_input);
  end if;

  if v_act is null then
    if v_in = 'ยกเลิก' and v_sess.step is not null then v_act := 'cancel';
    elsif v_sess.step in ('await_text','await_reply') and v_in <> '' then v_act := 'text'; v_arg := v_in;
    else return jsonb_build_object('ok', true, 'handled', false);
    end if;
  end if;

  insert into public.message_sessions(line_user_id) values (p_user) on conflict do nothing;
  select * into v_sess from public.message_sessions where line_user_id = p_user;
  select p.id, p.role::text as role, p.full_name, p.tambon_id, p.approved, coalesce(p.is_test, false) as is_test
    into v_prof from public.profiles p where p.line_user_id = p_user limit 1;
  if v_prof.id is null then
    return jsonb_build_object('ok', true, 'handled', true,
      'reply', jsonb_build_object('text', 'ยังไม่พบบัญชีของคุณ กรุณาผูกบัญชี LINE กับร้าน/ไรเดอร์ หรือเลือกตำบลก่อนใช้ส่งข้อความ ค่ะ'));
  end if;

  v_hq := v_prof.role = 'superadmin'
       or exists (select 1 from public.staff_line_accounts s where s.line_user_id = p_user and s.level in ('superadmin','admin'))
       or exists (select 1 from public.admin_scopes s where s.profile_id = v_prof.id and s.tambon_id is null);
  v_scope := array(select x from (
      select v_prof.tambon_id as x where v_prof.role = 'admin' and coalesce(v_prof.approved, false)
      union select s.tambon_id from public.admin_scopes s where s.profile_id = v_prof.id) q where x is not null);
  v_agent := not v_hq and cardinality(v_scope) > 0;
  v_role := case when v_hq then 'hq' when v_agent then 'agent'
                 when v_prof.role in ('customer','merchant','driver') then v_prof.role else 'customer' end;
  v_tambon := coalesce(v_prof.tambon_id, v_scope[1]);
  select regexp_replace(t.name, '^ตำบล', '') into v_tname from public.tambons t where t.id = v_tambon;
  v_d := v_sess.draft;

  if v_act = 'nick' then
    if v_arg = '' or char_length(v_arg) > 30 then
      return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'พิมพ์ ตั้งชื่อแสดง ตามด้วยชื่อที่ต้องการ (ไม่เกิน 30 ตัวอักษร) เช่น ตั้งชื่อแสดง ป้าบุญ'));
    end if;
    update public.message_sessions set nickname = v_arg, updated_at = now() where line_user_id = p_user;
    return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object(
      'text', 'ตั้งชื่อที่แสดงเป็น "' || v_arg || '" แล้ว' || case when v_sess.show_real then ' (จะแสดงชื่อจริงต่อท้ายด้วย)' else '' end,
      'buttons', jsonb_build_array(
        jsonb_build_object('label', case when v_sess.show_real then 'ซ่อนชื่อจริง' else 'แสดงชื่อจริงด้วย' end, 'data', 'msg|real|' || case when v_sess.show_real then 'off' else 'on' end))));
  end if;

  if v_act = 'real' then
    update public.message_sessions set show_real = (v_arg = 'on'), updated_at = now() where line_user_id = p_user;
    return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', case when v_arg = 'on' then 'จะแสดงชื่อจริงต่อท้ายชื่อที่ตั้ง' else 'จะแสดงเฉพาะชื่อที่ตั้ง' end));
  end if;

  if v_act = 'start' then
    update public.message_sessions set step = null, draft = '{}', updated_at = now() where line_user_id = p_user;
    v_btns := case v_role
      when 'hq' then jsonb_build_array(jsonb_build_object('label', 'ส่งถึงตัวแทนตำบล', 'data', 'msg|pick|agent'), jsonb_build_object('label', 'โพสต์ประกาศ', 'data', 'msg|pick|announce'))
      when 'agent' then jsonb_build_array(jsonb_build_object('label', 'ส่งถึงทีมบวรไทย', 'data', 'msg|pick|hq'))
      else jsonb_build_array(jsonb_build_object('label', 'ตัวแทนตำบลของฉัน', 'data', 'msg|pick|agent'), jsonb_build_object('label', 'ทีมบวรไทย', 'data', 'msg|pick|hq')) end;
    return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'ต้องการส่งข้อความถึงใคร', 'buttons', v_btns));
  end if;

  if v_act = 'pick' then
    if v_arg = 'hq' and v_role <> 'hq' then
      v_d := jsonb_build_object('kind', 'tambon_to_hq');
    elsif v_arg = 'agent' and v_role in ('customer','merchant','driver') then
      if v_tambon is null then
        return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'ยังไม่ได้เลือกตำบล กรุณาเลือกตำบลก่อนส่งข้อความ'));
      end if;
      v_d := jsonb_build_object('kind', 'in_tambon', 'to_tambon', v_tambon);
    elsif v_arg = 'agent' and v_role = 'hq' then
      return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'เลือกตำบลปลายทาง',
        'buttons', coalesce((select jsonb_agg(jsonb_build_object('label', t.name, 'data', 'msg|pick|t:' || t.slug) order by t.name)
                              from public.tambons t where t.is_active and t.slug is not null), '[]'::jsonb)));
    elsif v_arg like 't:%' and v_role = 'hq' then
      if not exists (select 1 from public.tambons t where t.slug = substr(v_arg, 3) and t.is_active) then
        return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'ไม่พบตำบลนี้'));
      end if;
      v_d := jsonb_build_object('kind', 'hq_to_tambon', 'to_tambon', (select t.id from public.tambons t where t.slug = substr(v_arg, 3)));
    elsif v_arg = 'announce' and v_role = 'hq' then
      update public.message_sessions set step = 'await_audience', draft = jsonb_build_object('kind', 'announce'), updated_at = now() where line_user_id = p_user;
      return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'ประกาศถึงใคร',
        'buttons', jsonb_build_array(
          jsonb_build_object('label', 'ทุกคน', 'data', 'msg|aud|all'), jsonb_build_object('label', 'ลูกค้า', 'data', 'msg|aud|customer'),
          jsonb_build_object('label', 'ร้านค้า', 'data', 'msg|aud|merchant'), jsonb_build_object('label', 'ไรเดอร์', 'data', 'msg|aud|driver'),
          jsonb_build_object('label', 'ตัวแทนตำบล', 'data', 'msg|aud|agent'))));
    else
      return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'ตัวเลือกนี้ใช้ไม่ได้กับบทบาทของคุณ พิมพ์ ส่งข้อความ เพื่อเริ่มใหม่'));
    end if;
    update public.message_sessions set step = 'await_text', draft = v_d, updated_at = now() where line_user_id = p_user;
    return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'พิมพ์เรื่องที่ต้องการแจ้ง (ไม่เกิน 500 ตัวอักษร) หรือพิมพ์ ยกเลิก'));
  end if;

  if v_act = 'aud' then
    if v_role <> 'hq' or v_sess.step is distinct from 'await_audience' or v_arg not in ('all','customer','merchant','driver','agent') then
      return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'พิมพ์ ส่งข้อความ เพื่อเริ่มใหม่'));
    end if;
    update public.message_sessions set step = 'await_text', draft = v_d || jsonb_build_object('audience', jsonb_build_array(v_arg)), updated_at = now() where line_user_id = p_user;
    return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'พิมพ์ข้อความประกาศ (ไม่เกิน 500 ตัวอักษร) หรือพิมพ์ ยกเลิก'));
  end if;

  if v_act = 'text' then
    if char_length(v_arg) > 500 then
      return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'ข้อความยาว ' || char_length(v_arg) || ' ตัวอักษร เกิน 500 กรุณาย่อแล้วพิมพ์ใหม่'));
    end if;
    v_warn := v_arg ~ '(0[0-9]{8,9}|[0-9]{13})';
    v_d := v_d || jsonb_build_object('body', v_arg);
    update public.message_sessions set step = 'confirm', draft = v_d, updated_at = now() where line_user_id = p_user;
    v_to_label := case coalesce(v_d ->> 'kind', 'reply')
      when 'in_tambon' then 'ตัวแทนตำบล' || coalesce(v_tname, '')
      when 'tambon_to_hq' then 'ทีมบวรไทย'
      when 'hq_to_tambon' then 'ตัวแทนตำบล' || coalesce((select regexp_replace(t.name, '^ตำบล', '') from public.tambons t where t.id = (v_d ->> 'to_tambon')::uuid), '')
      when 'announce' then 'ประกาศถึง: ' || (select string_agg(case a when 'all' then 'ทุกคน' else public._msg_role_th(a) end, ', ') from jsonb_array_elements_text(v_d -> 'audience') a)
      else 'ผู้ที่เกี่ยวข้องกับเรื่อง ' || (v_d ->> 'reply_ticket') end;
    return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object(
      'text', 'ตรวจก่อนส่ง' || E'\nถึง: ' || v_to_label || E'\nจาก: ' || coalesce(v_sess.nickname, v_prof.full_name, 'ไม่ระบุชื่อ')
              || coalesce(' · ตำบล' || v_tname, '') || ' · ' || public._msg_role_th(v_role) || E'\n\n' || v_arg
              || case when v_warn then E'\n\n⚠ ข้อความมีตัวเลขที่คล้ายเบอร์โทรหรือเลขบัตร ตรวจอีกครั้งว่าต้องการส่งจริง' else '' end,
      'buttons', jsonb_build_array(jsonb_build_object('label', 'ส่ง', 'data', 'msg|send'), jsonb_build_object('label', 'แก้ไข', 'data', 'msg|edit'), jsonb_build_object('label', 'ยกเลิก', 'data', 'msg|cancel'))));
  end if;

  if v_act = 'edit' then
    update public.message_sessions set step = case when v_d ? 'reply_ticket' then 'await_reply' else 'await_text' end, updated_at = now() where line_user_id = p_user;
    return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'พิมพ์ข้อความใหม่ได้เลย'));
  end if;

  if v_act = 'cancel' then
    if v_arg is not null and v_arg like 'MSG-%' then
      update public.messages set status = 'cancelled', updated_at = now()
       where ticket_no = v_arg and from_profile_id = v_prof.id and status = 'sent' and kind <> 'announce' returning * into v_m;
      if v_m.id is null then
        return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'ยกเลิกไม่ได้ เพราะผู้รับเปิดอ่านหรือรับเรื่องไปแล้ว'));
      end if;
      insert into public.message_events(message_id, event, actor_profile_id, actor_role, actor_tambon_id) values (v_m.id, 'cancelled', v_prof.id, v_role, v_tambon);
      return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'ยกเลิกเรื่อง ' || v_arg || ' แล้ว'));
    end if;
    update public.message_sessions set step = null, draft = '{}', updated_at = now() where line_user_id = p_user;
    return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'ยกเลิกแล้ว'));
  end if;

  if v_act = 'send' then
    if v_sess.step is distinct from 'confirm' or coalesce(v_d ->> 'body', '') = '' then
      return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'ไม่มีข้อความรอส่ง พิมพ์ ส่งข้อความ เพื่อเริ่มใหม่'));
    end if;
    if v_role <> 'hq' and (select count(*) from public.messages x where x.from_profile_id = v_prof.id and x.created_at > now() - interval '24 hours') >= 10 then
      return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'วันนี้ส่งครบ 10 เรื่องแล้ว กรุณารอพรุ่งนี้ หรือแจ้งทีมบวรไทย'));
    end if;
    v_nick := v_sess.nickname;
    v_real := case when v_nick is null or v_sess.show_real then v_prof.full_name end;

    if v_d ? 'reply_ticket' then
      select * into v_orig from public.messages where ticket_no = v_d ->> 'reply_ticket' for update;
      v_can := (v_role = 'hq' and v_orig.kind in ('tambon_to_hq','in_tambon'))
            or (v_role = 'agent' and v_orig.to_tambon_id = any (v_scope) and v_orig.kind in ('in_tambon','hq_to_tambon'))
            or v_orig.from_profile_id = v_prof.id;
      if v_orig.id is null or v_orig.status in ('draft','closed','cancelled') or not coalesce(v_can,false) then
        update public.message_sessions set step=null, draft='{}', updated_at=now() where line_user_id=p_user;
        return jsonb_build_object('ok',true,'handled',true,'reply',jsonb_build_object('text','ส่งคำตอบไม่ได้ เรื่องปิดหรือยกเลิกแล้ว หรือคุณไม่มีสิทธิ์ในเรื่องนี้'));
      end if;
      insert into public.message_events(message_id, event, actor_profile_id, actor_role, actor_tambon_id, note)
        values (v_orig.id, 'replied', v_prof.id, v_role, v_tambon, v_d ->> 'body');
      if v_orig.from_profile_id is distinct from v_prof.id then
        update public.messages set status = 'replied', updated_at = now() where id = v_orig.id;
        v_recips := array(select p.line_user_id from public.profiles p where p.id = v_orig.from_profile_id and p.line_user_id is not null);
      else
        update public.messages set updated_at = now() where id = v_orig.id;
        v_recips := public._msg_recipients(v_orig);
      end if;
      v_text := 'ตอบกลับเรื่อง ' || v_orig.ticket_no || E'\nจาก: ' || coalesce(v_nick || coalesce(' (' || v_real || ')', ''), v_real, 'ไม่ระบุชื่อ')
                || coalesce(' · ตำบล' || v_tname, ' · บวรไทย') || ' · ' || public._msg_role_th(v_role) || E'\n\n' || (v_d ->> 'body');
      v_push := jsonb_build_array(jsonb_build_object('to', to_jsonb(array_remove(v_recips, p_user)), 'text', v_text,
        'buttons', jsonb_build_array(jsonb_build_object('label', 'ตอบ', 'data', 'msg|reply|' || v_orig.ticket_no))));
      v_ticket := v_orig.ticket_no;
    else
      v_ticket := 'MSG-' || lpad(nextval('public.messages_ticket_seq')::text, 4, '0');
      insert into public.messages(ticket_no, kind, from_profile_id, from_tambon_id, from_role, from_nickname, from_real_name,
                                  to_tambon_id, to_hq, audience, category, body, status, is_test)
      values (v_ticket, v_d ->> 'kind', v_prof.id, case when v_role = 'hq' then null else v_tambon end, v_role, v_nick, v_real,
              nullif(v_d ->> 'to_tambon', '')::uuid, (v_d ->> 'kind') = 'tambon_to_hq',
              coalesce(array(select jsonb_array_elements_text(v_d -> 'audience')), '{}'),
              case when (v_d ->> 'kind') = 'announce' then 'announce' else 'ask' end, v_d ->> 'body', 'sent', v_prof.is_test)
      returning * into v_m;
      insert into public.message_events(message_id, event, actor_profile_id, actor_role, actor_tambon_id) values (v_m.id, 'sent', v_prof.id, v_role, v_tambon);

      if v_m.kind = 'announce' then
        v_aud := v_m.audience;
        v_recips := array(select p.line_user_id from public.profiles p
          where p.line_user_id is not null and p.line_user_id <> p_user and coalesce(p.is_test, false) = v_prof.is_test
            and ('all' = any (v_aud)
                 or (p.role::text = any (v_aud) and p.role in ('customer','merchant','driver'))
                 or ('agent' = any (v_aud) and ((p.role = 'admin' and coalesce(p.approved, false) and p.tambon_id is not null)
                                                or exists (select 1 from public.admin_scopes s where s.profile_id = p.id)))));
        if coalesce(cardinality(v_recips), 0) > 50 then
          delete from public.messages where id = v_m.id;
          return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text',
            'ประกาศนี้จะส่งถึง ' || cardinality(v_recips) || ' คน เกินที่อนุญาต 50 คนต่อครั้ง (กันโควตา LINE 300 ข้อความ/เดือน) กรุณาเลือกผู้รับเป็นบางประเภท หรือพิมพ์ ยกเลิก'));
        end if;
        v_text := 'ประกาศจากทีมบวรไทย' || E'\nเลขเรื่อง: ' || v_ticket || E'\n\n' || v_m.body;
        v_push := jsonb_build_array(jsonb_build_object('to', to_jsonb(v_recips), 'text', v_text));
      else
        v_recips := array_remove(public._msg_recipients(v_m), p_user);
        v_text := 'ข้อความใหม่' || E'\nจาก: ' || public._msg_label(v_m)
                  || E'\nถึง: ' || case v_m.kind when 'tambon_to_hq' then 'ทีมบวรไทย' else 'ตัวแทนตำบล' || coalesce((select regexp_replace(t.name, '^ตำบล', '') from public.tambons t where t.id = v_m.to_tambon_id), '') end
                  || E'\nเลขเรื่อง: ' || v_ticket || E'\n\n' || v_m.body;
        v_push := jsonb_build_array(jsonb_build_object('to', to_jsonb(v_recips), 'text', v_text,
          'buttons', jsonb_build_array(jsonb_build_object('label', 'รับเรื่อง', 'data', 'msg|accept|' || v_ticket),
                                       jsonb_build_object('label', 'ตอบ', 'data', 'msg|reply|' || v_ticket)
                                       ) || case when v_m.kind = 'in_tambon' then jsonb_build_array(jsonb_build_object('label', 'ส่งต่อบวรไทย', 'data', 'msg|fwd|' || v_ticket)) else '[]'::jsonb end));
      end if;
    end if;

    update public.message_sessions set step = null, draft = '{}', updated_at = now() where line_user_id = p_user;
    return jsonb_build_object('ok', true, 'handled', true, 'ticket', v_ticket,
      'reply', jsonb_build_object('text', 'ส่งแล้ว เลขเรื่อง ' || v_ticket || case when v_m.kind = 'announce' then ' ถึง ' || coalesce(cardinality(v_recips), 0) || ' คน' else '' end || case when coalesce(cardinality(v_recips), 0) = 0 then E'\n⚠ ยังไม่มีผู้รับที่ผูก LINE ไว้ ระบบจะแจ้งทีมบวรไทยหากไม่มีใครรับใน 24 ชม.' else '' end || E'\nพิมพ์ ติดตามข้อความ เพื่อดูสถานะ',
                                  'buttons', case when v_m.kind = 'announce' then '[]'::jsonb else jsonb_build_array(jsonb_build_object('label', 'ยกเลิกเรื่องนี้', 'data', 'msg|cancel|' || v_ticket)) end),
      'push', case when coalesce(cardinality(v_recips), 0) = 0 then '[]'::jsonb else v_push end);
  end if;

  if v_act in ('accept','reply','fwd') then
    select * into v_m from public.messages where ticket_no = v_arg for update;
    if v_m.id is null then
      return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'ไม่พบเรื่อง ' || coalesce(v_arg, '')));
    end if;
    v_can := (v_role = 'hq' and v_m.kind in ('tambon_to_hq','in_tambon'))
          or (v_role = 'agent' and v_m.to_tambon_id = any (v_scope) and v_m.kind in ('in_tambon','hq_to_tambon'));
    if v_act = 'reply' and not v_can and v_m.from_profile_id is distinct from v_prof.id then
      return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'คุณไม่ได้เกี่ยวข้องกับเรื่องนี้'));
    elsif v_act <> 'reply' and not v_can then
      return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'คุณไม่มีสิทธิ์จัดการเรื่องนี้'));
    end if;

    if v_act = 'reply' then
      if v_m.status in ('draft','closed','cancelled') then
        return jsonb_build_object('ok',true,'handled',true,'reply',jsonb_build_object('text','เรื่องนี้ปิดหรือยกเลิกแล้ว ไม่สามารถตอบกลับได้'));
      end if;
      update public.message_sessions set step = 'await_reply', draft = jsonb_build_object('reply_ticket', v_m.ticket_no), updated_at = now() where line_user_id = p_user;
      return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'พิมพ์ข้อความตอบเรื่อง ' || v_m.ticket_no || ' หรือพิมพ์ ยกเลิก'));
    end if;

    if v_act = 'accept' then
      if v_m.status not in ('sent','read','forwarded','overdue') then
        return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'เรื่องนี้สถานะ "' || public._msg_status_th(v_m.status) || '" แล้ว'));
      end if;
      update public.messages set status = 'accepted', updated_at = now() where id = v_m.id;
      insert into public.message_events(message_id, event, actor_profile_id, actor_role, actor_tambon_id) values (v_m.id, 'accepted', v_prof.id, v_role, v_tambon);
      v_recips := array(select p.line_user_id from public.profiles p where p.id = v_m.from_profile_id and p.line_user_id is not null);
      return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'รับเรื่อง ' || v_m.ticket_no || ' แล้ว'),
        'push', jsonb_build_array(jsonb_build_object('to', to_jsonb(v_recips), 'text', 'เรื่อง ' || v_m.ticket_no || ' ถูกรับแล้ว กำลังดำเนินการ')));
    end if;

    if v_m.kind <> 'in_tambon' or v_m.status in ('closed','cancelled','forwarded') then
      return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'ส่งต่อเรื่องนี้ไม่ได้'));
    end if;
    update public.messages set status = 'forwarded', updated_at = now() where id = v_m.id;
    insert into public.message_events(message_id, event, actor_profile_id, actor_role, actor_tambon_id) values (v_m.id, 'forwarded', v_prof.id, v_role, v_tambon);
    v_recips := array(select p.line_user_id from public.profiles p where p.id = v_m.from_profile_id and p.line_user_id is not null);
    return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'ส่งต่อเรื่อง ' || v_m.ticket_no || ' ให้ทีมบวรไทยแล้ว'),
      'push', jsonb_build_array(
        jsonb_build_object('to', to_jsonb(coalesce(public.central_admin_line_ids(), '{}'::text[])), 'text',
          'เรื่องส่งต่อจากตัวแทนตำบล' || E'\nจาก: ' || public._msg_label(v_m) || E'\nเลขเรื่อง: ' || v_m.ticket_no || E'\n\n' || v_m.body,
          'buttons', jsonb_build_array(jsonb_build_object('label', 'รับเรื่อง', 'data', 'msg|accept|' || v_m.ticket_no), jsonb_build_object('label', 'ตอบ', 'data', 'msg|reply|' || v_m.ticket_no))),
        jsonb_build_object('to', to_jsonb(v_recips), 'text', 'เรื่อง ' || v_m.ticket_no || ' ถูกส่งต่อให้ทีมบวรไทยแล้ว')));
  end if;

  if v_act = 'sweep' then
    if v_role <> 'hq' then
      return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'ปุ่มนี้สำหรับทีมบวรไทยเท่านั้น'));
    end if;
    v_res := public.message_sweep();
    return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text',
      'อัปเดตแล้ว: เรื่องเกินเวลา 24 ชม. ' || (v_res ->> 'count') || ' เรื่อง' || case when (v_res ->> 'count') <> '0' then E'\n' || (select string_agg(x, ', ') from jsonb_array_elements_text(v_res -> 'tickets') x) else '' end));
  end if;

  if v_act = 'mine' then
    select string_agg(x.ticket_no || ' · ' || public._msg_status_th(x.status) || ' · ' || to_char(x.created_at at time zone 'Asia/Bangkok', 'DD/MM HH24:MI'), E'\n' order by x.created_at desc)
      into v_list from (select m.ticket_no, m.status, m.created_at from public.messages m where m.from_profile_id = v_prof.id order by m.created_at desc limit 10) x;
    return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text',
      coalesce('เรื่องของฉัน (10 ล่าสุด)' || E'\n' || v_list, 'ยังไม่มีเรื่องที่ส่ง พิมพ์ ส่งข้อความ เพื่อเริ่ม')));
  end if;

  if v_act = 'inbox' then
    if v_role not in ('agent','hq') then
      return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'กล่องข้อความใช้ได้เฉพาะตัวแทนตำบลและทีมบวรไทย'));
    end if;
    with opened as (
      update public.messages m set status = 'read', updated_at = now()
       where m.status = 'sent' and m.is_test = v_prof.is_test and m.kind <> 'announce'
         and ((v_role = 'hq' and (m.kind = 'tambon_to_hq' or (m.kind = 'in_tambon' and exists(
           select 1 from public.message_events e where e.message_id=m.id and e.event in ('forwarded','overdue')))))
           or (v_role = 'agent' and m.kind in ('in_tambon','hq_to_tambon') and m.to_tambon_id = any (v_scope)))
      returning m.id)
    insert into public.message_events(message_id, event, actor_profile_id, actor_role, actor_tambon_id)
      select id, 'read', v_prof.id, v_role, v_tambon from opened;
    select string_agg(x.ticket_no || ' · ' || x.lbl || ' · ' || public._msg_status_th(x.status), E'\n' order by x.created_at desc)
      into v_list from (select m.ticket_no, public._msg_label(m) as lbl, m.status, m.created_at from public.messages m where m.status in ('sent','read','accepted','forwarded','overdue') and m.is_test = v_prof.is_test and m.kind <> 'announce'
        and ((v_role = 'hq' and (m.kind = 'tambon_to_hq' or (m.kind = 'in_tambon' and exists(
           select 1 from public.message_events e where e.message_id=m.id and e.event in ('forwarded','overdue')))))
           or (v_role = 'agent' and m.kind in ('in_tambon','hq_to_tambon') and m.to_tambon_id = any (v_scope)))
        order by m.created_at desc limit 10) x;
    return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', coalesce('เรื่องที่รอดำเนินการ' || E'\n' || v_list, 'ไม่มีเรื่องค้าง'),
        'buttons', case when v_role = 'hq' then jsonb_build_array(jsonb_build_object('label', 'อัปเดตเรื่องค้าง', 'data', 'msg|sweep')) else '[]'::jsonb end));
  end if;

  return jsonb_build_object('ok', true, 'handled', false);
end
$function$

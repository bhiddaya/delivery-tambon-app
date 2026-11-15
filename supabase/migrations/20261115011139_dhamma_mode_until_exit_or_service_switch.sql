CREATE OR REPLACE FUNCTION public.dhamma_begin(p_user text, p_cmd text, p_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'dhamma'
AS $function$
declare
  acc jsonb := (select value from dhamma.settings where key = 'access');
  allowed boolean;
  st dhamma.user_state;
  t text := btrim(coalesce(p_text, ''));
  intro boolean := false;
  v_len int;
begin
  allowed := coalesce(acc->>'mode', 'test') = 'open'
          or exists (select 1 from public.profiles p
                     where p.line_user_id = p_user
                       and ((p.role = 'admin' and coalesce(p.approved, false))
                            or exists (select 1 from public.admin_scopes a where a.profile_id = p.id)))
          or exists (select 1 from public.staff_line_accounts s
                     where s.line_user_id = p_user and s.level::text = coalesce(acc->>'allowed_staff_level', 'superadmin'));
  -- answer-length chips: postback dhamma=len:<chars>; also keeps the dhamma session open for the next question
  if p_cmd like 'len:%' then
    if not allowed then
      return jsonb_build_object('handled', true, 'allowed', false, 'reply', acc->>'blocked_reply');
    end if;
    v_len := case when substring(p_cmd from 5) in ('500', '1000', '3000', '6000', '12000') then substring(p_cmd from 5)::int else 3000 end;
    if (select mode from dhamma.user_state where line_user_id = p_user) = 'counsel' then
      insert into dhamma.user_prefs (line_user_id, length_pref, counsel_length) values (p_user, null, v_len)
        on conflict (line_user_id) do update set counsel_length = excluded.counsel_length, updated_at = now();
    else
      insert into dhamma.user_prefs (line_user_id, length_pref) values (p_user, v_len)
        on conflict (line_user_id) do update set length_pref = excluded.length_pref, updated_at = now();
    end if;
    insert into dhamma.user_state (line_user_id, mode)
      values (p_user, coalesce((select mode from dhamma.user_state where line_user_id = p_user), 'buddhayana'))
      on conflict (line_user_id) do update set updated_at = now();
    return jsonb_build_object('handled', true, 'allowed', true, 'mode', (select mode from dhamma.user_state where line_user_id = p_user), 'length_pref', v_len,
      'reply', 'ตั้งความยาวคำตอบประมาณ ' || translate(to_char(v_len, 'FM99,999'), '0123456789', '๐๑๒๓๔๕๖๗๘๙') || ' ตัวอักษรแล้วครับ พิมพ์คำถามได้เลย');
  end if;
  if p_cmd in ('counsel', 'learn', 'buddhayana') then
    if not allowed then
      return jsonb_build_object('handled', true, 'allowed', false, 'reply', acc->>'blocked_reply');
    end if;
    insert into dhamma.user_state (line_user_id, mode) values (p_user, p_cmd)
      on conflict (line_user_id) do update set mode = excluded.mode, updated_at = now();
    if p_cmd = 'counsel' then
      update dhamma.user_prefs set counsel_length = null where line_user_id = p_user;
    end if;
    intro := true;
  else
    select * into st from dhamma.user_state where line_user_id = p_user
      and updated_at > '1970-01-01T00:00:00Z'::timestamptz;
    if st.line_user_id is null or not allowed then
      return jsonb_build_object('handled', false);
    end if;
    if t in ('ออก', 'จบ', 'ออกจากโหมด', 'กลับเมนูหลัก') then
      delete from dhamma.user_state where line_user_id = p_user;
      return jsonb_build_object('handled', true, 'allowed', true, 'exit', true,
        'reply', 'ออกจากโหมดธรรมะแล้วครับ กดปุ่มในเมนูเพื่อกลับมาได้ทุกเมื่อ 🙏');
    end if;
    if st.mode = 'learn' and t in ('ต่อ', 'บทต่อไป', 'ถัดไป') then
      update dhamma.user_state set lesson_seq = lesson_seq + 1, updated_at = now() where line_user_id = p_user;
    else
      update dhamma.user_state set updated_at = now() where line_user_id = p_user;
    end if;
  end if;
  select * into st from dhamma.user_state where line_user_id = p_user;
  return jsonb_build_object(
    'handled', true, 'allowed', true, 'intro', intro, 'mode', st.mode, 'lesson_seq', st.lesson_seq,
    'consent', st.consent_at is not null,
    'length_pref', case when st.mode = 'counsel'
        then coalesce((select counsel_length from dhamma.user_prefs where line_user_id = p_user), 500)
        else coalesce((select length_pref from dhamma.user_prefs where line_user_id = p_user), 3000) end,
    'prompt_common', (select body from dhamma.prompts where mode = 'common' and active),
    'prompt_mode', (select body from dhamma.prompts where mode = st.mode and active),
    'prompt_version', (select version from dhamma.prompts where mode = st.mode and active),
    -- template for questions that start with "นิยาม" (any mode)
    'prompt_define', (select body from dhamma.prompts where mode = 'define' and active),
    'lesson', (select to_jsonb(l) from dhamma.lessons l where l.seq = st.lesson_seq),
    'lesson_count', (select count(*) from dhamma.lessons),
    'history', coalesce((select jsonb_agg(jsonb_build_object('q', q.question, 'a', q.answer) order by q.created_at)
                         from (select * from dhamma.turns where line_user_id = p_user and mode = st.mode
                               and created_at > now() - interval '2 hours' order by created_at desc limit 6) q), '[]'::jsonb));
end $function$

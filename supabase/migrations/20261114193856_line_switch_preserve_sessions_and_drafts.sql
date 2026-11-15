create or replace function public.bavorn_switch_line_service(p_user_id text, p_target text)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
begin
  if p_target is null or p_target='' then return jsonb_build_object('switched',false); end if;
  if p_user_id is null or p_user_id !~ '^U[0-9a-f]{32}$' then raise exception 'INVALID_LINE_USER'; end if;
  if p_target not in ('legal','translate','clip','dhamma','message','food','product','places','other','web') then raise exception 'INVALID_SERVICE'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id,0));
  if p_target <> 'legal' then
    update public.bavorn_legal_sessions set updated_at='1970-01-01Z',request_id=null,request_started_at=null
      where line_user_id=p_user_id and updated_at > '1970-01-01Z';
  end if;
  if p_target <> 'translate' then
    update public.translate_modes set expires_at='1970-01-01Z' where line_user_id=p_user_id and expires_at>'1970-01-01Z';
  end if;
  if p_target <> 'dhamma' then
    update dhamma.user_state set updated_at='1970-01-01Z' where line_user_id=p_user_id and updated_at>'1970-01-01Z';
  end if;
  if p_target <> 'clip' then
    update public.clip_sessions set started_at='1970-01-01Z',
      options=coalesce(options,'{}'::jsonb)
        || case when options?'pending' then jsonb_build_object('pending',options->'pending'||'{"review_at":"1970-01-01T00:00:00Z"}'::jsonb) else '{}'::jsonb end
        || case when options?'guide' then jsonb_build_object('guide',options->'guide'||'{"at":"1970-01-01T00:00:00Z","approved_at":"1970-01-01T00:00:00Z"}'::jsonb) else '{}'::jsonb end
      where line_user_id=p_user_id;
  end if;
  if p_target <> 'message' then
    update public.message_sessions set step=null,updated_at=now() where line_user_id=p_user_id and step is not null;
  end if;
  update public.line_pending_clarifications set expires_at='1970-01-01Z'
    where line_user_id=p_user_id and expires_at>'1970-01-01Z'
      and not (p_target='legal' and source='legal');
  if p_target <> 'food' then
    update public.carts set awaiting_location=false where line_user_id=p_user_id and awaiting_location;
  end if;
  if p_target <> 'product' then
    update public.pending_menu_items set created_at='1970-01-01Z' where line_user_id=p_user_id and created_at>'1970-01-01Z';
  end if;
  if p_target <> 'places' then
    update public.tourism_location_requests set requested_at='1970-01-01Z' where line_user_id=p_user_id and requested_at>'1970-01-01Z';
  end if;
  return jsonb_build_object('switched',true,'target',p_target,'preserved_content',true);
end $function$;
revoke all on function public.bavorn_switch_line_service(text,text) from public,anon,authenticated;
grant execute on function public.bavorn_switch_line_service(text,text) to service_role;
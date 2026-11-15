create or replace function public.bavorn_switch_my_line_service(p_target text)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare actor uuid:=auth.uid(); line_id text;
begin
  if actor is null then raise insufficient_privilege using message='AUTH_REQUIRED'; end if;
  if p_target is null or p_target not in ('food','web') then raise exception 'INVALID_WEB_SERVICE'; end if;
  select u.raw_app_meta_data->>'line_user_id' into line_id from auth.users u where u.id=actor;
  if line_id is null or line_id !~ '^U[0-9a-f]{32}$' then raise insufficient_privilege using message='VERIFIED_LINE_ACCOUNT_REQUIRED'; end if;
  return public.bavorn_switch_line_service(line_id,p_target);
end $function$;
revoke all on function public.bavorn_switch_my_line_service(text) from public,anon;
grant execute on function public.bavorn_switch_my_line_service(text) to authenticated;
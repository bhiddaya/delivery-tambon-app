-- แก้ 20261020120000: Postgres regex นับซ้ำได้ไม่เกิน 255 ({20,900} ใช้ไม่ได้ ปุ่มในแอปจึงขึ้น "เปิดไม่สำเร็จ") จึงแยกตรวจความยาวออกมา
alter table public.push_subscriptions drop constraint if exists push_subscriptions_endpoint_check;
alter table public.push_subscriptions add constraint push_subscriptions_endpoint_check
  check (length(endpoint) <= 1000 and (endpoint like 'https://%' or (endpoint ~ '^fcm:[A-Za-z0-9_:.-]+$' and length(endpoint) >= 24)));

create or replace function public.push_save_app_token(p_token text, p_kind text, p_user_agent text default null)
returns void language plpgsql security definer set search_path = 'public', 'pg_temp' as $function$
begin
  if auth.uid() is null then raise exception 'ต้องเข้าสู่ระบบก่อน' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('merchant', 'driver', 'agent') then raise exception 'ชนิดแจ้งเตือนไม่ถูกต้อง' using errcode = '22023'; end if;
  if p_token is null or length(p_token) not between 20 and 900 or p_token !~ '^[A-Za-z0-9_:.-]+$' then raise exception 'ข้อมูลอุปกรณ์ไม่ถูกต้อง' using errcode = '22023'; end if;
  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth, kind, user_agent)
  values (auth.uid(), 'fcm:' || p_token, '', '', p_kind, left(p_user_agent, 200))
  on conflict (endpoint) do update
    set profile_id = auth.uid(), kind = excluded.kind, user_agent = excluded.user_agent, updated_at = now();
end $function$;

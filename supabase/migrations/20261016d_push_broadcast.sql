-- อาจารย์สั่ง 16 ต.ค. 2569: ปุ่ม "ส่งสัญญาณเสียงถึงทุกคน" จาก PC/มือถือของเจ้าของ → Web Push ไปมือถือของตัวแทน/ไรเดอร์/ร้านค้า
-- ที่กดเปิดแจ้งเตือนไว้แล้ว (ไม่ผูกกับออเดอร์ ใช้ทดสอบเสียงตอนปิดเว็บ) · ไม่ผ่าน LINE
--   admin_send_sound_test()  เฉพาะ superadmin · ส่งได้ทุก 1 นาที (กันกดรัวรบกวนคนอื่น) · เรียก edge function push-notify {action:"broadcast"}
--   admin_push_status()      เฉพาะ superadmin · รายชื่อคนจริงและจำนวนเครื่องที่เปิดแจ้งเตือน (ดูว่าใครยังไม่เปิด)
--   push_broadcast_targets() service_role · เครื่องที่ส่งถึงได้ (โปรไฟล์อนุมัติแล้ว ไม่ถูกพักสิทธิ์)

create table if not exists public.push_broadcast_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);
alter table public.push_broadcast_log enable row level security;
revoke all on table public.push_broadcast_log from anon, authenticated;

create or replace function public.push_broadcast_targets() returns jsonb
language sql stable security definer set search_path = 'public', 'pg_temp' as $function$
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth, 'kind', s.kind)), '[]'::jsonb)
    from public.push_subscriptions s join public.profiles p on p.id = s.profile_id
   where coalesce(p.approved, false) and p.suspended_at is null
$function$;
revoke all on function public.push_broadcast_targets() from public, anon, authenticated;
grant execute on function public.push_broadcast_targets() to service_role;

create or replace function public.admin_send_sound_test() returns jsonb
language plpgsql security definer set search_path = 'public', 'vault', 'extensions', 'pg_temp' as $function$
declare v_secret text; v_devices jsonb;
begin
  if not public.is_superadmin() then raise exception 'เฉพาะส่วนกลางเท่านั้น' using errcode = '42501'; end if;
  if exists (select 1 from public.push_broadcast_log where created_at > now() - interval '1 minute') then
    raise exception 'ส่งสัญญาณได้ทุก 1 นาที รอสักครู่' using errcode = '54000';
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_secret' limit 1;
  if v_secret is null then raise exception 'ระบบแจ้งเตือนยังไม่พร้อม' using errcode = '55000'; end if;
  select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) into v_devices from (
    select s.kind, count(*) as n from public.push_subscriptions s join public.profiles p on p.id = s.profile_id
     where coalesce(p.approved, false) and p.suspended_at is null group by s.kind) x;
  insert into public.push_broadcast_log (created_by) values (auth.uid());
  perform net.http_post(url := 'https://kaeoxqiqonwjoqjoiiho.supabase.co/functions/v1/push-notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
    body := jsonb_build_object('action', 'broadcast'), timeout_milliseconds := 20000);
  return jsonb_build_object('ok', true, 'devices', v_devices);
end $function$;

create or replace function public.admin_push_status() returns jsonb
language plpgsql stable security definer set search_path = 'public', 'pg_temp' as $function$
begin
  if not public.is_superadmin() then raise exception 'เฉพาะส่วนกลางเท่านั้น' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('group', x.grp, 'label', x.label, 'devices', x.n) order by x.grp, x.label) from (
      select 'merchant' as grp, m.name as label, (select count(*) from public.push_subscriptions s where s.profile_id = p.id) as n
        from public.merchants m join public.profiles p on p.id = m.profile_id
       where not m.is_test and not p.is_test and coalesce(p.approved, false) and p.suspended_at is null
      union all
      select 'driver', p.full_name, (select count(*) from public.push_subscriptions s where s.profile_id = p.id)
        from public.profiles p
       where p.role = 'driver' and not p.is_test and coalesce(p.approved, false) and p.suspended_at is null
      union all
      select 'agent', p.full_name, (select count(*) from public.push_subscriptions s where s.profile_id = p.id)
        from public.profiles p
       where (p.role in ('superadmin', 'admin') or exists (select 1 from public.admin_scopes a where a.profile_id = p.id))
         and not p.is_test and coalesce(p.approved, false) and p.suspended_at is null
    ) x), '[]'::jsonb);
end $function$;

revoke all on function public.admin_send_sound_test(), public.admin_push_status() from public, anon;
grant execute on function public.admin_send_sound_test(), public.admin_push_status() to authenticated;

-- ย้อนกลับ: drop function admin_send_sound_test/admin_push_status/push_broadcast_targets · drop table push_broadcast_log

-- เจ้าของอนุมัติ 20 ต.ค. 2569: แอป Android "บวรไทย" รับแจ้งเตือนพร้อมเสียงของแอปเอง (FCM) ทดลองแบบทดสอบปิดก่อน
-- เก็บเครื่องที่ติดตั้งแอปไว้ในตารางเดิม push_subscriptions โดย endpoint = 'fcm:<token>' (ไม่มีกุญแจ p256dh/auth)
-- ช่วงทดลอง: เครื่องแอปได้แจ้งเตือนเฉพาะออเดอร์ซ้อม/ทดสอบ และสัญญาณทดสอบเสียง ออเดอร์จริงยังแจ้งทาง Web Push/LINE เหมือนเดิม
-- เปิดใช้กับออเดอร์จริง: ลบเงื่อนไข "s.endpoint not like 'fcm:%' or ..." ใน push_targets

alter table public.push_subscriptions drop constraint if exists push_subscriptions_endpoint_check;
alter table public.push_subscriptions add constraint push_subscriptions_endpoint_check
  check (length(endpoint) <= 1000 and (endpoint like 'https://%' or endpoint ~ '^fcm:[A-Za-z0-9_:.-]{20,900}$'));

create or replace function public.push_save_app_token(p_token text, p_kind text, p_user_agent text default null)
returns void language plpgsql security definer set search_path = 'public', 'pg_temp' as $function$
begin
  if auth.uid() is null then raise exception 'ต้องเข้าสู่ระบบก่อน' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('merchant', 'driver', 'agent') then raise exception 'ชนิดแจ้งเตือนไม่ถูกต้อง' using errcode = '22023'; end if;
  if p_token is null or p_token !~ '^[A-Za-z0-9_:.-]{20,900}$' then raise exception 'ข้อมูลอุปกรณ์ไม่ถูกต้อง' using errcode = '22023'; end if;
  -- เครื่องเดียวกันย้ายไปเป็นของคนที่เข้าสู่ระบบล่าสุด เหมือน push_save_subscription
  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth, kind, user_agent)
  values (auth.uid(), 'fcm:' || p_token, '', '', p_kind, left(p_user_agent, 200))
  on conflict (endpoint) do update
    set profile_id = auth.uid(), kind = excluded.kind, user_agent = excluded.user_agent, updated_at = now();
end $function$;

create or replace function public.push_remove_app_token(p_token text) returns void
language plpgsql security definer set search_path = 'public', 'pg_temp' as $function$
begin
  delete from public.push_subscriptions where endpoint = 'fcm:' || p_token and profile_id = auth.uid();
end $function$;

revoke all on function public.push_save_app_token(text, text, text), public.push_remove_app_token(text) from public, anon;
grant execute on function public.push_save_app_token(text, text, text), public.push_remove_app_token(text) to authenticated;

-- เหมือนเดิมทุกอย่าง เพิ่มบรรทัดเดียว: เครื่องแอปได้เฉพาะออเดอร์ซ้อม/ทดสอบ (ช่วงทดลอง)
create or replace function public.push_targets(p_order_id bigint, p_event text) returns jsonb
language plpgsql stable security definer set search_path = 'public', 'pg_temp' as $function$
declare o public.orders%rowtype; v_merchant_profile uuid; v_shop text; v_tambon text;
begin
  if p_event is null or p_event not in ('new', 'paid') then return jsonb_build_object('ok', false, 'reason', 'bad_event'); end if;
  select * into o from public.orders where id = p_order_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  select m.profile_id, m.name into v_merchant_profile, v_shop from public.merchants m where m.id = o.merchant_id;
  select t.name into v_tambon from public.tambons t where t.id = o.tambon_id;
  return jsonb_build_object(
    'ok', true,
    'order', jsonb_build_object('id', o.id, 'type', o.type::text, 'is_test', o.is_test, 'is_drill', o.is_drill, 'event', p_event, 'shop', v_shop, 'tambon', v_tambon),
    'targets', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth, 'kind', s.kind))
        from public.push_subscriptions s
        join public.profiles p on p.id = s.profile_id
       where coalesce(p.approved, false) and p.suspended_at is null
         and p.id <> o.customer_id
         and (o.is_drill or p.is_test = o.is_test)
         and (s.endpoint not like 'fcm:%' or o.is_drill or o.is_test)
         and (
              (s.kind = 'merchant' and p.id = v_merchant_profile and (p_event = 'new' or o.type = 'food'))
           or (s.kind = 'agent' and p_event = 'new' and (
                 p.role = 'superadmin'
              or (p.role = 'admin' and p.tambon_id = o.tambon_id)
              or exists (select 1 from public.admin_scopes a where a.profile_id = p.id and a.tambon_id = o.tambon_id)))
           or (s.kind = 'driver' and p.role = 'driver' and p.tambon_id = o.tambon_id
               and ((p_event = 'new' and (o.type <> 'food' or o.customer_paid_at is not null)) or (p_event = 'paid' and o.type = 'food'))
               and exists (select 1 from public.drivers d where d.profile_id = p.id and d.is_online))
         )), '[]'::jsonb));
end $function$;

-- Rollback:
--   delete from public.push_subscriptions where endpoint like 'fcm:%';
--   drop function if exists public.push_save_app_token(text, text, text), public.push_remove_app_token(text);
--   แล้วสร้าง push_targets และ push_subscriptions_endpoint_check ตาม 20261016c_web_push.sql

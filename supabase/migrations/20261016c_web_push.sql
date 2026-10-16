-- อาจารย์สั่ง 16 ต.ค. 2569: Web Push ให้ร้านค้า/ไรเดอร์/ตัวแทนตำบลได้ยินเสียงแจ้งเตือนของมือถือแม้ปิดหน้า PWA
-- (เสียงเป็นของเครื่อง ตั้งได้แค่ข้อความ การสั่น และให้ค้างจนกดอ่าน)
--
-- ลำดับ: orders เพิ่ม/ยืนยันเงิน → trigger นี้ → pg_net เรียก edge function push-notify (รหัสลับเดียวกับ n8n: vault notify_secret)
--        → push_targets() เลือกผู้รับตามกติกาด้านล่าง → ส่งผ่านเซิร์ฟเวอร์แจ้งเตือนของ Google/Apple/Mozilla (ฟรี ไม่ผ่าน LINE ไม่นับโควต้า)
-- กติกาผู้รับ (ตรงกับของ LINE เดิม + ออเดอร์ซ้อม):
--   ร้านค้า : ร้านของออเดอร์นั้น  (ออเดอร์ใหม่ทุกชนิด · อาหารยืนยันเงินแล้วก็แจ้งอีกครั้ง)
--   ไรเดอร์ : ไรเดอร์ที่ออนไลน์ในตำบล (ออเดอร์ไม่ใช่อาหาร = ทันที · อาหาร = หลังตัวแทนยืนยันเงิน)
--   ตัวแทน  : ผู้ดูแลกลาง + แอดมิน/ผู้ได้รับแต่งตั้งของตำบลนั้น (ออเดอร์ใหม่)
--   ออเดอร์ทดสอบ (is_test) แจ้งเฉพาะบัญชีทดสอบ · ออเดอร์ซ้อม (is_drill) แจ้งคนจริงได้ · ไม่แจ้งคนสั่งเอง
-- กุญแจ VAPID สร้างโดย edge function แล้วเก็บใน vault เท่านั้น (ไม่มีใครเห็นกุญแจส่วนตัว)

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) <= 1000 and endpoint like 'https://%'),
  p256dh text not null,
  auth text not null,
  kind text not null check (kind in ('merchant', 'driver', 'agent')),
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_subscriptions_profile_idx on public.push_subscriptions (profile_id);
alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from anon, authenticated;  -- เข้าถึงผ่านฟังก์ชันด้านล่างเท่านั้น

-- ฝั่งผู้ใช้ (ล็อกอินแล้ว)
create or replace function public.push_public_key() returns text
language sql stable security definer set search_path = 'public', 'vault', 'pg_temp' as $function$
  select decrypted_secret from vault.decrypted_secrets where name = 'vapid_public' limit 1
$function$;

create or replace function public.push_save_subscription(p_endpoint text, p_p256dh text, p_auth text, p_kind text, p_user_agent text default null)
returns void language plpgsql security definer set search_path = 'public', 'pg_temp' as $function$
begin
  if auth.uid() is null then raise exception 'ต้องเข้าสู่ระบบก่อน' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('merchant', 'driver', 'agent') then raise exception 'ชนิดแจ้งเตือนไม่ถูกต้อง' using errcode = '22023'; end if;
  if p_endpoint is null or p_endpoint not like 'https://%' or length(p_endpoint) > 1000 or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'ข้อมูลอุปกรณ์ไม่ถูกต้อง' using errcode = '22023';
  end if;
  -- อุปกรณ์เดียวกัน (endpoint เดียวกัน) ย้ายไปเป็นของคนที่เข้าสู่ระบบล่าสุด จะได้ไม่แจ้งเตือนผิดคน
  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth, kind, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, p_kind, left(p_user_agent, 200))
  on conflict (endpoint) do update
    set profile_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth, kind = excluded.kind,
        user_agent = excluded.user_agent, updated_at = now();
end $function$;

create or replace function public.push_remove_subscription(p_endpoint text) returns void
language plpgsql security definer set search_path = 'public', 'pg_temp' as $function$
begin
  delete from public.push_subscriptions where endpoint = p_endpoint and profile_id = auth.uid();
end $function$;

revoke all on function public.push_public_key(), public.push_save_subscription(text, text, text, text, text), public.push_remove_subscription(text) from public, anon;
grant execute on function public.push_public_key(), public.push_save_subscription(text, text, text, text, text), public.push_remove_subscription(text) to authenticated;

-- ฝั่ง edge function (service_role เท่านั้น)
create or replace function public.push_set_keys(p_public text, p_private text) returns void
language plpgsql security definer set search_path = 'public', 'vault', 'pg_temp' as $function$
declare v_id uuid;
begin
  if coalesce(p_public, '') = '' or coalesce(p_private, '') = '' then raise exception 'กุญแจว่าง' using errcode = '22023'; end if;
  select id into v_id from vault.secrets where name = 'vapid_public';
  if v_id is null then perform vault.create_secret(p_public, 'vapid_public', 'Web Push (VAPID) public key'); else perform vault.update_secret(v_id, p_public); end if;
  select id into v_id from vault.secrets where name = 'vapid_private';
  if v_id is null then perform vault.create_secret(p_private, 'vapid_private', 'Web Push (VAPID) private key'); else perform vault.update_secret(v_id, p_private); end if;
end $function$;

create or replace function public.push_get_keys() returns jsonb
language sql stable security definer set search_path = 'public', 'vault', 'pg_temp' as $function$
  select jsonb_build_object(
    'public', (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_public' limit 1),
    'private', (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private' limit 1),
    'notify_secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notify_secret' limit 1))
$function$;

create or replace function public.push_delete_subscriptions(p_ids uuid[]) returns integer
language plpgsql security definer set search_path = 'public', 'pg_temp' as $function$
declare n integer;
begin
  delete from public.push_subscriptions where id = any(p_ids);
  get diagnostics n = row_count;
  return n;
end $function$;

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

revoke all on function public.push_set_keys(text, text), public.push_get_keys(), public.push_delete_subscriptions(uuid[]), public.push_targets(bigint, text)
  from public, anon, authenticated;
grant execute on function public.push_set_keys(text, text), public.push_get_keys(), public.push_delete_subscriptions(uuid[]), public.push_targets(bigint, text)
  to service_role;

-- trigger: ออเดอร์ใหม่ (pending) และตัวแทนยืนยันเงิน → สั่ง edge function (พังก็ไม่กระทบออเดอร์)
create or replace function public.push_notify_order() returns trigger
language plpgsql security definer set search_path = 'public', 'vault', 'extensions', 'pg_temp' as $function$
declare v_secret text; v_event text;
begin
  if tg_op = 'INSERT' then
    if new.status is distinct from 'pending' then return new; end if;
    v_event := 'new';
  elsif old.customer_paid_at is null and new.customer_paid_at is not null and new.status in ('pending', 'accepted') then
    v_event := 'paid';
  else
    return new;
  end if;
  begin
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_secret' limit 1;
    if v_secret is not null then
      perform net.http_post(url := 'https://kaeoxqiqonwjoqjoiiho.supabase.co/functions/v1/push-notify',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
        body := jsonb_build_object('order_id', new.id, 'event', v_event), timeout_milliseconds := 10000);
    end if;
  exception when others then
    raise warning 'push_notify_order failed for order %: %', new.id, sqlerrm;
  end;
  return new;
end $function$;

drop trigger if exists orders_push_new on public.orders;
create trigger orders_push_new after insert on public.orders for each row execute function public.push_notify_order();
drop trigger if exists orders_push_paid on public.orders;
create trigger orders_push_paid after update of customer_paid_at on public.orders for each row execute function public.push_notify_order();

-- ย้อนกลับ: drop trigger orders_push_new / orders_push_paid บน orders · drop function push_* · drop table push_subscriptions ·
--   ลบรหัส vapid_public / vapid_private ใน vault (ถ้าสร้างกุญแจใหม่ ทุกเครื่องต้องกดเปิดแจ้งเตือนใหม่)

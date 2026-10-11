-- C/D/E: LINE partner operations, a single review/confirm contract, bank QR and opening hours.
-- Recovery: revert the app/workflow deployment first; preserve new columns/files and fix forward.
-- Existing shops default to manual hours. No payment or dispatch is performed by this migration.
-- RLS remains enabled; new RPCs bind browser callers to auth.uid(), LINE callers to service_role.

alter table public.merchants add column if not exists hours_enabled boolean not null default false;
alter table public.merchants add column if not exists opening_hours jsonb;
alter table public.profiles add column if not exists payment_qr_path text;
alter table public.profiles add column if not exists payment_account_name text;
alter table public.profiles add column if not exists payment_bank_name text;
alter table public.carts add column if not exists customer_note text;
alter table public.carts add column if not exists delivery_point jsonb;
alter table public.carts add column if not exists awaiting_location boolean not null default false;
alter table public.carts add column if not exists checkout_quote jsonb;
alter table public.carts add column if not exists last_checkout jsonb;
alter table public.orders add column if not exists merchant_accepted_at timestamptz;
alter table public.orders add column if not exists food_ready_at timestamptz;

create or replace function public.valid_shop_hours(h jsonb)
returns boolean language plpgsql immutable set search_path=public,pg_temp as $$
declare d jsonb;
begin
  if jsonb_typeof(h) is distinct from 'array' then return false; end if;
  if jsonb_array_length(h)<>7 then return false; end if;
  for d in select value from jsonb_array_elements(h) loop
    if jsonb_typeof(d->'enabled') is distinct from 'boolean'
      or coalesce(d->>'open','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or coalesce(d->>'close','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or ((d->>'enabled')::boolean and d->>'open'=d->>'close') then return false; end if;
  end loop;
  return true;
end $$;
revoke all on function public.valid_shop_hours(jsonb) from public,anon;
grant execute on function public.valid_shop_hours(jsonb) to authenticated,service_role;
alter table public.merchants drop constraint if exists merchants_valid_opening_hours;
alter table public.merchants add constraint merchants_valid_opening_hours check
  ((opening_hours is null or public.valid_shop_hours(opening_hours)) and (not hours_enabled or opening_hours is not null));
alter table public.profiles drop constraint if exists profiles_payment_qr_owner;
alter table public.profiles add constraint profiles_payment_qr_owner check (payment_qr_path is null or
  (payment_qr_path ~ ('^'||id::text||'/[a-f0-9-]{36}\.(png|jpg|webp)$') and length(btrim(coalesce(payment_account_name,'')))>0));

create or replace function public.shop_open_at(manually_open boolean, enabled boolean, h jsonb, at_time timestamptz default now())
returns boolean language plpgsql immutable set search_path=public,pg_temp as $$
declare local_time timestamp:=at_time at time zone 'Asia/Bangkok'; day_no int; clock text; today jsonb; yesterday jsonb;
begin
  if not coalesce(manually_open,false) then return false; end if;
  if not coalesce(enabled,false) then return true; end if;
  if not public.valid_shop_hours(h) then return false; end if;
  day_no:=extract(dow from local_time)::int; clock:=to_char(local_time,'HH24:MI');
  today:=h->day_no; yesterday:=h->((day_no+6)%7);
  return ((today->>'enabled')::boolean and
    case when today->>'open'<today->>'close' then clock>=today->>'open' and clock<today->>'close' else clock>=today->>'open' end)
    or ((yesterday->>'enabled')::boolean and yesterday->>'open'>yesterday->>'close' and clock<yesterday->>'close');
end $$;
revoke all on function public.shop_open_at(boolean,boolean,jsonb,timestamptz) from public;
grant execute on function public.shop_open_at(boolean,boolean,jsonb,timestamptz) to anon,authenticated,service_role;

-- This public availability predicate discloses only a boolean; test shops are not exposed to anon.
create or replace function public.shop_is_open(p_merchant_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce((select public.shop_open_at(m.is_open,m.hours_enabled,m.opening_hours)
    from public.merchants m join public.profiles p on p.id=m.profile_id
    where m.id=p_merchant_id and p.approved and p.suspended_at is null
      and (not m.is_test or m.profile_id=auth.uid() or public.can_admin_tambon(m.tambon_id)
        or exists(select 1 from public.profiles me where me.id=auth.uid() and me.is_test and me.tambon_id=m.tambon_id)
        or coalesce(auth.role(),'')='service_role')),false);
$$;
revoke all on function public.shop_is_open(uuid) from public;
grant execute on function public.shop_is_open(uuid) to anon,authenticated,service_role;

create or replace function public.guard_food_shop_hours()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.merchants%rowtype;
begin
  if new.type='food' and new.merchant_id is not null then
    select * into m from public.merchants where id=new.merchant_id for share;
    if not found or not public.shop_open_at(m.is_open,m.hours_enabled,m.opening_hours) then
      raise exception 'ร้านปิดรับออเดอร์แล้ว กรุณาเลือกร้านอื่น';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_food_shop_hours() from public,anon,authenticated;
drop trigger if exists orders_check_shop_hours on public.orders;
create trigger orders_check_shop_hours before insert on public.orders for each row execute function public.guard_food_shop_hours();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('payment-qr','payment-qr',false,5242880,array['image/png','image/jpeg','image/webp'])
on conflict(id) do nothing;
drop policy if exists payment_qr_upload_own on storage.objects;
create policy payment_qr_upload_own on storage.objects for insert to authenticated with check
  (bucket_id='payment-qr' and (storage.foldername(name))[1]=auth.uid()::text
    and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('merchant','driver')));
drop policy if exists payment_qr_read_scoped on storage.objects;
create policy payment_qr_read_scoped on storage.objects for select to authenticated using
  (bucket_id='payment-qr' and exists(select 1 from public.profiles p where p.id::text=(storage.foldername(name))[1]
    and (p.id=auth.uid() or public.can_admin_profile(p.id))));
drop policy if exists payment_qr_delete_own on storage.objects;
create policy payment_qr_delete_own on storage.objects for delete to authenticated using
  (bucket_id='payment-qr' and (storage.foldername(name))[1]=auth.uid()::text);

-- Session-owned browser checkout. Quantities are accepted; prices, shipping and totals come from SQL.
create or replace function public.customer_food_review(p_merchant_id uuid, p_items jsonb, p_point jsonb default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.profiles%rowtype; m public.merchants%rowtype; i jsonb; normalized jsonb:='[]'; point jsonb; r jsonb;
begin
  select * into p from public.profiles where id=auth.uid();
  if p.id is null or p.line_user_id is null then return jsonb_build_object('ok',false,'error','line_login_required'); end if;
  if p.suspended_at is not null then return jsonb_build_object('ok',false,'error','account_suspended'); end if;
  if nullif(btrim(p.phone),'') is null or length(btrim(coalesce(p.full_name,'')))<2 then return jsonb_build_object('ok',false,'error','registration_required'); end if;
  select mm.* into m from public.merchants mm join public.profiles owner on owner.id=mm.profile_id
    where mm.id=p_merchant_id and owner.approved and owner.suspended_at is null and mm.is_test=p.is_test;
  if not found or not public.shop_open_at(m.is_open,m.hours_enabled,m.opening_hours) then return jsonb_build_object('ok',false,'error','shop_closed'); end if;
  if p.tambon_id is distinct from m.tambon_id then
    if p.role<>'customer' then return jsonb_build_object('ok',false,'error','role_fixed_tambon'); end if;
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then return jsonb_build_object('ok',false,'error','bad_items'); end if;
  if jsonb_array_length(p_items) not between 1 and 50 then return jsonb_build_object('ok',false,'error','bad_items'); end if;
  for i in select value from jsonb_array_elements(p_items) loop
    if coalesce(i->>'id','') !~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$' or coalesce(i->>'qty','') !~ '^[0-9]{1,2}$'
      or (i->>'qty')::int not between 1 and 99 then return jsonb_build_object('ok',false,'error','bad_items'); end if;
    if exists(select 1 from jsonb_array_elements(normalized) x where x->>'id'=lower(i->>'id')) then
      return jsonb_build_object('ok',false,'error','bad_items'); end if;
    if not exists(select 1 from public.menu_items mi where mi.id=(i->>'id')::uuid and mi.merchant_id=m.id
      and mi.is_available and not coalesce(mi.is_hidden,false)) then return jsonb_build_object('ok',false,'error','item_unavailable'); end if;
    normalized:=normalized||jsonb_build_array(jsonb_build_object('id',lower(i->>'id'),'qty',(i->>'qty')::int));
  end loop;
  if p_point is not null then
    begin
      if not ((p_point->>'lat')::float8 between -90 and 90) or not ((p_point->>'lng')::float8 between -180 and 180)
        or p_point->>'lat' is null or p_point->>'lng' is null then return jsonb_build_object('ok',false,'error','bad_point'); end if;
      point:=jsonb_build_object('lat',(p_point->>'lat')::float8,'lng',(p_point->>'lng')::float8,
        'label',left(coalesce(nullif(btrim(p_point->>'label'),''),'จุดส่งที่เลือก'),500),'source','shared_location');
    exception when others then return jsonb_build_object('ok',false,'error','bad_point'); end;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('food-chat:'||p.line_user_id,0));
  if p.tambon_id is distinct from m.tambon_id then update public.profiles set tambon_id=m.tambon_id where id=p.id; end if;
  insert into public.carts(line_user_id,merchant_id,items,delivery_point,awaiting_location,customer_note)
    values(p.line_user_id,m.id,normalized,point,false,left(p_note,300))
    on conflict(line_user_id) do update set merchant_id=excluded.merchant_id,items=excluded.items,
      delivery_point=coalesce(excluded.delivery_point,carts.delivery_point),awaiting_location=false,
      checkout_quote=null,customer_note=excluded.customer_note,updated_at=now();
  r:=public.food_chat_flow('review',p.line_user_id);
  return r;
end $$;
revoke all on function public.customer_food_review(uuid,jsonb,jsonb,text) from public,anon;
grant execute on function public.customer_food_review(uuid,jsonb,jsonb,text) to authenticated;

create or replace function public.customer_food_confirm(p_token text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u text;
begin
  select line_user_id into u from public.profiles where id=auth.uid() and suspended_at is null;
  if u is null then return jsonb_build_object('ok',false,'error','line_login_required'); end if;
  return public.food_chat_flow('confirm',u,p_token);
end $$;
revoke all on function public.customer_food_confirm(text) from public,anon;
grant execute on function public.customer_food_confirm(text) to authenticated;

-- Canonical SQL checks are used for both authenticated screens and verified LINE webhook callers.
create or replace function public.partner_order_action_core(p_actor uuid,p_order_id bigint,p_action text,p_action_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.profiles%rowtype; o public.orders%rowtype; m public.merchants%rowtype;
begin
  select * into p from public.profiles where id=p_actor;
  if p.id is null or not p.approved or p.suspended_at is not null then return jsonb_build_object('ok',false,'error','not_approved'); end if;
  select * into o from public.orders where id=p_order_id for update;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  select * into m from public.merchants where id=o.merchant_id;
  if p_action in ('accept_shop','ready','reject_shop') then
    if m.profile_id is distinct from p.id then return jsonb_build_object('ok',false,'error','not_your_shop'); end if;
    if o.status in ('cancelled','delivered','in_progress') then return jsonb_build_object('ok',false,'error','closed_order'); end if;
    if p_action='reject_shop' then
      if o.customer_paid_at is not null or o.slip_submitted_at is not null or o.driver_id is not null then
        return jsonb_build_object('ok',false,'error','contact_agent','text','ออเดอร์มีสลิป/รับเงิน/มอบหมายไรเดอร์แล้ว ให้ตัวแทนตรวจและจัดการคืนเงินก่อนยกเลิก');
      end if;
      update public.orders set status='cancelled' where id=o.id;
    elsif p_action='ready' then
      if o.customer_paid_at is null then return jsonb_build_object('ok',false,'error','payment_required'); end if;
      if o.food_ready_at is not null then return jsonb_build_object('ok',true,'duplicate',true); end if;
      update public.orders set merchant_accepted_at=coalesce(merchant_accepted_at,now()),food_ready_at=now() where id=o.id;
    else
      if o.merchant_accepted_at is not null then return jsonb_build_object('ok',true,'duplicate',true); end if;
      update public.orders set merchant_accepted_at=now() where id=o.id;
    end if;
  elsif p_action in ('accept_driver','pickup','deliver') then
    if p.role<>'driver' or p.tambon_id is distinct from o.tambon_id or p.is_test is distinct from o.is_test then return jsonb_build_object('ok',false,'error','not_driver'); end if;
    -- Serialize claims by this driver as well as by order, across browser/LINE callers.
    perform 1 from public.drivers where profile_id=p.id for update;
    if p_action='accept_driver' then
      if o.driver_id=p.id and o.status in ('accepted','in_progress','delivered') then return jsonb_build_object('ok',true,'duplicate',true); end if;
      if o.status<>'pending' or o.driver_id is not null or (o.type='food' and o.customer_paid_at is null) then return jsonb_build_object('ok',false,'error','job_not_ready'); end if;
      if not exists(select 1 from public.drivers d where d.profile_id=p.id and d.is_online
        and (o.required_vehicle_type is null or d.vehicle_type=o.required_vehicle_type)) then return jsonb_build_object('ok',false,'error','driver_offline'); end if;
      if exists(select 1 from public.orders where driver_id=p.id and status in ('accepted','in_progress')) then return jsonb_build_object('ok',false,'error','active_job'); end if;
      update public.orders set driver_id=p.id,status='accepted' where id=o.id;
    else
      if o.driver_id is distinct from p.id then return jsonb_build_object('ok',false,'error','not_your_job'); end if;
      if o.status='delivered' or (p_action='pickup' and o.status='in_progress') then return jsonb_build_object('ok',true,'duplicate',true); end if;
      if (p_action='pickup' and o.status<>'accepted') or (p_action='deliver' and o.status<>'in_progress') then return jsonb_build_object('ok',false,'error','wrong_step'); end if;
      update public.orders set status=case when p_action='pickup' then 'in_progress'::public.order_status else 'delivered'::public.order_status end,
        delivered_at=case when p_action='deliver' then now() else delivered_at end where id=o.id;
    end if;
  else return jsonb_build_object('ok',false,'error','bad_action'); end if;
  insert into public.order_events(order_id,status,note) select id,status,'partner:'||p_action||' actor='||p.id||' action='||coalesce(p_action_id::text,'') from public.orders where id=o.id;
  return jsonb_build_object('ok',true,'order_id',o.id,'action',p_action);
end $$;
revoke all on function public.partner_order_action_core(uuid,bigint,text,uuid) from public,anon,authenticated,service_role;

create or replace function public.partner_order_action(p_order_id bigint,p_action text,p_action_id uuid default null)
returns jsonb language sql security definer set search_path=public,pg_temp as $$
  select public.partner_order_action_core(auth.uid(),p_order_id,p_action,p_action_id);
$$;
revoke all on function public.partner_order_action(bigint,text,uuid) from public,anon;
grant execute on function public.partner_order_action(bigint,text,uuid) to authenticated;

-- Only the Edge Function writes raw_app_meta_data after verifying the LINE ID token.
-- No client-supplied LINE ID, role, approval or test flag is accepted here.
create or replace function public.register_line_customer(p_name text,p_phone text,p_tambon_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid:=auth.uid(); line_id text; p public.profiles%rowtype; phone text;
begin
  if u is null then return jsonb_build_object('ok',false,'error','login_required'); end if;
  select raw_app_meta_data->>'line_user_id' into line_id from auth.users where id=u;
  if coalesce(line_id,'') !~ '^U[0-9a-f]{32}$' then return jsonb_build_object('ok',false,'error','line_login_required'); end if;
  if length(btrim(coalesce(p_name,''))) not between 2 and 100 then return jsonb_build_object('ok',false,'error','bad_name'); end if;
  phone:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
  if phone ~ '^0[0-9]{9}$' then phone:='66'||substr(phone,2); end if;
  if phone !~ '^66[0-9]{9}$' then return jsonb_build_object('ok',false,'error','bad_phone'); end if;
  if not exists(select 1 from public.tambons where id=p_tambon_id and is_active) then return jsonb_build_object('ok',false,'error','area_unavailable'); end if;
  perform pg_advisory_xact_lock(hashtextextended('customer-registration:'||u::text,0));
  select * into p from public.profiles where id=u for update;
  if p.id is not null and (p.role<>'customer' or p.suspended_at is not null) then
    return jsonb_build_object('ok',false,'error','use_existing_account');
  end if;
  if p.id is not null and p.line_user_id is not null and p.line_user_id<>line_id then
    return jsonb_build_object('ok',false,'error','identity_mismatch');
  end if;
  if exists(select 1 from public.profiles where line_user_id=line_id and id<>u) then
    return jsonb_build_object('ok',false,'error','identity_in_use');
  end if;
  insert into public.profiles(id,role,full_name,phone,tambon_id,line_user_id)
    values(u,'customer',btrim(p_name),phone,p_tambon_id,line_id)
    on conflict(id) do update set full_name=excluded.full_name,phone=excluded.phone,tambon_id=excluded.tambon_id,line_user_id=excluded.line_user_id;
  return jsonb_build_object('ok',true,'tambon_id',p_tambon_id);
end $$;
revoke all on function public.register_line_customer(text,text,uuid) from public,anon;
grant execute on function public.register_line_customer(text,text,uuid) to authenticated;

create or replace function public.line_partner_flow(p_line_user_id text,p_arg text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.profiles%rowtype; a jsonb; result jsonb; jobs jsonb; shop public.merchants%rowtype; payouts jsonb;
  base constant text:='https://delivery-tambon-app-v3.vercel.app'; target bigint;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'ไม่มีสิทธิ์' using errcode='42501'; end if;
  begin a:=coalesce(p_arg::jsonb,'{}'); exception when others then return jsonb_build_object('ok',false,'error','bad_action'); end;
  select * into p from public.profiles where line_user_id=p_line_user_id;
  if a->>'action'='register' or p.id is null then
    return jsonb_build_object('ok',true,'view','partner','title','สมัครลูกค้าใหม่','text','สมัครครั้งเดียว เลือกตำบล ชื่อ และเบอร์ติดต่อจัดส่ง','links',jsonb_build_object('สมัครลูกค้า',base||'/liff/register'));
  end if;
  if p.suspended_at is not null then return jsonb_build_object('ok',false,'error','account_suspended'); end if;
  if a->>'action' in ('accept_shop','ready','reject_shop','accept_driver','pickup','deliver') then
    begin
      result:=public.partner_order_action_core(p.id,(a->>'order_id')::bigint,a->>'action',(a->>'action_id')::uuid);
    exception when invalid_text_representation then return jsonb_build_object('ok',false,'error','bad_action'); end;
    return result||jsonb_build_object('view','partner_result');
  elsif a->>'action' in ('open_shop','close_shop') then
    if p.role<>'merchant' or not p.approved then return jsonb_build_object('ok',false,'error','not_approved'); end if;
    update public.merchants set is_open=(a->>'action'='open_shop') where profile_id=p.id;
    return jsonb_build_object('ok',found,'view','partner_result','text',case when a->>'action'='open_shop' then 'เปิดรับออเดอร์แล้ว (ตามเวลาร้านที่ตั้งไว้)' else 'พักรับออเดอร์ใหม่แล้ว งานเดิมยังทำต่อได้' end);
  elsif a->>'action'='confirm_payout' then
    begin target:=(a->>'settlement_id')::bigint; exception when others then return jsonb_build_object('ok',false,'error','bad_action'); end;
    perform 1 from public.settlements where id=target and payee_profile_id=p.id and paid_out_at is not null for update;
    if not found then return jsonb_build_object('ok',false,'error','not_your_payout'); end if;
    update public.settlements set confirmed_at=now() where id=target and confirmed_at is null;
    return jsonb_build_object('ok',true,'view','partner_result','text','บันทึกว่าคุณตรวจพบเงินเข้าบัญชีแล้ว');
  end if;
  if p.role='merchant' and p.approved then
    select * into shop from public.merchants where profile_id=p.id limit 1;
    select coalesce(jsonb_agg(j),'[]') into jobs from (
      select o.id,o.status,o.merchant_accepted_at,o.food_ready_at,o.customer_paid_at,
        o.note,o.items_subtotal,o.dropoff,
        (select jsonb_agg(jsonb_build_object('name',oi.name,'qty',oi.qty)) from public.order_items oi where oi.order_id=o.id) items
      from public.orders o where o.merchant_id=shop.id and o.status in ('pending','accepted','in_progress') order by o.created_at limit 10
    ) j;
    select coalesce(jsonb_agg(j),'[]') into payouts from (select id,amount from public.settlements where payee_profile_id=p.id and paid_out_at is not null and confirmed_at is null order by paid_out_at limit 10) j;
    return jsonb_build_object('ok',true,'view','partner','role','merchant','title','งานร้าน '||shop.name,'jobs',jobs,'payouts',payouts,'shop_open',shop.is_open,
      'links',jsonb_build_object('ตั้งเวลา / เมนู',base||'/merchant','QR รับเงิน',base||'/account','ออเดอร์และเสียง',base||'/merchant/orders'));
  elsif p.role='driver' and p.approved then
    select coalesce(jsonb_agg(j),'[]') into jobs from (
      select o.id,o.status,o.driver_id,o.pickup,o.dropoff,o.delivery_fee,o.customer_paid_at from public.orders o
      where o.tambon_id=p.tambon_id and o.is_test=p.is_test and (
        (o.driver_id=p.id and o.status in ('accepted','in_progress')) or
        (o.status='pending' and o.driver_id is null and o.customer_paid_at is not null and exists(select 1 from public.drivers dr where dr.profile_id=p.id and dr.is_online and (o.required_vehicle_type is null or dr.vehicle_type=o.required_vehicle_type))))
      order by (o.driver_id=p.id) desc nulls last,o.created_at limit 10
    ) j;
    select coalesce(jsonb_agg(j),'[]') into payouts from (select id,amount from public.settlements where payee_profile_id=p.id and paid_out_at is not null and confirmed_at is null order by paid_out_at limit 10) j;
    return jsonb_build_object('ok',true,'view','partner','role','driver','title','งานไรเดอร์ในตำบลของคุณ','jobs',jobs,'payouts',payouts,
      'links',jsonb_build_object('ออนไลน์ / ตำแหน่ง / เสียง',base||'/driver','QR รับเงิน',base||'/account'));
  elsif coalesce((public.line_staff_context(p_line_user_id)->>'is_staff')::boolean,false) then
    return jsonb_build_object('ok',true,'view','partner','title','การเงินตำบล','text','ตรวจเงินจริงก่อนยืนยันรับเงิน แล้วโอนต่อให้ร้านค้าและไรเดอร์ตามรอบ','links',jsonb_build_object('เปิด PWA การเงิน',base||'/finance'));
  else
    return jsonb_build_object('ok',true,'view','partner','title','บัญชีลูกค้า','links',jsonb_build_object('เลือกอาหาร',base||'/liff','บัญชีของฉัน',base||'/account'));
  end if;
end $$;
revoke all on function public.line_partner_flow(text,text) from public,anon,authenticated;
grant execute on function public.line_partner_flow(text,text) to service_role;

-- Version the already deployed cart contract so a fresh database also has its columns.
alter table public.carts add column if not exists delivery_point jsonb;
alter table public.carts add column if not exists awaiting_location boolean not null default false;
alter table public.carts add column if not exists checkout_quote jsonb;
alter table public.carts add column if not exists last_checkout jsonb;

CREATE OR REPLACE FUNCTION public.food_flow(p_action text, p_user text, p_arg text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_item record; v_cart public.carts; v_items jsonb; v_found boolean := false; v_reset boolean := false;
  v_profile uuid; v_order bigint; v_json jsonb; v_shop record;
  v_is_test boolean;
  v_role public.user_role; v_tambon uuid; v_tambon_ok boolean; v_new record; v_active jsonb;
begin
  if p_user is null or p_user = '' then return jsonb_build_object('ok', false, 'error', 'no_user'); end if;

  -- นโยบาย D28 ข้อ 3–4: บัญชีทดสอบเห็นเฉพาะร้านทดสอบ ลูกค้าจริงเห็นเฉพาะร้านจริง
  select p.id, coalesce(p.is_test, false), p.role, p.tambon_id
    into v_profile, v_is_test, v_role, v_tambon
    from public.profiles p where p.line_user_id = p_user limit 1;
  v_is_test := coalesce(v_is_test, false);

  -- ตำบลที่เปิดบริการ (ใช้ทั้งการ์ดเลือกตำบลและกรณีมีตำบลเดียว)
  v_active := coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'slug', t.slug, 'name', t.name,
                                        'district', t.district, 'province', t.province) order by t.created_at)
      from public.tambons t where t.is_active and t.slug is not null), '[]'::jsonb);

  if p_action = 'tambons' then
    return jsonb_build_object('ok', true, 'tambons', v_active, 'current', v_tambon);
  end if;

  if p_action = 'set_tambon' then
    select t.id, t.name into v_new from public.tambons t
     where t.slug = btrim(coalesce(p_arg, '')) and (t.is_active or v_is_test);
    if not found then
      return jsonb_build_object('ok', false, 'error', 'tambon_unavailable', 'tambons', v_active);
    end if;
    if v_profile is null then
      insert into public.profiles(role, full_name, line_user_id, tambon_id)
      values ('customer', 'ลูกค้า LINE', p_user, v_new.id) returning id into v_profile;
    elsif v_role = 'customer' then
      update public.profiles set tambon_id = v_new.id where id = v_profile;
    elsif v_tambon is distinct from v_new.id then
      return jsonb_build_object('ok', false, 'error', 'role_fixed_tambon', 'tambons', v_active);
    end if;
    return public.food_flow('shops', p_user) || jsonb_build_object('tambon_set', v_new.name);
  end if;

  -- ยังไม่มีตำบล และเปิดบริการอยู่ตำบลเดียว: ใช้ตำบลนั้นไปก่อน (ไม่เขียนข้อมูล)
  if v_tambon is null and jsonb_array_length(v_active) = 1 then
    v_tambon := (v_active -> 0 ->> 'id')::uuid;
  end if;
  v_tambon_ok := v_tambon is not null
    and exists (select 1 from public.tambons t where t.id = v_tambon and (t.is_active or v_is_test));

  if not v_tambon_ok and p_action in ('shops', 'search', 'menu', 'add', 'remove', 'checkout') then
    return jsonb_build_object('ok', false, 'error', 'need_tambon', 'tambons', v_active,
                              'cart', public._cart_json(p_user));
  end if;

  if p_action = 'shops' then
    return jsonb_build_object('ok', true, 'tambon', (select t.name from public.tambons t where t.id = v_tambon),
      'shops', coalesce((
      select jsonb_agg(s order by s->>'name') from (
        select jsonb_build_object('id', m.id, 'name', m.name, 'category', m.category,
          'count', count(mi.id), 'photo', max(mi.photo_url)) s
        from public.merchants m
        join public.profiles p on p.id = m.profile_id and p.approved
        join public.menu_items mi on mi.merchant_id = m.id and mi.is_available and not coalesce(mi.is_hidden,false)
        where public.shop_open_at(m.is_open,m.hours_enabled,m.opening_hours) and m.is_test = v_is_test and m.tambon_id = v_tambon
        group by m.id, m.name, m.category
        limit 10) q), '[]'::jsonb));

  elsif p_action = 'menu' then
    select m.id, m.name, m.category into v_shop from public.merchants m
     where m.id = p_arg::uuid and public.shop_open_at(m.is_open,m.hours_enabled,m.opening_hours) and m.is_test = v_is_test and m.tambon_id = v_tambon;
    if not found then return jsonb_build_object('ok', false, 'error', 'shop_closed'); end if;
    return jsonb_build_object('ok', true, 'shop', jsonb_build_object('id', v_shop.id, 'name', v_shop.name, 'category', v_shop.category),
      'items', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'price', price, 'photo', photo_url) order by (photo_url is null), name)
        from (select * from public.menu_items where merchant_id = v_shop.id and is_available and not coalesce(is_hidden,false) order by (photo_url is null), name limit 11) t), '[]'::jsonb),
      'cart', public._cart_json(p_user));

  elsif p_action = 'search' then
    -- ค้นเองแทน search_menu (ซึ่งซ่อนร้านทดสอบเสมอ) เพื่อให้บัญชีทดสอบค้นร้านทดสอบได้
    return jsonb_build_object('ok', true, 'term', p_arg, 'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.item_id, 'name', r.item_name, 'price', r.price, 'photo', r.photo_url, 'shop_id', r.merchant_id, 'shop_name', r.merchant_name))
      from (select m.id as merchant_id, m.name as merchant_name, mi.id as item_id, mi.name as item_name, mi.price, mi.photo_url
              from public.menu_items mi
              join public.merchants m on m.id = mi.merchant_id
             where public.shop_open_at(m.is_open,m.hours_enabled,m.opening_hours) and m.is_test = v_is_test and m.tambon_id = v_tambon
               and mi.is_available and not coalesce(mi.is_hidden, false)
               and length(btrim(coalesce(p_arg, ''))) >= 2
               and mi.name ilike '%' || btrim(p_arg) || '%'
             order by mi.price asc, mi.name asc
             limit 10) r), '[]'::jsonb));

  elsif p_action in ('add', 'remove') then
    select mi.id, mi.name, mi.merchant_id into v_item from public.menu_items mi join public.merchants m on m.id = mi.merchant_id
     where mi.id = p_arg::uuid and mi.is_available and not coalesce(mi.is_hidden,false) and public.shop_open_at(m.is_open,m.hours_enabled,m.opening_hours) and m.is_test = v_is_test
       and m.tambon_id = v_tambon;
    if not found then return jsonb_build_object('ok', false, 'error', 'item_unavailable', 'cart', public._cart_json(p_user)); end if;
    select * into v_cart from public.carts where line_user_id = p_user for update;
    if not found then
      insert into public.carts(line_user_id, merchant_id, items) values (p_user, v_item.merchant_id, '[]') returning * into v_cart;
    elsif v_cart.merchant_id is distinct from v_item.merchant_id then
      v_reset := jsonb_array_length(v_cart.items) > 0;
      update public.carts set merchant_id = v_item.merchant_id, items = '[]' where line_user_id = p_user returning * into v_cart;
    end if;
    select coalesce(jsonb_agg(case when (e->>'id')::uuid = v_item.id
             then jsonb_build_object('id', e->>'id', 'qty', (e->>'qty')::int + case when p_action = 'add' then 1 else -1 end) else e end), '[]')
      into v_items from jsonb_array_elements(v_cart.items) e;
    v_found := exists (select 1 from jsonb_array_elements(v_cart.items) e where (e->>'id')::uuid = v_item.id);
    if not v_found and p_action = 'add' then v_items := v_items || jsonb_build_array(jsonb_build_object('id', v_item.id, 'qty', 1)); end if;
    select coalesce(jsonb_agg(e), '[]') into v_items from jsonb_array_elements(v_items) e where (e->>'qty')::int > 0;
    update public.carts set items = v_items, updated_at = now() where line_user_id = p_user;
    return jsonb_build_object('ok', true, 'action', p_action, 'item_name', v_item.name, 'reset', v_reset, 'cart', public._cart_json(p_user));

  elsif p_action = 'cart' then
    return jsonb_build_object('ok', true, 'cart', public._cart_json(p_user));

  elsif p_action = 'clear' then
    delete from public.carts where line_user_id = p_user;
    return jsonb_build_object('ok', true, 'cart', public._cart_json(p_user));

  elsif p_action = 'checkout' then
    v_json := public._cart_json(p_user);
    if coalesce((v_json->>'count')::int, 0) = 0 then return jsonb_build_object('ok', false, 'error', 'empty_cart', 'cart', v_json); end if;
    select m.id, m.name, m.tambon_id, pr.line_user_id into v_shop from public.merchants m left join public.profiles pr on pr.id = m.profile_id
     where m.id = (v_json->>'merchant_id')::uuid and public.shop_open_at(m.is_open,m.hours_enabled,m.opening_hours) and m.is_test = v_is_test and m.tambon_id = v_tambon;
    if not found then return jsonb_build_object('ok', false, 'error', 'shop_closed', 'cart', v_json); end if;
    if v_profile is null then
      insert into public.profiles(role, full_name, line_user_id, tambon_id) values ('customer', 'ลูกค้า LINE', p_user, v_shop.tambon_id) returning id into v_profile;
    end if;
    insert into public.orders(type, status, tambon_id, customer_id, merchant_id, items_subtotal, note)
      values ('food', 'pending', v_shop.tambon_id, v_profile, v_shop.id, (v_json->>'total')::numeric, 'สั่งผ่าน LINE (ตะกร้า)')
      returning id into v_order;
    insert into public.order_items(order_id, menu_item_id, name, qty, price)
      select v_order, (i->>'id')::uuid, i->>'name', (i->>'qty')::int, (i->>'price')::numeric from jsonb_array_elements(v_json->'items') i;
    delete from public.carts where line_user_id = p_user;
    return jsonb_build_object('ok', true, 'order_id', v_order, 'shop_name', v_shop.name, 'merchant_line_user_id', v_shop.line_user_id,
      'items', v_json->'items', 'total', v_json->'total', 'count', v_json->'count');
  end if;
  return jsonb_build_object('ok', false, 'error', 'unknown_action');
end $function$;

CREATE OR REPLACE FUNCTION public.food_chat_quote(p_user text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare c public.carts; p record; m record; t record; j jsonb; point jsonb; km double precision; fee numeric; effective_tambon uuid;
begin
  select * into c from public.carts where line_user_id=p_user;
  j := public._cart_json(p_user);
  if coalesce((j->>'count')::int,0)=0 then return jsonb_build_object('ok',false,'error','empty_cart','cart',j); end if;
  select id,coalesce(is_test,false) as is_test,tambon_id,role into p from public.profiles where line_user_id=p_user;
  effective_tambon := p.tambon_id;
  if effective_tambon is null then
    select case when count(*)=1 then (array_agg(id))[1] end into effective_tambon from public.tambons where is_active;
  end if;
  if effective_tambon is null then
    return public.food_flow('tambons',p_user)||jsonb_build_object('ok',false,'error','need_tambon');
  end if;
  select mm.* into m from public.merchants mm join public.profiles owner on owner.id=mm.profile_id
    where mm.id=c.merchant_id and public.shop_open_at(mm.is_open,mm.hours_enabled,mm.opening_hours) and mm.is_test=coalesce(p.is_test,false) and owner.approved and mm.tambon_id=effective_tambon;
  if not found then return jsonb_build_object('ok',false,'error','shop_closed','cart',j); end if;
  select * into t from public.tambons where id=m.tambon_id;
  if not (t.is_active or p.is_test) then return jsonb_build_object('ok',false,'error','tambon_unavailable','cart',j); end if;
  if coalesce(t.intake_blocked,false) then return jsonb_build_object('ok',false,'error','intake_blocked','cart',j); end if;
  if jsonb_array_length(c.items) <> jsonb_array_length(j->'items') or exists(
    select 1 from jsonb_array_elements(j->'items') i where (i->>'qty')::int not between 1 and 99
  ) then return jsonb_build_object('ok',false,'error','cart_changed','cart',j); end if;
  point := c.delivery_point;
  if point is null then
    select jsonb_build_object('lat',o.dropoff_lat,'lng',o.dropoff_lng,
      'label',coalesce(nullif(btrim(o.dropoff),''),'จุดส่งเดิมที่เคยแชร์'),'source','previous_order') into point
      from public.orders o where o.customer_id=p.id and o.type='food' and o.is_test=p.is_test
        and o.dropoff_lat between -90 and 90 and o.dropoff_lng between -180 and 180
      order by o.created_at desc,o.id desc limit 1;
  end if;
  if point is null or c.awaiting_location then
    return jsonb_build_object('ok',true,'view','need_location','cart',j);
  end if;
  if m.lat is null or m.lng is null then
    return jsonb_build_object('ok',false,'error','shop_no_pin','cart',j);
  end if;
  km := public.haversine_km(m.lat,m.lng,(point->>'lat')::double precision,(point->>'lng')::double precision);
  if km>30 then return jsonb_build_object('ok',false,'error','too_far','cart',j); end if;
  km := round(km::numeric,1)::double precision;
  fee := public.delivery_fee_for(m.tambon_id,km);
  return jsonb_build_object('ok',true,'view','review','cart',j,'quote',jsonb_build_object(
    'customer_note',c.customer_note,'merchant_id',m.id,'items',j->'items','items_total',(j->>'total')::numeric,'delivery_fee',fee,
    'grand_total',(j->>'total')::numeric+fee,'distance_km',km,'point',point));
end $function$;

CREATE OR REPLACE FUNCTION public.food_chat_flow(p_action text, p_user text, p_arg text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare c public.carts; r jsonb; fresh jsonb; q jsonb; point jsonb; previous jsonb; profile_id uuid;
  m record; order_id bigint; new_point jsonb;
begin
  if p_action='partner' then return public.line_partner_flow(p_user,p_arg); end if;
  if coalesce(btrim(p_user),'')='' then return jsonb_build_object('ok',false,'error','no_user'); end if;
  perform pg_advisory_xact_lock(hashtextextended('food-chat:'||p_user,0));
  select * into c from public.carts where line_user_id=p_user for update;
  if p_action='location' then
    if c.line_user_id is null or not c.awaiting_location then return jsonb_build_object('ok',true,'handled',false); end if;
    begin
      new_point := p_arg::jsonb;
      if not ((new_point->>'lat')::double precision between -90 and 90)
        or not ((new_point->>'lng')::double precision between -180 and 180)
        or new_point->>'lat' is null or new_point->>'lng' is null then
        return jsonb_build_object('ok',false,'handled',true,'error','bad_point');
      end if;
    exception when others then return jsonb_build_object('ok',false,'handled',true,'error','bad_point'); end;
    update public.carts set delivery_point=jsonb_build_object('lat',(new_point->>'lat')::double precision,
      'lng',(new_point->>'lng')::double precision,'label',left(coalesce(nullif(btrim(new_point->>'label'),''),'จุดส่งที่เลือก'),500),
      'source','shared_location'), awaiting_location=false,checkout_quote=null,updated_at=now() where line_user_id=p_user;
    r := public.food_chat_flow('review',p_user);
    return r||jsonb_build_object('handled',true);
  elsif p_action='request_location' then
    if c.line_user_id is null or coalesce((public._cart_json(p_user)->>'count')::int,0)=0 then
      return jsonb_build_object('ok',false,'error','empty_cart');
    end if;
    update public.carts set awaiting_location=true,checkout_quote=null,updated_at=now() where line_user_id=p_user;
    return jsonb_build_object('ok',true,'view','need_location','cart',public._cart_json(p_user));
  elsif p_action in ('review','checkout') then
    -- Old checkout buttons become review buttons. No order exists at this point.
    r := public.food_chat_quote(p_user);
    if r->>'view'='need_location' or r->>'error'='too_far' then
      update public.carts set awaiting_location=true,checkout_quote=null,updated_at=now() where line_user_id=p_user;
    elsif (r->>'ok')::boolean then
      q := (r->'quote')||jsonb_build_object('token',gen_random_uuid(),'expires_at',now()+interval '10 minutes');
      update public.carts set checkout_quote=q,delivery_point=q->'point',updated_at=now() where line_user_id=p_user;
      r := jsonb_set(r,'{quote}',q);
    end if;
    return r;
  elsif p_action='confirm' then
    -- Only the same LINE user can replay this token; retries never create a second order.
    if c.last_checkout->>'token'=p_arg then
      order_id := (c.last_checkout->>'order_id')::bigint;
      if not exists(select 1 from public.orders where id=order_id and status<>'cancelled') then
        return jsonb_build_object('ok',false,'error','order_cancelled');
      end if;
      return (c.last_checkout->'result')||jsonb_build_object('duplicate',true,'payment',public.line_payment_instructions(order_id));
    end if;
    q := c.checkout_quote;
    if q is null or q->>'token' is distinct from p_arg then
      return jsonb_build_object('ok',false,'error','review_required','cart',public._cart_json(p_user));
    end if;
    -- Keep availability and prices stable from the final check through order creation.
    perform 1 from public.merchants where id=c.merchant_id for share;
    perform 1 from public.tambons where id=(select tambon_id from public.merchants where id=c.merchant_id) for share;
    perform 1 from public.menu_items where id in (select (i->>'id')::uuid from jsonb_array_elements(c.items) i) order by id for share;
    fresh := public.food_chat_quote(p_user);
    if not coalesce((fresh->>'ok')::boolean,false) or fresh->>'view'<>'review' then return fresh; end if;
    if (q->>'expires_at')::timestamptz<now() or (q-'token'-'expires_at') is distinct from fresh->'quote' then
      r := public.food_chat_flow('review',p_user);
      return r||jsonb_build_object('notice','ยอดหรือรายการเปลี่ยน กรุณาตรวจแล้วกดยืนยันอีกครั้ง');
    end if;
    select id into profile_id from public.profiles where line_user_id=p_user;
    select * into m from public.merchants where id=(q->>'merchant_id')::uuid;
    if profile_id is null then
      insert into public.profiles(role,full_name,line_user_id,tambon_id)
      values('customer','ลูกค้า LINE',p_user,m.tambon_id) returning id into profile_id;
    end if;
    point := q->'point';
    insert into public.orders(type,status,tambon_id,customer_id,merchant_id,items_subtotal,note,
      dropoff,dropoff_lat,dropoff_lng,pickup_lat,pickup_lng,delivery_fee,price)
    values('food','pending',m.tambon_id,profile_id,m.id,(q->>'items_total')::numeric,concat_ws(E'\n','สั่งผ่าน LINE (ยืนยันยอด)',nullif(q->>'customer_note','')),
      point->>'label',(point->>'lat')::double precision,(point->>'lng')::double precision,m.lat,m.lng,
      (q->>'delivery_fee')::numeric,(q->>'delivery_fee')::numeric) returning id into order_id;
    insert into public.order_items(order_id,menu_item_id,name,qty,price)
    select order_id,(i->>'id')::uuid,i->>'name',(i->>'qty')::int,(i->>'price')::numeric from jsonb_array_elements(q->'items') i;
    r := jsonb_build_object('ok',true,'view','confirmed','order_id',order_id,'shop_name',m.name,'items',q->'items',
      'items_total',q->'items_total','delivery_fee',q->'delivery_fee','grand_total',q->'grand_total','point',point,
      'payment',public.line_payment_instructions(order_id));
    update public.carts set items='[]',checkout_quote=null,awaiting_location=false,updated_at=now(),
      last_checkout=jsonb_build_object('token',p_arg,'order_id',order_id,'result',r-'payment') where line_user_id=p_user;
    return r;
  elsif p_action='clear' then
    update public.carts set items='[]',checkout_quote=null,awaiting_location=false,updated_at=now() where line_user_id=p_user;
    return jsonb_build_object('ok',true,'cart',public._cart_json(p_user));
  elsif p_action='remove' then
    -- A sold-out item can still be removed from its owner's cart.
    update public.carts set items=coalesce((select jsonb_agg(case when i->>'id'=p_arg
        then jsonb_set(i,'{qty}',to_jsonb((i->>'qty')::int-1)) else i end)
      from jsonb_array_elements(c.items) i where i->>'id'<>p_arg or (i->>'qty')::int>1),'[]'),
      checkout_quote=null,updated_at=now() where line_user_id=p_user;
    return jsonb_build_object('ok',true,'action','remove','item_name',(select name from public.menu_items where id=p_arg::uuid),
      'cart',public._cart_json(p_user));
  elsif p_action='add' then
    if exists(select 1 from jsonb_array_elements(coalesce(c.items,'[]')) i where i->>'id'=p_arg and (i->>'qty')::int>=99) then
      return jsonb_build_object('ok',false,'error','qty_limit','cart',public._cart_json(p_user));
    end if;
  end if;
  if p_action not in ('shops','menu','search','add','remove','cart','clear','tambons','set_tambon') then
    return jsonb_build_object('ok',false,'error','unknown_action');
  end if;
  r := public.food_flow(p_action,p_user,p_arg);
  if p_action in ('add','remove','clear','set_tambon') then
    update public.carts set checkout_quote=null,updated_at=now() where line_user_id=p_user;
  end if;
  -- A single available shop opens its menu immediately, preserving the existing tambon choice.
  if p_action in ('shops','set_tambon') and coalesce((r->>'ok')::boolean,false) and jsonb_array_length(r->'shops')=1 then
    previous := r;
    r := public.food_flow('menu',p_user,r->'shops'->0->>'id');
    r := r||jsonb_build_object('view','menu','tambon',previous->'tambon');
  end if;
  return r;
end $function$;

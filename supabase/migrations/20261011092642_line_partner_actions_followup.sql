-- Fix forward: preserve all business rows and existing function ACLs.
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
    if p.role<>'merchant' or m.profile_id is distinct from p.id then return jsonb_build_object('ok',false,'error','not_your_shop'); end if;
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
  if a->>'action'='finance' then
    if not coalesce((public.line_staff_context(p_line_user_id)->>'is_staff')::boolean,false) then return jsonb_build_object('ok',false,'error','not_staff'); end if;
    return jsonb_build_object('ok',true,'view','partner','title','การเงินตำบล','links',jsonb_build_object('เปิด PWA การเงิน',base||'/finance'));
  elsif a->>'action'='reject_shop_prompt' then
    if p.role<>'merchant' or not p.approved then return jsonb_build_object('ok',false,'error','not_approved'); end if;
    begin target:=(a->>'order_id')::bigint; exception when others then return jsonb_build_object('ok',false,'error','bad_action'); end;
    if not exists(select 1 from public.orders o join public.merchants m on m.id=o.merchant_id where o.id=target and m.profile_id=p.id
      and o.status='pending' and o.customer_paid_at is null and o.slip_submitted_at is null and o.driver_id is null) then
      return jsonb_build_object('ok',false,'error','contact_agent');
    end if;
    return jsonb_build_object('ok',true,'view','partner_reject_confirm','order_id',target);
  end if;
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
        o.note,o.items_subtotal,o.dropoff,o.slip_submitted_at,o.driver_id,
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
        (o.status='pending' and o.driver_id is null and (o.type<>'food' or o.customer_paid_at is not null) and exists(select 1 from public.drivers dr where dr.profile_id=p.id and dr.is_online and (o.required_vehicle_type is null or dr.vehicle_type=o.required_vehicle_type))))
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
    update public.carts set items='[]',customer_note=null,checkout_quote=null,awaiting_location=false,updated_at=now(),
      last_checkout=jsonb_build_object('token',p_arg,'order_id',order_id,'result',r-'payment') where line_user_id=p_user;
    return r;
  elsif p_action='clear' then
    update public.carts set items='[]',customer_note=null,checkout_quote=null,awaiting_location=false,updated_at=now() where line_user_id=p_user;
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

-- Every data mutation and notification enqueue below is deliberately rolled back.
do $$
declare uid uuid:=gen_random_uuid(); forged uuid:=gen_random_uuid(); t uuid; r jsonb; h jsonb; checks int:=0;
  cid uuid; lu text; mid uuid; iid uuid; q jsonb; oid bigint; before_count bigint; point jsonb; owner_id uuid; owner_line text; job bigint;
begin
  begin
    if has_function_privilege('authenticated','public.partner_order_action_core(uuid,bigint,text,uuid)','EXECUTE')
      or has_function_privilege('anon','public.register_line_customer(text,text,uuid)','EXECUTE')
      or has_function_privilege('authenticated','public.line_partner_flow(text,text)','EXECUTE') then raise exception 'ACL regression'; end if;
    checks:=checks+1;
    h:=(select jsonb_agg(jsonb_build_object('enabled',true,'open','18:00','close','02:00')) from generate_series(0,6));
    if not public.valid_shop_hours(h) or public.valid_shop_hours('[]')
      or not public.shop_open_at(true,true,h,'2026-10-11 18:00:00+07')
      or not public.shop_open_at(true,true,h,'2026-10-12 01:59:00+07')
      or public.shop_open_at(true,true,h,'2026-10-12 02:00:00+07')
      or public.shop_open_at(false,true,h,'2026-10-11 19:00:00+07') then raise exception 'schedule boundary'; end if;
    checks:=checks+1;
    select id into t from public.tambons where is_active order by created_at limit 1;
    insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values
      (uid,'qa-'||uid||'@line.invalid',jsonb_build_object('line_user_id','U'||replace(uid::text,'-','')),'{}'),
      (forged,'qa-'||forged||'@line.invalid','{}',jsonb_build_object('line_user_id','U'||replace(forged::text,'-','')));
    perform set_config('request.jwt.claims',jsonb_build_object('sub',forged,'role','authenticated')::text,true);
    r:=public.register_line_customer('QA customer','0812345678',t);
    if r->>'error' is distinct from 'line_login_required' then raise exception 'unverified identity accepted'; end if;
    checks:=checks+1;
    perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
    r:=public.register_line_customer('QA customer','0812345678',t);
    if not coalesce((r->>'ok')::boolean,false) then raise exception 'signup failed: %',r; end if;
    if not exists(select 1 from public.profiles where id=uid and role='customer' and phone='66812345678' and line_user_id='U'||replace(uid::text,'-','')) then raise exception 'signup data mismatch'; end if;
    r:=public.register_line_customer('QA repeat','0812345678',t);
    if not (r->>'ok')::boolean or (select count(*) from public.profiles where id=uid)<>1 then raise exception 'signup duplicate'; end if;
    checks:=checks+1;
    r:=public.register_line_customer('QA customer','123',t);
    if r->>'error' is distinct from 'bad_phone' then raise exception 'bad phone accepted'; end if;
    checks:=checks+1;
    r:=public.partner_order_action(155,'accept_shop',gen_random_uuid());
    if r->>'ok'='true' then raise exception 'customer mutated shop order'; end if;
    checks:=checks+1;
    -- Use the existing cart customer only inside the rollback block; no real order is changed/committed.
    select o.customer_id,p.line_user_id,o.merchant_id into cid,lu,mid from public.orders o join public.profiles p on p.id=o.customer_id where o.id=143;
    if cid is null then raise exception 'cart fixture missing'; end if;
    select id into iid from public.menu_items where merchant_id=mid and is_available and not coalesce(is_hidden,false) order by name limit 1;
    select jsonb_build_object('lat',lat,'lng',lng,'label','QA rollback only') into point from public.merchants where id=mid;
    update public.profiles set phone=coalesce(nullif(phone,''),'66812345678') where id=cid;
    perform set_config('request.jwt.claims',jsonb_build_object('sub',cid,'role','authenticated')::text,true);
    select count(*) into before_count from public.orders;
    r:=public.customer_food_review(mid,jsonb_build_array(jsonb_build_object('id',iid,'qty',2)),point,'QA note');
    if r->>'view' is distinct from 'review' or r->'quote'->>'customer_note' is distinct from 'QA note' then raise exception 'review failed %',r; end if;
    if (select count(*) from public.orders)<>before_count or r ? 'payment' then raise exception 'premature order/payment'; end if;
    q:=r->'quote'; checks:=checks+1;
    perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
    r:=public.customer_food_confirm(q->>'token');
    if r->>'view'='confirmed' then raise exception 'other customer used quote'; end if;
    checks:=checks+1;
    perform set_config('request.jwt.claims',jsonb_build_object('sub',cid,'role','authenticated')::text,true);
    r:=public.customer_food_confirm(q->>'token');
    if r->>'view' is distinct from 'confirmed' then raise exception 'confirm failed %',r; end if;
    oid:=(r->>'order_id')::bigint;
    if (select note from public.orders where id=oid) not like '%QA note%' then raise exception 'note not saved'; end if;
    r:=public.customer_food_confirm(q->>'token');
    if not (r->>'duplicate')::boolean or (r->>'order_id')::bigint<>oid or (select count(*) from public.orders)<>before_count+1 then raise exception 'duplicate order'; end if;
    checks:=checks+1;
    if exists(select 1 from public.carts where line_user_id=lu and customer_note is not null) then raise exception 'note leaked to next order'; end if;
    checks:=checks+1;
    select p.id,p.line_user_id into owner_id,owner_line from public.merchants m join public.profiles p on p.id=m.profile_id where m.id=mid;
    perform set_config('request.jwt.claims','{"role":"service_role"}',true);
    r:=public.line_partner_flow('U'||replace(uid::text,'-',''),'{"action":"finance"}');
    if r->>'error' is distinct from 'not_staff' then raise exception 'customer accessed finance'; end if;
    checks:=checks+1;
    r:=public.line_partner_flow(owner_line,jsonb_build_object('action','reject_shop_prompt','order_id',oid)::text);
    if r->>'view' is distinct from 'partner_reject_confirm' or (select status from public.orders where id=oid)<>'pending' then raise exception 'reject did not ask first %',r; end if;
    r:=public.partner_order_action_core(owner_id,oid,'ready',gen_random_uuid());
    if r->>'error' is distinct from 'payment_required' then raise exception 'ready before verified payment %',r; end if;
    checks:=checks+1;
    r:=public.partner_order_action_core(owner_id,oid,'accept_shop',gen_random_uuid());
    if not coalesce((r->>'ok')::boolean,false) then raise exception 'merchant acceptance failed %',r; end if;
    r:=public.partner_order_action_core(owner_id,oid,'accept_shop',gen_random_uuid());
    if not coalesce((r->>'duplicate')::boolean,false) then raise exception 'merchant acceptance retried'; end if;
    if not exists(select 1 from public.order_events where order_id=oid and note like '%partner:accept_shop%') then raise exception 'missing action audit'; end if;
    checks:=checks+1;
    insert into public.profiles(id,role,full_name,tambon_id,approved,is_test)
      select forged,'driver','QA rollback driver',tambon_id,true,is_test from public.merchants where id=mid;
    insert into public.drivers(profile_id,is_online) values(forged,true);
    update public.profiles set approved=true where id=forged;
    r:=public.partner_order_action_core(forged,oid,'accept_driver',gen_random_uuid());
    if r->>'error' is distinct from 'job_not_ready' then raise exception 'unpaid food claimed %',r; end if;
    checks:=checks+1;
    insert into public.orders(customer_id,tambon_id,type,pickup,dropoff,price,delivery_fee,is_test,payment_method,required_vehicle_type)
      select cid,tambon_id,'parcel','QA pickup','QA dropoff',20,20,is_test,'เงินสดปลายทาง','motorcycle' from public.merchants where id=mid returning id into job;
    r:=public.partner_order_action_core(forged,job,'accept_driver',gen_random_uuid());
    if not coalesce((r->>'ok')::boolean,false) then raise exception 'driver claim failed %',r; end if;
    r:=public.partner_order_action_core(forged,job,'accept_driver',gen_random_uuid());
    if not coalesce((r->>'duplicate')::boolean,false) then raise exception 'driver claim retry'; end if;
    r:=public.partner_order_action_core(forged,job,'deliver',gen_random_uuid());
    if r->>'error' is distinct from 'wrong_step' then raise exception 'skipped pickup'; end if;
    r:=public.partner_order_action_core(forged,job,'pickup',gen_random_uuid());
    if not coalesce((r->>'ok')::boolean,false) then raise exception 'pickup failed %',r; end if;
    r:=public.partner_order_action_core(forged,job,'deliver',gen_random_uuid());
    if not coalesce((r->>'ok')::boolean,false) or (select status from public.orders where id=job)<>'delivered' then raise exception 'delivery failed %',r; end if;
    r:=public.partner_order_action_core(forged,job,'deliver',gen_random_uuid());
    if not coalesce((r->>'duplicate')::boolean,false) then raise exception 'delivery retry'; end if;
    checks:=checks+1;
    raise exception using errcode='Z0001',message='intentional rollback';
  exception when sqlstate 'Z0001' then null;
  end;
  perform set_config('app.line_operations_qa',jsonb_build_object('passed',checks,'data_rolled_back',true)::text,false);
end $$;
select current_setting('app.line_operations_qa')::jsonb as results;

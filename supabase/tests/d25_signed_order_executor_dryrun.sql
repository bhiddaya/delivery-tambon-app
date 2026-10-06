-- Run after the D25 Delivery migration in SAME transaction, then ROLLBACK.
-- Creates only is_test profiles/orders. No LINE IDs and no notification calls.
do $$
declare a uuid:=gen_random_uuid(); d uuid:=gen_random_uuid(); c uuid:=gen_random_uuid();
  t uuid:=gen_random_uuid(); t2 uuid:=gen_random_uuid(); o bigint; o2 bigint;
  p jsonb; ticket text; sig text; receipt jsonb; again jsonb; cid uuid:=gen_random_uuid();
begin
  if exists(select 1 from vault.secrets where name='d25_bridge_hmac') then
    raise exception 'D25 key already exists: use an isolated test environment';
  end if;
  perform vault.create_secret(repeat('d25-test-only-',6),'d25_bridge_hmac');
  insert into public.tambons(id,name,slug) values(t,'D25 test','d25-test-'||t),(t2,'D25 other','d25-test-'||t2);
  insert into public.profiles(id,role,full_name,tambon_id,is_test)
    values(a,'admin','D25 test admin',t,true),(d,'driver','D25 test driver',t,true),
          (c,'customer','D25 test customer',t,true);
  update public.profiles set approved=true where id=d;
  insert into public.drivers(profile_id) values(d);
  insert into public.orders(type,tambon_id,customer_id,is_test) values('food',t,c,true) returning id into o;
  insert into public.orders(type,tambon_id,customer_id,is_test) values('food',t2,c,true) returning id into o2;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
  p := jsonb_build_object('command_id',cid,'project_id','4ecec344-ba76-48f3-89c1-b7cb230702d6',
    'delivery_actor',a,'action','order.assign','order_id',o,'driver_id',d,'reason','D25 test assignment');
  ticket := jsonb_build_object('issuer','hermes-d25-v1','audience','delivery-d25-v1','payload',p,
     'approved_by',gen_random_uuid(),'expires_at',extract(epoch from now()+interval '5 minutes')::bigint)::text;
  sig := private.d25_sign('approval',ticket);
  begin
    perform public.delivery_command_execute(ticket,repeat('0',64));
    raise exception 'forged ticket accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.delivery_command_execute(replace(ticket,'order.assign','order.cancel'),sig);
    raise exception 'tampered ticket accepted';
  exception when insufficient_privilege then null; end;
  receipt := public.delivery_command_execute(ticket,sig);
  again := public.delivery_command_execute(ticket,sig);
  if receipt is distinct from again then raise exception 'duplicate receipt changed'; end if;
  if (select count(*) from private.delivery_command_receipts where command_id=cid)<>1
     or (select count(*) from public.admin_actions where actor_id=a and action='command.execute')<>1
     or not exists(select 1 from public.orders where id=o and status='accepted' and driver_id=d) then
    raise exception 'mutation or idempotency failed';
  end if;
  p := jsonb_set(p,'{order_id}',to_jsonb(o2));
  ticket := jsonb_set(ticket::jsonb,'{payload}',p)::text;
  begin
    perform public.delivery_command_execute(ticket,private.d25_sign('approval',ticket));
    raise exception 'cross tambon accepted';
  exception when insufficient_privilege then null; end;
  p := jsonb_set(p,'{order_id}',to_jsonb(o));
  p := jsonb_set(p,'{action}','"order.cancel"'); p := jsonb_set(p,'{driver_id}','null');
  ticket := jsonb_set(ticket::jsonb,'{payload}',p)::text;
  begin
    perform public.delivery_command_execute(ticket,private.d25_sign('approval',ticket));
    raise exception 'same command different payload accepted';
  exception when object_not_in_prerequisite_state then null; end;
  p := jsonb_set(p,'{command_id}',to_jsonb(gen_random_uuid()));
  ticket := jsonb_set(ticket::jsonb,'{payload}',p)::text;
  receipt := public.delivery_command_execute(ticket,private.d25_sign('approval',ticket));
  if not exists(select 1 from public.orders where id=o and status='cancelled') then
    raise exception 'cancel failed';
  end if;
  ticket := jsonb_set(ticket::jsonb,'{expires_at}',to_jsonb(0))::text;
  begin
    perform public.delivery_command_execute(ticket,private.d25_sign('approval',ticket));
    raise exception 'expired ticket accepted';
  exception when insufficient_privilege then null; end;
  if has_function_privilege('anon','public.delivery_command_execute(text,text)','execute')
     or has_function_privilege('authenticated','private.d25_sign(text,text)','execute')
     or has_table_privilege('authenticated','private.delivery_command_receipts','insert') then
    raise exception 'privilege leak';
  end if;
end $$;
select 'D25 Delivery rollback assertions passed' as verification;


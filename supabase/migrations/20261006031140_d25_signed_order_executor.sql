-- D25: authenticated Delivery admin + signed approval + atomic replay receipt.
create schema if not exists private;
create table private.delivery_command_receipts (
  command_id uuid primary key,
  payload jsonb not null,
  receipt jsonb not null,
  created_at timestamptz not null default now()
);
alter table private.delivery_command_receipts enable row level security;
revoke all on private.delivery_command_receipts from public,anon,authenticated;

create function private.d25_sign(p_domain text,p_body text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_key text;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name='d25_bridge_hmac';
  if v_key is null or length(v_key)<64 then
    raise exception 'D25 signing key is not configured' using errcode='55000';
  end if;
  return encode(extensions.hmac(convert_to(p_domain || E'\n' || p_body,'UTF8'),
                convert_to(v_key,'UTF8'),'sha256'),'hex');
end $$;
revoke all on function private.d25_sign(text,text) from public,anon,authenticated;

create function public.delivery_command_execute(p_ticket text,p_signature text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t jsonb; p jsonb; v_id uuid; v_order public.orders%rowtype;
  v_old private.delivery_command_receipts%rowtype; v_receipt jsonb;
begin
  if auth.uid() is null then
    raise exception 'Delivery login required' using errcode='42501';
  end if;
  if p_ticket is null or octet_length(p_ticket)>8000 or p_signature is null
     or p_signature is distinct from private.d25_sign('approval',p_ticket) then
    raise exception 'invalid approval signature' using errcode='42501';
  end if;
  t := p_ticket::jsonb; p := t->'payload';
  if t->>'issuer' is distinct from 'hermes-d25-v1' or t->>'audience' is distinct from 'delivery-d25-v1'
     or t->>'approved_by' is null or (t->>'expires_at')::bigint is null
     or (t->>'expires_at')::bigint < extract(epoch from clock_timestamp())
     or (t->>'expires_at')::bigint > extract(epoch from clock_timestamp() + interval '6 minutes')
     or p->>'project_id' is distinct from '4ecec344-ba76-48f3-89c1-b7cb230702d6'
     or (p->>'delivery_actor')::uuid is distinct from auth.uid()
     or p->>'action' is null or p->>'action' not in ('order.assign','order.cancel')
     or (p->>'order_id')::bigint is null or (p->>'order_id')::bigint <= 0
     or p->>'reason' is null or length(btrim(p->>'reason')) not between 5 and 500
     or (p->>'action'='order.assign') <> (p->>'driver_id' is not null) then
    raise exception 'invalid approval ticket' using errcode='42501';
  end if;
  v_id := (p->>'command_id')::uuid;
  if v_id is null then raise exception 'command ID required' using errcode='22023'; end if;
  -- Serialize duplicate commands before checking the durable receipt. UUID hash
  -- collisions only serialize unrelated calls; correctness comes from the PK.
  perform pg_advisory_xact_lock(hashtextextended(v_id::text,0));
  select * into v_order from public.orders where id=(p->>'order_id')::bigint for update;
  if not found then raise exception 'order not found' using errcode='P0002'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid()
                and approved and suspended_at is null)
     or not public.can_admin_tambon(v_order.tambon_id) then
    raise exception 'wrong tambon' using errcode='42501';
  end if;
  select * into v_old from private.delivery_command_receipts where command_id=v_id;
  if found then
    if v_old.payload is distinct from p then raise exception 'command payload changed' using errcode='55000'; end if;
    return jsonb_build_object('body',v_old.receipt::text,'signature',private.d25_sign('receipt',v_old.receipt::text));
  end if;
  if p->>'action'='order.assign' then
    perform public.admin_assign_order(v_order.id,(p->>'driver_id')::uuid);
  else
    perform public.admin_cancel_order(v_order.id,p->>'reason');
  end if;
  v_receipt := jsonb_build_object('issuer','delivery-d25-v1','payload',p,
      'status','completed','completed_at',now());
  insert into private.delivery_command_receipts(command_id,payload,receipt) values(v_id,p,v_receipt);
  insert into public.admin_actions(actor_id,target_id,action,note)
  values(auth.uid(),auth.uid(),'command.execute',
      'Hermes command ' || v_id::text || ' ' || (p->>'action') || ' #' || v_order.id);
  return jsonb_build_object('body',v_receipt::text,'signature',private.d25_sign('receipt',v_receipt::text));
end $$;
revoke all on function public.delivery_command_execute(text,text) from public,anon;
grant execute on function public.delivery_command_execute(text,text) to authenticated;


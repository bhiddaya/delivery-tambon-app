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
  -- The canonical order trigger may already have logged this status in this transaction.
  -- Append the action audit to that event; never insert the same (order,status,created_at) twice.
  update public.order_events set note=concat_ws(E'\n',nullif(note,''),'partner:'||p_action||' actor='||p.id||' action='||coalesce(p_action_id::text,''))
    where id=(select e.id from public.order_events e join public.orders ord on ord.id=e.order_id
      where e.order_id=o.id and e.status=ord.status and e.created_at=now() order by e.id desc limit 1);
  if not found then
    insert into public.order_events(order_id,status,note) select id,status,'partner:'||p_action||' actor='||p.id||' action='||coalesce(p_action_id::text,'') from public.orders where id=o.id;
  end if;
  return jsonb_build_object('ok',true,'order_id',o.id,'action',p_action);
end $$;

-- ต่อจาก 20261018000000_everyone_can_order: ทุกบัญชี LINE สั่งร้านตำบลไหนก็ได้
-- food_chat_quote ยังบังคับให้ร้านอยู่ตำบลเดียวกับบัญชี (profiles.tambon_id) บัญชีลูกค้าผ่านเพราะ customer_food_review
-- ย้ายตำบลให้ก่อน แต่บัญชีผู้ดูแล/ร้าน/ไรเดอร์คงตำบลเดิมไว้ จึงได้ error shop_closed ทั้งที่ร้านเปิดอยู่
-- แก้: ตัดเงื่อนไข mm.tambon_id=effective_tambon ออก ที่เหลือเหมือนเดิมทุกบรรทัด (ออเดอร์ยังไปตำบลของร้าน)

create or replace function public.food_chat_quote(p_user text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare c public.carts; p record; m record; t record; j jsonb; point jsonb; km double precision; fee numeric; effective_tambon uuid;
begin
  select * into c from public.carts where line_user_id=p_user;
  j := public._cart_json(p_user);
  if coalesce((j->>'count')::int,0)=0 then return jsonb_build_object('ok',false,'error','empty_cart','cart',j); end if;
  select id,coalesce(is_test,false) as is_test,tambon_id,role,llp_tester into p from public.profiles where line_user_id=p_user;
  effective_tambon := p.tambon_id;
  if effective_tambon is null then
    select case when count(*)=1 then (array_agg(id))[1] end into effective_tambon from public.tambons where is_active;
  end if;
  if effective_tambon is null then
    return public.food_flow('tambons',p_user)||jsonb_build_object('ok',false,'error','need_tambon');
  end if;
  select mm.* into m from public.merchants mm join public.profiles owner on owner.id=mm.profile_id
    where mm.id=c.merchant_id and public.shop_open_at(mm.is_open,mm.hours_enabled,mm.opening_hours) and (mm.is_test=coalesce(p.is_test,false) or (mm.is_test and p.llp_tester)) and owner.approved;
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

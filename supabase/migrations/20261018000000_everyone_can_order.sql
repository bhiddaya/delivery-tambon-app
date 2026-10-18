-- ทุกบัญชีที่ล็อกอิน LINE และลงทะเบียนแล้วสั่งอาหารได้ ไม่จำกัดตำบลและไม่จำกัดประเภทบัญชี
-- บัญชีผู้ดูแล (admin/superadmin/merchant/driver) ยังคงสิทธิ์การทำงานตาม role เดิม การเปลี่ยนแปลงนี้ไม่แก้ role

create or replace function public.customer_food_review(p_merchant_id uuid, p_items jsonb, p_point jsonb default null::jsonb, p_note text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare p public.profiles%rowtype; m public.merchants%rowtype; i jsonb; normalized jsonb:='[]'; point jsonb; r jsonb;
begin
  select * into p from public.profiles where id=auth.uid();
  if p.id is null or p.line_user_id is null then return jsonb_build_object('ok',false,'error','line_login_required'); end if;
  if p.suspended_at is not null then return jsonb_build_object('ok',false,'error','account_suspended'); end if;
  if nullif(btrim(p.phone),'') is null or length(btrim(coalesce(p.full_name,'')))<2 then return jsonb_build_object('ok',false,'error','registration_required'); end if;
  select mm.* into m from public.merchants mm join public.profiles owner on owner.id=mm.profile_id
    where mm.id=p_merchant_id and owner.approved and owner.suspended_at is null and (mm.is_test=p.is_test or (mm.is_test and p.llp_tester));
  if not found or not public.shop_open_at(m.is_open,m.hours_enabled,m.opening_hours) then return jsonb_build_object('ok',false,'error','shop_closed'); end if;
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
  -- ตำบลของลูกค้าจำตามร้านที่สั่งล่าสุดเฉพาะบัญชีลูกค้า บัญชีอื่นคงตำบลเดิมไว้
  if p.role='customer' and p.tambon_id is distinct from m.tambon_id then update public.profiles set tambon_id=m.tambon_id where id=p.id; end if;
  insert into public.carts(line_user_id,merchant_id,items,delivery_point,awaiting_location,customer_note)
    values(p.line_user_id,m.id,normalized,point,false,left(p_note,300))
    on conflict(line_user_id) do update set merchant_id=excluded.merchant_id,items=excluded.items,
      delivery_point=coalesce(excluded.delivery_point,carts.delivery_point),awaiting_location=false,
      checkout_quote=null,customer_note=excluded.customer_note,updated_at=now();
  r:=public.food_chat_flow('review',p.line_user_id);
  return r;
end $function$;

create or replace function public.register_line_customer(p_name text, p_phone text, p_tambon_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare u uuid:=auth.uid(); line_id text; p public.profiles%rowtype; phone_no text;
begin
  if u is null then return jsonb_build_object('ok',false,'error','login_required'); end if;
  select raw_app_meta_data->>'line_user_id' into line_id from auth.users where id=u;
  if coalesce(line_id,'') !~ '^U[0-9a-f]{32}$' then return jsonb_build_object('ok',false,'error','line_login_required'); end if;
  if length(btrim(coalesce(p_name,''))) not between 2 and 100 then return jsonb_build_object('ok',false,'error','bad_name'); end if;
  phone_no:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
  if phone_no ~ '^0[0-9]{9}$' then phone_no:='66'||substr(phone_no,2); end if;
  if phone_no !~ '^66[0-9]{9}$' then return jsonb_build_object('ok',false,'error','bad_phone'); end if;
  if not exists(select 1 from public.tambons where id=p_tambon_id and is_active) then return jsonb_build_object('ok',false,'error','area_unavailable'); end if;
  perform pg_advisory_xact_lock(hashtextextended('customer-registration:'||u::text,0));
  select * into p from public.profiles where id=u for update;
  if p.id is not null and p.suspended_at is not null then return jsonb_build_object('ok',false,'error','account_suspended'); end if;
  if p.id is not null and p.line_user_id is not null and p.line_user_id<>line_id then
    return jsonb_build_object('ok',false,'error','identity_mismatch');
  end if;
  if exists(select 1 from public.profiles where line_user_id=line_id and id<>u) then
    return jsonb_build_object('ok',false,'error','identity_in_use');
  end if;
  if p.id is not null then
    -- บัญชีที่มีอยู่แล้ว (เช่น ผู้ดูแล) คง role และตำบลเดิมไว้ อัปเดตเฉพาะชื่อและเบอร์สำหรับติดต่อจัดส่ง
    update public.profiles set full_name=btrim(p_name), phone=phone_no, line_user_id=line_id,
      tambon_id=case when p.role='customer' then p_tambon_id else p.tambon_id end
      where id=u;
    return jsonb_build_object('ok',true,'tambon_id',p_tambon_id);
  end if;
  insert into public.profiles(id,role,full_name,phone,tambon_id,line_user_id)
    values(u,'customer',btrim(p_name),phone_no,p_tambon_id,line_id);
  return jsonb_build_object('ok',true,'tambon_id',p_tambon_id);
end $function$;

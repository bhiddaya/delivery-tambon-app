-- [D33] กู้จากฐานจริง: supabase_migrations.schema_migrations version 20260926052647 (line_food_cart_v1)
-- ข้อความ SQL ด้านล่างตรงกับที่รันบนฐานจริงทุกตัวอักษร (md5 9f119e46d8712cd950f6bd07366c5f6c) — ฐานจริงมีแล้ว ไม่ต้องรันซ้ำ
--
-- ตะกร้าสั่งอาหารผ่าน LINE (1 ตะกร้า/ผู้ใช้ · 1 ร้าน/ตะกร้า)
create table if not exists public.carts (
  line_user_id text primary key,
  merchant_id uuid references public.merchants(id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.carts enable row level security;
revoke all on public.carts from anon, authenticated;
comment on table public.carts is 'ตะกร้าสั่งอาหารของลูกค้า LINE บวรไทย · เข้าถึงผ่าน food_flow() ด้วย service role เท่านั้น';

create or replace function public._cart_json(p_user text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((
    select jsonb_build_object(
      'merchant_id', c.merchant_id, 'shop_name', m.name,
      'items', coalesce(jsonb_agg(jsonb_build_object('id', mi.id, 'name', mi.name, 'price', mi.price, 'qty', (x->>'qty')::int,
                 'line_total', mi.price * (x->>'qty')::int) order by mi.name) filter (where mi.id is not null), '[]'::jsonb),
      'count', coalesce(sum((x->>'qty')::int) filter (where mi.id is not null), 0),
      'total', coalesce(sum(mi.price * (x->>'qty')::int) filter (where mi.id is not null), 0))
    from public.carts c
    left join public.merchants m on m.id = c.merchant_id
    left join lateral jsonb_array_elements(c.items) x on true
    left join public.menu_items mi on mi.id = (x->>'id')::uuid and mi.is_available and not coalesce(mi.is_hidden,false)
    where c.line_user_id = p_user
    group by c.merchant_id, m.name), jsonb_build_object('items','[]'::jsonb,'count',0,'total',0));
$$;

create or replace function public.food_flow(p_action text, p_user text, p_arg text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_item record; v_cart public.carts; v_items jsonb; v_found boolean := false; v_reset boolean := false;
  v_profile uuid; v_order bigint; v_json jsonb; v_shop record;
begin
  if p_user is null or p_user = '' then return jsonb_build_object('ok', false, 'error', 'no_user'); end if;

  if p_action = 'shops' then
    return jsonb_build_object('ok', true, 'shops', coalesce((
      select jsonb_agg(s order by s->>'name') from (
        select jsonb_build_object('id', m.id, 'name', m.name, 'category', m.category,
          'count', count(mi.id), 'photo', max(mi.photo_url)) s
        from public.merchants m
        join public.profiles p on p.id = m.profile_id and p.approved
        join public.menu_items mi on mi.merchant_id = m.id and mi.is_available and not coalesce(mi.is_hidden,false)
        where m.is_open
        group by m.id, m.name, m.category
        limit 10) q), '[]'::jsonb));

  elsif p_action = 'menu' then
    select m.id, m.name, m.category into v_shop from public.merchants m where m.id = p_arg::uuid and m.is_open;
    if not found then return jsonb_build_object('ok', false, 'error', 'shop_closed'); end if;
    return jsonb_build_object('ok', true, 'shop', jsonb_build_object('id', v_shop.id, 'name', v_shop.name, 'category', v_shop.category),
      'items', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'price', price, 'photo', photo_url) order by (photo_url is null), name)
        from (select * from public.menu_items where merchant_id = v_shop.id and is_available and not coalesce(is_hidden,false) order by (photo_url is null), name limit 11) t), '[]'::jsonb),
      'cart', public._cart_json(p_user));

  elsif p_action = 'search' then
    return jsonb_build_object('ok', true, 'term', p_arg, 'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.item_id, 'name', r.item_name, 'price', r.price, 'photo', r.photo_url, 'shop_id', r.merchant_id, 'shop_name', r.merchant_name))
      from (select * from public.search_menu(p_arg, null) limit 10) r), '[]'::jsonb));

  elsif p_action in ('add', 'remove') then
    select mi.id, mi.name, mi.merchant_id into v_item from public.menu_items mi join public.merchants m on m.id = mi.merchant_id
     where mi.id = p_arg::uuid and mi.is_available and not coalesce(mi.is_hidden,false) and m.is_open;
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
     where m.id = (v_json->>'merchant_id')::uuid and m.is_open;
    if not found then return jsonb_build_object('ok', false, 'error', 'shop_closed', 'cart', v_json); end if;
    select id into v_profile from public.profiles where line_user_id = p_user limit 1;
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
end $$;
revoke all on function public.food_flow(text, text, text) from public, anon, authenticated;
revoke all on function public._cart_json(text) from public, anon, authenticated;
grant execute on function public.food_flow(text, text, text) to service_role;
grant execute on function public._cart_json(text) to service_role;

-- 20261002d_food_flow_by_tambon.sql — ระดับ D
--
-- LINE OA สั่งอาหารแยกตามตำบล (อาจารย์ตัดสิน 2 ต.ค. 69: LINE OA เดียว, ทำข้อ 1–2 ก่อน)
--
-- เดิม food_flow แสดงร้านที่เปิดอยู่ "ทุกตำบล" รวมกัน ไม่ดูตำบลของลูกค้าและไม่ดูว่าตำบลเปิดบริการหรือยัง
-- — เมื่อตำบลใหม่ (นวมินทร์, คลองกุ่ม กรุงเทพฯ) มีร้าน ลูกค้าบุ่งไหม (อุบลฯ) จะเห็นและสั่งร้านกรุงเทพฯ ได้
--
-- ใหม่:
--   * ตำบลของลูกค้า = profiles.tambon_id ของ LINE user นี้. ถ้ายังไม่มี และมีตำบลเปิดบริการอยู่ตำบลเดียว
--     ใช้ตำบลนั้นไปก่อนโดยไม่เขียนอะไร (ลูกค้าบุ่งไหมใช้งานเหมือนเดิม)
--   * ร้าน/ค้นหา/เมนู/ใส่ตะกร้า/สั่ง ได้เฉพาะร้านในตำบลของลูกค้า และตำบลนั้นต้องเปิดบริการ (is_active)
--     — บัญชีทดสอบ (is_test) ยกเว้นเงื่อนไขเปิดบริการ เพื่อทดสอบตำบลใหม่ก่อนเปิดได้
--   * ยังไม่รู้ตำบล → ok:false, error:'need_tambon' พร้อมรายชื่อตำบลที่เปิดบริการ (n8n แสดงการ์ดเลือกตำบล)
--   * action ใหม่ 'tambons' = รายชื่อตำบลที่เปิดบริการ; 'set_tambon' (p_arg = slug) = บันทึกตำบลของลูกค้า
--     แล้วคืนรายชื่อร้านของตำบลนั้น. เปลี่ยนตำบลได้เฉพาะบัญชีลูกค้า (ร้าน/ไรเดอร์/แอดมินผูกตำบลเดิม)
--     — ลูกค้าที่ยังไม่มีบัญชี สร้างบัญชีลูกค้า "ลูกค้า LINE" แบบเดียวกับตอน checkout เดิม
--   * ตะกร้าเก่าที่เป็นร้านต่างตำบล: checkout ปฏิเสธ (shop_closed) — ไม่ลบตะกร้าเอง
-- อื่น ๆ เหมือนเดิมทุกอย่าง (ร้านทดสอบเฉพาะบัญชีทดสอบ, ข้อความผลลัพธ์, ตะกร้า, ออเดอร์)
--
-- สิทธิ์: ไม่เปลี่ยน (food_flow เรียกได้เฉพาะ service_role ผ่าน n8n). ต้อง publish workflow สั่งอาหาร
-- (Csc8nDWFBvLegG1d) ที่รู้จัก need_tambon / set_tambon พร้อมกัน
--
-- แผนกู้ (๖.๖): สร้าง food_flow เดิมคืนจาก 20261002_test_data_dispatch.sql (ส่วน food_flow)
-- ไม่แตะข้อมูลเดิม. idempotent: create or replace.

create or replace function public.food_flow(p_action text, p_user text, p_arg text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
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
        where m.is_open and m.is_test = v_is_test and m.tambon_id = v_tambon
        group by m.id, m.name, m.category
        limit 10) q), '[]'::jsonb));

  elsif p_action = 'menu' then
    select m.id, m.name, m.category into v_shop from public.merchants m
     where m.id = p_arg::uuid and m.is_open and m.is_test = v_is_test and m.tambon_id = v_tambon;
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
             where m.is_open and m.is_test = v_is_test and m.tambon_id = v_tambon
               and mi.is_available and not coalesce(mi.is_hidden, false)
               and length(btrim(coalesce(p_arg, ''))) >= 2
               and mi.name ilike '%' || btrim(p_arg) || '%'
             order by mi.price asc, mi.name asc
             limit 10) r), '[]'::jsonb));

  elsif p_action in ('add', 'remove') then
    select mi.id, mi.name, mi.merchant_id into v_item from public.menu_items mi join public.merchants m on m.id = mi.merchant_id
     where mi.id = p_arg::uuid and mi.is_available and not coalesce(mi.is_hidden,false) and m.is_open and m.is_test = v_is_test
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
     where m.id = (v_json->>'merchant_id')::uuid and m.is_open and m.is_test = v_is_test and m.tambon_id = v_tambon;
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

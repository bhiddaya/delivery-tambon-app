-- 20261002_test_data_dispatch.sql
--
-- D28 ขั้น 3 ส่วนฐานข้อมูล (ระดับ D) — นโยบายข้อมูลทดสอบข้อ 3–4 (อนุมัติ 2 ต.ค. 2569, decision 4ed5b27a)
-- ต้องมี 20261001_test_data_flags.sql (คอลัมน์ is_test) ก่อน
--
--   1) find_nearest_driver / find_agri_owner รับ p_is_test (ค่าเริ่มต้น false)
--      ออเดอร์จริงไม่ไปถึงไรเดอร์/เจ้าของรถทดสอบ, ออเดอร์ทดสอบไปเฉพาะบัญชีทดสอบ
--      workflow n8n ปัจจุบันเรียกแบบ 4 พารามิเตอร์ → ได้ค่า false → ใช้ต่อได้ระหว่างรอแก้ workflow
--      ไม่เพิ่มเงื่อนไข approved ใน find_nearest_driver — แยกเป็นงาน D36 (ระดับ E)
--   2) search_menu (เว็บและ LINE) ไม่แสดงร้านทดสอบ
--   3) food_flow: ลูกค้าจริงเห็น/สั่งได้เฉพาะร้านจริง, บัญชีทดสอบเห็น/สั่งได้เฉพาะร้านทดสอบ
--   4) driver_rankings / merchant_rankings ไม่นับบัญชีทดสอบ
--   5) order_events: ปฏิเสธ event สถานะเดียวกันซ้ำในรายการ (transaction) เดียวกัน
--      สาเหตุ #87: trigger บันทึก cancelled แล้วมีการ insert มืออีกแถว (29 ก.ย.) — ให้แก้ note ของแถวเดิมแทน
--      แถวเก่าของ #87 เก็บไว้เป็นประวัติ ไม่ลบ
--
-- ใครกระทบ (กฎ ๔.๑):
--   - n8n LINE OA v2 เรียก find_nearest_driver / find_agri_owner (named args 4 ตัว) และ search_menu
--   - เว็บ src/lib/food-search.ts เรียก search_menu (anon) — ผลเหมือนเดิมเพราะยังไม่มีร้านทดสอบ
--   - n8n สั่งอาหาร Csc8nDWFBvLegG1d เรียก food_flow — ผลเหมือนเดิมสำหรับลูกค้าจริง
--   - ไม่มีโค้ดอื่น insert order_events นอกจาก trigger log_order_status_change (ตรวจ 2 ต.ค.)
--   - ตอนนี้ไม่มีบัญชี/ร้านทดสอบ (is_test) → ผู้ใช้จริงไม่เห็นความเปลี่ยนแปลง
--   - คงตัวกรองคำนำหน้า LINE 'TEST%' / 'U_driver_sim%' สำหรับออเดอร์จริงไว้ก่อน
--     (มีบัญชีจำลอง 2 บัญชีที่ยังไม่ติด is_test — รออาจารย์ตัดสิน)
--
-- แผนกู้ (กฎ ๖.๖): เขียน migration ถัดไปด้วยนิยามเดิม (ประวัติ git / pg_get_functiondef ก่อน apply)
-- ฟังก์ชัน 4 พารามิเตอร์เดิมถูกแทนด้วยตัวใหม่ที่มีพารามิเตอร์เพิ่ม (ต้องเอาตัวเดิมออก ไม่เช่นนั้นการเรียก
-- แบบ named args จะกำกวม) — ถ้าต้องกู้ ให้สร้างตัว 4 พารามิเตอร์กลับและเอาตัวใหม่ออกในไฟล์เดียวกัน
-- trigger กัน event ซ้ำ: ถ้าขวางงานจำเป็น ให้ปิด trigger order_events_no_dup_status ใน migration ถัดไป
--
-- รันซ้ำได้: drop ... if exists ก่อน create, create or replace, drop trigger if exists

-- 1) หาไรเดอร์ / เจ้าของรถเกษตร ------------------------------------------------
drop function if exists public.find_nearest_driver(double precision, double precision, uuid, text);
create or replace function public.find_nearest_driver(
  p_order_lat double precision, p_order_lng double precision, p_tambon_id uuid,
  p_vehicle_type text default null, p_is_test boolean default false)
 returns table(profile_id uuid, line_user_id text, vehicle_type text, distance_km double precision)
 language sql
 stable
as $function$
  select d.profile_id, p.line_user_id, d.vehicle_type::text, public.haversine_km(p_order_lat, p_order_lng, d.lat, d.lng) as distance_km
  from public.drivers d
  join public.profiles p on p.id = d.profile_id
  where d.is_online = true
    and d.lat is not null and d.lng is not null
    and (p_vehicle_type is null or d.vehicle_type::text = p_vehicle_type)
    and (p.tambon_id is null or p_tambon_id is null or p.tambon_id = p_tambon_id)
    -- นโยบาย D28 ข้อ 4: ออเดอร์ทดสอบถึงไรเดอร์ทดสอบเท่านั้น ออเดอร์จริงไม่ถึงไรเดอร์ทดสอบ
    and p.is_test = coalesce(p_is_test, false)
  order by distance_km asc nulls last
  limit 1;
$function$;
-- สิทธิ์เท่าเดิม (PUBLIC) — การจำกัดสิทธิ์ถ้าจำเป็นทำในงานแยก

drop function if exists public.find_agri_owner(double precision, double precision, uuid, text);
create or replace function public.find_agri_owner(
  p_order_lat double precision, p_order_lng double precision, p_tambon_id uuid,
  p_vehicle_type text default null, p_is_test boolean default false)
 returns table(profile_id uuid, line_user_id text, vehicle_type text, distance_km double precision)
 language sql
 stable
 set search_path to 'public'
as $function$
  -- เจ้าของรถเกษตร: ไม่ต้องออนไลน์ แต่ต้องอนุมัติแล้วและผูก LINE · ใกล้แปลงก่อน (ไม่มีพิกัดไว้ท้าย)
  select d.profile_id, p.line_user_id, d.vehicle_type::text,
         case when d.lat is not null and d.lng is not null then public.haversine_km(p_order_lat, p_order_lng, d.lat, d.lng) end as distance_km
  from public.drivers d
  join public.profiles p on p.id = d.profile_id
  where p.line_user_id is not null
    and coalesce(p.approved, false) = true
    and (p_vehicle_type is null or d.vehicle_type::text = p_vehicle_type)
    and (p.tambon_id is null or p_tambon_id is null or p.tambon_id = p_tambon_id)
    -- นโยบาย D28 ข้อ 4 (แทนการดูคำนำหน้า LINE) — ตัวกรองคำนำหน้าเดิมยังใช้กับออเดอร์จริง
    and p.is_test = coalesce(p_is_test, false)
    and (coalesce(p_is_test, false)
         or (p.line_user_id not like 'U_driver_sim%' and p.line_user_id not like 'TEST%'))
  order by distance_km asc nulls last
  limit 1;
$function$;

revoke all on function public.find_agri_owner(double precision, double precision, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.find_agri_owner(double precision, double precision, uuid, text, boolean) to service_role;

-- 2) ค้นสินค้า (เว็บ + LINE) ไม่แสดงร้านทดสอบ -----------------------------------
create or replace function public.search_menu(p_query text, p_tambon uuid default null::uuid)
 returns table(merchant_id uuid, merchant_name text, merchant_category text, item_id uuid, item_name text, price numeric, photo_url text)
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select m.id, m.name, m.category, mi.id, mi.name, mi.price, mi.photo_url
    from public.menu_items mi
    join public.merchants m on m.id = mi.merchant_id
   where m.is_open
     and not m.is_test
     and mi.is_available
     and not mi.is_hidden
     and (p_tambon is null or m.tambon_id = p_tambon)
     and length(btrim(p_query)) >= 2
     and mi.name ilike '%' || btrim(p_query) || '%'
   order by mi.price asc, mi.name asc
   limit 30;
$function$;

-- 3) สั่งอาหารผ่าน LINE ------------------------------------------------------------
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
begin
  if p_user is null or p_user = '' then return jsonb_build_object('ok', false, 'error', 'no_user'); end if;

  -- นโยบาย D28 ข้อ 3–4: บัญชีทดสอบเห็นเฉพาะร้านทดสอบ ลูกค้าจริงเห็นเฉพาะร้านจริง
  v_is_test := coalesce((select p.is_test from public.profiles p where p.line_user_id = p_user limit 1), false);

  if p_action = 'shops' then
    return jsonb_build_object('ok', true, 'shops', coalesce((
      select jsonb_agg(s order by s->>'name') from (
        select jsonb_build_object('id', m.id, 'name', m.name, 'category', m.category,
          'count', count(mi.id), 'photo', max(mi.photo_url)) s
        from public.merchants m
        join public.profiles p on p.id = m.profile_id and p.approved
        join public.menu_items mi on mi.merchant_id = m.id and mi.is_available and not coalesce(mi.is_hidden,false)
        where m.is_open and m.is_test = v_is_test
        group by m.id, m.name, m.category
        limit 10) q), '[]'::jsonb));

  elsif p_action = 'menu' then
    select m.id, m.name, m.category into v_shop from public.merchants m
     where m.id = p_arg::uuid and m.is_open and m.is_test = v_is_test;
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
             where m.is_open and m.is_test = v_is_test
               and mi.is_available and not coalesce(mi.is_hidden, false)
               and length(btrim(coalesce(p_arg, ''))) >= 2
               and mi.name ilike '%' || btrim(p_arg) || '%'
             order by mi.price asc, mi.name asc
             limit 10) r), '[]'::jsonb));

  elsif p_action in ('add', 'remove') then
    select mi.id, mi.name, mi.merchant_id into v_item from public.menu_items mi join public.merchants m on m.id = mi.merchant_id
     where mi.id = p_arg::uuid and mi.is_available and not coalesce(mi.is_hidden,false) and m.is_open and m.is_test = v_is_test;
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
     where m.id = (v_json->>'merchant_id')::uuid and m.is_open and m.is_test = v_is_test;
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
end $function$;

-- 4) อันดับ ไม่นับบัญชีทดสอบ -------------------------------------------------------
create or replace view public.driver_rankings as
 SELECT p.id,
    p.full_name,
    count(r.id) AS rating_count,
    round(avg(r.score), 1) AS avg_score
   FROM (profiles p
     JOIN ratings r ON ((r.to_profile = p.id)))
  WHERE (p.role = 'driver'::user_role) AND (NOT p.is_test)
  GROUP BY p.id, p.full_name
  ORDER BY (round(avg(r.score), 1)) DESC, (count(r.id)) DESC;

create or replace view public.merchant_rankings as
 SELECT m.id AS merchant_id,
    m.name,
    count(r.id) AS rating_count,
    round(avg(r.score), 1) AS avg_score
   FROM ((merchants m
     JOIN profiles p ON ((p.id = m.profile_id)))
     JOIN ratings r ON ((r.to_profile = p.id)))
  WHERE (NOT m.is_test) AND (NOT p.is_test)
  GROUP BY m.id, m.name
  ORDER BY (round(avg(r.score), 1)) DESC, (count(r.id)) DESC;

-- 5) กัน event สถานะซ้ำในรายการเดียวกัน ---------------------------------------------
create or replace function public.order_events_no_dup_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.order_events e
              where e.order_id = new.order_id and e.status = new.status
                and e.created_at = new.created_at) then
    raise exception 'ออเดอร์ #% มี event สถานะ % ในรายการนี้แล้ว (บันทึกอัตโนมัติจากการเปลี่ยนสถานะ) — ให้แก้ note ของแถวเดิมแทนการเพิ่มแถว',
      new.order_id, new.status using errcode = '23505';
  end if;
  return new;
end;
$$;

revoke all on function public.order_events_no_dup_status() from public, anon, authenticated;

drop trigger if exists order_events_no_dup_status on public.order_events;
create trigger order_events_no_dup_status
  before insert on public.order_events
  for each row execute function public.order_events_no_dup_status();

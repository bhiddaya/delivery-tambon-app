-- ระดับ E (ฟังก์ชันสร้างออเดอร์ เรียกได้เฉพาะ service_role): สร้างออเดอร์จากข้อความ "🛒 รายการสั่งซื้อ" ของหน้า LIFF
--
-- เหตุผล: หน้า LIFF (/liff/shop/<id>) ส่งข้อความเข้าแชต LINE รูปแบบ
--   [order:v1 shop=<uuid ร้าน> area=<slug ตำบล> items=<uuid สินค้า>x<จำนวน>,... lat=<ละติจูด> lng=<ลองจิจูด>]
--   พร้อมบรรทัด "จุดส่ง: ..." และ "หมายเหตุ: ..." บอท LINE (n8n) ต้องเปลี่ยนข้อความนี้เป็นออเดอร์จริง
--   ตัวตนของลูกค้ามาจาก LINE (p_user = userId ในเหตุการณ์ที่ LINE ส่งให้บอท) ราคาอ่านจากฐานข้อมูลเสมอ ไม่เชื่อราคาจากข้อความ
--
-- ทำเหมือน food_flow('checkout') เพื่อให้ขั้นต่อไปใช้ระบบเดิมได้ทั้งหมด
--   ออเดอร์ type food สถานะ pending + order_items → ส่งตำแหน่ง/คิดค่าส่ง → QR พร้อมเพย์ → สลิป → ตัวแทนยืนยัน → ไรเดอร์
--   ต่างกันตรงที่ใส่ที่อยู่ (dropoff) และพิกัดจุดส่งมาด้วย ถ้ามีพิกัดจะคิดค่าส่งทันที: delivery_fee_for(ตำบล, ระยะเส้นตรง) = 35 + 10 บาท/กม. ของตำบลคลองกุ่ม
--
-- กฎ (ตามนโยบาย D28 และ food_flow):
--   ร้านต้องเปิดอยู่ ผู้ดูแลร้านอนุมัติแล้ว และเป็นร้านจริง/ร้านทดสอบตรงกับบัญชีลูกค้า
--   ตำบลต้องเปิดบริการ (หรือบัญชีทดสอบ) และไม่ได้หยุดรับออเดอร์
--   ลูกค้า (role customer) ที่อยู่คนละตำบลกับร้านจะถูกย้ายไปตำบลของร้าน (เหมือนกดเลือกตำบลด้วยตัวเอง) บทบาทอื่นเปลี่ยนตำบลเองไม่ได้
--   ไกลจากร้านเกิน 30 กม. ไม่รับ (ตำแหน่งผิดแน่นอน)
--   ส่งซ้ำข้อความเดิมภายใน 10 นาที ไม่สร้างออเดอร์ซ้ำ
--   ไม่สร้างโปรไฟล์หรือเปลี่ยนตำบลจนกว่าข้อมูลทุกอย่างผ่านการตรวจ
--
-- ผลข้างเคียงที่มีอยู่แล้ว: trigger orders_notify_new ส่งแจ้งเตือนออเดอร์ใหม่ (เหมือนออเดอร์ที่สร้างจากตะกร้า)
-- ไม่แก้ฟังก์ชันเดิมใด ๆ (food_flow ไม่ถูกแตะ)
--
-- แผนกู้ (ย้อนกลับ): drop function if exists public.liff_order(text, text);
--   ออเดอร์ที่สร้างไปแล้วยกเลิกได้ตามปกติ (สถานะ cancelled) ไม่มีการลบข้อมูลเดิม
-- IDEMPOTENT: create or replace รันซ้ำได้

create or replace function public.liff_order(p_user text, p_text text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_max_km constant double precision := 30;
  c_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  c_coord constant text := '^-?[0-9]{1,3}(\.[0-9]{1,8})?$';
  v_code text;
  v_kv jsonb := '{}'::jsonb;
  v_pair text;
  v_eq int;
  v_shop_id uuid;
  v_lat double precision;
  v_lng double precision;
  v_has_pin boolean := false;
  v_wanted jsonb := '{}'::jsonb;
  v_item text;
  v_m text[];
  v_id text;
  v_qty int;
  v_profile uuid;
  v_is_test boolean;
  v_role public.user_role;
  v_ptambon uuid;
  v_shop record;
  v_area record;
  v_lines jsonb;
  v_subtotal numeric;
  v_found int;
  v_address text;
  v_note text;
  v_km double precision;
  v_fee numeric := 0;
  v_order bigint;
  v_sig text;
  v_dup record;
  v_duplicate boolean := false;
  v_pay jsonb;
begin
  if coalesce(btrim(p_user), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'no_user');
  end if;
  if p_text is null or char_length(p_text) > 4000 then
    return jsonb_build_object('ok', false, 'error', 'bad_message');
  end if;

  -- 1) อ่านรหัสบรรทัดสุดท้าย [order:v1 ...]
  v_code := (regexp_match(p_text, '\[order:v1\s+([^\]]*)\]'))[1];
  if v_code is null then
    return jsonb_build_object('ok', false, 'error', 'bad_message');
  end if;
  for v_pair in select unnest(regexp_split_to_array(btrim(v_code), '\s+')) loop
    v_eq := position('=' in v_pair);
    if v_eq > 1 then
      v_kv := v_kv || jsonb_build_object(substr(v_pair, 1, v_eq - 1), substr(v_pair, v_eq + 1));
    end if;
  end loop;

  if coalesce(v_kv->>'shop', '') !~* c_uuid then
    return jsonb_build_object('ok', false, 'error', 'bad_message');
  end if;
  v_shop_id := (v_kv->>'shop')::uuid;

  -- รายการ: <uuid>x<จำนวน> คั่นด้วย , (จำนวน 1-99 รวมรายการซ้ำ ไม่เกิน 30 เมนู)
  for v_item in select unnest(string_to_array(coalesce(v_kv->>'items', ''), ',')) loop
    v_m := regexp_match(v_item, '^([0-9a-fA-F-]{36})x([0-9]{1,3})$');
    if v_m is null or lower(v_m[1]) !~ c_uuid then
      return jsonb_build_object('ok', false, 'error', 'bad_message');
    end if;
    v_id := lower(v_m[1]);
    v_qty := coalesce((v_wanted->>v_id)::int, 0) + v_m[2]::int;
    if v_m[2]::int < 1 or v_qty > 99 then
      return jsonb_build_object('ok', false, 'error', 'bad_message');
    end if;
    v_wanted := v_wanted || jsonb_build_object(v_id, v_qty);
  end loop;
  if v_wanted = '{}'::jsonb or (select count(*) from jsonb_object_keys(v_wanted)) > 30 then
    return jsonb_build_object('ok', false, 'error', 'bad_message');
  end if;

  -- ตำแหน่ง (ไม่บังคับ): ต้องถูกรูปแบบและอยู่ในช่วงพิกัดโลก ไม่งั้นถือว่าไม่ได้ปัก
  if coalesce(v_kv->>'lat', '') ~ c_coord and coalesce(v_kv->>'lng', '') ~ c_coord then
    v_lat := (v_kv->>'lat')::double precision;
    v_lng := (v_kv->>'lng')::double precision;
    if v_lat between -90 and 90 and v_lng between -180 and 180 then
      v_has_pin := true;
    end if;
  end if;

  -- ที่อยู่ (บังคับ อย่างน้อย 5 ตัวอักษร) และหมายเหตุ จากบรรทัดที่คนอ่าน
  v_address := btrim(coalesce((regexp_match(p_text, '(?n)^จุดส่ง: (.*)$'))[1], ''), E' \t\r\n');
  v_note := nullif(btrim(coalesce((regexp_match(p_text, '(?n)^หมายเหตุ: (.*)$'))[1], ''), E' \t\r\n'), '');
  if char_length(v_address) < 5 then
    return jsonb_build_object('ok', false, 'error', 'bad_address');
  end if;
  v_address := left(v_address, 500);
  v_note := left(v_note, 300);

  -- 2) บัญชีลูกค้า (ยังไม่สร้างหรือแก้อะไรจนกว่าข้อมูลทุกอย่างผ่าน)
  select p.id, coalesce(p.is_test, false), p.role, p.tambon_id
    into v_profile, v_is_test, v_role, v_ptambon
    from public.profiles p where p.line_user_id = p_user limit 1;
  v_is_test := coalesce(v_is_test, false);

  -- 3) ร้านและตำบล
  select m.id, m.name, m.tambon_id, m.lat, m.lng, pr.line_user_id as line_user_id
    into v_shop
    from public.merchants m
    join public.profiles pr on pr.id = m.profile_id
   where m.id = v_shop_id and m.is_open and m.is_test = v_is_test and pr.approved;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'shop_closed');
  end if;

  select t.id, t.name, t.is_active, coalesce(t.intake_blocked, false) as intake_blocked
    into v_area from public.tambons t where t.id = v_shop.tambon_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'tambon_unavailable');
  end if;
  if not (v_area.is_active or v_is_test) then
    return jsonb_build_object('ok', false, 'error', 'tambon_unavailable');
  end if;
  if v_area.intake_blocked then
    return jsonb_build_object('ok', false, 'error', 'intake_blocked');
  end if;
  if v_profile is not null and v_role is distinct from 'customer' and v_ptambon is distinct from v_shop.tambon_id then
    return jsonb_build_object('ok', false, 'error', 'role_fixed_tambon');
  end if;

  -- 4) รายการสินค้า: ต้องเป็นของร้านนี้ ขายอยู่ และไม่ซ่อน ราคาอ่านจากฐานข้อมูล
  select jsonb_agg(jsonb_build_object('id', mi.id, 'name', mi.name, 'price', mi.price,
                                      'qty', (v_wanted->>(mi.id::text))::int,
                                      'line_total', mi.price * (v_wanted->>(mi.id::text))::int) order by mi.name),
         coalesce(sum(mi.price * (v_wanted->>(mi.id::text))::int), 0),
         count(*)
    into v_lines, v_subtotal, v_found
    from public.menu_items mi
   where mi.merchant_id = v_shop.id
     and mi.is_available and not coalesce(mi.is_hidden, false)
     and jsonb_exists(v_wanted, mi.id::text);
  if v_found <> (select count(*) from jsonb_object_keys(v_wanted)) then
    return jsonb_build_object('ok', false, 'error', 'item_unavailable');
  end if;

  -- 5) ค่าส่งเมื่อมีพิกัด: สูตรของตำบล × ระยะเส้นตรง (ร้านยังไม่ปักหมุด = ค่าส่งเริ่มต้น)
  if v_has_pin then
    if v_shop.lat is not null and v_shop.lng is not null then
      v_km := public.haversine_km(v_shop.lat, v_shop.lng, v_lat, v_lng);
      if v_km > c_max_km then
        return jsonb_build_object('ok', false, 'error', 'too_far', 'distance_km', round(v_km::numeric, 1));
      end if;
      v_km := round(v_km::numeric, 1)::double precision;
    end if;
    v_fee := public.delivery_fee_for(v_shop.tambon_id, v_km);
  end if;

  -- 6) ผ่านการตรวจทั้งหมด: สร้างโปรไฟล์/ย้ายตำบล (ถ้าจำเป็น) แล้วสร้างออเดอร์
  if v_profile is null then
    insert into public.profiles(role, full_name, line_user_id, tambon_id)
    values ('customer', 'ลูกค้า LINE', p_user, v_shop.tambon_id) returning id into v_profile;
  elsif v_role = 'customer' and v_ptambon is distinct from v_shop.tambon_id then
    update public.profiles set tambon_id = v_shop.tambon_id where id = v_profile;
  end if;

  v_sig := (select string_agg(k || 'x' || v, ',' order by k) from jsonb_each_text(v_wanted) as t(k, v));
  select o.id, o.delivery_fee, o.dropoff_lat, o.dropoff_lng
    into v_dup
    from public.orders o
   where o.customer_id = v_profile and o.merchant_id = v_shop.id and o.status = 'pending'
     and o.created_at > now() - interval '10 minutes'
     and (select string_agg(oi.menu_item_id::text || 'x' || oi.qty, ',' order by oi.menu_item_id::text)
            from public.order_items oi where oi.order_id = o.id) = v_sig
   order by o.created_at desc limit 1;

  if found then
    -- ส่งซ้ำ: คืนออเดอร์เดิม ไม่สร้างใหม่
    v_duplicate := true;
    v_order := v_dup.id;
    v_has_pin := v_dup.dropoff_lat is not null;
    v_fee := coalesce(v_dup.delivery_fee, 0);
    v_km := case when v_has_pin and v_shop.lat is not null and v_shop.lng is not null
                 then round(public.haversine_km(v_shop.lat, v_shop.lng, v_dup.dropoff_lat, v_dup.dropoff_lng)::numeric, 1)::double precision
            end;
  else
    insert into public.orders(type, status, tambon_id, customer_id, merchant_id, items_subtotal, note,
                              dropoff, dropoff_lat, dropoff_lng, pickup_lat, pickup_lng, delivery_fee, price)
    values ('food', 'pending', v_shop.tambon_id, v_profile, v_shop.id, v_subtotal,
            'สั่งผ่าน LINE (LIFF)' || coalesce(' · ' || v_note, ''),
            v_address,
            case when v_has_pin then v_lat end, case when v_has_pin then v_lng end,
            case when v_has_pin then v_shop.lat end, case when v_has_pin then v_shop.lng end,
            case when v_has_pin then v_fee else 0 end, case when v_has_pin then v_fee else 0 end)
    returning id into v_order;

    insert into public.order_items(order_id, menu_item_id, name, qty, price)
    select v_order, (l->>'id')::uuid, l->>'name', (l->>'qty')::int, (l->>'price')::numeric
      from jsonb_array_elements(v_lines) l;
  end if;

  -- วิธีชำระเงินของตำบล (ข้อความ + QR พร้อมเพย์ตามยอดรวม) มีเมื่อรู้ค่าส่งแล้วเท่านั้น
  if v_has_pin then
    v_pay := public.line_payment_instructions(v_order);
  end if;

  return jsonb_build_object(
    'ok', true,
    'duplicate', v_duplicate,
    'order_id', v_order,
    'shop_name', v_shop.name,
    'merchant_line_user_id', v_shop.line_user_id,
    'tambon', v_area.name,
    'items', v_lines,
    'items_total', v_subtotal,
    'has_pin', v_has_pin,
    'distance_km', v_km,
    'delivery_fee', case when v_has_pin then v_fee end,
    'grand_total', v_subtotal + case when v_has_pin then v_fee else 0 end,
    'no_merchant_gps', v_has_pin and (v_shop.lat is null or v_shop.lng is null),
    'payment', v_pay
  );
end;
$$;

revoke all on function public.liff_order(text, text) from public, anon, authenticated;
grant execute on function public.liff_order(text, text) to service_role;

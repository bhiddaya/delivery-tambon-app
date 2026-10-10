-- ระดับ E (ฟังก์ชันที่ผู้เยี่ยมชมเรียกได้): ค่าส่งตามสูตรของตำบล + ประมาณค่าส่งให้หน้าสั่งอาหาร
--
-- เหตุผล: หน้า /liff/shop/<id> ต้องบอกค่าส่งและยอดรวมประมาณก่อนสั่ง
--   เจ้าของอนุมัติสูตร 35 + 10 บาท/กม. ของตำบลคลองกุ่ม (11 ต.ค. 2569)
--   พิกัดร้านไม่เปิดให้ anon อ่าน (merchants เปิดให้ anon เฉพาะ category,id,is_open,name,tambon_id)
--   จึงคำนวณฝั่งฐานข้อมูล และคืนเฉพาะระยะ (ปัด 0.1 กม.) กับค่าส่ง ไม่คืนพิกัดร้าน
--
-- สูตร: tambons.delivery_fee_base + delivery_fee_per_km × ระยะเส้นตรง ปัดเป็นบาท
--   ตำบลที่ยังไม่ตั้งค่า (delivery_fee_base เป็น null) ใช้สูตรเดิมของ calc_delivery_fee (10 + 5 บาท/กม. ขั้นต่ำ 15)
-- ข้อจำกัด: ระยะเส้นตรงสั้นกว่าระยะถนนจริง ค่าที่คืนจึงเป็นค่าประมาณ ตัวแทนยืนยันค่าส่งจริงในแชต
-- ความเสี่ยง: ถามซ้ำหลายจุดย้อนหาตำแหน่งร้านได้ละเอียดราว 100 เมตร (ที่อยู่ร้านเปิดเผยต่อลูกค้าอยู่แล้ว)
--
-- แผนกู้ (ย้อนกลับ):
--   drop function if exists public.estimate_delivery_fee(uuid, double precision, double precision);
--   drop function if exists public.delivery_fee_for(uuid, double precision);
-- IDEMPOTENT: create or replace รันซ้ำได้

create or replace function public.delivery_fee_for(p_tambon_id uuid, p_distance_km double precision)
returns numeric
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(
    (select case
              when t.delivery_fee_base is not null
                then round((t.delivery_fee_base + coalesce(t.delivery_fee_per_km, 0) * coalesce(p_distance_km, 0))::numeric, 0)
            end
       from public.tambons t
      where t.id = p_tambon_id),
    public.calc_delivery_fee(p_distance_km)
  );
$$;

revoke all on function public.delivery_fee_for(uuid, double precision) from public, anon, authenticated;
grant execute on function public.delivery_fee_for(uuid, double precision) to service_role;

create or replace function public.estimate_delivery_fee(p_shop_id uuid, p_lat double precision, p_lng double precision)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  m record;
  v_km double precision;
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    return jsonb_build_object('ok', false, 'error', 'bad_point');
  end if;

  -- เฉพาะร้านที่ผู้เยี่ยมชมเห็นได้ (เปิดอยู่และไม่ใช่ร้านทดสอบ) เหมือน policy merchants_select_public_open
  select mm.tambon_id, mm.lat, mm.lng into m
    from public.merchants mm
   where mm.id = p_shop_id and mm.is_open and not mm.is_test;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'shop_unavailable');
  end if;

  if m.lat is null or m.lng is null then
    -- ร้านยังไม่ปักหมุด: คิดค่าส่งเริ่มต้น ไม่มีระยะ
    return jsonb_build_object('ok', true, 'distance_km', null, 'fee', public.delivery_fee_for(m.tambon_id, null), 'basis', 'base_only');
  end if;

  v_km := round(public.haversine_km(m.lat, m.lng, p_lat, p_lng)::numeric, 1)::double precision;
  return jsonb_build_object('ok', true, 'distance_km', v_km, 'fee', public.delivery_fee_for(m.tambon_id, v_km), 'basis', 'straight_line');
end;
$$;

revoke all on function public.estimate_delivery_fee(uuid, double precision, double precision) from public;
grant execute on function public.estimate_delivery_fee(uuid, double precision, double precision) to anon, authenticated, service_role;

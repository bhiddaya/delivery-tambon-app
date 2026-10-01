-- 20261001c_test_orders_no_settlement.sql
--
-- D28 ขั้น 2 (ส่วนระดับ F — เงิน): ออเดอร์ทดสอบไม่สร้างยอดค้างจ่าย (settlements)
-- นโยบายข้อ 4 และ 8 (อนุมัติ 1 ต.ค. 2569; อาจารย์อนุมัติระดับ F ในบทสนทนาเดียวกัน)
-- ต้องมี 20261001_test_data_flags.sql (orders.is_test) ก่อน
--
-- เปลี่ยนเพียงจุดเดียว: ห่อการ insert settlements ด้วย `if not o.is_test`
-- ทุกอย่างอื่นคงเดิม: การตรวจผู้ยืนยัน, การบันทึก customer_paid_at, refresh_intake_block
-- กฎ ๘.๘ (ledger เพิ่มได้อย่างเดียว) ไม่กระทบ — ไม่มีการอ่าน-คำนวณ-เขียนยอด
--
-- ใครกระทบ: confirm_customer_payment เป็นที่เดียวที่สร้าง settlements (ตรวจ 1 ต.ค.);
-- settlements ปัจจุบัน 0 แถว; ออเดอร์จริงทำงานเหมือนเดิมทุกประการ
--
-- แผนกู้ (กฎ ๖.๖): เขียน migration ถัดไปด้วยนิยามเดิม (ไม่มีเงื่อนไข is_test)
-- ไม่มีข้อมูลเสียหาย — ถ้าเคยข้ามออเดอร์ทดสอบไปแล้ว ก็คือไม่มีหนี้ทดสอบ ซึ่งตรงกับนโยบาย
--
-- รันซ้ำได้: create or replace (คงสิทธิ์เดิม)

create or replace function public.confirm_customer_payment(p_order_id bigint, p_slip_url text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  o public.orders%rowtype;
  v_due timestamptz;
  v_driver_amount numeric;
  v_merchant_profile uuid;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'ไม่พบออเดอร์'; end if;
  if o.customer_id <> auth.uid() then raise exception 'ยืนยันได้เฉพาะเจ้าของออเดอร์'; end if;
  if o.customer_paid_at is not null then raise exception 'ออเดอร์นี้ยืนยันการจ่ายไปแล้ว'; end if;
  if o.status <> 'delivered' then raise exception 'ยืนยันการจ่ายได้หลังได้รับของแล้วเท่านั้น'; end if;

  update public.orders
    set customer_paid_at = now(), customer_slip_url = p_slip_url
    where id = p_order_id;

  -- นโยบาย D28 ข้อ 4/8: ออเดอร์ทดสอบไม่สร้างยอดค้างจ่ายให้ร้านหรือไรเดอร์
  if not o.is_test then
    select public.next_payout_due(o.tambon_id) into v_due;

    -- ส่วนของร้าน = ค่าสินค้า
    if o.merchant_id is not null and coalesce(o.items_subtotal, 0) > 0 then
      select m.profile_id into v_merchant_profile from public.merchants m where m.id = o.merchant_id;
      if v_merchant_profile is not null then
        insert into public.settlements (order_id, tambon_id, payee_profile_id, payee_role, amount, due_at)
        values (o.id, o.tambon_id, v_merchant_profile, 'merchant', o.items_subtotal, v_due)
        on conflict (order_id, payee_profile_id) do nothing;
      end if;
    end if;

    -- ส่วนของไรเดอร์ = ค่าส่ง ยกเว้นงานเรียกรถที่ค่าโดยสารอยู่ในช่อง price
    v_driver_amount := case when o.type = 'ride' then coalesce(o.price, 0) else coalesce(o.delivery_fee, 0) end;
    if o.driver_id is not null and v_driver_amount > 0 then
      insert into public.settlements (order_id, tambon_id, payee_profile_id, payee_role, amount, due_at)
      values (o.id, o.tambon_id, o.driver_id, 'driver', v_driver_amount, v_due)
      on conflict (order_id, payee_profile_id) do nothing;
    end if;
  end if;

  perform public.refresh_intake_block(o.tambon_id);
end;
$function$;

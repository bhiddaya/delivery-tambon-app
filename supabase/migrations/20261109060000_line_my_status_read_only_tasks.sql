-- งานค้างตามบทบาท ใน LINE แบบอ่านอย่างเดียว (ไม่มีปุ่มและไม่เขียนข้อมูล)
-- เพิ่มส่วนต่อท้ายของ line_my_status (ไม่แก้ผลเดิมของลูกค้า และคงคีย์ผลลัพธ์เดิมทั้งหมด):
--   * ร้าน: จำนวนงานค้างของร้าน (pending / accepted / in_progress)
--   * ไรเดอร์ที่ออนไลน์: จำนวนงานที่รับได้ตอนนี้ในตำบล (กติกาเดียวกับ งานไรเดอร์)
--   * ตัวแทน/ผู้ดูแลที่มีสิทธิ์: สลิปรอตรวจ และยอดค้างโอนผู้รับ แยกทีละตำบล ไม่รวมยอดข้ามตำบล
-- ใช้ patch บนนิยามปัจจุบัน แล้ว execute ทับ (ยังคงสิทธิ์ service_role เดิม)
-- ย้อนกลับ: นำนิยาม line_my_status จาก supabase/snapshots/live-schema-2026-11-08.sql มาสร้างทับอีกครั้ง

do $$
declare d text;
begin
  d := pg_get_functiondef('public.line_my_status(text)'::regprocedure);

  d := replace(d, $r$  lines text[] := '{}';$r$, $r$  lines text[] := '{}';
  n int; rs record; sl_n int; sl_total numeric; py_n int; py_total numeric; ptb uuid; ptest boolean;$r$);

  d := replace(d, $r$  return jsonb_build_object('linked', true, 'role', p.role, 'approved', p.approved,$r$, $r$  -- อ่านอย่างเดียว: งานค้างตามบทบาท
  if p.approved and p.suspended_at is null then
    select pr.tambon_id, pr.is_test into ptb, ptest from public.profiles pr where pr.id = p.id;
    if p.role = 'merchant' then
      select count(*) into n from public.orders ord
       where ord.merchant_id in (select mer.id from public.merchants mer where mer.profile_id = p.id)
         and ord.status in ('pending', 'accepted', 'in_progress');
      lines := lines || format('งานค้างของร้านตอนนี้ %s รายการ', n);
    elsif p.role = 'driver' and coalesce((select dr.is_online from public.drivers dr where dr.profile_id = p.id), false) then
      select count(*) into n from public.orders ord
       where ord.tambon_id = ptb and ord.is_test = ptest and ord.status = 'pending' and ord.driver_id is null
         and (ord.type <> 'food' or ord.customer_paid_at is not null)
         and (ord.required_vehicle_type is null or ord.required_vehicle_type = (select dr.vehicle_type from public.drivers dr where dr.profile_id = p.id));
      lines := lines || format('งานที่รับได้ตอนนี้ในตำบล %s รายการ', n);
    end if;

    for rs in
      select tbn.id, tbn.name from public.tambons tbn
       where tbn.id = any (public.line_finance_tambons(p_line_user_id))
       order by tbn.name
    loop
      select count(*), coalesce(sum(public.order_customer_total(ord)), 0) into sl_n, sl_total
        from public.orders ord
       where ord.tambon_id = rs.id and not ord.is_test and ord.status <> 'cancelled'
         and ord.slip_submitted_at is not null and ord.customer_paid_at is null and ord.payment_rejected_at is null;
      select count(distinct st.payee_profile_id), coalesce(sum(st.amount), 0) into py_n, py_total
        from public.settlements st
       where st.tambon_id = rs.id and st.paid_out_at is null;
      lines := lines || format('ตำบล%s: สลิปรอตรวจ %s รายการ (%s บาท) · ค้างโอนผู้รับ %s ราย (%s บาท)',
        regexp_replace(rs.name, '^ตำบล', ''), sl_n, sl_total::numeric(12,0), py_n, py_total::numeric(12,0));
    end loop;
  end if;

  return jsonb_build_object('linked', true, 'role', p.role, 'approved', p.approved,$r$);

  if position('งานค้างของร้านตอนนี้' in d) = 0 or position('sl_total numeric;' in d) = 0 then
    raise exception 'line_my_status patch not applied';
  end if;
  execute d;
end $$;

-- ส่วนที่ 2: แสดงเฉพาะตำบลที่มีสลิปรอตรวจหรือยอดค้างโอน (ไม่แสดงตำบลที่เป็นศูนย์)
do $$
declare d text;
begin
  d := pg_get_functiondef('public.line_my_status(text)'::regprocedure);
  d := replace(d, $r$lines := lines || format('ตำบล%s:$r$, $r$if sl_n > 0 or py_n > 0 then lines := lines || format('ตำบล%s:$r$);
  d := replace(d, $r$py_total::numeric(12,0));$r$, $r$py_total::numeric(12,0)); end if;$r$);
  if position('if sl_n > 0 or py_n > 0 then' in d) = 0 or position('py_total::numeric(12,0)); end if;' in d) = 0 then
    raise exception 'nonzero patch not applied';
  end if;
  execute d;
end $$;

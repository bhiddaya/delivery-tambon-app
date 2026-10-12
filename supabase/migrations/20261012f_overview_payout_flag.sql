-- ระดับ E (ข้อมูลที่ส่งไป Dashboard): บอกว่าร้านค้า/ไรเดอร์แต่ละคนใส่ช่องรับเงินแล้วหรือยัง
--
-- อาจารย์แจ้ง 12 ต.ค. 2569: "ร้านค้าอ้อยผักปั่น ไม่ได้ลงบันทึก promptpay แต่ไม่มีรายงาน ต่อไปรายงานด้วย ตัวแทนตำบลจะได้ติดตาม"
-- เพิ่มใน delivery_overview_core(): merchants/drivers.list[].has_payout และ merchants/drivers.with_payout
--   has_payout = มีพร้อมเพย์ (profiles.promptpay_id) หรือ QR รับเงินจากธนาคาร (profiles.payment_qr_path)
--   ส่งแค่ true/false ไม่ส่งเลขพร้อมเพย์หรือรูป QR
-- แก้ด้วยการแทนที่ข้อความในนิยามฟังก์ชันปัจจุบัน ถ้าไม่เจอข้อความเดิมจะหยุด
--
-- แผนกู้ (ย้อนกลับ): รัน DO block เดียวกันโดยสลับคู่ข้อความ (Dashboard รองรับกรณีไม่มีฟิลด์)
-- IDEMPOTENT: รันซ้ำได้ (ถ้าแก้แล้วจะข้าม)

do $migration$
declare
  v_def text := pg_get_functiondef('public.delivery_overview_core()'::regprocedure);
  v_pay constant text := $p$(nullif(btrim(coalesce(p.promptpay_id, '')), '') is not null or p.payment_qr_path is not null) as has_payout$p$;
  v_pairs text[][] := array[
    array['select m.*, p.line_user_id is not null as has_line,',
          'select m.*, p.line_user_id is not null as has_line, ' || v_pay || ','],
    array['coalesce(d.is_online, false) as is_online, d.vehicle_type',
          'coalesce(d.is_online, false) as is_online, d.vehicle_type, ' || v_pay],
    array['''with_menu'', count(*) filter (where menu_count > 0),',
          '''with_menu'', count(*) filter (where menu_count > 0), ''with_payout'', count(*) filter (where has_payout),'],
    array['''menu_count'', menu_count)',
          '''menu_count'', menu_count, ''has_payout'', has_payout)'],
    array['''online'', count(*) filter (where is_online),',
          '''online'', count(*) filter (where is_online), ''with_payout'', count(*) filter (where has_payout),'],
    array['''is_online'', is_online, ''vehicle_type'', vehicle_type)',
          '''is_online'', is_online, ''vehicle_type'', vehicle_type, ''has_payout'', has_payout)']
  ];
  i int;
begin
  if position('as has_payout' in v_def) > 0 then
    raise notice 'already applied';
    return;
  end if;
  for i in 1 .. array_length(v_pairs, 1) loop
    if position(v_pairs[i][1] in v_def) = 0 then
      raise exception 'delivery_overview_core: text % not found — function changed, edit by hand', i;
    end if;
    v_def := replace(v_def, v_pairs[i][1], v_pairs[i][2]);
  end loop;
  execute v_def;
end
$migration$;

-- อาจารย์สั่ง 13 ต.ค. 2569: ให้เวลาผ่อนผันโอนออกไม่เกิน 3 วัน ก่อนพักรับออเดอร์ทั้งตำบล
-- (เดิมพักทันทีที่เลยกำหนด เช่นยอด 40 บาทสร้าง 20:54 กำหนด 21:00 → คลองกุ่มถูกพักทั้งตำบล)
-- ระหว่างผ่อนผัน สรุปยอดโอน 20:30 ใน LINE ยังเตือนตัวแทนทุกวันเหมือนเดิม · เงื่อนไขเงินค้ำประกันไม่เปลี่ยน
create or replace function public.refresh_intake_block(p_tambon uuid)
 returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  v_float numeric;
  v_deposit numeric;
  v_overdue int;
begin
  select public.tambon_float(p_tambon) into v_float;
  select deposit_amount into v_deposit from public.tambons where id = p_tambon;

  select count(*) into v_overdue
  from public.settlements
  where tambon_id = p_tambon and paid_out_at is null and due_at < now() - interval '3 days';

  if v_overdue > 0 then
    update public.tambons
      set intake_blocked = true,
          intake_blocked_reason = 'มีรายการค้างโอนออกเกิน 3 วัน ' || v_overdue || ' รายการ'
      where id = p_tambon;
  elsif coalesce(v_deposit, 0) > 0 and v_float > v_deposit then
    update public.tambons
      set intake_blocked = true,
          intake_blocked_reason = 'ยอดค้างจ่าย ' || round(v_float) || ' บาท เกินเงินค้ำประกัน ' || round(v_deposit) || ' บาท'
      where id = p_tambon;
  else
    update public.tambons
      set intake_blocked = false, intake_blocked_reason = null
      where id = p_tambon;
  end if;
end;
$function$;

-- เดิมคำนวณใหม่เฉพาะตอนมีการยืนยันเงิน/บันทึกโอน → ครบ 3 วันแล้วอาจยังไม่พัก จึงตรวจทุกชั่วโมงด้วย
select cron.schedule('refresh-intake-block-hourly', '5 * * * *',
  $$select public.refresh_intake_block(id) from public.tambons where is_active$$);

-- คำนวณใหม่ทันทีทุกตำบล
select public.refresh_intake_block(id) from public.tambons;

-- ย้อนกลับ: เปลี่ยน due_at < now() - interval '3 days' กลับเป็น due_at < now() และ select cron.unschedule('refresh-intake-block-hourly');

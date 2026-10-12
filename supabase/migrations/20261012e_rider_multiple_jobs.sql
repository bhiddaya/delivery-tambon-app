-- ระดับ E (กติกาการรับงานไรเดอร์): ไรเดอร์ 1 คนถืองานพร้อมกันได้หลายงาน (หลายร้าน) สูงสุด 3 งาน
--
-- อาจารย์สั่ง 12 ต.ค. 2569: "ไรเดอร์ 1 คน ส่งสินค้าหลายร้านได้ ไม่ต้องทำตะกร้าหลายร้าน ให้จ่ายตามตะกร้าจริงแต่ละร้าน"
--   ลูกค้ายังสั่งและจ่ายแยกร้านละออเดอร์ (ค่าส่งของแต่ละออเดอร์เหมือนเดิม) — เปลี่ยนเฉพาะกติกาการกดรับงาน
-- เดิม partner_order_action_core('accept_driver') ปฏิเสธ (error active_job) ถ้าไรเดอร์มีงาน accepted/in_progress อยู่ 1 งาน
--   การจ่ายงานอัตโนมัติหลังจ่ายเงิน (dispatch_paid_order) ไม่ได้จำกัดอยู่แล้ว
-- ใหม่: ปฏิเสธเมื่อมีงานค้างครบ 3 งาน (error code เดิม active_job บอท/เว็บแสดงข้อความเดิม)
-- แก้ด้วยการแทนที่บรรทัดเดียวในนิยามฟังก์ชันปัจจุบัน ถ้าไม่เจอบรรทัดเดิม (ฟังก์ชันถูกแก้ไปแล้ว) จะหยุดด้วย error ไม่แก้มั่ว
--
-- แผนกู้ (ย้อนกลับ): รัน DO block เดียวกันโดยสลับ v_old กับ v_new
-- IDEMPOTENT: รันซ้ำได้ (ถ้าแก้แล้วจะข้าม)

do $migration$
declare
  v_def text := pg_get_functiondef('public.partner_order_action_core'::regproc);
  v_old text := $o$if exists(select 1 from public.orders where driver_id=p.id and status in ('accepted','in_progress')) then return jsonb_build_object('ok',false,'error','active_job'); end if;$o$;
  v_new text := $n$if (select count(*) from public.orders where driver_id=p.id and status in ('accepted','in_progress')) >= 3 then return jsonb_build_object('ok',false,'error','active_job'); end if; -- ไรเดอร์ถือได้สูงสุด 3 งานพร้อมกัน (12 ต.ค. 2569)$n$;
begin
  if position(v_new in v_def) > 0 then
    raise notice 'already applied';
  elsif position(v_old in v_def) = 0 then
    raise exception 'partner_order_action_core: active_job line not found — function changed, edit by hand';
  else
    execute replace(v_def, v_old, v_new);
  end if;
end
$migration$;

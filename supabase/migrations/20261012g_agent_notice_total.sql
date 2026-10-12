-- ระดับ C (ข้อความแจ้งเตือน LINE): ข้อความ "ออเดอร์ใหม่" ถึงตัวแทนตำบลบอกค่าส่งและยอดรวมที่ลูกค้าต้องโอน
--
-- อาจารย์แจ้ง 12 ต.ค. 2569 (ออเดอร์ #164): ข้อความใน LINE OA บอก "รวมค่าสินค้า 130 บาท" แต่ลูกค้าโอนจริง 170 บาท (รวมค่าส่ง 40)
--   ตัวแทนต้องเทียบยอดกับสลิป จึงต้องเห็นยอดที่ลูกค้าโอน
-- เพิ่มบรรทัด "ค่าส่ง X บาท · รวมที่ลูกค้าโอน Y บาท" (order_customer_total) ใน agent_text ของ line_new_order_notice()
--   เฉพาะเมื่อมีค่าส่งแล้ว · ข้อความถึงร้าน (merchant_text) คงเดิม (ร้านได้เฉพาะค่าสินค้า)
-- แก้ด้วยการแทนที่ข้อความในนิยามฟังก์ชันปัจจุบัน ถ้าไม่เจอจะหยุด
-- IDEMPOTENT: รันซ้ำได้ (ถ้าแก้แล้วจะข้าม)

do $migration$
declare
  v_def text := pg_get_functiondef('public.line_new_order_notice'::regproc);
  v_old constant text := $o$|| case when o.type = 'food' then 'สถานะ: รอตรวจสลิปและยืนยันเงินก่อนจัดไรเดอร์'$o$;
  v_new constant text := $n$|| case when coalesce(o.delivery_fee, 0) > 0 then 'ค่าส่ง ' || to_char(o.delivery_fee, 'FM999,999,990.##') || ' บาท · รวมที่ลูกค้าโอน ' || to_char(public.order_customer_total(o), 'FM999,999,990.##') || ' บาท' || chr(10) else '' end
        || case when o.type = 'food' then 'สถานะ: รอตรวจสลิปและยืนยันเงินก่อนจัดไรเดอร์'$n$;
begin
  if position('รวมที่ลูกค้าโอน' in v_def) > 0 then raise notice 'already applied'; return; end if;
  if position(v_old in v_def) = 0 then raise exception 'line_new_order_notice: text not found — edit by hand'; end if;
  execute replace(v_def, v_old, v_new);
end
$migration$;

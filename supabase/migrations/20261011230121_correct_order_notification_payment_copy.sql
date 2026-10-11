-- Correct the notice text only; preserve recipients, grants and dispatch behavior.
do $migration$
declare
  old_definition text;
  new_definition text;
begin
  old_definition := pg_get_functiondef('public.line_new_order_notice(bigint)'::regprocedure);
  if position('เตรียมสินค้าได้เลยครับ ระบบจะเรียกไรเดอร์เมื่อลูกค้าส่งตำแหน่งจัดส่ง' in old_definition) = 0
     or position('สถานะ: รอไรเดอร์/รอลูกค้าส่งตำแหน่ง' in old_definition) = 0 then
    raise exception 'Order notice changed; review current definition before applying this copy fix';
  end if;
  new_definition := replace(old_definition,
    'เตรียมสินค้าได้เลยครับ ระบบจะเรียกไรเดอร์เมื่อลูกค้าส่งตำแหน่งจัดส่ง',
    $merchant$' || case when o.type = 'food' then 'ได้รับออเดอร์แล้วครับ รอตัวแทนยืนยันเงินก่อนเตรียมอาหาร ระบบจะแจ้งเมื่อยืนยันแล้ว' else 'ได้รับออเดอร์แล้วครับ ตรวจสอบรายละเอียดและสถานะที่หน้าออเดอร์' end || E'$merchant$);
  new_definition := replace(new_definition,
    'สถานะ: รอไรเดอร์/รอลูกค้าส่งตำแหน่ง',
    $agent$' || case when o.type = 'food' then 'สถานะ: รอตรวจสลิปและยืนยันเงินก่อนจัดไรเดอร์' else 'สถานะ: ตรวจสอบรายละเอียดและการจัดไรเดอร์ที่หน้าออเดอร์' end || E'$agent$);
  execute new_definition;
end
$migration$;

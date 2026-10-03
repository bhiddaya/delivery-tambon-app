-- [D33] กู้จากฐานจริง: supabase_migrations.schema_migrations version 20260916005206 (intake_block_only_when_deposit_set)
-- ข้อความ SQL ด้านล่างตรงกับที่รันบนฐานจริงทุกตัวอักษร (md5 7f5af2db01b0a2f56e0591f63f2da79d) — ฐานจริงมีแล้ว ไม่ต้องรันซ้ำ
--
-- แก้ให้เพดาน float มีผลเฉพาะเมื่อตั้งเงินค้ำประกันไว้แล้ว
-- ค่าเริ่มต้นของ deposit_amount คือ 0 ซึ่งหมายถึง "ยังไม่ได้ตั้งค่า" ไม่ใช่ "ค้ำไว้ศูนย์บาท"
-- ถ้าไม่แยกสองอย่างนี้ ตำบลจะถูกระงับทันทีที่มีออเดอร์แรกที่ลูกค้าจ่าย
create or replace function public.refresh_intake_block(p_tambon uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_float numeric;
  v_deposit numeric;
  v_overdue int;
begin
  select public.tambon_float(p_tambon) into v_float;
  select deposit_amount into v_deposit from public.tambons where id = p_tambon;

  select count(*) into v_overdue
  from public.settlements
  where tambon_id = p_tambon and paid_out_at is null and due_at < now();

  if v_overdue > 0 then
    update public.tambons
      set intake_blocked = true,
          intake_blocked_reason = 'มีรายการค้างจ่ายเลยกำหนดโอนออก ' || v_overdue || ' รายการ'
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
$$;

-- ปิดช่องโหว่: order_events เป็นตารางเดียวในสคีมาที่ RLS ปิดอยู่
--
-- anon key ไม่ใช่ความลับ — มันถูกส่งไปกับหน้าเว็บทุกครั้ง ใครเปิด DevTools ก็เห็น
-- ตารางที่ RLS ปิด จึงเท่ากับเปิดให้คนนอกอ่าน/แก้/ลบได้ทุกแถว

alter table public.order_events enable row level security;

-- อ่านได้เท่าที่เห็นออร์เดอร์แม่ได้ — ล้อกับ order_items_select_relevant ที่มีอยู่แล้ว
create policy "order_events_select_relevant"
on public.order_events
for select
to authenticated
using (
  exists (
    select 1 from public.orders o
    where o.id = order_events.order_id
      and (
        o.customer_id = auth.uid()
        or o.driver_id = auth.uid()
        or is_admin()
        or exists (
          select 1 from public.merchants m
          where m.id = o.merchant_id
            and m.profile_id = auth.uid()
        )
      )
  )
);

-- ตั้งใจไม่มี policy สำหรับ INSERT/UPDATE/DELETE
-- ไทม์ไลน์เป็นข้อมูลที่ระบบเขียนเท่านั้น ผู้ใช้ไม่ควรปลอมแปลงได้

comment on table public.order_events is
  'Status timeline for an order. Readable by anyone who can see the parent order; writes are service-role/trigger only by design (no INSERT/UPDATE/DELETE policy).';

-- ------------------------------------------------------------------
-- สำคัญ: trigger บน orders เขียนตารางนี้แทนผู้ใช้
--
-- trg_log_order_status_change ยิงทุกครั้งที่สร้างออร์เดอร์หรือเปลี่ยนสถานะ
-- ฟังก์ชันเดิมเป็น SECURITY INVOKER คือรันด้วยสิทธิ์ผู้ใช้ที่เรียก
-- พอเปิด RLS โดยไม่มี INSERT policy การสร้างออร์เดอร์จะพังทั้งหมด
--
-- ให้รันด้วยสิทธิ์เจ้าของแทน และตรึง search_path
-- (SECURITY DEFINER ที่ search_path เปลี่ยนได้ เปิดช่องให้ยิงฟังก์ชันปลอมมาแทน)
-- ------------------------------------------------------------------

create or replace function public.log_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if (tg_op = 'INSERT') or (old.status is distinct from new.status) then
    insert into public.order_events(order_id, status, note)
    values (new.id, new.status, case when tg_op = 'INSERT' then 'order created' else null end);
  end if;
  return new;
end;
$function$;

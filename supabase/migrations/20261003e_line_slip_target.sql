-- 20261003e_line_slip_target.sql
--
-- D41 ขั้น 2 (ส่วน LINE): ลูกค้าส่งรูปสลิปในแชต LINE → n8n ต้องรู้ว่าเป็นสลิปของออเดอร์ไหน
-- คืนออเดอร์ล่าสุดของผู้ใช้ LINE นั้นที่ส่งถึงแล้ว ยังไม่ได้รับการยืนยันรับเงิน
-- และอยู่ในตำบลที่ตั้งพร้อมเพย์รับเงินแล้ว (ถ้าไม่มี order_id เป็น null แต่ยังคืน profile_role)
--
-- security definer เพราะอ่านข้ามผู้ใช้ด้วย line_user_id · ให้ service_role (n8n) เท่านั้น
-- รูปแบบเดียวกับ 20260905_notification_helpers.sql
-- แผนกู้: drop function (ไม่มีข้อมูลเปลี่ยน)
-- รันซ้ำได้

create or replace function public.line_slip_target(p_line_user_id text)
returns table (
  profile_role text,
  order_id bigint,
  tambon_id uuid,
  tambon_slug text,
  total numeric,
  slip_state text
)
language sql stable security definer set search_path = public, pg_temp
as $$
  with p as (
    select id, role::text as role from public.profiles
     where line_user_id = p_line_user_id
     limit 1
  )
  select p.role,
         o.id,
         o.tambon_id,
         t.slug,
         o.total,
         case when o.id is null then null
              when o.payment_rejected_at is not null then 'rejected'
              when o.slip_submitted_at is not null then 'submitted'
              else 'none' end
  from p
  left join lateral (
    select o2.id, o2.tambon_id, o2.payment_rejected_at, o2.slip_submitted_at,
           public.order_customer_total(o2) as total
      from public.orders o2
      join public.tambons t2 on t2.id = o2.tambon_id and t2.settlement_promptpay_id is not null
     where o2.customer_id = p.id
       and o2.status = 'delivered'
       and o2.customer_paid_at is null
       and (o2.payment_method = 'พร้อมเพย์' or o2.slip_submitted_at is not null)
     order by o2.delivered_at desc nulls last, o2.id desc
     limit 1
  ) o on true
  left join public.tambons t on t.id = o.tambon_id;
$$;

revoke all on function public.line_slip_target(text) from public, anon, authenticated;
grant execute on function public.line_slip_target(text) to service_role;
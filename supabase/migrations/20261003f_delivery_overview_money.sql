-- 20261003f_delivery_overview_money.sql — ระดับ E (ฟังก์ชัน security definer อ่านข้ามสิทธิ์ RLS)
--
-- รายงานเงินใน BAVORN AI Dashboard (อาจารย์อนุมัติ "อนุมัติรายงานเงินใน Dashboard" 3 ต.ค. 2569)
-- ต่อจาก D41 ขั้น 2 (20261003d): เพิ่ม tambons[].money ให้ delivery_overview — ส่วนอื่นเหมือน 20261002c ทุกบรรทัด
--
--   money.has_promptpay, money.intake_blocked
--   money.slips   {pending, pending_over_12h, rejected_waiting, awaiting_slip,
--                  verified_today, verified_today_amount, verified_7d, verified_7d_amount}
--   money.payouts {owed, owed_amount, overdue, overdue_amount,
--                  awaiting_confirm, awaiting_confirm_amount, confirmed_7d_amount}
--
-- เป็นยอดรวมรายตำบลเท่านั้น: ไม่ส่งเลขพร้อมเพย์ ชื่อบัญชี ชื่อลูกค้า หรือรูปสลิป
-- ไม่นับออเดอร์ทดสอบ (is_test) · ออเดอร์ทดสอบไม่สร้าง settlements อยู่แล้ว (20261001c)
-- สิทธิ์เดิม: service_role เท่านั้น
--
-- แผนกู้: รัน 20261002c_delivery_overview.sql อีกครั้ง (create or replace นิยามเดิม)
-- idempotent: create or replace

create or replace function public.delivery_overview()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with real_profiles as (
    select * from public.profiles where not coalesce(is_test, false)
  ),
  real_merchants as (
    select m.*, p.line_user_id is not null as has_line,
           (select count(*) from public.menu_items mi
             where mi.merchant_id = m.id and not coalesce(mi.is_hidden, false)) as menu_count
      from public.merchants m
      left join public.profiles p on p.id = m.profile_id
     where not coalesce(m.is_test, false)
  ),
  real_drivers as (
    select p.id, p.tambon_id, p.full_name, coalesce(p.approved, false) as approved,
           p.line_user_id is not null as has_line,
           coalesce(d.is_online, false) as is_online, d.vehicle_type
      from real_profiles p
      left join public.drivers d on d.profile_id = p.id
     where p.role = 'driver'
  ),
  -- "วันนี้" ตามเวลาไทย เหมือน tambon_daily_stats
  bkk_day as (
    select (date_trunc('day', (now() at time zone 'Asia/Bangkok')) at time zone 'Asia/Bangkok') as ts
  ),
  tambon_admins as (
    select p.tambon_id, p.id, p.full_name from real_profiles p
     where p.role = 'admin' and coalesce(p.approved, false) and p.tambon_id is not null
    union
    select s.tambon_id, p.id, p.full_name from public.admin_scopes s
      join real_profiles p on p.id = s.profile_id
  )
  select jsonb_build_object(
    'generated_at', now(),
    'db_size_bytes', pg_catalog.pg_database_size(pg_catalog.current_database()),
    'superadmins', (select count(*) from real_profiles where role = 'superadmin'),
    'tambons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'district', t.district, 'province', t.province,
        'slug', t.slug, 'is_active', t.is_active,
        'customers', (select jsonb_build_object(
            'total', count(*), 'with_line', count(*) filter (where line_user_id is not null))
          from real_profiles where role = 'customer' and tambon_id = t.id),
        'merchants', (select jsonb_build_object(
            'total', count(*),
            'open', count(*) filter (where is_open),
            'with_line', count(*) filter (where has_line),
            'with_gps', count(*) filter (where lat is not null and lng is not null),
            'with_menu', count(*) filter (where menu_count > 0),
            'list', coalesce(jsonb_agg(jsonb_build_object(
                'name', name, 'is_open', is_open, 'has_line', has_line,
                'has_gps', lat is not null and lng is not null, 'menu_count', menu_count)
              order by name), '[]'::jsonb))
          from real_merchants where tambon_id = t.id),
        'drivers', (select jsonb_build_object(
            'total', count(*),
            'approved', count(*) filter (where approved),
            'with_line', count(*) filter (where has_line),
            'online', count(*) filter (where is_online),
            'list', coalesce(jsonb_agg(jsonb_build_object(
                'name', full_name, 'approved', approved, 'has_line', has_line,
                'is_online', is_online, 'vehicle_type', vehicle_type)
              order by full_name), '[]'::jsonb))
          from real_drivers where tambon_id = t.id),
        'admins', (select jsonb_build_object(
            'total', count(distinct id),
            'list', coalesce(jsonb_agg(distinct jsonb_build_object('name', full_name)), '[]'::jsonb))
          from tambon_admins where tambon_id = t.id),
        'web_applications_pending', (select count(*) from public.web_applications w
                                      where w.tambon_id = t.id and w.status = 'pending'),
        'orders_7d', (select count(*) from public.orders o
                       where o.tambon_id = t.id and not coalesce(o.is_test, false)
                         and o.created_at > now() - interval '7 days'),
        'money', jsonb_build_object(
          'has_promptpay', t.settlement_promptpay_id is not null,
          'intake_blocked', coalesce(t.intake_blocked, false),
          'slips', (select jsonb_build_object(
              'pending', count(*) filter (where o.slip_submitted_at is not null
                                            and o.customer_paid_at is null and o.payment_rejected_at is null),
              'pending_over_12h', count(*) filter (where o.slip_submitted_at is not null
                                            and o.customer_paid_at is null and o.payment_rejected_at is null
                                            and o.slip_submitted_at < now() - interval '12 hours'),
              'rejected_waiting', count(*) filter (where o.payment_rejected_at is not null and o.customer_paid_at is null),
              'awaiting_slip', count(*) filter (where o.status = 'delivered' and o.payment_method = 'พร้อมเพย์'
                                            and o.slip_submitted_at is null and o.customer_paid_at is null),
              'verified_today', count(*) filter (where o.customer_paid_at >= (select ts from bkk_day)),
              'verified_today_amount', coalesce(sum(public.order_customer_total(o))
                                         filter (where o.customer_paid_at >= (select ts from bkk_day)), 0),
              'verified_7d', count(*) filter (where o.customer_paid_at > now() - interval '7 days'),
              'verified_7d_amount', coalesce(sum(public.order_customer_total(o))
                                      filter (where o.customer_paid_at > now() - interval '7 days'), 0))
            from public.orders o
           where o.tambon_id = t.id and not coalesce(o.is_test, false)),
          'payouts', (select jsonb_build_object(
              'owed', count(*) filter (where s.paid_out_at is null),
              'owed_amount', coalesce(sum(s.amount) filter (where s.paid_out_at is null), 0),
              'overdue', count(*) filter (where s.paid_out_at is null and s.due_at < now()),
              'overdue_amount', coalesce(sum(s.amount) filter (where s.paid_out_at is null and s.due_at < now()), 0),
              'awaiting_confirm', count(*) filter (where s.paid_out_at is not null and s.confirmed_at is null),
              'awaiting_confirm_amount', coalesce(sum(s.amount)
                                           filter (where s.paid_out_at is not null and s.confirmed_at is null), 0),
              'confirmed_7d_amount', coalesce(sum(s.amount) filter (where s.confirmed_at > now() - interval '7 days'), 0))
            from public.settlements s
           where s.tambon_id = t.id))
      ) order by t.name)
      from public.tambons t), '[]'::jsonb),
    'tambon_applications_pending', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'tambon_name', a.tambon_name, 'district', a.district, 'province', a.province,
        'applicant_name', a.applicant_name, 'merchant_count', a.merchant_count,
        'driver_count', a.driver_count, 'created_at', a.created_at) order by a.created_at)
      from public.tambon_applications a where a.status = 'pending'), '[]'::jsonb)
  );
$$;

comment on function public.delivery_overview() is
  'สรุปรายตำบลสำหรับ BAVORN AI (n8n คัดลอกไป Hermes วันละครั้ง) รวมยอดเงินรวมรายตำบล (money). service_role เท่านั้น. ไม่มีเบอร์/LINE id/พิกัด/เลขพร้อมเพย์.';

revoke all on function public.delivery_overview() from public, anon, authenticated;
grant execute on function public.delivery_overview() to service_role;
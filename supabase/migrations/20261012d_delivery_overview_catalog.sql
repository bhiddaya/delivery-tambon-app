-- ระดับ E (ข้อมูลที่ส่งไป Dashboard): เพิ่มส่วน catalog ใน delivery_overview()
--
-- อาจารย์อนุมัติ 12 ต.ค. 2569 ("อนุมัติตามแผน"): หน้างานร้านค้าและไรเดอร์ที่บันทึกภาพ เมนู ราคา ให้เชื่อมกับ Dashboard
--   ใช้ท่อเดิม: n8n C31 เรียก delivery_overview() → Hermes delivery_snapshot_record() → แท็บ "ข้อมูล Delivery"
--   (ตามรอบเดิม + ปุ่ม "อัปเดตตอนนี้") · ขนาดรวมต้องไม่เกิน 512 KB (ตรวจที่ Hermes)
--
-- ส่งเพิ่ม: ร้านจริงทุกร้าน (ไม่รวมร้านทดสอบ) + เมนูทุกรายการ (ชื่อ ราคา รูป คำบรรยาย พร้อมขาย/หมด พักขาย)
--   + สินค้าที่ส่งมารอรูป (ชื่อ ราคา เวลา) · ไรเดอร์จริงทุกคน + งาน 7 วัน
-- ไม่ส่ง: เบอร์ LINE id พร้อมเพย์ QR รับเงิน ที่อยู่ พิกัด ทะเบียนรถ เอกสารส่วนตัวไรเดอร์ (อาจารย์เลือกไม่รวม)
--
-- แผนกู้ (ย้อนกลับ):
--   create or replace function public.delivery_overview() returns jsonb language sql stable security definer
--     set search_path to 'public','pg_temp' as $$ select public.delivery_overview_core() || jsonb_build_object('line_oa', public.delivery_line_oa()); $$;
--   drop function if exists public.delivery_catalog();
-- IDEMPOTENT: รันซ้ำได้

create or replace function public.delivery_catalog()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object(
    'shops', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'name', m.name, 'tambon', t.name, 'category', m.category,
        'is_open', m.is_open, 'hours_enabled', coalesce(m.hours_enabled, false), 'updated_at', m.updated_at,
        'menu', coalesce((
          select jsonb_agg(jsonb_build_object(
            'name', mi.name, 'price', mi.price, 'photo_url', mi.photo_url, 'description', mi.description,
            'is_available', mi.is_available, 'is_hidden', coalesce(mi.is_hidden, false))
            order by coalesce(mi.is_hidden, false), mi.name)
          from public.menu_items mi where mi.merchant_id = m.id), '[]'::jsonb),
        'pending_items', coalesce((
          select jsonb_agg(jsonb_build_object('name', pm.name, 'price', pm.price, 'created_at', pm.created_at)
            order by pm.created_at)
          from public.pending_menu_items pm where pm.merchant_id = m.id), '[]'::jsonb)
      ) order by t.name, m.name)
      from public.merchants m
      left join public.tambons t on t.id = m.tambon_id
     where not coalesce(m.is_test, false)), '[]'::jsonb),
    'drivers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', p.full_name, 'tambon', t.name, 'approved', coalesce(p.approved, false),
        'suspended', p.suspended_at is not null,
        'is_online', coalesce(d.is_online, false), 'vehicle_type', d.vehicle_type, 'last_active_at', d.updated_at,
        'jobs_7d', (select count(*) from public.orders o where o.driver_id = p.id and not coalesce(o.is_test, false)
                     and o.created_at > now() - interval '7 days'),
        'delivered_7d', (select count(*) from public.orders o where o.driver_id = p.id and not coalesce(o.is_test, false)
                     and o.status = 'delivered' and o.created_at > now() - interval '7 days'))
        order by t.name, p.full_name)
      from public.profiles p
      left join public.drivers d on d.profile_id = p.id
      left join public.tambons t on t.id = p.tambon_id
     where p.role = 'driver' and not coalesce(p.is_test, false)), '[]'::jsonb)
  );
$function$;

revoke all on function public.delivery_catalog() from public, anon, authenticated;

create or replace function public.delivery_overview()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select public.delivery_overview_core()
      || jsonb_build_object('line_oa', public.delivery_line_oa(), 'catalog', public.delivery_catalog());
$function$;

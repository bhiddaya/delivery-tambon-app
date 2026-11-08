-- จำนวนผู้ดูแลทั้งหมดสำหรับถามใน LINE: ผู้ดูแลสูงสุด + แอดมินกลาง + ตัวแทนตำบล
--
-- ออกแบบ:
--   * ใช้ line_staff_level() เดิมเป็นตัวตัดสินระดับ (ไม่สร้างกติกาใหม่)
--   * นับคนละ 1 ครั้ง: superadmin > admin (ผู้ช่วยกลาง) > tambon_agent
--   * รวมบัญชีใน staff_line_accounts ด้วย (รวมถึงที่ยังไม่มีโปรไฟล์)
--   * นับเฉพาะบัญชีที่อนุมัติแล้ว ไม่ถูกพักสิทธิ์ และไม่ใช่บัญชีทดสอบ
--   * เรียกได้เฉพาะผู้ดูแลกลาง (superadmin/admin) ตัวแทนตำบลและคนทั่วไปได้ allowed=false
--   * service_role เท่านั้น (เรียกจาก n8n)
--
-- สถานะ: applied บน production แล้ว (migration name: line_staff_headcount_include_staff_accounts)

create or replace function public.line_staff_headcount(p_line_user_id text)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
  v_level text;
  v_result jsonb;
begin
  v_level := public.line_staff_level(p_line_user_id) ->> 'level';
  if v_level is null or v_level not in ('superadmin', 'admin') then
    return jsonb_build_object('allowed', false);
  end if;

  with people as (
    select p.id::text as key, p.role::text as role, p.tambon_id, sl.level as staff_level,
      exists (select 1 from public.admin_scopes s where s.profile_id = p.id and s.tambon_id is null) as national,
      exists (select 1 from public.admin_scopes s where s.profile_id = p.id) as any_scope
    from public.profiles p
    left join public.staff_line_accounts sl on sl.line_user_id = p.line_user_id
    where coalesce(p.approved, false)
      and p.suspended_at is null
      and not coalesce(p.is_test, false)
  ), unmatched as (
    select sl.line_user_id as key, null::text as role, null::uuid as tambon_id, sl.level as staff_level,
      false as national, false as any_scope
    from public.staff_line_accounts sl
    where not exists (select 1 from public.profiles p where p.line_user_id = sl.line_user_id)
  ), tiers as (
    select case
      when role = 'superadmin' or staff_level = 'superadmin' then 'superadmin'
      when national or staff_level = 'admin' then 'admin'
      when (role = 'admin' and tambon_id is not null) or any_scope then 'tambon_agent'
    end as tier
    from (select * from people union all select * from unmatched) all_people
  )
  select jsonb_build_object(
    'allowed', true,
    'superadmin', count(*) filter (where tier = 'superadmin'),
    'admin', count(*) filter (where tier = 'admin'),
    'tambon_agent', count(*) filter (where tier = 'tambon_agent'),
    'total', count(*) filter (where tier is not null)
  ) into v_result
  from tiers;

  return v_result;
end;
$$;

revoke all on function public.line_staff_headcount(text) from public, anon, authenticated;
grant execute on function public.line_staff_headcount(text) to service_role;

-- ย้อนกลับ: drop function public.line_staff_headcount(text);

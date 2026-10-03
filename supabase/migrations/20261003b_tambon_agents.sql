-- [ระดับ E] ระบบตัวแทนตำบล — อาจารย์สั่ง "อนุมัติระบบตัวแทนตำบล" (3 ต.ค. 2569)
--
-- 1. ช่องที่ส่วนกลางคุมเท่านั้น: เปิด/ปิดบริการ (is_active, opened_at), เงินค้ำประกัน (deposit_amount), slug
--    เดิม RLS tambons_write_scoped ให้ตัวแทนแก้ตำบลตัวเองได้ทุกช่อง หน้าเว็บแค่ซ่อนไว้
--    → trigger ปฏิเสธเมื่อผู้แก้ผ่าน API (authenticated) ไม่ใช่ส่วนกลาง
--    ฟังก์ชันระบบ (security definer) เช่น refresh_intake_block / approve_tambon_application ไม่ถูกกระทบ
-- 2. แต่งตั้ง/ถอดตัวแทนตำบล: tambon_admin_grant / tambon_admin_revoke (ส่วนกลางเท่านั้น)
--    ใช้ admin_scopes (คนเดิมยังเป็นร้าน/ไรเดอร์ได้ตามเดิม) บันทึกทุกครั้งใน admin_actions
-- 3. approve_tambon_application รับ p_make_applicant_admin (ค่าเริ่มต้น false) ตั้งผู้สมัครเป็นตัวแทนได้ทันที
--
-- ย้อนกลับ: drop trigger tambons_central_fields_guard; drop function tambons_central_fields_guard,
--   tambon_admin_grant, tambon_admin_revoke; drop index admin_scopes_profile_tambon_uniq;
--   คืน approve_tambon_application รุ่น 3 พารามิเตอร์ (20261002c_delivery_overview.sql / ไฟล์เดิม)

create or replace function public.tambons_central_fields_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  -- security invoker (ตั้งใจ): current_user = authenticated/anon เมื่อแก้ผ่าน API ของผู้ใช้
  -- ส่วนการแก้จากฟังก์ชัน security definer ของระบบ current_user คือเจ้าของฟังก์ชัน จึงไม่ถูกตรวจ
  if current_user in ('authenticated', 'anon') and not public.has_national_scope() then
    if new.is_active is distinct from old.is_active
       or new.opened_at is distinct from old.opened_at
       or new.deposit_amount is distinct from old.deposit_amount
       or new.slug is distinct from old.slug then
      raise exception 'เปิด/ปิดบริการ เงินค้ำประกัน และลิงก์ตำบล แก้ได้เฉพาะส่วนกลาง' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists tambons_central_fields_guard on public.tambons;
create trigger tambons_central_fields_guard
  before update on public.tambons
  for each row execute function public.tambons_central_fields_guard();

create unique index if not exists admin_scopes_profile_tambon_uniq
  on public.admin_scopes (profile_id, tambon_id) nulls not distinct;

create or replace function public.tambon_admin_grant(p_profile_id uuid, p_tambon_id uuid, p_note text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
  v_name text;
begin
  if not public.is_superadmin() then
    raise exception 'แต่งตั้งตัวแทนตำบลได้เฉพาะส่วนกลาง' using errcode = '42501';
  end if;
  if p_tambon_id is null then
    raise exception 'ต้องระบุตำบล (สิทธิ์ทุกตำบลไม่แต่งตั้งผ่านหน้านี้)' using errcode = '22023';
  end if;
  select name into v_name from public.tambons where id = p_tambon_id;
  if not found then
    raise exception 'ไม่พบตำบล' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception 'ไม่พบบัญชีผู้ใช้' using errcode = 'P0002';
  end if;

  insert into public.admin_scopes (profile_id, tambon_id, note, granted_by)
  values (p_profile_id, p_tambon_id, left(p_note, 300), auth.uid())
  on conflict (profile_id, tambon_id) do nothing
  returning id into v_id;

  if v_id is not null then
    insert into public.admin_actions (actor_id, target_id, action, note)
    values (auth.uid(), p_profile_id, 'tambon_admin.grant',
            'แต่งตั้งเป็นตัวแทน' || v_name || coalesce(' · ' || left(p_note, 200), ''));
  else
    select id into v_id from public.admin_scopes where profile_id = p_profile_id and tambon_id = p_tambon_id;
  end if;
  return v_id;
end $$;

create or replace function public.tambon_admin_revoke(p_profile_id uuid, p_tambon_id uuid, p_note text default null)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_name text;
  v_n int;
begin
  if not public.is_superadmin() then
    raise exception 'ถอดตัวแทนตำบลได้เฉพาะส่วนกลาง' using errcode = '42501';
  end if;
  if p_tambon_id is null then
    raise exception 'ต้องระบุตำบล' using errcode = '22023';
  end if;
  select name into v_name from public.tambons where id = p_tambon_id;
  delete from public.admin_scopes where profile_id = p_profile_id and tambon_id = p_tambon_id;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    insert into public.admin_actions (actor_id, target_id, action, note)
    values (auth.uid(), p_profile_id, 'tambon_admin.revoke',
            'ถอดจากตัวแทน' || coalesce(v_name, 'ตำบล') || coalesce(' · ' || left(p_note, 200), ''));
  end if;
  return v_n > 0;
end $$;

revoke all on function public.tambon_admin_grant(uuid, uuid, text) from public, anon;
revoke all on function public.tambon_admin_revoke(uuid, uuid, text) from public, anon;
grant execute on function public.tambon_admin_grant(uuid, uuid, text) to authenticated;
grant execute on function public.tambon_admin_revoke(uuid, uuid, text) to authenticated;
revoke all on function public.tambons_central_fields_guard() from public, anon, authenticated;

-- approve_tambon_application: เพิ่มตัวเลือกตั้งผู้สมัครเป็นตัวแทน (ค่าเริ่มต้นไม่ตั้ง — พฤติกรรมเดิม)
drop function if exists public.approve_tambon_application(uuid, text, text);
create function public.approve_tambon_application(app_id uuid, tambon_slug text, review_note text default null,
                                                  p_make_applicant_admin boolean default false)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a       public.tambon_applications;
  new_id  uuid;
begin
  if not public.is_superadmin() then
    raise exception 'อนุมัติได้เฉพาะส่วนกลางเท่านั้น' using errcode = '42501';
  end if;

  select * into a from public.tambon_applications where id = app_id for update;
  if not found then
    raise exception 'ไม่พบใบสมัครนี้' using errcode = 'P0002';
  end if;
  if a.status <> 'pending' then
    raise exception 'ใบสมัครนี้ถูกพิจารณาไปแล้ว (%)', a.status using errcode = '22023';
  end if;
  if tambon_slug is null or btrim(tambon_slug) = '' then
    raise exception 'ต้องระบุ slug ของตำบล' using errcode = '22023';
  end if;

  -- สร้างแบบ "ยังไม่เปิดบริการ" เสมอ — อนุมัติแล้วไม่ได้แปลว่าพร้อมใช้งาน
  insert into public.tambons (name, district, province, code, slug, is_active)
  values (a.tambon_name, a.district, a.province, a.tambon_code, btrim(tambon_slug), false)
  returning id into new_id;

  insert into public.tambon_profiles (tambon_id) values (new_id);

  update public.tambon_applications
     set status            = 'approved',
         reviewed_by       = auth.uid(),
         reviewed_at       = now(),
         review_note       = approve_tambon_application.review_note,
         created_tambon_id = new_id
   where id = app_id;

  if p_make_applicant_admin and a.applicant_profile_id is not null then
    perform public.tambon_admin_grant(a.applicant_profile_id, new_id, 'ผู้สมัครเปิดตำบล');
  end if;

  return new_id;
end $$;

revoke all on function public.approve_tambon_application(uuid, text, text, boolean) from public, anon;
grant execute on function public.approve_tambon_application(uuid, text, text, boolean) to authenticated, service_role;

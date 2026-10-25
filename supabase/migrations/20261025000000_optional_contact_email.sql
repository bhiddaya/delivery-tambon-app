-- อีเมลติดต่อแบบไม่บังคับ ในใบสมัครทั้ง 4 บทบาท (ลูกค้า ร้านค้า ไรเดอร์ ตัวแทนตำบล)
-- แยกจาก auth.users.email เพราะบัญชีเบอร์โทร/LINE มีอีเมลแฝง (@…invalid) ไม่ใช่อีเมลจริง
-- ว่างได้ (null) · ถ้ากรอกต้องเป็นรูปแบบอีเมล (หน้าเว็บ/RPC แปลงเป็นตัวพิมพ์เล็กก่อนบันทึก)
alter table public.profiles add column if not exists contact_email text
  constraint profiles_contact_email_check check (contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');
alter table public.tambon_applications add column if not exists applicant_email text
  constraint tambon_applications_applicant_email_check check (applicant_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');

-- register_line_customer รับ p_email เพิ่ม (default null — เรียกแบบ 3 ค่าเดิมยังได้)
drop function if exists public.register_line_customer(text, text, uuid);
create or replace function public.register_line_customer(p_name text, p_phone text, p_tambon_id uuid, p_email text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare u uuid:=auth.uid(); line_id text; p public.profiles%rowtype; phone_no text; mail text;
begin
  if u is null then return jsonb_build_object('ok',false,'error','login_required'); end if;
  select raw_app_meta_data->>'line_user_id' into line_id from auth.users where id=u;
  if coalesce(line_id,'') !~ '^U[0-9a-f]{32}$' then return jsonb_build_object('ok',false,'error','line_login_required'); end if;
  if length(btrim(coalesce(p_name,''))) not between 2 and 100 then return jsonb_build_object('ok',false,'error','bad_name'); end if;
  phone_no:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
  if phone_no ~ '^0[0-9]{9}$' then phone_no:='66'||substr(phone_no,2); end if;
  if phone_no !~ '^66[0-9]{9}$' then return jsonb_build_object('ok',false,'error','bad_phone'); end if;
  mail:=nullif(lower(btrim(coalesce(p_email,''))),'');
  if mail is not null and (length(mail)>254 or mail !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    return jsonb_build_object('ok',false,'error','bad_email');
  end if;
  if not exists(select 1 from public.tambons where id=p_tambon_id and is_active) then return jsonb_build_object('ok',false,'error','area_unavailable'); end if;
  perform pg_advisory_xact_lock(hashtextextended('customer-registration:'||u::text,0));
  select * into p from public.profiles where id=u for update;
  if p.id is not null and p.suspended_at is not null then return jsonb_build_object('ok',false,'error','account_suspended'); end if;
  if p.id is not null and p.line_user_id is not null and p.line_user_id<>line_id then
    return jsonb_build_object('ok',false,'error','identity_mismatch');
  end if;
  if exists(select 1 from public.profiles where line_user_id=line_id and id<>u) then
    return jsonb_build_object('ok',false,'error','identity_in_use');
  end if;
  if p.id is not null then
    update public.profiles set full_name=btrim(p_name), phone=phone_no, line_user_id=line_id,
      tambon_id=case when p.role='customer' then p_tambon_id else p.tambon_id end,
      contact_email=coalesce(mail, p.contact_email)
      where id=u;
    return jsonb_build_object('ok',true,'tambon_id',p_tambon_id);
  end if;
  insert into public.profiles(id,role,full_name,phone,tambon_id,line_user_id,contact_email)
    values(u,'customer',btrim(p_name),phone_no,p_tambon_id,line_id,mail);
  return jsonb_build_object('ok',true,'tambon_id',p_tambon_id);
end $function$;

revoke all on function public.register_line_customer(text, text, uuid, text) from public;
grant execute on function public.register_line_customer(text, text, uuid, text) to authenticated, service_role;

-- Rollback:
--   drop function if exists public.register_line_customer(text, text, uuid, text);
--   สร้าง register_line_customer(text, text, uuid) ตัวเดิมคืน (นิยามก่อนไฟล์นี้: เหมือนด้านบนแต่ไม่มี p_email/mail/contact_email)
--   แล้ว grant execute ... to authenticated, service_role
--   alter table public.profiles drop column if exists contact_email;
--   alter table public.tambon_applications drop column if exists applicant_email;

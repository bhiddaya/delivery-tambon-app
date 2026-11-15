-- ใบสมัครลูกค้าผ่านแชต LINE (ฟอร์มเดียวกับร้านค้า/ไรเดอร์ ผ่าน n8n) ไม่ใช้หน้า LIFF เดิม
-- n8n เรียกด้วย service_role หลังผู้ใช้กรอกฟอร์มที่ลงลายเซ็นแล้ว จึงรับ line_user_id มาจาก n8n โดยตรง
-- กันการทับ role: บัญชีที่เป็นร้านค้า/ไรเดอร์/ผู้ดูแลอยู่แล้วจะไม่ถูกเปลี่ยนเป็นลูกค้า

create or replace function public.line_signup_customer(p_line_user_id text, p_name text, p_phone text, p_tambon_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare p public.profiles%rowtype; phone_no text;
begin
  if coalesce(p_line_user_id,'') !~ '^U[0-9a-f]{32}$' then return jsonb_build_object('ok',false,'error','line_login_required'); end if;
  if length(btrim(coalesce(p_name,''))) not between 2 and 100 then return jsonb_build_object('ok',false,'error','bad_name'); end if;
  phone_no:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
  if phone_no ~ '^0[0-9]{9}$' then phone_no:='66'||substr(phone_no,2); end if;
  if phone_no !~ '^66[0-9]{9}$' then return jsonb_build_object('ok',false,'error','bad_phone'); end if;
  if not exists(select 1 from public.tambons where id=p_tambon_id and is_active) then return jsonb_build_object('ok',false,'error','area_unavailable'); end if;
  perform pg_advisory_xact_lock(hashtextextended('line-signup-customer:'||p_line_user_id,0));
  select * into p from public.profiles where line_user_id=p_line_user_id for update;
  if p.id is not null and p.role<>'customer' then return jsonb_build_object('ok',false,'error','use_existing_account'); end if;
  if p.id is not null and p.suspended_at is not null then return jsonb_build_object('ok',false,'error','account_suspended'); end if;
  if p.id is not null then
    update public.profiles set full_name=btrim(p_name), phone=phone_no, tambon_id=p_tambon_id where id=p.id;
    return jsonb_build_object('ok',true,'updated',true,'tambon_id',p_tambon_id);
  end if;
  insert into public.profiles(id,role,full_name,phone,tambon_id,line_user_id)
    values(gen_random_uuid(),'customer',btrim(p_name),phone_no,p_tambon_id,p_line_user_id);
  return jsonb_build_object('ok',true,'updated',false,'tambon_id',p_tambon_id);
end $function$;

revoke all on function public.line_signup_customer(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.line_signup_customer(text, text, text, uuid) to service_role;

-- Rollback:
--   drop function if exists public.line_signup_customer(text, text, text, uuid);

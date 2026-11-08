


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE SCHEMA IF NOT EXISTS "dhamma";


ALTER SCHEMA "dhamma" OWNER TO "postgres";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."order_status" AS ENUM (
    'pending',
    'accepted',
    'in_progress',
    'delivered',
    'cancelled'
);


ALTER TYPE "public"."order_status" OWNER TO "postgres";


CREATE TYPE "public"."order_type" AS ENUM (
    'food',
    'parcel',
    'ride',
    'agri_service'
);


ALTER TYPE "public"."order_type" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'customer',
    'driver',
    'merchant',
    'admin',
    'superadmin'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE TYPE "public"."vehicle_type" AS ENUM (
    'motorcycle',
    'pickup',
    'trike',
    'tractor',
    'bicycle',
    'other',
    'harvester',
    'rice_transplanter',
    'drone',
    'car'
);


ALTER TYPE "public"."vehicle_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."d25_sign"("p_domain" "text", "p_body" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_key text;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name='d25_bridge_hmac';
  if v_key is null or length(v_key)<64 then
    raise exception 'D25 signing key is not configured' using errcode='55000';
  end if;
  return encode(extensions.hmac(convert_to(p_domain || E'\n' || p_body,'UTF8'),
                convert_to(v_key,'UTF8'),'sha256'),'hex');
end $$;


ALTER FUNCTION "private"."d25_sign"("p_domain" "text", "p_body" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_cart_json"("p_user" "text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select coalesce((
    select jsonb_build_object(
      'merchant_id', c.merchant_id, 'shop_name', m.name,
      'items', coalesce(jsonb_agg(jsonb_build_object('id', mi.id, 'name', mi.name, 'price', mi.price, 'qty', (x->>'qty')::int,
                 'line_total', mi.price * (x->>'qty')::int) order by mi.name) filter (where mi.id is not null), '[]'::jsonb),
      'count', coalesce(sum((x->>'qty')::int) filter (where mi.id is not null), 0),
      'total', coalesce(sum(mi.price * (x->>'qty')::int) filter (where mi.id is not null), 0))
    from public.carts c
    left join public.merchants m on m.id = c.merchant_id
    left join lateral jsonb_array_elements(c.items) x on true
    left join public.menu_items mi on mi.id = (x->>'id')::uuid and mi.is_available and not coalesce(mi.is_hidden,false)
    where c.line_user_id = p_user
    group by c.merchant_id, m.name), jsonb_build_object('items','[]'::jsonb,'count',0,'total',0));
$$;


ALTER FUNCTION "public"."_cart_json"("p_user" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_dir_state_th"("s" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select case s when 'pending' then 'รอตัดสินใจ' when 'ack' then 'รับทราบ' when 'approved' then 'อนุมัติ'
    when 'conditional' then 'อนุมัติมีเงื่อนไข' when 'rejected' then 'ไม่อนุมัติ' else s end
$$;


ALTER FUNCTION "public"."_dir_state_th"("s" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_is_service_command"("p_user" "text", "p_text" "text") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $_$
  with t as (select btrim(coalesce(p_text, '')) as s)
  select
       s in ('เพิ่มสินค้า','สั่งอาหาร','สั่งอาหาร/ของแห้ง','เรียกรถ/ส่งคน','จ้างรถ-เครื่องจักรเกษตร',
             'สรุปยอดวันนี้','ยอดวันนี้','สรุปยอด','อันดับ','จัดอันดับ','อันดับความพึงพอใจ','ท็อปไรเดอร์','ท็อปร้านค้า',
             'ยืนยันรับของ','ได้รับของแล้ว','ได้รับแล้ว','ยืนยันรับสินค้า','ปิดงาน',
             'ปิดรับงาน','เลิกรับงาน','ออฟไลน์','ปิดงานวันนี้','เปิดรับงาน',
             'สถานที่สำคัญ','สถานที่ราชการ','คำถามรอสอน','รายงานคำถาม')
    or s ~* '^(นโยบายความเป็นส่วนตัว|ความเป็นส่วนตัว|PDPA|ข้อมูลส่วนบุคคล)$'
    or s ~ '^สอน(คำตอบ)?\s*[:：]'
    or s ~ '^สมัคร(ร้านค้า|ไรเดอร์|ขับรถส่วนตัว|รถส่วนบุคคล|รถไถ|รถเกี่ยวข้าว|รถดำนา|โดรน|งานอาชีพ|งาน)(\s|$)'
    or s ~ '^สมัครงาน\s*J\d+'
    or s ~ '^ยืนยันนายจ้าง\s*[A-Za-z0-9]{6}'
    or s ~ '^ผูก(บัญชี|ร้าน|ไรเดอร์)'
    or s ~ '^(แจ้งเรื่อง|ร้องเรียน|แจ้งปัญหา|ติดตามเรื่อง|สถานะ\s*R\d{6}-)'
    or (starts_with(s, 'เพิ่มสินค้า') and position('ชื่อสินค้า' in s) > 0)
    or s ~ '#[a-z][a-z0-9-]{2,39}\s*$'
    or (s ~ '^[1-5]$' and exists (
          select 1 from (
            select o.id as order_id, p.id as pid
              from public.profiles p
              join public.orders o on o.customer_id = p.id
             where p.line_user_id = p_user and o.status = 'delivered'
             order by o.delivered_at desc nulls last
             limit 1) lo
         where not exists (select 1 from public.ratings r where r.order_id = lo.order_id and r.from_profile = lo.pid)))
  from t
$_$;


ALTER FUNCTION "public"."_is_service_command"("p_user" "text", "p_text" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_no" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "from_profile_id" "uuid",
    "from_tambon_id" "uuid",
    "from_role" "text" NOT NULL,
    "from_nickname" "text",
    "from_real_name" "text",
    "to_profile_id" "uuid",
    "to_tambon_id" "uuid",
    "to_hq" boolean DEFAULT false NOT NULL,
    "audience" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "category" "text" NOT NULL,
    "body" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "is_test" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "audience_valid" CHECK ((("audience" <@ ARRAY['all'::"text", 'customer'::"text", 'merchant'::"text", 'driver'::"text", 'agent'::"text"]) AND (("kind" = 'announce'::"text") = ("cardinality"("audience") > 0)))),
    CONSTRAINT "in_tambon_same" CHECK ((("kind" <> 'in_tambon'::"text") OR ("from_tambon_id" = "to_tambon_id"))),
    CONSTRAINT "messages_body_check" CHECK (("char_length"("body") <= 500)),
    CONSTRAINT "messages_category_check" CHECK (("category" = ANY (ARRAY['ask'::"text", 'problem'::"text", 'help'::"text", 'announce'::"text"]))),
    CONSTRAINT "messages_from_role_check" CHECK (("from_role" = ANY (ARRAY['customer'::"text", 'merchant'::"text", 'driver'::"text", 'agent'::"text", 'hq'::"text"]))),
    CONSTRAINT "messages_kind_check" CHECK (("kind" = ANY (ARRAY['in_tambon'::"text", 'tambon_to_hq'::"text", 'hq_to_tambon'::"text", 'announce'::"text"]))),
    CONSTRAINT "messages_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'sent'::"text", 'read'::"text", 'accepted'::"text", 'replied'::"text", 'closed'::"text", 'cancelled'::"text", 'forwarded'::"text", 'overdue'::"text"]))),
    CONSTRAINT "to_hq_flag" CHECK ((("kind" = 'tambon_to_hq'::"text") = "to_hq"))
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


COMMENT ON TABLE "public"."messages" IS 'ข้อความสื่อสารผ่าน LINE OA ระหว่างตำบล/บวรไทย และโพสต์ประกาศ (audience) · service role เท่านั้น · ห้ามเก็บ LINE userId ในช่องแสดงผล';



CREATE OR REPLACE FUNCTION "public"."_msg_label"("m" "public"."messages") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select coalesce(m.from_nickname || coalesce(' (' || m.from_real_name || ')', ''), m.from_real_name, 'ไม่ระบุชื่อ')
         || ' · ' || coalesce('ตำบล' || (select regexp_replace(t.name, '^ตำบล', '') from public.tambons t where t.id = m.from_tambon_id), 'บวรไทย')
         || ' · ' || public._msg_role_th(m.from_role)
$$;


ALTER FUNCTION "public"."_msg_label"("m" "public"."messages") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_msg_recipients"("m" "public"."messages") RETURNS "text"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select case
    when m.kind = 'tambon_to_hq' then coalesce(public.central_admin_line_ids(), '{}')
    when m.kind in ('in_tambon','hq_to_tambon') then
      coalesce(array(select l.line_user_id from public.line_targets_for_tambon_admin(m.to_tambon_id) l), '{}')
    else '{}'::text[] end
$$;


ALTER FUNCTION "public"."_msg_recipients"("m" "public"."messages") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_msg_role_th"("r" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select case r when 'customer' then 'ลูกค้า' when 'merchant' then 'ร้านค้า' when 'driver' then 'ไรเดอร์'
    when 'agent' then 'ตัวแทนตำบล' when 'hq' then 'ทีมบวรไทย' else r end
$$;


ALTER FUNCTION "public"."_msg_role_th"("r" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."_msg_status_th"("s" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select case s when 'sent' then 'ส่งแล้ว' when 'read' then 'เปิดอ่านแล้ว' when 'accepted' then 'รับเรื่องแล้ว'
    when 'replied' then 'ตอบแล้ว' when 'closed' then 'ปิดเรื่อง' when 'cancelled' then 'ยกเลิก'
    when 'forwarded' then 'ส่งต่อบวรไทย' when 'overdue' then 'เกินเวลา' else s end
$$;


ALTER FUNCTION "public"."_msg_status_th"("s" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_assign_order"("p_order_id" bigint, "p_driver_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  o public.orders%rowtype;
  d public.profiles%rowtype;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'ไม่พบออเดอร์'; end if;
  if not public.can_admin_tambon(o.tambon_id) then raise exception 'ทำได้เฉพาะตัวแทนของตำบลนี้'; end if;
  if o.status <> 'pending' or o.driver_id is not null then raise exception 'ออเดอร์นี้มีคนรับแล้วหรือไม่อยู่ในสถานะรอคนรับ'; end if;
  select * into d from public.profiles where id = p_driver_id;
  if not found or d.role <> 'driver' or not coalesce(d.approved, false) or d.suspended_at is not null
     or d.tambon_id is distinct from o.tambon_id then
    raise exception 'เลือกได้เฉพาะไรเดอร์ที่อนุมัติแล้วของตำบลนี้';
  end if;

  update public.orders set driver_id = p_driver_id, status = 'accepted' where id = p_order_id;
  insert into public.admin_actions (actor_id, target_id, action, note)
  values (auth.uid(), p_driver_id, 'order.assign', format('มอบออเดอร์ #%s ให้ %s', o.id, d.full_name));
end;
$$;


ALTER FUNCTION "public"."admin_assign_order"("p_order_id" bigint, "p_driver_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_cancel_order"("p_order_id" bigint, "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  o public.orders%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'ไม่พบออเดอร์'; end if;
  if not public.can_admin_tambon(o.tambon_id) then raise exception 'ทำได้เฉพาะตัวแทนของตำบลนี้'; end if;
  if o.status = 'cancelled' then raise exception 'ออเดอร์นี้ยกเลิกไปแล้ว'; end if;
  if o.customer_paid_at is not null then raise exception 'ออเดอร์นี้ยืนยันรับเงินแล้ว ยกเลิกไม่ได้ — ติดต่อส่วนกลาง'; end if;
  if char_length(v_reason) < 5 then raise exception 'กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร'; end if;

  update public.orders set status = 'cancelled' where id = p_order_id;
  -- trg_log_order_status_change เพิ่มแถว order_events แล้ว ใส่เหตุผลให้แถวนั้น
  update public.order_events set note = left('ยกเลิกโดยตัวแทนตำบล: ' || v_reason, 500)
   where id = (select max(id) from public.order_events where order_id = p_order_id and status = 'cancelled');
  insert into public.admin_actions (actor_id, target_id, action, note)
  values (auth.uid(), o.customer_id, 'order.cancel', left(format('ยกเลิกออเดอร์ #%s เหตุผล: %s', o.id, v_reason), 1000));
end;
$$;


ALTER FUNCTION "public"."admin_cancel_order"("p_order_id" bigint, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_issue_link_code"("p_profile_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  t public.profiles%rowtype;
  v_alpha constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_bytes bytea;
  i int;
begin
  select * into t from public.profiles where id = p_profile_id;
  if not found then raise exception 'ไม่พบบัญชี'; end if;
  if not (public.can_admin_profile(p_profile_id)
          or coalesce(auth.role(), '') = 'service_role'
          or (auth.uid() is null and session_user = 'postgres')) then
    raise exception 'ทำได้เฉพาะตัวแทนของตำบลนี้';
  end if;
  if t.role not in ('merchant', 'driver') then raise exception 'ออกรหัสได้เฉพาะร้านค้าและไรเดอร์'; end if;
  if t.suspended_at is not null then raise exception 'บัญชีนี้ถูกระงับอยู่'; end if;

  update public.profile_link_codes set revoked_at = now()
   where profile_id = t.id and used_at is null and revoked_at is null;

  loop
    v_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    v_code := '';
    for i in 0..5 loop
      v_code := v_code || substr(v_alpha, (get_byte(v_bytes, i) % length(v_alpha)) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.profile_link_codes where code = v_code);
  end loop;

  insert into public.profile_link_codes (code, profile_id, issued_by) values (v_code, t.id, auth.uid());
  if auth.uid() is not null then
    insert into public.admin_actions (actor_id, target_id, action, note)
    values (auth.uid(), t.id, 'profile.link_code_issue',
            left(format('ออกรหัสผูก LINE ให้ %s (%s)%s', t.full_name, t.role,
                        case when t.line_user_id is not null then ' · บัญชีนี้ผูก LINE อยู่แล้ว จะย้ายไป LINE ใหม่เมื่อใช้รหัส' else '' end), 1000));
  end if;

  return jsonb_build_object('code', v_code, 'profile_id', t.id, 'full_name', t.full_name, 'role', t.role,
                            'expires_at', now() + interval '7 days');
end $$;


ALTER FUNCTION "public"."admin_issue_link_code"("p_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_push_status"() RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if not public.is_superadmin() then raise exception 'เฉพาะส่วนกลางเท่านั้น' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('group', x.grp, 'label', x.label, 'devices', x.n) order by x.grp, x.label) from (
      select 'merchant' as grp, m.name as label, (select count(*) from public.push_subscriptions s where s.profile_id = p.id) as n
        from public.merchants m join public.profiles p on p.id = m.profile_id
       where not m.is_test and not p.is_test and coalesce(p.approved, false) and p.suspended_at is null
      union all
      select 'driver', p.full_name, (select count(*) from public.push_subscriptions s where s.profile_id = p.id)
        from public.profiles p
       where p.role = 'driver' and not p.is_test and coalesce(p.approved, false) and p.suspended_at is null
      union all
      select 'agent', p.full_name, (select count(*) from public.push_subscriptions s where s.profile_id = p.id)
        from public.profiles p
       where (p.role in ('superadmin', 'admin') or exists (select 1 from public.admin_scopes a where a.profile_id = p.id))
         and not p.is_test and coalesce(p.approved, false) and p.suspended_at is null
    ) x), '[]'::jsonb);
end $$;


ALTER FUNCTION "public"."admin_push_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_review_board_post"("p_id" bigint, "p_action" "text", "p_reason" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  p public.tambon_board_posts%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into p from public.tambon_board_posts where id = p_id for update;
  if not found then raise exception 'ไม่พบประกาศ'; end if;
  if not public.can_admin_tambon(p.tambon_id) then raise exception 'ทำได้เฉพาะตัวแทนของตำบลนี้'; end if;

  if p_action = 'approve' then
    update public.tambon_board_posts
       set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), reject_reason = null,
           expires_at = now() + interval '30 days'
     where id = p_id;
  elsif p_action = 'reject' then
    if v_reason is null or char_length(v_reason) < 5 then raise exception 'ระบุเหตุผลอย่างน้อย 5 ตัวอักษร'; end if;
    update public.tambon_board_posts
       set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), reject_reason = left(v_reason, 300)
     where id = p_id;
  elsif p_action = 'close' then
    update public.tambon_board_posts set status = 'closed', reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  else
    raise exception 'คำสั่งไม่ถูกต้อง';
  end if;

  insert into public.admin_actions (actor_id, target_id, action, note)
  values (auth.uid(), null, 'board.' || p_action,
          left(format('ประกาศ #%s "%s"%s', p.id, p.title, coalesce(' เหตุผล: ' || v_reason, '')), 1000));
end;
$$;


ALTER FUNCTION "public"."admin_review_board_post"("p_id" bigint, "p_action" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_send_drill_order"("p_kind" "text" DEFAULT 'food'::"text", "p_merchant_id" "uuid" DEFAULT NULL::"uuid", "p_tambon_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_customer uuid; v_tambon uuid; v_merchant uuid; v_id bigint;
begin
  if not public.is_superadmin() then raise exception 'เฉพาะส่วนกลางเท่านั้น' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('food', 'ride') then raise exception 'ชนิดออเดอร์ซ้อมไม่ถูกต้อง' using errcode = '22023'; end if;
  select id into v_customer from public.profiles
   where role = 'customer' and is_test and approved and suspended_at is null order by created_at limit 1;
  if v_customer is null then raise exception 'ไม่มีบัญชีลูกค้าทดสอบ' using errcode = '22023'; end if;
  if p_kind = 'food' then
    select m.id, m.tambon_id into v_merchant, v_tambon from public.merchants m where m.id = p_merchant_id and not m.is_test;
    if v_merchant is null then raise exception 'ไม่พบร้านจริงนี้' using errcode = '22023'; end if;
  else
    select t.id into v_tambon from public.tambons t where t.id = p_tambon_id;
    if v_tambon is null then raise exception 'ไม่พบตำบลนี้' using errcode = '22023'; end if;
  end if;
  insert into public.orders (type, status, tambon_id, customer_id, merchant_id, pickup, dropoff, note, is_test, is_drill, customer_paid_at)
  values (p_kind::public.order_type, 'pending', v_tambon, v_customer, v_merchant, 'ออเดอร์ซ้อม', 'ออเดอร์ซ้อม — ไม่ต้องทำจริง',
          'ซ้อมเสียงแจ้งเตือน ไม่ต้องเตรียมของหรือส่งจริง', true, true, case when p_kind = 'food' then now() end)
  returning id into v_id;
  if p_kind = 'food' then
    insert into public.order_items (order_id, name, qty, price) values (v_id, 'ออเดอร์ซ้อม (ไม่ต้องทำจริง)', 1, 0);
  end if;
  return jsonb_build_object('order_id', v_id);
end $$;


ALTER FUNCTION "public"."admin_send_drill_order"("p_kind" "text", "p_merchant_id" "uuid", "p_tambon_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_send_sound_test"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'vault', 'extensions', 'pg_temp'
    AS $$
declare v_secret text; v_devices jsonb;
begin
  if not public.is_superadmin() then raise exception 'เฉพาะส่วนกลางเท่านั้น' using errcode = '42501'; end if;
  if exists (select 1 from public.push_broadcast_log where created_at > now() - interval '1 minute') then
    raise exception 'ส่งสัญญาณได้ทุก 1 นาที รอสักครู่' using errcode = '54000';
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_secret' limit 1;
  if v_secret is null then raise exception 'ระบบแจ้งเตือนยังไม่พร้อม' using errcode = '55000'; end if;
  select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) into v_devices from (
    select s.kind, count(*) as n from public.push_subscriptions s join public.profiles p on p.id = s.profile_id
     where coalesce(p.approved, false) and p.suspended_at is null group by s.kind) x;
  insert into public.push_broadcast_log (created_by) values (auth.uid());
  perform net.http_post(url := 'https://kaeoxqiqonwjoqjoiiho.supabase.co/functions/v1/push-notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
    body := jsonb_build_object('action', 'broadcast'), timeout_milliseconds := 20000);
  return jsonb_build_object('ok', true, 'devices', v_devices);
end $$;


ALTER FUNCTION "public"."admin_send_sound_test"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_set_agent_share"("p_tambon_id" "uuid", "p_commission_pct" numeric, "p_delivery_pct" numeric) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  t public.tambons%rowtype;
begin
  if not public.is_superadmin() then raise exception 'ส่วนแบ่งตัวแทนกำหนดได้เฉพาะส่วนกลาง'; end if;
  if p_commission_pct is null or p_delivery_pct is null
     or p_commission_pct not between 0 and 100 or p_delivery_pct not between 0 and 100 then
    raise exception 'อัตราต้องอยู่ระหว่าง 0 ถึง 100';
  end if;
  select * into t from public.tambons where id = p_tambon_id for update;
  if not found then raise exception 'ไม่พบตำบล'; end if;
  update public.tambons
     set agent_share_commission_pct = round(p_commission_pct, 2),
         agent_share_delivery_pct = round(p_delivery_pct, 2)
   where id = t.id;
  insert into public.admin_actions (actor_id, target_id, action, note)
  values (auth.uid(), null, 'tambon.agent_share',
          format('ตั้งส่วนแบ่งตัวแทน %s: ค่าคอม %s%% (เดิม %s%%) · ค่าขนส่ง %s%% (เดิม %s%%)', t.name,
                 round(p_commission_pct, 2), t.agent_share_commission_pct,
                 round(p_delivery_pct, 2), t.agent_share_delivery_pct));
end;
$$;


ALTER FUNCTION "public"."admin_set_agent_share"("p_tambon_id" "uuid", "p_commission_pct" numeric, "p_delivery_pct" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_set_shop_open"("p_merchant_id" "uuid", "p_open" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  m public.merchants%rowtype;
begin
  select * into m from public.merchants where id = p_merchant_id for update;
  if not found then raise exception 'ไม่พบร้าน'; end if;
  if not public.can_admin_tambon(m.tambon_id) then raise exception 'ทำได้เฉพาะตัวแทนของตำบลนี้'; end if;
  if p_open and exists (select 1 from public.profiles p where p.id = m.profile_id and p.suspended_at is not null) then
    raise exception 'ร้านนี้ถูกระงับอยู่ ต้องคืนสิทธิ์ก่อน';
  end if;
  if m.is_open = p_open then return; end if;
  update public.merchants set is_open = p_open where id = m.id;
  insert into public.admin_actions (actor_id, target_id, action, note)
  values (auth.uid(), m.profile_id, case when p_open then 'shop.open' else 'shop.close' end,
          format('%s ร้าน %s', case when p_open then 'เปิด' else 'ปิดชั่วคราว' end, m.name));
end;
$$;


ALTER FUNCTION "public"."admin_set_shop_open"("p_merchant_id" "uuid", "p_open" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_set_suspended"("p_profile_id" "uuid", "p_suspend" boolean, "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  t public.profiles%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into t from public.profiles where id = p_profile_id for update;
  if not found then raise exception 'ไม่พบบัญชี'; end if;
  if not public.can_admin_tambon(t.tambon_id) then raise exception 'ทำได้เฉพาะตัวแทนของตำบลนี้'; end if;
  if t.id = auth.uid() then raise exception 'ระงับบัญชีตัวเองไม่ได้'; end if;
  if t.role not in ('driver', 'merchant') then raise exception 'ระงับได้เฉพาะร้านค้าและไรเดอร์'; end if;
  if exists (select 1 from public.admin_scopes s where s.profile_id = t.id) and not public.is_superadmin() then
    raise exception 'บัญชีนี้เป็นตัวแทนตำบล ต้องให้ส่วนกลางจัดการ';
  end if;

  if p_suspend then
    if t.suspended_at is not null then raise exception 'บัญชีนี้ถูกระงับอยู่แล้ว'; end if;
    if char_length(v_reason) < 5 then raise exception 'กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร'; end if;
    update public.profiles
       set approved = false, suspended_at = now(), suspended_reason = left(v_reason, 300), suspended_by = auth.uid()
     where id = t.id;
    update public.drivers set is_online = false where profile_id = t.id;
    update public.merchants set is_open = false where profile_id = t.id;
    insert into public.admin_actions (actor_id, target_id, action, note)
    values (auth.uid(), t.id, 'profile.suspend', left(format('ระงับ %s (%s) เหตุผล: %s', t.full_name, t.role, v_reason), 1000));
  else
    if t.suspended_at is null then raise exception 'บัญชีนี้ไม่ได้ถูกระงับ'; end if;
    update public.profiles
       set approved = true, suspended_at = null, suspended_reason = null, suspended_by = null
     where id = t.id;
    insert into public.admin_actions (actor_id, target_id, action, note)
    values (auth.uid(), t.id, 'profile.restore',
            left(format('คืนสิทธิ์ %s (%s)%s', t.full_name, t.role,
                        case when v_reason <> '' then ' หมายเหตุ: ' || v_reason else '' end), 1000));
  end if;
end;
$$;


ALTER FUNCTION "public"."admin_set_suspended"("p_profile_id" "uuid", "p_suspend" boolean, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_stats_snapshot"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    AS $$
  select jsonb_build_object(
    'generated_at', now(),
    'orders_total', (select count(*) from public.orders where not is_test),
    'orders_today', (select count(*) from public.orders where not is_test and created_at >= date_trunc('day', now())),
    'orders_by_status', (select coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb) from (select status, count(*) cnt from public.orders where not is_test group by status) s),
    'orders_by_type', (select coalesce(jsonb_object_agg(type, cnt), '{}'::jsonb) from (select type, count(*) cnt from public.orders where not is_test group by type) t),
    'merchants_total', (select count(*) from public.merchants where not is_test),
    'merchants_pending_approval', (select count(*) from public.profiles where role = 'merchant' and approved = false and not is_test),
    'drivers_total', (select count(*) from public.drivers d where not exists (select 1 from public.profiles p where p.id = d.profile_id and p.is_test)),
    'drivers_pending_approval', (select count(*) from public.profiles where role = 'driver' and approved = false and not is_test),
    'drivers_online_now', (select count(*) from public.drivers d where d.is_online = true and not exists (select 1 from public.profiles p where p.id = d.profile_id and p.is_test)),
    'job_seekers_total', (select count(*) from public.job_seekers),
    'profiles_by_role', (select coalesce(jsonb_object_agg(role, cnt), '{}'::jsonb) from (select role, count(*) cnt from public.profiles where not is_test group by role) p),
    'places_total', (select count(*) from public.places),
    'recent_orders', (
      select coalesce(jsonb_agg(o), '[]'::jsonb) from (
        select id, type, status, price, created_at from public.orders where not is_test order by created_at desc limit 5
      ) o
    ),
    -- นโยบาย D28 ข้อ 4: ข้อมูลทดสอบแสดงแยก ไม่ปนในตัวเลขข้างบน
    'test_data', jsonb_build_object(
      'orders', (select count(*) from public.orders where is_test),
      'profiles', (select count(*) from public.profiles where is_test),
      'merchants', (select count(*) from public.merchants where is_test))
  );
$$;


ALTER FUNCTION "public"."admin_stats_snapshot"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."admin_stats_snapshot"() IS 'Returns a live snapshot of key system counts/status for the admin AI assistant to ground answers in real data. Called via PostgREST RPC from n8n.';



CREATE OR REPLACE FUNCTION "public"."admin_tambon_complaints"("p_tambon_id" "uuid") RETURNS TABLE("id" "uuid", "ticket_no" "text", "subject" "text", "place" "text", "detail" "text", "category" "text", "urgency" "text", "ai_summary" "text", "suggested_agency" "text", "status" "text", "public_title" "text", "reporter_name" "text", "reporter_phone" "text", "is_test" boolean, "created_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if not public.can_admin_tambon(p_tambon_id) then raise exception 'ทำได้เฉพาะตัวแทนของตำบลนี้'; end if;
  return query
    select c.id, c.ticket_no, c.subject, c.place, c.detail, c.category, c.urgency, c.ai_summary, c.suggested_agency,
           c.status, c.public_title,
           case when c.disclose_identity then c.reporter_name end,
           case when c.disclose_identity then c.reporter_phone end,
           c.is_test, c.created_at, c.updated_at
      from public.complaints c
     where c.tambon_id = p_tambon_id
     order by c.created_at desc
     limit 200;
end;
$$;


ALTER FUNCTION "public"."admin_tambon_complaints"("p_tambon_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_complaint"("p_id" "uuid", "p_status" "text", "p_note" "text" DEFAULT NULL::"text", "p_public_title" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  c public.complaints%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_title text := nullif(btrim(coalesce(p_public_title, '')), '');
begin
  select * into c from public.complaints where id = p_id for update;
  if not found then raise exception 'ไม่พบเรื่อง'; end if;
  if not public.can_admin_tambon(c.tambon_id) then raise exception 'ทำได้เฉพาะตัวแทนของตำบลนี้'; end if;
  if p_status not in ('received', 'reviewing', 'forwarded', 'answered', 'closed', 'rejected') then raise exception 'สถานะไม่ถูกต้อง'; end if;
  if v_title is not null and p_status not in ('answered', 'closed') then
    raise exception 'แสดงหัวเรื่องบนหน้าตำบลได้เฉพาะเรื่องที่แก้แล้ว';
  end if;

  update public.complaints
     set status = p_status,
         public_title = case when p_status in ('answered', 'closed') then v_title end,
         public_title_by = case when p_status in ('answered', 'closed') and v_title is not null then auth.uid() end,
         public_title_at = case when p_status in ('answered', 'closed') and v_title is not null then now() end
   where id = p_id;

  if p_status is distinct from c.status or v_note is not null then
    insert into public.complaint_updates (complaint_id, status, note, is_public, created_by)
    values (p_id, p_status, left(v_note, 1000), true, 'agent:' || auth.uid());
  end if;

  insert into public.admin_actions (actor_id, target_id, action, note)
  values (auth.uid(), null, 'complaint.update',
          left(format('เรื่อง %s: %s → %s%s', c.ticket_no, c.status, p_status, coalesce(' หัวเรื่องสาธารณะ: ' || v_title, '')), 1000));
end;
$$;


ALTER FUNCTION "public"."admin_update_complaint"("p_id" "uuid", "p_status" "text", "p_note" "text", "p_public_title" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agent_dashboard"("p_tambon_id" "uuid", "p_status" "text" DEFAULT 'open'::"text", "p_offset" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare result jsonb; day_start timestamptz:=date_trunc('day',now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok';
begin
 if not public.agent_dashboard_access(p_tambon_id) then raise exception 'พื้นที่นี้ไม่มีสิทธิ์ กรุณาเข้าสู่ระบบด้วยรหัสผ่าน' using errcode='42501'; end if;
 if p_status not in ('open','todo','doing','waiting','done') or p_status is null or p_offset is null or p_offset<0 or p_offset>1000000 then raise exception 'ตัวกรองไม่ถูกต้อง' using errcode='22023'; end if;
 select jsonb_build_object(
   'area',jsonb_build_object('id',t.id,'name',t.name,'slug',t.slug,'intake_blocked',t.intake_blocked),
   'counts',jsonb_build_object(
     'today_orders',(select count(*) from public.orders where tambon_id=t.id and not is_test and created_at>=day_start),
     'active_orders',(select count(*) from public.orders where tambon_id=t.id and not is_test and status in ('pending','accepted','in_progress')),
     'delivered_today',(select count(*) from public.orders where tambon_id=t.id and not is_test and status='delivered' and delivered_at>=day_start),
     'awaiting_payment',(select count(*) from public.orders where tambon_id=t.id and not is_test and status not in ('delivered','cancelled') and payment_method<>'เงินสดปลายทาง' and customer_paid_at is null),
     'pending_payouts',(select count(*) from public.settlements where tambon_id=t.id and paid_out_at is null),
     'payout_amount',(select coalesce(sum(amount),0) from public.settlements where tambon_id=t.id and paid_out_at is null),
     'shops',(select count(*) from public.merchants where tambon_id=t.id and not is_test),
     'open_shops',(select count(*) from public.merchants m where m.tambon_id=t.id and not m.is_test and public.shop_is_open(m.id)),
     'online_drivers',(select count(*) from public.profiles p join public.drivers d on d.profile_id=p.id where p.tambon_id=t.id and not p.is_test and p.approved and p.suspended_at is null and d.is_online),
     'pending_members',(select count(*) from public.profiles p where p.tambon_id=t.id and not p.is_test and not p.approved and p.role in ('driver','merchant')),
     'open_messages',(select count(*) from public.messages m where not m.is_test and (m.to_tambon_id=t.id or m.from_tambon_id=t.id) and m.status not in ('closed','resolved'))),
   'tasks',coalesce((select jsonb_agg(to_jsonb(w) order by w.updated_at desc) from (select * from public.agent_work_items where tambon_id=t.id and (case when p_status='open' then status<>'done' else status=p_status end) order by updated_at desc,id limit 100 offset p_offset) w),'[]'::jsonb),
   'task_counts',(select jsonb_build_object('todo',count(*) filter(where status='todo'),'doing',count(*) filter(where status='doing'),'waiting',count(*) filter(where status='waiting'),'done',count(*) filter(where status='done')) from public.agent_work_items where tambon_id=t.id),
   'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from (select id,task_id,action,status,note,created_at from public.agent_work_events where tambon_id=t.id order by created_at desc limit 50) e),'[]'::jsonb),
   'orders',coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at) from (select id,type,status,customer_paid_at is not null as paid,payment_method<>'เงินสดปลายทาง' as needs_payment,merchant_accepted_at is not null as shop_accepted,food_ready_at is not null as food_ready,driver_id is not null as driver_assigned,is_drill,created_at from public.orders where tambon_id=t.id and (not is_test or is_drill) and status in ('pending','accepted','in_progress') order by created_at limit 20) o),'[]'::jsonb)
 ) into result from public.tambons t where t.id=p_tambon_id;
 return result;
end;
$$;


ALTER FUNCTION "public"."agent_dashboard"("p_tambon_id" "uuid", "p_status" "text", "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agent_dashboard_access"("p_tambon_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
 select auth.uid() is not null
   and coalesce(public.can_admin_tambon(p_tambon_id),false)
   and exists(select 1 from public.profiles p where p.id=auth.uid() and p.approved and p.suspended_at is null)
   and public.backoffice_session_valid() is true;
$$;


ALTER FUNCTION "public"."agent_dashboard_access"("p_tambon_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agent_dashboard_areas"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'slug',t.slug) order by t.name),'[]'::jsonb)
 from public.tambons t where public.agent_dashboard_access(t.id);
$$;


ALTER FUNCTION "public"."agent_dashboard_areas"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agent_memory_snapshot"("p_tambon_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare d jsonb; s jsonb;
begin
 d:=public.agent_dashboard(p_tambon_id);
 s:=jsonb_build_object('tambon_id',p_tambon_id,'day',to_char(now() at time zone 'Asia/Bangkok','YYYY-MM-DD'),
 'counts',(d->'counts')-'payout_amount','task_counts',d->'task_counts',
 'last_work_change',(select max(updated_at) from public.agent_work_items where tambon_id=p_tambon_id));
 return jsonb_build_object('revision',md5(s::text),'summary',s);
end;
$$;


ALTER FUNCTION "public"."agent_memory_snapshot"("p_tambon_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agent_refund_done"("p_order_id" bigint, "p_note" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_tambon uuid;
begin
  select tambon_id into v_tambon from public.order_refunds where order_id = p_order_id;
  if not found then raise exception 'ไม่พบรายการคืนเงิน' using errcode = '22023'; end if;
  if not public.agent_dashboard_access(v_tambon) then raise exception 'ไม่มีสิทธิ์ในพื้นที่นี้' using errcode = '42501'; end if;
  update public.order_refunds
     set status = 'done', refunded_at = coalesce(refunded_at, now()), refunded_by = coalesce(refunded_by, auth.uid()),
         note = left(nullif(btrim(coalesce(p_note, '')), ''), 200)
   where order_id = p_order_id;
  return jsonb_build_object('ok', true);
end $$;


ALTER FUNCTION "public"."agent_refund_done"("p_order_id" bigint, "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agent_refunds"("p_tambon_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.agent_dashboard_access(p_tambon_id) then raise exception 'ไม่มีสิทธิ์ในพื้นที่นี้' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'order_id', r.order_id, 'amount', r.amount, 'payment_method', r.payment_method, 'reason', r.reason,
             'status', r.status, 'created_at', r.created_at, 'refunded_at', r.refunded_at,
             'customer', p.full_name, 'phone', p.phone)
           order by (r.status = 'pending') desc, r.created_at desc)
      from (select * from public.order_refunds
             where tambon_id = p_tambon_id and (status = 'pending' or refunded_at > now() - interval '7 days')
             order by created_at desc limit 50) r
      join public.orders o on o.id = r.order_id
      left join public.profiles p on p.id = o.customer_id), '[]'::jsonb);
end $$;


ALTER FUNCTION "public"."agent_refunds"("p_tambon_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agent_work_save"("p_tambon_id" "uuid", "p_request_id" "uuid", "p_title" "text", "p_detail" "text", "p_category" "text", "p_due_on" "date" DEFAULT NULL::"date", "p_order_id" bigint DEFAULT NULL::bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v public.agent_work_items;
begin
 if not public.agent_dashboard_access(p_tambon_id) then raise exception 'พื้นที่นี้ไม่มีสิทธิ์ กรุณาเข้าสู่ระบบด้วยรหัสผ่าน' using errcode='42501'; end if;
 if p_order_id is not null and not exists(select 1 from public.orders where id=p_order_id and tambon_id=p_tambon_id and not is_test) then
   raise exception 'ออเดอร์ไม่อยู่ในพื้นที่' using errcode='22023';
 end if;
 insert into public.agent_work_items(id,tambon_id,title,detail,category,due_on,order_id,created_by,updated_by)
 values(p_request_id,p_tambon_id,btrim(p_title),btrim(p_detail),p_category,p_due_on,p_order_id,auth.uid(),auth.uid())
 on conflict(id) do nothing returning * into v;
 if v.id is null then
   select * into v from public.agent_work_items where id=p_request_id;
   if v.tambon_id<>p_tambon_id or v.created_by<>auth.uid() or v.title<>btrim(p_title) or v.detail<>btrim(p_detail) or v.category<>p_category
     or v.due_on is distinct from p_due_on or v.order_id is distinct from p_order_id then
     raise exception 'รายการซ้ำแต่รายละเอียดต่างกัน กรุณาตรวจใหม่' using errcode='22023';
   end if;
   return to_jsonb(v);
 end if;
 insert into public.agent_work_events(id,task_id,tambon_id,actor_id,action,status,note)
 values(p_request_id,v.id,v.tambon_id,auth.uid(),'create',v.status,v.detail);
 return to_jsonb(v);
end;
$$;


ALTER FUNCTION "public"."agent_work_save"("p_tambon_id" "uuid", "p_request_id" "uuid", "p_title" "text", "p_detail" "text", "p_category" "text", "p_due_on" "date", "p_order_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."agent_work_update"("p_task_id" "uuid", "p_request_id" "uuid", "p_version" integer, "p_action" "text", "p_note" "text" DEFAULT ''::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v public.agent_work_items; e public.agent_work_events; next_status text;
begin
 select * into v from public.agent_work_items where id=p_task_id for update;
 if v.id is null or not public.agent_dashboard_access(v.tambon_id) then raise exception 'พื้นที่นี้ไม่มีสิทธิ์' using errcode='42501'; end if;
 select * into e from public.agent_work_events where id=p_request_id;
 if e.id is not null then
   if e.task_id is distinct from v.id or e.actor_id is distinct from auth.uid() or e.action is distinct from p_action or e.note is distinct from btrim(p_note) then raise exception 'คำขอซ้ำไม่ตรงรายการเดิม' using errcode='22023'; end if;
   return to_jsonb(v);
 end if;
 if v.version is distinct from p_version then raise exception 'มีผู้แก้รายการนี้แล้ว กรุณาอัปเดตข้อมูลก่อน' using errcode='PT409'; end if;
 if char_length(p_note)>2000 then raise exception 'บันทึกยาวเกินกำหนด' using errcode='22023'; end if;
 if p_action='wait' and char_length(btrim(p_note))<5 then raise exception 'กรุณาระบุสิ่งที่รอ' using errcode='22023'; end if;
 if p_action='note' and char_length(btrim(p_note))<3 then raise exception 'กรุณาเขียนความคืบหน้า' using errcode='22023'; end if;
 next_status:=case p_action when 'start' then 'doing' when 'wait' then 'waiting' when 'done' then 'done' when 'reopen' then 'todo' when 'note' then v.status else null end;
 if next_status is null then raise exception 'ไม่พบปุ่มจัดการนี้' using errcode='22023'; end if;
 update public.agent_work_items set status=next_status,updated_by=auth.uid(),updated_at=now(),version=version+1 where id=v.id returning * into v;
 insert into public.agent_work_events(id,task_id,tambon_id,actor_id,action,status,note)
 values(p_request_id,v.id,v.tambon_id,auth.uid(),p_action,v.status,btrim(p_note));
 return to_jsonb(v);
end;
$$;


ALTER FUNCTION "public"."agent_work_update"("p_task_id" "uuid", "p_request_id" "uuid", "p_version" integer, "p_action" "text", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ai_budget_check"("p_profile" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  c_limit_thb constant numeric := 300;
  v_period text := to_char(now() at time zone 'Asia/Bangkok', 'YYYY-MM');
  v_used numeric;
begin
  if not public.ai_is_admin_profile(p_profile) then
    return jsonb_build_object('allowed', false, 'reason', 'not_admin');
  end if;
  select coalesce(sum(l.cost_thb), 0) into v_used
    from public.ai_usage_ledger l
   where l.profile_id = p_profile and l.period = v_period;
  return jsonb_build_object(
    'allowed', v_used < c_limit_thb,
    'used_thb', v_used,
    'remaining_thb', greatest(c_limit_thb - v_used, 0),
    'limit_thb', c_limit_thb,
    'period', v_period);
end $$;


ALTER FUNCTION "public"."ai_budget_check"("p_profile" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ai_is_admin_profile"("p_profile" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (select 1 from public.profiles p
                  where p.id = p_profile and coalesce(p.approved, false) and p.role in ('admin', 'superadmin'))
      or exists (select 1 from public.admin_scopes s where s.profile_id = p_profile);
$$;


ALTER FUNCTION "public"."ai_is_admin_profile"("p_profile" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ai_upsert_tambon_items"("p_tambon_id" "uuid", "p_items" "jsonb", "p_run" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  it jsonb;
  v_added int := 0;
  v_refreshed int := 0;
  v_rejected int := 0;
  v_received int := 0;
  v_key text;
  v_kind text;
  v_title text;
  v_url text;
  v_ttl interval;
  v_inserted boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'ไม่มีสิทธิ์'; end if;
  if not exists (select 1 from public.tambons where id = p_tambon_id and ai_content_enabled) then
    raise exception 'ตำบลนี้ไม่ได้เปิดให้ AI ทำข้อมูล';
  end if;

  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_received := v_received + 1;
    exit when v_received > 80;
    v_kind := it->>'kind';
    v_title := btrim(coalesce(it->>'title', ''));
    v_url := btrim(coalesce(it->>'source_url', ''));
    if v_kind not in ('news', 'event', 'place', 'product', 'tradition', 'fact', 'education', 'industry', 'food', 'health', 'shopping')
       or char_length(v_title) < 3 or v_url !~* '^https?://' then
      v_rejected := v_rejected + 1;
      continue;
    end if;
    v_key := md5(v_kind || '|' || lower(regexp_replace(v_title, '\s+', '', 'g')));
    -- ข่าว/กิจกรรมหมดอายุเร็ว ข้อมูลคงที่อยู่นาน
    v_ttl := case when v_kind in ('news', 'event') then interval '30 days' else interval '120 days' end;

    insert into public.tambon_ai_items as t
      (tambon_id, kind, title, summary, source_url, source_name, event_date, content_key, expires_at)
    values (p_tambon_id, v_kind, left(v_title, 160), left(coalesce(it->>'summary', ''), 800), left(v_url, 500),
            nullif(left(coalesce(it->>'source_name', ''), 120), ''),
            case when (it->>'event_date') ~ '^\d{4}-\d{2}-\d{2}$' then (it->>'event_date')::date end,
            v_key, now() + v_ttl)
    on conflict (tambon_id, content_key) do update
      set summary = excluded.summary,
          source_url = excluded.source_url,
          source_name = excluded.source_name,
          event_date = coalesce(excluded.event_date, t.event_date),
          refreshed_at = now(),
          expires_at = excluded.expires_at
    returning (xmax = 0) into v_inserted;
    if v_inserted then v_added := v_added + 1; else v_refreshed := v_refreshed + 1; end if;
  end loop;

  insert into public.tambon_ai_runs
    (tambon_id, model, input_tokens, output_tokens, cost_usd, items_received, items_added, items_refreshed,
     items_rejected, status, error, n8n_execution_id)
  values (p_tambon_id, p_run->>'model', nullif(p_run->>'input_tokens', '')::int, nullif(p_run->>'output_tokens', '')::int,
          nullif(p_run->>'cost_usd', '')::numeric, v_received, v_added, v_refreshed,
          v_rejected + coalesce(nullif(p_run->>'rejected_before', '')::int, 0),
          coalesce(nullif(p_run->>'status', ''), 'ok'), left(p_run->>'error', 1000), p_run->>'n8n_execution_id');

  return jsonb_build_object('received', v_received, 'added', v_added, 'refreshed', v_refreshed, 'rejected', v_rejected);
end;
$_$;


ALTER FUNCTION "public"."ai_upsert_tambon_items"("p_tambon_id" "uuid", "p_items" "jsonb", "p_run" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ai_usage_record"("p_profile" "uuid", "p_feature" "text", "p_model" "text", "p_cost_usd" numeric, "p_thb_per_usd" numeric) RETURNS numeric
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_thb numeric;
begin
  if not public.ai_is_admin_profile(p_profile) then
    raise exception 'not an admin profile' using errcode = '42501';
  end if;
  if p_cost_usd is null or p_cost_usd < 0 or p_thb_per_usd is null or p_thb_per_usd <= 0 then
    raise exception 'bad cost or rate' using errcode = '22023';
  end if;
  v_thb := round(p_cost_usd * p_thb_per_usd, 2);
  insert into public.ai_usage_ledger (profile_id, feature, model, cost_usd, cost_thb)
    values (p_profile, p_feature, p_model, p_cost_usd, v_thb);
  return v_thb;
end $$;


ALTER FUNCTION "public"."ai_usage_record"("p_profile" "uuid", "p_feature" "text", "p_model" "text", "p_cost_usd" numeric, "p_thb_per_usd" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_tambon_application"("app_id" "uuid", "tambon_slug" "text", "review_note" "text" DEFAULT NULL::"text", "p_make_applicant_admin" boolean DEFAULT false) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."approve_tambon_application"("app_id" "uuid", "tambon_slug" "text", "review_note" "text", "p_make_applicant_admin" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_tambon_application_line"("app_id" "uuid", "tambon_slug" "text", "caller_line_user_id" "text", "review_note" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  a public.tambon_applications;
  new_id uuid;
  owner_id constant uuid := '9300feca-0701-4626-8f74-ec95e6cc4670';
begin
  if caller_line_user_id is null or not exists (
    select 1 from public.profiles p
    where p.id = owner_id and p.line_user_id = caller_line_user_id
  ) then
    raise exception 'ผู้กดไม่ใช่เจ้าของ' using errcode = '42501';
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

  -- สร้างแบบยังไม่เปิดบริการเสมอ เหมือน approve_tambon_application
  insert into public.tambons (name, district, province, code, slug, is_active)
  values (a.tambon_name, a.district, a.province, a.tambon_code, btrim(tambon_slug), false)
  returning id into new_id;

  insert into public.tambon_profiles (tambon_id) values (new_id);

  update public.tambon_applications
     set status = 'approved',
         reviewed_by = owner_id,
         reviewed_at = now(),
         review_note = approve_tambon_application_line.review_note,
         created_tambon_id = new_id
   where id = app_id;

  return new_id;
end $$;


ALTER FUNCTION "public"."approve_tambon_application_line"("app_id" "uuid", "tambon_slug" "text", "caller_line_user_id" "text", "review_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auth_user_id_for_line"("p_line_user_id" "text", "p_alias_email" "text") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'pg_temp'
    AS $$
  select coalesce(
    -- ผูกไว้แล้วกับบัญชีจริง — ต้องมีแถวใน auth.users ด้วย ไม่ใช่แค่มีโปรไฟล์
    (select p.id
       from public.profiles p
       join auth.users u on u.id = p.id
      where p.line_user_id = p_line_user_id
      limit 1),
    -- ยังไม่ผูก — หาด้วยอีเมลแฝงที่คำนวณจาก LINE user id
    (select u.id
       from auth.users u
      where lower(u.email) = lower(p_alias_email)
      limit 1));
$$;


ALTER FUNCTION "public"."auth_user_id_for_line"("p_line_user_id" "text", "p_alias_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."backoffice_session_valid"() RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare session_text text:=auth.jwt()->>'session_id'; session_uuid uuid;
begin
 if auth.uid() is null or coalesce(session_text,'') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
 session_uuid:=session_text::uuid;
 return exists (
   select 1 from auth.sessions s join auth.users u on u.id=s.user_id
   where s.id=session_uuid and s.user_id=auth.uid()
     and (s.not_after is null or s.not_after>now())
     and (u.banned_until is null or u.banned_until<=now())
     and exists (
      select 1 from auth.mfa_amr_claims c where c.session_id=s.id and (
       c.authentication_method='password'
       or (c.authentication_method='otp' and exists (
        select 1 from public.profiles p where p.id=u.id
          and p.line_user_id ~ '^U[0-9a-fA-F]{32}$'
          and u.raw_app_meta_data->>'line_user_id'=p.line_user_id
       ))
      )
     )
  );
end;
$_$;


ALTER FUNCTION "public"."backoffice_session_valid"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."backoffice_session_valid"() IS 'Active own session: password or LINE OTP with service-controlled app_metadata matching the profile. Never trust user_metadata or a supplied LINE ID.';



CREATE OR REPLACE FUNCTION "public"."base36"("p" bigint) RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare
  d text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  n bigint := p;
  result text := '';
begin
  if n is null then return null; end if;
  if n = 0 then return '0'; end if;
  while n > 0 loop
    result := substr(d, (n % 36)::int + 1, 1) || result;
    n := n / 36;
  end loop;
  return result;
end $$;


ALTER FUNCTION "public"."base36"("p" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."block_orders_when_intake_blocked"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare v_blocked boolean; v_reason text;
begin
  select intake_blocked, intake_blocked_reason into v_blocked, v_reason
  from public.tambons where id = new.tambon_id;
  if coalesce(v_blocked, false) then
    raise exception 'ตำบลนี้หยุดรับออเดอร์ชั่วคราว: %', coalesce(v_reason, 'ยอดค้างจ่ายเกินกำหนด');
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."block_orders_when_intake_blocked"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calc_delivery_fee"("distance_km" double precision) RETURNS numeric
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select case
    when distance_km is null then 15::numeric  -- fallback flat fee when no coordinates available yet
    else greatest(15, round((10 + distance_km * 5)::numeric, 0))
  end;
$$;


ALTER FUNCTION "public"."calc_delivery_fee"("distance_km" double precision) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."calc_delivery_fee"("distance_km" double precision) IS 'MVP delivery fee formula: base 10 baht + 5 baht/km (Haversine straight-line), minimum 15 baht. Placeholder rate pending Pittaya''s real pricing decision — easy to tune in one place.';



CREATE OR REPLACE FUNCTION "public"."can_admin_profile"("p" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select public.can_admin_tambon((select tambon_id from public.profiles where id = p))
      or (public.has_national_scope()
          and exists (select 1 from public.profiles x where x.id = p));
$$;


ALTER FUNCTION "public"."can_admin_profile"("p" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_admin_tambon"("t" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select public.has_national_scope()
      or (t is not null and (
            exists (select 1 from public.profiles p
                     where p.id = auth.uid() and p.role = 'admin'
                       and coalesce(p.approved, false) and p.tambon_id = t)
         or exists (select 1 from public.admin_scopes s
                     where s.profile_id = auth.uid() and s.tambon_id = t)));
$$;


ALTER FUNCTION "public"."can_admin_tambon"("t" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cashbook_can_access"("p_scope" "text", "p_owner" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
 select exists(select 1 from public.profiles where id=auth.uid() and suspended_at is null
 and ((p_scope='personal' and p_owner=auth.uid()) or (p_scope='delivery' and role='superadmin' and public.backoffice_session_valid())));
$$;


ALTER FUNCTION "public"."cashbook_can_access"("p_scope" "text", "p_owner" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cashbook_month"("p_scope" "text", "p_month" "date", "p_page" integer DEFAULT 0) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare v_start date:=date_trunc('month',p_month)::date; v_result jsonb;
begin
 if p_scope not in ('personal','delivery') or p_scope is null or p_month is null or p_page<0 or p_page>100000 then raise exception 'ช่วงรายงานไม่ถูกต้อง' using errcode='22023'; end if;
 if not public.cashbook_can_access(p_scope,auth.uid()) then raise exception 'ไม่มีสิทธิ์เปิดสมุดบัญชีนี้' using errcode='42501'; end if;
 with entries as materialized (
 select * from public.cashbook_entries where scope=p_scope and entry_date>=v_start and entry_date<(v_start+interval '1 month')
 ), totals as (
 select count(*) as count,coalesce(sum(amount) filter(where kind='income' and voided_at is null),0) as income,
 coalesce(sum(amount) filter(where kind='expense' and voided_at is null),0) as expense from entries
 ), page as (select * from entries order by entry_date desc,created_at desc,id desc limit 50 offset p_page*50)
 select jsonb_build_object('count',totals.count,'income',totals.income,'expense',totals.expense,'entries',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb)) into v_result from totals;
 return v_result;
end $$;


ALTER FUNCTION "public"."cashbook_month"("p_scope" "text", "p_month" "date", "p_page" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cashbook_record"("p_scope" "text", "p_date" "date", "p_kind" "text", "p_amount" numeric, "p_category" "text", "p_note" "text", "p_request" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare v_id uuid;
begin
 if p_amount is null or p_amount<>round(p_amount,2) then raise exception 'จำนวนเงินต้องมีไม่เกินสองตำแหน่งทศนิยม' using errcode='22023'; end if;
 select id into v_id from public.cashbook_entries where created_by=auth.uid() and request_id=p_request;
 if v_id is not null then
 if not exists(select 1 from public.cashbook_entries where id=v_id and scope=p_scope and entry_date=p_date and kind=p_kind and amount=p_amount and category=btrim(p_category) and note=coalesce(p_note,'')) then raise exception 'รหัสคำขอเดิมมีข้อมูลต่างกัน' using errcode='22023'; end if;
 return v_id; end if;
 insert into public.cashbook_entries(scope,owner_id,entry_date,kind,amount,category,note,request_id)
 values(p_scope,auth.uid(),p_date,p_kind,p_amount,btrim(p_category),coalesce(p_note,''),p_request) returning id into v_id;
 return v_id;
end $$;


ALTER FUNCTION "public"."cashbook_record"("p_scope" "text", "p_date" "date", "p_kind" "text", "p_amount" numeric, "p_category" "text", "p_note" "text", "p_request" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cashbook_void"("p_id" "uuid", "p_reason" "text") RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
 update public.cashbook_entries set voided_at=now(),void_reason=btrim(p_reason) where id=p_id and voided_at is null;
 return found;
end $$;


ALTER FUNCTION "public"."cashbook_void"("p_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cashbook_void_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
 if old.voided_at is not null or new.voided_at is null or length(btrim(coalesce(new.void_reason,''))) not between 1 and 500 then
 raise exception 'ยกเลิกได้ครั้งเดียวและต้องระบุเหตุผล' using errcode='22023'; end if;
 new.voided_at:=now(); new.voided_by:=auth.uid(); return new;
end $$;


ALTER FUNCTION "public"."cashbook_void_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."central_admin_line_ids"() RETURNS "text"[]
    LANGUAGE "sql" IMMUTABLE
    AS $$ select array['U2bb9719524e34535d1a2e1ee3422f74d']::text[] $$;


ALTER FUNCTION "public"."central_admin_line_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clip_rule_add"("p_body" "text", "p_reason" "text") RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_body text := btrim(coalesce(p_body, ''));
  v_id bigint;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if char_length(v_body) not between 1 and 1000 then
    raise exception 'rule must be 1-1000 characters' using errcode = '22023';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'reason required' using errcode = '22023';
  end if;
  insert into public.clip_rules (body, created_by) values (v_body, auth.uid()) returning id into v_id;
  insert into public.admin_actions (actor_id, action, note)
    values (auth.uid(), 'clip_rule_add', left(btrim(p_reason), 480) || ' #' || v_id);
  return v_id;
end $$;


ALTER FUNCTION "public"."clip_rule_add"("p_body" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clip_rule_retire"("p_id" bigint, "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'reason required' using errcode = '22023';
  end if;
  update public.clip_rules set active = false, retired_by = auth.uid(), retired_at = now()
   where id = p_id and active;
  if not found then
    raise exception 'rule not found or already retired' using errcode = 'P0002';
  end if;
  insert into public.admin_actions (actor_id, action, note)
    values (auth.uid(), 'clip_rule_retire', left(btrim(p_reason), 480) || ' #' || p_id);
end $$;


ALTER FUNCTION "public"."clip_rule_retire"("p_id" bigint, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clip_rules_active"() RETURNS TABLE("id" bigint, "body" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select r.id, r.body from public.clip_rules r where r.active order by r.id;
$$;


ALTER FUNCTION "public"."clip_rules_active"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."compare_products_search"("p_query" "text") RETURNS TABLE("product_id" "uuid", "sku" "text", "name" "text", "image_url" "text", "prices" "jsonb")
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select
    p.id,
    p.sku,
    p.name,
    p.image_url,
    coalesce(
      jsonb_object_agg(
        l.platform,
        jsonb_build_object('price', pp.price, 'in_stock', pp.in_stock, 'url', l.affiliate_url)
      ) filter (where l.id is not null),
      '{}'::jsonb
    ) as prices
  from products p
  left join platform_listings l on l.product_id = p.id
  left join platform_prices pp on pp.listing_id = l.id
  where length(trim(p_query)) > 0
    and p.name ilike '%' || trim(p_query) || '%'
  group by p.id, p.sku, p.name, p.image_url
  order by p.name
  limit 10;
$$;


ALTER FUNCTION "public"."compare_products_search"("p_query" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complaints_fill_tambon"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if new.tambon_id is null and new.line_user_id is not null then
    select p.tambon_id into new.tambon_id from public.profiles p where p.line_user_id = new.line_user_id;
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."complaints_fill_tambon"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complaints_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin new.updated_at := now(); return new; end $$;


ALTER FUNCTION "public"."complaints_touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_customer_payment"("p_order_id" bigint, "p_slip_url" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  o public.orders%rowtype;
  v_due timestamptz;
  v_driver_amount numeric;
  v_merchant_profile uuid;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'ไม่พบออเดอร์'; end if;
  if o.customer_id <> auth.uid() then raise exception 'ยืนยันได้เฉพาะเจ้าของออเดอร์'; end if;
  if o.customer_paid_at is not null then raise exception 'ออเดอร์นี้ยืนยันการจ่ายไปแล้ว'; end if;
  if o.status <> 'delivered' then raise exception 'ยืนยันการจ่ายได้หลังได้รับของแล้วเท่านั้น'; end if;

  update public.orders
    set customer_paid_at = now(), customer_slip_url = p_slip_url
    where id = p_order_id;

  -- นโยบาย D28 ข้อ 4/8: ออเดอร์ทดสอบไม่สร้างยอดค้างจ่ายให้ร้านหรือไรเดอร์
  if not o.is_test then
    select public.next_payout_due(o.tambon_id) into v_due;

    -- ส่วนของร้าน = ค่าสินค้า
    if o.merchant_id is not null and coalesce(o.items_subtotal, 0) > 0 then
      select m.profile_id into v_merchant_profile from public.merchants m where m.id = o.merchant_id;
      if v_merchant_profile is not null then
        insert into public.settlements (order_id, tambon_id, payee_profile_id, payee_role, amount, due_at)
        values (o.id, o.tambon_id, v_merchant_profile, 'merchant', o.items_subtotal, v_due)
        on conflict (order_id, payee_profile_id) do nothing;
      end if;
    end if;

    -- ส่วนของไรเดอร์ = ค่าส่ง ยกเว้นงานเรียกรถที่ค่าโดยสารอยู่ในช่อง price
    v_driver_amount := case when o.type = 'ride' then coalesce(o.price, 0) else coalesce(o.delivery_fee, 0) end;
    if o.driver_id is not null and v_driver_amount > 0 then
      insert into public.settlements (order_id, tambon_id, payee_profile_id, payee_role, amount, due_at)
      values (o.id, o.tambon_id, o.driver_id, 'driver', v_driver_amount, v_due)
      on conflict (order_id, payee_profile_id) do nothing;
    end if;
  end if;

  perform public.refresh_intake_block(o.tambon_id);
end;
$$;


ALTER FUNCTION "public"."confirm_customer_payment"("p_order_id" bigint, "p_slip_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_payout_received"("p_settlement_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare s public.settlements%rowtype;
begin
  select * into s from public.settlements where id = p_settlement_id for update;
  if not found then raise exception 'ไม่พบรายการ'; end if;
  if s.payee_profile_id <> auth.uid() then raise exception 'ยืนยันได้เฉพาะเจ้าของรายการ'; end if;
  if s.paid_out_at is null then raise exception 'ตัวแทนยังไม่ได้โอนออก'; end if;

  update public.settlements set confirmed_at = now() where id = p_settlement_id;
end;
$$;


ALTER FUNCTION "public"."confirm_payout_received"("p_settlement_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."customer_chat_add"("p_line_user_id" "text", "p_question" "text", "p_answer" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_q text := left(btrim(coalesce(p_question, '')), 2000);
  v_a text := left(btrim(coalesce(p_answer, '')), 2000);
  v_now timestamptz := clock_timestamp();
begin
  if coalesce(p_line_user_id, '') = '' or v_q = '' or v_a = '' then
    return 0;
  end if;
  insert into public.customer_chat_turns (line_user_id, role, content, created_at)
  values (p_line_user_id, 'user', v_q, v_now),
         (p_line_user_id, 'assistant', v_a, v_now + interval '1 millisecond');
  return 2;
end;
$$;


ALTER FUNCTION "public"."customer_chat_add"("p_line_user_id" "text", "p_question" "text", "p_answer" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."customer_chat_add"("p_line_user_id" "text", "p_question" "text", "p_answer" "text", "p_memory" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if coalesce(p_line_user_id, '') = '' then
    return 0;
  end if;
  if p_memory = '' then
    delete from public.customer_memory where line_user_id = p_line_user_id;
    delete from public.customer_chat_turns where line_user_id = p_line_user_id;
    return 0;
  end if;
  if p_memory is not null then
    insert into public.customer_memory (line_user_id, notes, updated_at)
    values (p_line_user_id, left(p_memory, 1000), now())
    on conflict (line_user_id) do update set notes = excluded.notes, updated_at = excluded.updated_at;
  end if;
  return public.customer_chat_add(p_line_user_id, p_question, p_answer);
end;
$$;


ALTER FUNCTION "public"."customer_chat_add"("p_line_user_id" "text", "p_question" "text", "p_answer" "text", "p_memory" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."customer_chat_context"("p_line_user_id" "text", "p_limit" integer DEFAULT 6, "p_gap_minutes" integer DEFAULT 30) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_prev timestamptz := now();
  v_gap interval := make_interval(mins => least(greatest(coalesce(p_gap_minutes, 30), 1), 1440));
  v_turns jsonb := '[]'::jsonb;
  r record;
begin
  if coalesce(p_line_user_id, '') = '' then
    return jsonb_build_object('turns', v_turns);
  end if;
  for r in
    select t.role, t.content, t.created_at from public.customer_chat_turns t
     where t.line_user_id = p_line_user_id
     order by t.created_at desc, t.id desc
     limit least(greatest(coalesce(p_limit, 6), 0), 20)
  loop
    exit when v_prev - r.created_at > v_gap;
    v_turns := jsonb_build_object('role', r.role, 'content', r.content) || v_turns;
    v_prev := r.created_at;
  end loop;
  return jsonb_build_object('turns', v_turns);
end;
$$;


ALTER FUNCTION "public"."customer_chat_context"("p_line_user_id" "text", "p_limit" integer, "p_gap_minutes" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."customer_food_confirm"("p_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare u text;
begin
  select line_user_id into u from public.profiles where id=auth.uid() and suspended_at is null;
  if u is null then return jsonb_build_object('ok',false,'error','line_login_required'); end if;
  return public.food_chat_flow('confirm',u,p_token);
end $$;


ALTER FUNCTION "public"."customer_food_confirm"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."customer_food_review"("p_merchant_id" "uuid", "p_items" "jsonb", "p_point" "jsonb" DEFAULT NULL::"jsonb", "p_note" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare p public.profiles%rowtype; m public.merchants%rowtype; i jsonb; normalized jsonb:='[]'; point jsonb; r jsonb;
begin
  select * into p from public.profiles where id=auth.uid();
  if p.id is null or p.line_user_id is null then return jsonb_build_object('ok',false,'error','line_login_required'); end if;
  if p.suspended_at is not null then return jsonb_build_object('ok',false,'error','account_suspended'); end if;
  if nullif(btrim(p.phone),'') is null or length(btrim(coalesce(p.full_name,'')))<2 then return jsonb_build_object('ok',false,'error','registration_required'); end if;
  select mm.* into m from public.merchants mm join public.profiles owner on owner.id=mm.profile_id
    where mm.id=p_merchant_id and owner.approved and owner.suspended_at is null and (mm.is_test=p.is_test or (mm.is_test and p.llp_tester));
  if not found or not public.shop_open_at(m.is_open,m.hours_enabled,m.opening_hours) then return jsonb_build_object('ok',false,'error','shop_closed'); end if;
  if jsonb_typeof(p_items) is distinct from 'array' then return jsonb_build_object('ok',false,'error','bad_items'); end if;
  if jsonb_array_length(p_items) not between 1 and 50 then return jsonb_build_object('ok',false,'error','bad_items'); end if;
  for i in select value from jsonb_array_elements(p_items) loop
    if coalesce(i->>'id','') !~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$' or coalesce(i->>'qty','') !~ '^[0-9]{1,2}$'
      or (i->>'qty')::int not between 1 and 99 then return jsonb_build_object('ok',false,'error','bad_items'); end if;
    if exists(select 1 from jsonb_array_elements(normalized) x where x->>'id'=lower(i->>'id')) then
      return jsonb_build_object('ok',false,'error','bad_items'); end if;
    if not exists(select 1 from public.menu_items mi where mi.id=(i->>'id')::uuid and mi.merchant_id=m.id
      and mi.is_available and not coalesce(mi.is_hidden,false)) then return jsonb_build_object('ok',false,'error','item_unavailable'); end if;
    normalized:=normalized||jsonb_build_array(jsonb_build_object('id',lower(i->>'id'),'qty',(i->>'qty')::int));
  end loop;
  if p_point is not null then
    begin
      if not ((p_point->>'lat')::float8 between -90 and 90) or not ((p_point->>'lng')::float8 between -180 and 180)
        or p_point->>'lat' is null or p_point->>'lng' is null then return jsonb_build_object('ok',false,'error','bad_point'); end if;
      point:=jsonb_build_object('lat',(p_point->>'lat')::float8,'lng',(p_point->>'lng')::float8,
        'label',left(coalesce(nullif(btrim(p_point->>'label'),''),'จุดส่งที่เลือก'),500),'source','shared_location');
    exception when others then return jsonb_build_object('ok',false,'error','bad_point'); end;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('food-chat:'||p.line_user_id,0));
  if p.role='customer' and p.tambon_id is distinct from m.tambon_id then update public.profiles set tambon_id=m.tambon_id where id=p.id; end if;
  insert into public.carts(line_user_id,merchant_id,items,delivery_point,awaiting_location,customer_note)
    values(p.line_user_id,m.id,normalized,point,false,left(p_note,300))
    on conflict(line_user_id) do update set merchant_id=excluded.merchant_id,items=excluded.items,
      delivery_point=coalesce(excluded.delivery_point,carts.delivery_point),awaiting_location=false,
      checkout_quote=null,customer_note=excluded.customer_note,updated_at=now();
  r:=public.food_chat_flow('review',p.line_user_id);
  return r;
end $_$;


ALTER FUNCTION "public"."customer_food_review"("p_merchant_id" "uuid", "p_items" "jsonb", "p_point" "jsonb", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delivery_catalog"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."delivery_catalog"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delivery_command_execute"("p_ticket" "text", "p_signature" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare t jsonb; p jsonb; v_id uuid; v_order public.orders%rowtype;
  v_old private.delivery_command_receipts%rowtype; v_receipt jsonb;
begin
  if auth.uid() is null then
    raise exception 'Delivery login required' using errcode='42501';
  end if;
  if p_ticket is null or octet_length(p_ticket)>8000 or p_signature is null
     or p_signature is distinct from private.d25_sign('approval',p_ticket) then
    raise exception 'invalid approval signature' using errcode='42501';
  end if;
  t := p_ticket::jsonb; p := t->'payload';
  if t->>'issuer' is distinct from 'hermes-d25-v1' or t->>'audience' is distinct from 'delivery-d25-v1'
     or t->>'approved_by' is null or (t->>'expires_at')::bigint is null
     or (t->>'expires_at')::bigint < extract(epoch from clock_timestamp())
     or (t->>'expires_at')::bigint > extract(epoch from clock_timestamp() + interval '6 minutes')
     or p->>'project_id' is distinct from '4ecec344-ba76-48f3-89c1-b7cb230702d6'
     or (p->>'delivery_actor')::uuid is distinct from auth.uid()
     or p->>'action' is null or p->>'action' not in ('order.assign','order.cancel')
     or (p->>'order_id')::bigint is null or (p->>'order_id')::bigint <= 0
     or p->>'reason' is null or length(btrim(p->>'reason')) not between 5 and 500
     or (p->>'action'='order.assign') <> (p->>'driver_id' is not null) then
    raise exception 'invalid approval ticket' using errcode='42501';
  end if;
  v_id := (p->>'command_id')::uuid;
  if v_id is null then raise exception 'command ID required' using errcode='22023'; end if;
  -- Serialize duplicate commands before checking the durable receipt. UUID hash
  -- collisions only serialize unrelated calls; correctness comes from the PK.
  perform pg_advisory_xact_lock(hashtextextended(v_id::text,0));
  select * into v_order from public.orders where id=(p->>'order_id')::bigint for update;
  if not found then raise exception 'order not found' using errcode='P0002'; end if;
  if not exists(select 1 from public.profiles where id=auth.uid()
                and approved and suspended_at is null)
     or not public.can_admin_tambon(v_order.tambon_id) then
    raise exception 'wrong tambon' using errcode='42501';
  end if;
  select * into v_old from private.delivery_command_receipts where command_id=v_id;
  if found then
    if v_old.payload is distinct from p then raise exception 'command payload changed' using errcode='55000'; end if;
    return jsonb_build_object('body',v_old.receipt::text,'signature',private.d25_sign('receipt',v_old.receipt::text));
  end if;
  if p->>'action'='order.assign' then
    perform public.admin_assign_order(v_order.id,(p->>'driver_id')::uuid);
  else
    perform public.admin_cancel_order(v_order.id,p->>'reason');
  end if;
  v_receipt := jsonb_build_object('issuer','delivery-d25-v1','payload',p,
      'status','completed','completed_at',now());
  insert into private.delivery_command_receipts(command_id,payload,receipt) values(v_id,p,v_receipt);
  insert into public.admin_actions(actor_id,target_id,action,note)
  values(auth.uid(),auth.uid(),'command.execute',
      'Hermes command ' || v_id::text || ' ' || (p->>'action') || ' #' || v_order.id);
  return jsonb_build_object('body',v_receipt::text,'signature',private.d25_sign('receipt',v_receipt::text));
end $$;


ALTER FUNCTION "public"."delivery_command_execute"("p_ticket" "text", "p_signature" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delivery_fee_for"("p_tambon_id" "uuid", "p_distance_km" double precision) RETURNS numeric
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select coalesce(
    (select case
              when t.delivery_fee_base is not null
                then round((t.delivery_fee_base + coalesce(t.delivery_fee_per_km, 0) * coalesce(p_distance_km, 0))::numeric, 0)
            end
       from public.tambons t
      where t.id = p_tambon_id),
    public.calc_delivery_fee(p_distance_km)
  );
$$;


ALTER FUNCTION "public"."delivery_fee_for"("p_tambon_id" "uuid", "p_distance_km" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delivery_line_oa"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select jsonb_build_object(
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', day, 'source', source, 'tambon_id', tambon_id, 'n', n) order by day desc, source)
        from public.line_oa_daily
       where day >= (now() at time zone 'Asia/Bangkok')::date - 29), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'ticket', m.ticket_no, 'kind', m.kind, 'status', m.status,
               'from_name', coalesce(m.from_nickname, m.from_real_name), 'from_role', m.from_role,
               'from_tambon_id', m.from_tambon_id, 'to_tambon_id', m.to_tambon_id, 'to_hq', m.to_hq,
               'audience', m.audience, 'at', m.created_at) order by m.created_at desc)
        from (select * from public.messages
               where not is_test and status <> 'draft'
               order by created_at desc limit 200) m), '[]'::jsonb),
    'directives', coalesce((
      select jsonb_agg(jsonb_build_object(
               'ticket', x.ticket_no, 'kind', x.kind, 'title', x.title, 'conditions', x.conditions, 'status', x.status,
               'deadline', x.deadline_at, 'at', x.created_at,
               'targets', coalesce((select jsonb_agg(jsonb_build_object('tambon_id', t.tambon_id, 'state', t.state, 'note', t.note, 'decided_at', t.decided_at) order by t.tambon_id)
                                      from public.directive_targets t where t.directive_id = x.id), '[]'::jsonb)) order by x.created_at desc)
        from (select * from public.directives where not is_test order by created_at desc limit 30) x), '[]'::jsonb)
  );
$$;


ALTER FUNCTION "public"."delivery_line_oa"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delivery_overview"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select public.delivery_overview_core()
      || jsonb_build_object('line_oa', public.delivery_line_oa(), 'catalog', public.delivery_catalog());
$$;


ALTER FUNCTION "public"."delivery_overview"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delivery_overview_core"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  with real_profiles as (
    select * from public.profiles where not coalesce(is_test, false)
  ),
  real_merchants as (
    select m.*, p.line_user_id is not null as has_line, (nullif(btrim(coalesce(p.promptpay_id, '')), '') is not null or p.payment_qr_path is not null) as has_payout,
           (select count(*) from public.menu_items mi
             where mi.merchant_id = m.id and not coalesce(mi.is_hidden, false)) as menu_count
      from public.merchants m
      left join public.profiles p on p.id = m.profile_id
     where not coalesce(m.is_test, false)
  ),
  real_drivers as (
    select p.id, p.tambon_id, p.full_name, coalesce(p.approved, false) as approved,
           p.line_user_id is not null as has_line,
           coalesce(d.is_online, false) as is_online, d.vehicle_type, (nullif(btrim(coalesce(p.promptpay_id, '')), '') is not null or p.payment_qr_path is not null) as has_payout
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
            'with_menu', count(*) filter (where menu_count > 0), 'with_payout', count(*) filter (where has_payout),
            'list', coalesce(jsonb_agg(jsonb_build_object(
                'name', name, 'is_open', is_open, 'has_line', has_line,
                'has_gps', lat is not null and lng is not null, 'menu_count', menu_count, 'has_payout', has_payout)
              order by name), '[]'::jsonb))
          from real_merchants where tambon_id = t.id),
        'drivers', (select jsonb_build_object(
            'total', count(*),
            'approved', count(*) filter (where approved),
            'with_line', count(*) filter (where has_line),
            'online', count(*) filter (where is_online), 'with_payout', count(*) filter (where has_payout),
            'list', coalesce(jsonb_agg(jsonb_build_object(
                'name', full_name, 'approved', approved, 'has_line', has_line,
                'is_online', is_online, 'vehicle_type', vehicle_type, 'has_payout', has_payout)
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


ALTER FUNCTION "public"."delivery_overview_core"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."delivery_overview_core"() IS 'สรุปรายตำบลสำหรับ BAVORN AI (n8n คัดลอกไป Hermes วันละครั้ง) รวมยอดเงินรวมรายตำบล (money). service_role เท่านั้น. ไม่มีเบอร์/LINE id/พิกัด/เลขพร้อมเพย์.';



CREATE OR REPLACE FUNCTION "public"."dhamma_begin"("p_user" "text", "p_cmd" "text", "p_text" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'dhamma'
    AS $$
declare
  acc jsonb := (select value from dhamma.settings where key = 'access');
  allowed boolean;
  st dhamma.user_state;
  t text := btrim(coalesce(p_text, ''));
  intro boolean := false;
  v_len int;
begin
  allowed := coalesce(acc->>'mode', 'test') = 'open'
          or exists (select 1 from public.profiles p
                     where p.line_user_id = p_user
                       and ((p.role = 'admin' and coalesce(p.approved, false))
                            or exists (select 1 from public.admin_scopes a where a.profile_id = p.id)))
          or exists (select 1 from public.staff_line_accounts s
                     where s.line_user_id = p_user and s.level::text = coalesce(acc->>'allowed_staff_level', 'superadmin'));
  -- answer-length chips: postback dhamma=len:<chars>; also keeps the dhamma session open for the next question
  if p_cmd like 'len:%' then
    if not allowed then
      return jsonb_build_object('handled', true, 'allowed', false, 'reply', acc->>'blocked_reply');
    end if;
    v_len := case when substring(p_cmd from 5) in ('500', '1000', '3000', '6000', '12000') then substring(p_cmd from 5)::int else 3000 end;
    if (select mode from dhamma.user_state where line_user_id = p_user) = 'counsel' then
      insert into dhamma.user_prefs (line_user_id, length_pref, counsel_length) values (p_user, null, v_len)
        on conflict (line_user_id) do update set counsel_length = excluded.counsel_length, updated_at = now();
    else
      insert into dhamma.user_prefs (line_user_id, length_pref) values (p_user, v_len)
        on conflict (line_user_id) do update set length_pref = excluded.length_pref, updated_at = now();
    end if;
    insert into dhamma.user_state (line_user_id, mode)
      values (p_user, coalesce((select mode from dhamma.user_state where line_user_id = p_user), 'buddhayana'))
      on conflict (line_user_id) do update set updated_at = now();
    return jsonb_build_object('handled', true, 'allowed', true, 'mode', (select mode from dhamma.user_state where line_user_id = p_user), 'length_pref', v_len,
      'reply', 'ตั้งความยาวคำตอบประมาณ ' || translate(to_char(v_len, 'FM99,999'), '0123456789', '๐๑๒๓๔๕๖๗๘๙') || ' ตัวอักษรแล้วครับ พิมพ์คำถามได้เลย');
  end if;
  if p_cmd in ('counsel', 'learn', 'buddhayana') then
    if not allowed then
      return jsonb_build_object('handled', true, 'allowed', false, 'reply', acc->>'blocked_reply');
    end if;
    insert into dhamma.user_state (line_user_id, mode) values (p_user, p_cmd)
      on conflict (line_user_id) do update set mode = excluded.mode, updated_at = now();
    if p_cmd = 'counsel' then
      update dhamma.user_prefs set counsel_length = null where line_user_id = p_user;
    end if;
    intro := true;
  else
    select * into st from dhamma.user_state where line_user_id = p_user
      and updated_at > now() - make_interval(mins => coalesce((acc->>'session_minutes')::int, 30));
    if st.line_user_id is null or not allowed then
      return jsonb_build_object('handled', false);
    end if;
    if t in ('ออก', 'จบ', 'ออกจากโหมด', 'กลับเมนูหลัก') then
      delete from dhamma.user_state where line_user_id = p_user;
      return jsonb_build_object('handled', true, 'allowed', true, 'exit', true,
        'reply', 'ออกจากโหมดธรรมะแล้วครับ กดปุ่มในเมนูเพื่อกลับมาได้ทุกเมื่อ 🙏');
    end if;
    if st.mode = 'learn' and t in ('ต่อ', 'บทต่อไป', 'ถัดไป') then
      update dhamma.user_state set lesson_seq = lesson_seq + 1, updated_at = now() where line_user_id = p_user;
    else
      update dhamma.user_state set updated_at = now() where line_user_id = p_user;
    end if;
  end if;
  select * into st from dhamma.user_state where line_user_id = p_user;
  return jsonb_build_object(
    'handled', true, 'allowed', true, 'intro', intro, 'mode', st.mode, 'lesson_seq', st.lesson_seq,
    'consent', st.consent_at is not null,
    'length_pref', case when st.mode = 'counsel'
        then coalesce((select counsel_length from dhamma.user_prefs where line_user_id = p_user), 500)
        else coalesce((select length_pref from dhamma.user_prefs where line_user_id = p_user), 3000) end,
    'prompt_common', (select body from dhamma.prompts where mode = 'common' and active),
    'prompt_mode', (select body from dhamma.prompts where mode = st.mode and active),
    'prompt_version', (select version from dhamma.prompts where mode = st.mode and active),
    -- template for questions that start with "นิยาม" (any mode)
    'prompt_define', (select body from dhamma.prompts where mode = 'define' and active),
    'lesson', (select to_jsonb(l) from dhamma.lessons l where l.seq = st.lesson_seq),
    'lesson_count', (select count(*) from dhamma.lessons),
    'history', coalesce((select jsonb_agg(jsonb_build_object('q', q.question, 'a', q.answer) order by q.created_at)
                         from (select * from dhamma.turns where line_user_id = p_user and mode = st.mode
                               and created_at > now() - interval '2 hours' order by created_at desc limit 6) q), '[]'::jsonb));
end $$;


ALTER FUNCTION "public"."dhamma_begin"("p_user" "text", "p_cmd" "text", "p_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dhamma_log"("p_user" "text", "p_mode" "text", "p_question" "text", "p_answer" "text", "p_cites" "jsonb", "p_model" "text", "p_prompt_version" integer, "p_latency_ms" integer) RETURNS bigint
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'dhamma'
    AS $$
  insert into dhamma.turns (line_user_id, mode, question, answer, cites, model, prompt_version, latency_ms)
  values (p_user, p_mode, p_question, p_answer, coalesce(p_cites, '[]'), p_model, p_prompt_version, p_latency_ms)
  returning id;
$$;


ALTER FUNCTION "public"."dhamma_log"("p_user" "text", "p_mode" "text", "p_question" "text", "p_answer" "text", "p_cites" "jsonb", "p_model" "text", "p_prompt_version" integer, "p_latency_ms" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."directive_create"("p_kind" "text", "p_title" "text", "p_body" "text", "p_conditions" "text" DEFAULT NULL::"text", "p_tambon_ids" "uuid"[] DEFAULT NULL::"uuid"[], "p_deadline" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_is_test" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_d public.directives; t record; v_to text[]; v_push jsonb := '[]'::jsonb; v_unreach jsonb := '[]'::jsonb;
  v_btns jsonb; v_text text; v_total int; v_head text; v_n int := 0; v_tn text;
begin
  if p_kind not in ('policy','approval','consult') then raise exception 'kind must be policy|approval|consult'; end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 120 then raise exception 'title must be 1-120 chars'; end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 1000 then raise exception 'body must be 1-1000 chars'; end if;
  v_total := (select count(*) from (select distinct l.line_user_id
      from public.tambons tb cross join lateral public.line_targets_for_tambon_admin(tb.id) l
     where tb.is_active and (p_tambon_ids is null or tb.id = any (p_tambon_ids))) x);
  if v_total > 50 then raise exception 'too many recipients (%), limit 50 per request (LINE push quota)', v_total; end if;

  insert into public.directives(ticket_no, kind, title, body, conditions, deadline_at, is_test)
  values ('DIR-' || lpad(nextval('public.directives_ticket_seq')::text, 4, '0'), p_kind, btrim(p_title), btrim(p_body),
          nullif(btrim(coalesce(p_conditions, '')), ''), p_deadline, p_is_test)
  returning * into v_d;

  v_head := case p_kind when 'approval' then 'ขออนุมัติจากทีมบวรไทย' when 'consult' then 'ขอความเห็นจากทีมบวรไทย' else 'นโยบายจากทีมบวรไทย' end;
  for t in select tb.id, regexp_replace(tb.name, '^ตำบล', '') as nm from public.tambons tb
            where tb.is_active and (p_tambon_ids is null or tb.id = any (p_tambon_ids)) order by tb.name loop
    insert into public.directive_targets(directive_id, tambon_id) values (v_d.id, t.id);
    v_n := v_n + 1;
    v_to := array(select l.line_user_id from public.line_targets_for_tambon_admin(t.id) l);
    if coalesce(cardinality(v_to), 0) = 0 then
      v_unreach := v_unreach || jsonb_build_array(t.nm);
      continue;
    end if;
    v_btns := case p_kind
      when 'approval' then jsonb_build_array(
        jsonb_build_object('label', 'อนุมัติ', 'data', 'dir|approve|' || v_d.ticket_no || '|' || t.id),
        jsonb_build_object('label', 'อนุมัติมีเงื่อนไข', 'data', 'dir|cond|' || v_d.ticket_no || '|' || t.id),
        jsonb_build_object('label', 'ไม่อนุมัติ', 'data', 'dir|reject|' || v_d.ticket_no || '|' || t.id))
      when 'consult' then jsonb_build_array(
        jsonb_build_object('label', 'เห็นด้วย', 'data', 'dir|approve|' || v_d.ticket_no || '|' || t.id),
        jsonb_build_object('label', 'เห็นด้วยมีเงื่อนไข', 'data', 'dir|cond|' || v_d.ticket_no || '|' || t.id),
        jsonb_build_object('label', 'ไม่เห็นด้วย', 'data', 'dir|reject|' || v_d.ticket_no || '|' || t.id))
      else jsonb_build_array(jsonb_build_object('label', 'รับทราบ', 'data', 'dir|ack|' || v_d.ticket_no || '|' || t.id)) end;
    v_text := v_head || E'\nเลขเรื่อง: ' || v_d.ticket_no || ' · ตำบล' || t.nm || E'\n\n' || v_d.title || E'\n' || v_d.body
      || case when v_d.conditions is not null then E'\n\nเงื่อนไขของข้อเสนอ: ' || v_d.conditions else '' end
      || case when v_d.deadline_at is not null then E'\n\nกรุณาตอบภายใน ' || to_char(v_d.deadline_at at time zone 'Asia/Bangkok', 'DD/MM/YYYY HH24:MI') || ' น.' else '' end;
    v_push := v_push || jsonb_build_array(jsonb_build_object('to', to_jsonb(v_to), 'text', v_text, 'buttons', v_btns));
  end loop;
  if v_n = 0 then raise exception 'no active tambon matched'; end if;
  return jsonb_build_object('ticket', v_d.ticket_no, 'kind', p_kind, 'targets', v_n, 'recipients', v_total, 'unreachable', v_unreach, 'push', v_push);
end $$;


ALTER FUNCTION "public"."directive_create"("p_kind" "text", "p_title" "text", "p_body" "text", "p_conditions" "text", "p_tambon_ids" "uuid"[], "p_deadline" timestamp with time zone, "p_is_test" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."directive_flow"("p_user" "text", "p_input" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_in text := btrim(coalesce(p_input, '')); v_parts text[]; v_act text; v_ticket text; v_tid uuid; v_dec text; v_note text;
  v_prof record; v_sess public.message_sessions; v_scope uuid[]; v_d public.directives; v_t public.directive_targets;
  v_tn text; v_state text; v_by text; v_push jsonb := '[]'::jsonb; v_open int;
begin
  select * into v_sess from public.message_sessions where line_user_id = p_user;
  if v_sess.updated_at < now() - interval '30 minutes' then v_sess.step := null; v_sess.draft := '{}'::jsonb; end if;

  if v_in like 'dir|%' then
    v_parts := string_to_array(v_in, '|'); v_act := v_parts[2]; v_ticket := v_parts[3];
    begin v_tid := v_parts[4]::uuid; exception when others then v_tid := null; end;
  elsif v_sess.step = 'await_dnote' then
    if v_in = 'ยกเลิก' then
      update public.message_sessions set step = null, draft = '{}', updated_at = now() where line_user_id = p_user;
      return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'ยกเลิกแล้ว ยังไม่ได้บันทึกการตัดสินใจ กดปุ่มในข้อความคำขอเพื่อตัดสินใหม่ได้'));
    end if;
    v_act := 'note'; v_note := v_in; v_ticket := v_sess.draft ->> 'dir_ticket'; v_dec := v_sess.draft ->> 'dir_decision';
    begin v_tid := (v_sess.draft ->> 'dir_tambon')::uuid; exception when others then v_tid := null; end;
  else
    return jsonb_build_object('ok', true, 'handled', false);
  end if;

  select p.id, p.role::text as role, p.full_name, p.tambon_id, p.approved into v_prof from public.profiles p where p.line_user_id = p_user limit 1;
  v_scope := array(select x from (
      select v_prof.tambon_id as x where v_prof.role = 'admin' and coalesce(v_prof.approved, false)
      union select s.tambon_id from public.admin_scopes s where s.profile_id = v_prof.id) q where x is not null);
  if v_prof.id is null or v_tid is null or not (v_tid = any (v_scope)) then
    return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'ปุ่มนี้สำหรับตัวแทนของตำบลนั้นเท่านั้น'));
  end if;

  select * into v_d from public.directives where ticket_no = v_ticket;
  select * into v_t from public.directive_targets where directive_id = v_d.id and tambon_id = v_tid;
  if v_d.id is null or v_t.id is null then
    return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'ไม่พบคำขอนี้'));
  end if;
  if v_d.status <> 'active' then
    return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'คำขอ ' || v_d.ticket_no || ' ปิดแล้ว'));
  end if;
  if v_d.deadline_at is not null and v_d.deadline_at < now() and v_t.state = 'pending' then
    return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'คำขอ ' || v_d.ticket_no || ' เลยกำหนดตอบแล้ว กรุณาติดต่อทีมบวรไทย'));
  end if;
  if v_t.state <> 'pending' then
    select coalesce(full_name, 'ตัวแทน') into v_by from public.profiles where id = v_t.decided_by;
    return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text',
      'ตำบลนี้ตัดสินใจไปแล้ว: ' || public._dir_state_th(v_t.state) || ' โดย ' || coalesce(v_by, 'ตัวแทน')));
  end if;

  if v_act in ('cond', 'reject') then
    update public.message_sessions set step = 'await_dnote', updated_at = now(),
      draft = jsonb_build_object('dir_ticket', v_d.ticket_no, 'dir_tambon', v_tid, 'dir_decision', v_act)
     where line_user_id = p_user;
    insert into public.message_sessions(line_user_id, step, draft) values
      (p_user, 'await_dnote', jsonb_build_object('dir_ticket', v_d.ticket_no, 'dir_tambon', v_tid, 'dir_decision', v_act))
      on conflict do nothing;
    return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text',
      case v_act when 'cond' then 'พิมพ์เงื่อนไขที่ต้องการ (ไม่เกิน 300 ตัวอักษร) หรือพิมพ์ ยกเลิก' else 'พิมพ์เหตุผลที่ไม่อนุมัติ (ไม่เกิน 300 ตัวอักษร) หรือพิมพ์ ยกเลิก' end));
  end if;

  if v_act = 'note' then
    if char_length(v_note) > 300 or char_length(v_note) < 2 then
      return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'ข้อความต้องยาว 2–300 ตัวอักษร กรุณาพิมพ์ใหม่ หรือพิมพ์ ยกเลิก'));
    end if;
    v_state := case v_dec when 'cond' then 'conditional' else 'rejected' end;
  elsif v_act = 'approve' then v_state := 'approved'; v_note := null;
  elsif v_act = 'ack' then v_state := 'ack'; v_note := null;
  else
    return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'คำสั่งไม่ถูกต้อง'));
  end if;
  if v_d.kind = 'policy' and v_state <> 'ack' then
    return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'นโยบายนี้ใช้ได้เฉพาะปุ่ม รับทราบ'));
  end if;
  if v_d.kind <> 'policy' and v_state = 'ack' then
    return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'คำขอนี้ต้องเลือก อนุมัติ/เงื่อนไข/ไม่อนุมัติ'));
  end if;

  update public.directive_targets set state = v_state, note = v_note, decided_by = v_prof.id, decided_at = now()
   where id = v_t.id and state = 'pending';
  update public.message_sessions set step = null, draft = '{}', updated_at = now() where line_user_id = p_user;

  select regexp_replace(name, '^ตำบล', '') into v_tn from public.tambons where id = v_tid;
  select count(*) into v_open from public.directive_targets where directive_id = v_d.id and state = 'pending';
  if v_open = 0 then update public.directives set status = 'closed' where id = v_d.id; end if;

  v_push := jsonb_build_array(jsonb_build_object('to', to_jsonb(coalesce(public.central_admin_line_ids(), '{}'::text[])), 'text',
    'ตำบล' || v_tn || ' ตอบ ' || v_d.ticket_no || ': ' || public._dir_state_th(v_state)
    || case when v_note is not null then E'\nเหตุผล/เงื่อนไข: ' || v_note else '' end
    || E'\n' || v_d.title || case when v_open = 0 then E'\n\nครบทุกตำบลแล้ว' else E'\n\nรอตอบอีก ' || v_open || ' ตำบล' end));
  return jsonb_build_object('ok', true, 'handled', true,
    'reply', jsonb_build_object('text', 'บันทึกแล้ว: ' || public._dir_state_th(v_state) || ' (' || v_d.ticket_no || ')'), 'push', v_push);
end $$;


ALTER FUNCTION "public"."directive_flow"("p_user" "text", "p_input" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dispatch_paid_order"("p_order_id" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  o public.orders%rowtype;
  m public.merchants%rowtype;
  d record;
  v_lat double precision; v_lng double precision;
  v_plat double precision; v_plng double precision;
  v_customer_line text; v_customer_phone text; v_merchant_line text; v_merchant_phone text;
  v_driver_name text; v_driver_phone text; v_plate text; v_rider text;
  v_fee numeric; v_type text; v_pick text; v_drop text; v_items text; v_test text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'ไม่มีสิทธิ์'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.customer_paid_at is null or o.status not in ('pending', 'accepted') then
    return jsonb_build_object('ok', false, 'reason', 'not_ready');
  end if;
  if o.merchant_id is not null then select * into m from public.merchants where id = o.merchant_id; end if;
  select line_user_id, phone into v_customer_line, v_customer_phone from public.profiles where id = o.customer_id;
  select line_user_id, phone into v_merchant_line, v_merchant_phone from public.profiles where id = m.profile_id;

  v_plat := coalesce(case when o.type in ('ride', 'agri_service') then o.pickup_lat end, m.lat, o.pickup_lat);
  v_plng := coalesce(case when o.type in ('ride', 'agri_service') then o.pickup_lng end, m.lng, o.pickup_lng);
  v_lat := coalesce(v_plat, o.dropoff_lat);
  v_lng := coalesce(v_plng, o.dropoff_lng);

  if o.driver_id is null then
    select * into d from public.find_nearest_driver(v_lat, v_lng, o.tambon_id, o.required_vehicle_type::text, o.is_test);
    if d.profile_id is not null then
      update public.orders set driver_id = d.profile_id, status = 'accepted' where id = o.id;
    end if;
  else
    select p.id as profile_id, p.line_user_id into d from public.profiles p where p.id = o.driver_id;
  end if;

  if d.profile_id is not null then
    select p.full_name, p.phone, nullif(nullif(btrim(dr.plate_number), ''), '-')
      into v_driver_name, v_driver_phone, v_plate
      from public.profiles p left join public.drivers dr on dr.profile_id = p.id where p.id = d.profile_id;
    v_rider := coalesce(v_driver_name, '-') || coalesce(' · ทะเบียน ' || v_plate, '')
               || coalesce(E'\nโทร: ' || v_driver_phone, '');
  end if;

  select string_agg('- ' || oi.name || ' x' || oi.qty, E'\n' order by oi.name) into v_items
    from public.order_items oi where oi.order_id = o.id;
  v_fee := case when o.type = 'ride' then coalesce(o.price, 0) else coalesce(o.delivery_fee, 0) end;
  v_type := case o.type when 'food' then 'สั่งอาหาร/ของแห้ง' when 'parcel' then 'ส่งของ' when 'ride' then 'เรียกรถ/ส่งคน'
                        when 'agri_service' then 'จ้างรถเกษตร' else o.type::text end;
  v_test := case when o.is_test then '[ทดสอบ] ' else '' end;
  v_pick := coalesce(nullif(coalesce(m.name || coalesce(' · ' || m.address, ''), o.pickup, ''), ''), 'ตามแผนที่')
            || coalesce(E'\nโทรร้าน: ' || v_merchant_phone, '')
            || case when v_plat is not null then E'\nแผนที่: https://www.google.com/maps?q=' || v_plat || ',' || v_plng
                    else E'\n(ร้านยังไม่ปักหมุด โทรถามทางร้าน)' end;
  v_drop := coalesce(nullif(o.dropoff, ''), 'ตามแผนที่')
            || coalesce(E'\nโทรลูกค้า: ' || v_customer_phone, '')
            || case when o.dropoff_lat is not null then E'\nแผนที่: https://www.google.com/maps?q=' || o.dropoff_lat || ',' || o.dropoff_lng else '' end;

  return jsonb_build_object(
    'ok', true, 'order_id', o.id, 'is_test', o.is_test, 'tambon_id', o.tambon_id,
    'driver_found', d.profile_id is not null, 'driver_line', d.line_user_id,
    'driver_text', case when d.profile_id is not null then
        v_test || '🛵 งานใหม่ #' || o.id || ' · ' || v_type || ' (ลูกค้าชำระแล้ว)'
        || coalesce(E'\n\nสินค้า:\n' || v_items, '')
        || E'\n\nรับที่: ' || v_pick || E'\n\nส่งที่: ' || v_drop
        || E'\n\nค่าส่ง ' || to_char(v_fee, 'FM999,999,990.##') || ' บาท (ตัวแทนตำบลโอนให้ตามรอบจ่าย)'
        || E'\nส่งถึงแล้ว ให้ลูกค้าพิมพ์ \"ยืนยันรับของ\" ในแชท LINE' end,
    'customer_line', v_customer_line,
    'customer_text', '✅ ตัวแทนตำบลยืนยันยอดเงินแล้ว ออเดอร์ #' || o.id
        || case when d.profile_id is not null then E'\nไรเดอร์กำลังไปรับของครับ\n\nไรเดอร์: ' || v_rider
                else E'\nกำลังหาไรเดอร์ ตัวแทนตำบลจะประสานให้เร็วที่สุดครับ' end
        || E'\n\nได้ของแล้วพิมพ์ \"ยืนยันรับของ\" ครับ',
    'merchant_line', v_merchant_line,
    'merchant_text', v_test || '✅ ออเดอร์ #' || o.id || ' ลูกค้าชำระเงินแล้ว เตรียมสินค้าได้เลยครับ'
        || coalesce(E'\n\n' || v_items, '')
        || case when d.profile_id is not null then E'\n\nไรเดอร์ที่จะมารับ: ' || v_rider
                else E'\n\nกำลังหาไรเดอร์ ตัวแทนตำบลจะแจ้งอีกครั้ง' end
        || E'\n\nค่าสินค้าตัวแทนตำบลโอนให้ตามรอบจ่าย',
    'agent_text', case when d.profile_id is null then
        '⚠️ ออเดอร์ #' || o.id || ' ชำระเงินแล้ว แต่ยังไม่มีไรเดอร์ออนไลน์ในพื้นที่ กรุณาประสานไรเดอร์' end
  );
end
$$;


ALTER FUNCTION "public"."dispatch_paid_order"("p_order_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."estimate_delivery_fee"("p_shop_id" "uuid", "p_lat" double precision, "p_lng" double precision) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  m record;
  v_km double precision;
begin
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    return jsonb_build_object('ok', false, 'error', 'bad_point');
  end if;

  select mm.tambon_id, mm.lat, mm.lng into m
    from public.merchants mm
   where mm.id = p_shop_id and mm.is_open and not mm.is_test;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'shop_unavailable');
  end if;

  if m.lat is null or m.lng is null then
    return jsonb_build_object('ok', true, 'distance_km', null, 'fee', public.delivery_fee_for(m.tambon_id, null), 'basis', 'base_only');
  end if;

  v_km := round(public.haversine_km(m.lat, m.lng, p_lat, p_lng)::numeric, 1)::double precision;
  return jsonb_build_object('ok', true, 'distance_km', v_km, 'fee', public.delivery_fee_for(m.tambon_id, v_km), 'basis', 'straight_line');
end;
$$;


ALTER FUNCTION "public"."estimate_delivery_fee"("p_shop_id" "uuid", "p_lat" double precision, "p_lng" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_unassigned_orders"("p_minutes" integer DEFAULT 15) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'vault', 'extensions', 'pg_temp'
    AS $$
declare
  v_min integer := greatest(p_minutes, 5);
  v_ids bigint[];
  v_refund bigint[];
  v_secret text; v_url text; r bigint;
begin
  with stale as (
    select id from public.orders
     where status = 'pending' and driver_id is null and scheduled_date is null
       and coalesce(customer_paid_at, created_at) < now() - make_interval(mins => v_min)
       and (is_test
            or (type in ('ride', 'parcel', 'agri_service') and customer_paid_at is null and slip_submitted_at is null)
            or (type = 'food' and customer_paid_at is not null))
     for update skip locked
  ), done as (
    update public.orders o set status = 'cancelled' from stale where o.id = stale.id
    returning o.id, o.tambon_id, o.is_test, o.type, o.customer_paid_at, o.payment_method
  ), refunds as (
    insert into public.order_refunds (order_id, tambon_id, amount, payment_method, reason)
    select d.id, d.tambon_id, public.order_customer_total(o2), d.payment_method,
           format('ไม่มีไรเดอร์รับงานภายใน %s นาที', v_min)
      from done d join public.orders o2 on o2.id = d.id
     where not d.is_test and d.type = 'food' and d.customer_paid_at is not null
    on conflict (order_id) do nothing
    returning order_id
  )
  select (select coalesce(array_agg(id), '{}') from done), (select coalesce(array_agg(order_id), '{}') from refunds)
    into v_ids, v_refund;

  if cardinality(v_ids) > 0 then
    update public.order_events e
       set note = format('ยกเลิกอัตโนมัติ: ไม่มีไรเดอร์รับงานภายใน %s นาที', v_min)
     where e.id in (select max(id) from public.order_events
                     where order_id = any(v_ids) and status = 'cancelled' group by order_id);
  end if;

  if cardinality(v_refund) > 0 then
    begin
      select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_secret' limit 1;
      select decrypted_secret into v_url from vault.decrypted_secrets where name = 'notify_url' limit 1;
      if v_secret is not null and v_url is not null then
        foreach r in array v_refund loop
          perform net.http_post(url := v_url,
            headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
            body := jsonb_build_object('action', 'refund_due', 'order_id', r), timeout_milliseconds := 5000);
        end loop;
      end if;
    exception when others then
      raise warning 'refund notice failed: %', sqlerrm;
    end;
  end if;
  return cardinality(v_ids);
end;
$$;


ALTER FUNCTION "public"."expire_unassigned_orders"("p_minutes" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_unassigned_rides"("p_minutes" integer DEFAULT 15) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_ids bigint[];
begin
  with stale as (
    select id from public.orders
     where type = 'ride' and status = 'pending' and driver_id is null and scheduled_date is null
       and created_at < now() - make_interval(mins => greatest(p_minutes, 5))
     for update skip locked
  ), done as (
    update public.orders o set status = 'cancelled' from stale where o.id = stale.id returning o.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from done;

  if cardinality(v_ids) > 0 then
    update public.order_events e
       set note = format('ยกเลิกอัตโนมัติ: ไม่มีไรเดอร์รับงานภายใน %s นาที', greatest(p_minutes, 5))
     where e.id in (select max(id) from public.order_events
                     where order_id = any(v_ids) and status = 'cancelled' group by order_id);
  end if;
  return cardinality(v_ids);
end;
$$;


ALTER FUNCTION "public"."expire_unassigned_rides"("p_minutes" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_unpaid_food_orders"("p_minutes" integer DEFAULT 15) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_ids bigint[];
begin
  with stale as (
    select id from public.orders
     where type = 'food'
       and status = 'pending'
       and customer_paid_at is null
       and slip_submitted_at is null
       and driver_id is null
       and merchant_accepted_at is null
       and created_at < now() - make_interval(mins => greatest(p_minutes, 5))
     for update skip locked
  ), done as (
    update public.orders o set status = 'cancelled'
      from stale where o.id = stale.id
    returning o.id
  )
  select coalesce(array_agg(id), '{}') into v_ids from done;

  if cardinality(v_ids) > 0 then
    update public.order_events e
       set note = format('ยกเลิกอัตโนมัติ: ไม่ชำระเงินภายใน %s นาที', greatest(p_minutes, 5))
     where e.id in (select max(id) from public.order_events
                     where order_id = any(v_ids) and status = 'cancelled' group by order_id);
  end if;
  return cardinality(v_ids);
end;
$$;


ALTER FUNCTION "public"."expire_unpaid_food_orders"("p_minutes" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_agri_owner"("p_order_lat" double precision, "p_order_lng" double precision, "p_tambon_id" "uuid", "p_vehicle_type" "text" DEFAULT NULL::"text", "p_is_test" boolean DEFAULT false) RETURNS TABLE("profile_id" "uuid", "line_user_id" "text", "vehicle_type" "text", "distance_km" double precision)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  -- เจ้าของรถเกษตร: ไม่ต้องออนไลน์ แต่ต้องอนุมัติแล้วและผูก LINE · ใกล้แปลงก่อน (ไม่มีพิกัดไว้ท้าย)
  select d.profile_id, p.line_user_id, d.vehicle_type::text,
         case when d.lat is not null and d.lng is not null then public.haversine_km(p_order_lat, p_order_lng, d.lat, d.lng) end as distance_km
  from public.drivers d
  join public.profiles p on p.id = d.profile_id
  where p.line_user_id is not null
    and coalesce(p.approved, false) = true
    and (p_vehicle_type is null or d.vehicle_type::text = p_vehicle_type)
    and (p.tambon_id is null or p_tambon_id is null or p.tambon_id = p_tambon_id)
    -- นโยบาย D28 ข้อ 4 (แทนการดูคำนำหน้า LINE) — ตัวกรองคำนำหน้าเดิมยังใช้กับออเดอร์จริง
    and p.is_test = coalesce(p_is_test, false)
    and (coalesce(p_is_test, false)
         or (p.line_user_id not like 'U_driver_sim%' and p.line_user_id not like 'TEST%'))
  order by distance_km asc nulls last
  limit 1;
$$;


ALTER FUNCTION "public"."find_agri_owner"("p_order_lat" double precision, "p_order_lng" double precision, "p_tambon_id" "uuid", "p_vehicle_type" "text", "p_is_test" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_nearest_driver"("p_order_lat" double precision, "p_order_lng" double precision, "p_tambon_id" "uuid", "p_vehicle_type" "text" DEFAULT NULL::"text", "p_is_test" boolean DEFAULT false) RETURNS TABLE("profile_id" "uuid", "line_user_id" "text", "vehicle_type" "text", "distance_km" double precision)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  select d.profile_id, p.line_user_id, d.vehicle_type::text, public.haversine_km(p_order_lat, p_order_lng, d.lat, d.lng) as distance_km
  from public.drivers d
  join public.profiles p on p.id = d.profile_id
  where d.is_online = true
    and d.lat is not null and d.lng is not null
    -- แชร์ตำแหน่งล่าสุดไม่เกิน 8 ชม. (ลืมกดปิดรับงานก็ไม่ถูกส่งงาน)
    and d.location_updated_at > now() - interval '8 hours'
    and p.line_user_id is not null
    and (p_vehicle_type is null or d.vehicle_type::text = p_vehicle_type)
    and (p.tambon_id is null or p_tambon_id is null or p.tambon_id = p_tambon_id)
    -- นโยบาย D28 ข้อ 4: ออเดอร์ทดสอบถึงไรเดอร์ทดสอบเท่านั้น ออเดอร์จริงไม่ถึงไรเดอร์ทดสอบ
    and p.is_test = coalesce(p_is_test, false)
    -- D36: ออเดอร์จริงถึงเฉพาะไรเดอร์ที่แอดมินอนุมัติแล้ว
    and (coalesce(p.approved, false) or coalesce(p_is_test, false))
  order by distance_km asc nulls last
  limit 1;
$$;


ALTER FUNCTION "public"."find_nearest_driver"("p_order_lat" double precision, "p_order_lng" double precision, "p_tambon_id" "uuid", "p_vehicle_type" "text", "p_is_test" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."food_chat_flow"("p_action" "text", "p_user" "text", "p_arg" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare c public.carts; r jsonb; fresh jsonb; q jsonb; point jsonb; previous jsonb; profile_id uuid;
  m record; order_id bigint; new_point jsonb;
begin
  if p_action='partner' then return public.line_partner_flow(p_user,p_arg); end if;
  if coalesce(btrim(p_user),'')='' then return jsonb_build_object('ok',false,'error','no_user'); end if;
  perform pg_advisory_xact_lock(hashtextextended('food-chat:'||p_user,0));
  select * into c from public.carts where line_user_id=p_user for update;
  if p_action='location' then
    if c.line_user_id is null or not c.awaiting_location then return jsonb_build_object('ok',true,'handled',false); end if;
    begin
      new_point := p_arg::jsonb;
      if not ((new_point->>'lat')::double precision between -90 and 90)
        or not ((new_point->>'lng')::double precision between -180 and 180)
        or new_point->>'lat' is null or new_point->>'lng' is null then
        return jsonb_build_object('ok',false,'handled',true,'error','bad_point');
      end if;
    exception when others then return jsonb_build_object('ok',false,'handled',true,'error','bad_point'); end;
    update public.carts set delivery_point=jsonb_build_object('lat',(new_point->>'lat')::double precision,
      'lng',(new_point->>'lng')::double precision,'label',left(coalesce(nullif(btrim(new_point->>'label'),''),'จุดส่งที่เลือก'),500),
      'source','shared_location'), awaiting_location=false,checkout_quote=null,updated_at=now() where line_user_id=p_user;
    r := public.food_chat_flow('review',p_user);
    return r||jsonb_build_object('handled',true);
  elsif p_action='request_location' then
    if c.line_user_id is null or coalesce((public._cart_json(p_user)->>'count')::int,0)=0 then
      return jsonb_build_object('ok',false,'error','empty_cart');
    end if;
    update public.carts set awaiting_location=true,checkout_quote=null,updated_at=now() where line_user_id=p_user;
    return jsonb_build_object('ok',true,'view','need_location','cart',public._cart_json(p_user));
  elsif p_action in ('review','checkout') then
    -- Old checkout buttons become review buttons. No order exists at this point.
    r := public.food_chat_quote(p_user);
    if r->>'view'='need_location' or r->>'error'='too_far' then
      update public.carts set awaiting_location=true,checkout_quote=null,updated_at=now() where line_user_id=p_user;
    elsif (r->>'ok')::boolean then
      q := (r->'quote')||jsonb_build_object('token',gen_random_uuid(),'expires_at',now()+interval '10 minutes');
      update public.carts set checkout_quote=q,delivery_point=q->'point',updated_at=now() where line_user_id=p_user;
      r := jsonb_set(r,'{quote}',q);
    end if;
    return r;
  elsif p_action='confirm' then
    -- Only the same LINE user can replay this token; retries never create a second order.
    if c.last_checkout->>'token'=p_arg then
      order_id := (c.last_checkout->>'order_id')::bigint;
      if not exists(select 1 from public.orders where id=order_id and status<>'cancelled') then
        return jsonb_build_object('ok',false,'error','order_cancelled');
      end if;
      return (c.last_checkout->'result')||jsonb_build_object('duplicate',true,'payment',public.line_payment_instructions(order_id));
    end if;
    q := c.checkout_quote;
    if q is null or q->>'token' is distinct from p_arg then
      return jsonb_build_object('ok',false,'error','review_required','cart',public._cart_json(p_user));
    end if;
    -- Keep availability and prices stable from the final check through order creation.
    perform 1 from public.merchants where id=c.merchant_id for share;
    perform 1 from public.tambons where id=(select tambon_id from public.merchants where id=c.merchant_id) for share;
    perform 1 from public.menu_items where id in (select (i->>'id')::uuid from jsonb_array_elements(c.items) i) order by id for share;
    fresh := public.food_chat_quote(p_user);
    if not coalesce((fresh->>'ok')::boolean,false) or fresh->>'view'<>'review' then return fresh; end if;
    if (q->>'expires_at')::timestamptz<now() or (q-'token'-'expires_at') is distinct from fresh->'quote' then
      r := public.food_chat_flow('review',p_user);
      return r||jsonb_build_object('notice','ยอดหรือรายการเปลี่ยน กรุณาตรวจแล้วกดยืนยันอีกครั้ง');
    end if;
    select id into profile_id from public.profiles where line_user_id=p_user;
    select * into m from public.merchants where id=(q->>'merchant_id')::uuid;
    if profile_id is null then
      insert into public.profiles(role,full_name,line_user_id,tambon_id)
      values('customer','ลูกค้า LINE',p_user,m.tambon_id) returning id into profile_id;
    end if;
    point := q->'point';
    insert into public.orders(type,status,tambon_id,customer_id,merchant_id,items_subtotal,note,
      dropoff,dropoff_lat,dropoff_lng,pickup_lat,pickup_lng,delivery_fee,price)
    values('food','pending',m.tambon_id,profile_id,m.id,(q->>'items_total')::numeric,concat_ws(E'\n','สั่งผ่าน LINE (ยืนยันยอด)',nullif(q->>'customer_note','')),
      point->>'label',(point->>'lat')::double precision,(point->>'lng')::double precision,m.lat,m.lng,
      (q->>'delivery_fee')::numeric,(q->>'delivery_fee')::numeric) returning id into order_id;
    insert into public.order_items(order_id,menu_item_id,name,qty,price)
    select order_id,(i->>'id')::uuid,i->>'name',(i->>'qty')::int,(i->>'price')::numeric from jsonb_array_elements(q->'items') i;
    r := jsonb_build_object('ok',true,'view','confirmed','order_id',order_id,'shop_name',m.name,'items',q->'items',
      'items_total',q->'items_total','delivery_fee',q->'delivery_fee','grand_total',q->'grand_total','point',point,
      'payment',public.line_payment_instructions(order_id));
    update public.carts set items='[]',customer_note=null,checkout_quote=null,awaiting_location=false,updated_at=now(),
      last_checkout=jsonb_build_object('token',p_arg,'order_id',order_id,'result',r-'payment') where line_user_id=p_user;
    return r;
  elsif p_action='clear' then
    update public.carts set items='[]',customer_note=null,checkout_quote=null,awaiting_location=false,updated_at=now() where line_user_id=p_user;
    return jsonb_build_object('ok',true,'cart',public._cart_json(p_user));
  elsif p_action='remove' then
    -- A sold-out item can still be removed from its owner's cart.
    update public.carts set items=coalesce((select jsonb_agg(case when i->>'id'=p_arg
        then jsonb_set(i,'{qty}',to_jsonb((i->>'qty')::int-1)) else i end)
      from jsonb_array_elements(c.items) i where i->>'id'<>p_arg or (i->>'qty')::int>1),'[]'),
      checkout_quote=null,updated_at=now() where line_user_id=p_user;
    return jsonb_build_object('ok',true,'action','remove','item_name',(select name from public.menu_items where id=p_arg::uuid),
      'cart',public._cart_json(p_user));
  elsif p_action='add' then
    if exists(select 1 from jsonb_array_elements(coalesce(c.items,'[]')) i where i->>'id'=p_arg and (i->>'qty')::int>=99) then
      return jsonb_build_object('ok',false,'error','qty_limit','cart',public._cart_json(p_user));
    end if;
  end if;
  if p_action not in ('shops','menu','search','add','remove','cart','clear','tambons','set_tambon') then
    return jsonb_build_object('ok',false,'error','unknown_action');
  end if;
  r := public.food_flow(p_action,p_user,p_arg);
  if p_action in ('add','remove','clear','set_tambon') then
    update public.carts set checkout_quote=null,updated_at=now() where line_user_id=p_user;
  end if;
  -- A single available shop opens its menu immediately, preserving the existing tambon choice.
  if p_action in ('shops','set_tambon') and coalesce((r->>'ok')::boolean,false) and jsonb_array_length(r->'shops')=1 then
    previous := r;
    r := public.food_flow('menu',p_user,r->'shops'->0->>'id');
    r := r||jsonb_build_object('view','menu','tambon',previous->'tambon');
  end if;
  return r;
end $$;


ALTER FUNCTION "public"."food_chat_flow"("p_action" "text", "p_user" "text", "p_arg" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."food_chat_quote"("p_user" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare c public.carts; p record; m record; t record; j jsonb; point jsonb; km double precision; fee numeric; effective_tambon uuid;
begin
  select * into c from public.carts where line_user_id=p_user;
  j := public._cart_json(p_user);
  if coalesce((j->>'count')::int,0)=0 then return jsonb_build_object('ok',false,'error','empty_cart','cart',j); end if;
  select id,coalesce(is_test,false) as is_test,tambon_id,role,llp_tester into p from public.profiles where line_user_id=p_user;
  effective_tambon := p.tambon_id;
  if effective_tambon is null then
    select case when count(*)=1 then (array_agg(id))[1] end into effective_tambon from public.tambons where is_active;
  end if;
  if effective_tambon is null then
    return public.food_flow('tambons',p_user)||jsonb_build_object('ok',false,'error','need_tambon');
  end if;
  select mm.* into m from public.merchants mm join public.profiles owner on owner.id=mm.profile_id
    where mm.id=c.merchant_id and public.shop_open_at(mm.is_open,mm.hours_enabled,mm.opening_hours) and (mm.is_test=coalesce(p.is_test,false) or (mm.is_test and p.llp_tester)) and owner.approved;
  if not found then return jsonb_build_object('ok',false,'error','shop_closed','cart',j); end if;
  select * into t from public.tambons where id=m.tambon_id;
  if not (t.is_active or p.is_test) then return jsonb_build_object('ok',false,'error','tambon_unavailable','cart',j); end if;
  if coalesce(t.intake_blocked,false) then return jsonb_build_object('ok',false,'error','intake_blocked','cart',j); end if;
  if jsonb_array_length(c.items) <> jsonb_array_length(j->'items') or exists(
    select 1 from jsonb_array_elements(j->'items') i where (i->>'qty')::int not between 1 and 99
  ) then return jsonb_build_object('ok',false,'error','cart_changed','cart',j); end if;
  point := c.delivery_point;
  if point is null then
    select jsonb_build_object('lat',o.dropoff_lat,'lng',o.dropoff_lng,
      'label',coalesce(nullif(btrim(o.dropoff),''),'จุดส่งเดิมที่เคยแชร์'),'source','previous_order') into point
      from public.orders o where o.customer_id=p.id and o.type='food' and o.is_test=p.is_test
        and o.dropoff_lat between -90 and 90 and o.dropoff_lng between -180 and 180
      order by o.created_at desc,o.id desc limit 1;
  end if;
  if point is null or c.awaiting_location then
    return jsonb_build_object('ok',true,'view','need_location','cart',j);
  end if;
  if m.lat is null or m.lng is null then
    return jsonb_build_object('ok',false,'error','shop_no_pin','cart',j);
  end if;
  km := public.haversine_km(m.lat,m.lng,(point->>'lat')::double precision,(point->>'lng')::double precision);
  if km>30 then return jsonb_build_object('ok',false,'error','too_far','cart',j); end if;
  km := round(km::numeric,1)::double precision;
  fee := public.delivery_fee_for(m.tambon_id,km);
  return jsonb_build_object('ok',true,'view','review','cart',j,'quote',jsonb_build_object(
    'customer_note',c.customer_note,'merchant_id',m.id,'items',j->'items','items_total',(j->>'total')::numeric,'delivery_fee',fee,
    'grand_total',(j->>'total')::numeric+fee,'distance_km',km,'point',point));
end $$;


ALTER FUNCTION "public"."food_chat_quote"("p_user" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."food_flow"("p_action" "text", "p_user" "text", "p_arg" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_item record; v_cart public.carts; v_items jsonb; v_found boolean := false; v_reset boolean := false;
  v_profile uuid; v_order bigint; v_json jsonb; v_shop record;
  v_is_test boolean;
  v_role public.user_role; v_tambon uuid; v_tambon_ok boolean; v_new record; v_active jsonb;
begin
  if p_user is null or p_user = '' then return jsonb_build_object('ok', false, 'error', 'no_user'); end if;

  -- นโยบาย D28 ข้อ 3–4: บัญชีทดสอบเห็นเฉพาะร้านทดสอบ ลูกค้าจริงเห็นเฉพาะร้านจริง
  select p.id, coalesce(p.is_test, false), p.role, p.tambon_id
    into v_profile, v_is_test, v_role, v_tambon
    from public.profiles p where p.line_user_id = p_user limit 1;
  v_is_test := coalesce(v_is_test, false);

  -- ตำบลที่เปิดบริการ (ใช้ทั้งการ์ดเลือกตำบลและกรณีมีตำบลเดียว)
  v_active := coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'slug', t.slug, 'name', t.name,
                                        'district', t.district, 'province', t.province) order by t.created_at)
      from public.tambons t where t.is_active and t.slug is not null), '[]'::jsonb);

  if p_action = 'tambons' then
    return jsonb_build_object('ok', true, 'tambons', v_active, 'current', v_tambon);
  end if;

  if p_action = 'set_tambon' then
    select t.id, t.name into v_new from public.tambons t
     where t.slug = btrim(coalesce(p_arg, '')) and (t.is_active or v_is_test);
    if not found then
      return jsonb_build_object('ok', false, 'error', 'tambon_unavailable', 'tambons', v_active);
    end if;
    if v_profile is null then
      insert into public.profiles(role, full_name, line_user_id, tambon_id)
      values ('customer', 'ลูกค้า LINE', p_user, v_new.id) returning id into v_profile;
    elsif v_role = 'customer' then
      update public.profiles set tambon_id = v_new.id where id = v_profile;
    elsif v_tambon is distinct from v_new.id then
      return jsonb_build_object('ok', false, 'error', 'role_fixed_tambon', 'tambons', v_active);
    end if;
    return public.food_flow('shops', p_user) || jsonb_build_object('tambon_set', v_new.name);
  end if;

  -- ยังไม่มีตำบล และเปิดบริการอยู่ตำบลเดียว: ใช้ตำบลนั้นไปก่อน (ไม่เขียนข้อมูล)
  if v_tambon is null and jsonb_array_length(v_active) = 1 then
    v_tambon := (v_active -> 0 ->> 'id')::uuid;
  end if;
  v_tambon_ok := v_tambon is not null
    and exists (select 1 from public.tambons t where t.id = v_tambon and (t.is_active or v_is_test));

  if not v_tambon_ok and p_action in ('shops', 'search', 'menu', 'add', 'remove', 'checkout') then
    return jsonb_build_object('ok', false, 'error', 'need_tambon', 'tambons', v_active,
                              'cart', public._cart_json(p_user));
  end if;

  if p_action = 'shops' then
    return jsonb_build_object('ok', true, 'tambon', (select t.name from public.tambons t where t.id = v_tambon),
      'shops', coalesce((
      select jsonb_agg(s order by s->>'name') from (
        select jsonb_build_object('id', m.id, 'name', m.name, 'category', m.category,
          'count', count(mi.id), 'photo', max(mi.photo_url)) s
        from public.merchants m
        join public.profiles p on p.id = m.profile_id and p.approved
        join public.menu_items mi on mi.merchant_id = m.id and mi.is_available and not coalesce(mi.is_hidden,false)
        where public.shop_open_at(m.is_open,m.hours_enabled,m.opening_hours) and m.is_test = v_is_test and m.tambon_id = v_tambon
        group by m.id, m.name, m.category
        limit 10) q), '[]'::jsonb));

  elsif p_action = 'menu' then
    select m.id, m.name, m.category into v_shop from public.merchants m
     where m.id = p_arg::uuid and public.shop_open_at(m.is_open,m.hours_enabled,m.opening_hours) and m.is_test = v_is_test and m.tambon_id = v_tambon;
    if not found then return jsonb_build_object('ok', false, 'error', 'shop_closed'); end if;
    return jsonb_build_object('ok', true, 'shop', jsonb_build_object('id', v_shop.id, 'name', v_shop.name, 'category', v_shop.category),
      'items', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'price', price, 'photo', photo_url) order by (photo_url is null), name)
        from (select * from public.menu_items where merchant_id = v_shop.id and is_available and not coalesce(is_hidden,false) order by (photo_url is null), name limit 11) t), '[]'::jsonb),
      'cart', public._cart_json(p_user));

  elsif p_action = 'search' then
    -- ค้นเองแทน search_menu (ซึ่งซ่อนร้านทดสอบเสมอ) เพื่อให้บัญชีทดสอบค้นร้านทดสอบได้
    return jsonb_build_object('ok', true, 'term', p_arg, 'items', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.item_id, 'name', r.item_name, 'price', r.price, 'photo', r.photo_url, 'shop_id', r.merchant_id, 'shop_name', r.merchant_name))
      from (select m.id as merchant_id, m.name as merchant_name, mi.id as item_id, mi.name as item_name, mi.price, mi.photo_url
              from public.menu_items mi
              join public.merchants m on m.id = mi.merchant_id
             where public.shop_open_at(m.is_open,m.hours_enabled,m.opening_hours) and m.is_test = v_is_test and m.tambon_id = v_tambon
               and mi.is_available and not coalesce(mi.is_hidden, false)
               and length(btrim(coalesce(p_arg, ''))) >= 2
               and mi.name ilike '%' || btrim(p_arg) || '%'
             order by mi.price asc, mi.name asc
             limit 10) r), '[]'::jsonb));

  elsif p_action in ('add', 'remove') then
    select mi.id, mi.name, mi.merchant_id into v_item from public.menu_items mi join public.merchants m on m.id = mi.merchant_id
     where mi.id = p_arg::uuid and mi.is_available and not coalesce(mi.is_hidden,false) and public.shop_open_at(m.is_open,m.hours_enabled,m.opening_hours) and m.is_test = v_is_test
       and m.tambon_id = v_tambon;
    if not found then return jsonb_build_object('ok', false, 'error', 'item_unavailable', 'cart', public._cart_json(p_user)); end if;
    select * into v_cart from public.carts where line_user_id = p_user for update;
    if not found then
      insert into public.carts(line_user_id, merchant_id, items) values (p_user, v_item.merchant_id, '[]') returning * into v_cart;
    elsif v_cart.merchant_id is distinct from v_item.merchant_id then
      v_reset := jsonb_array_length(v_cart.items) > 0;
      update public.carts set merchant_id = v_item.merchant_id, items = '[]' where line_user_id = p_user returning * into v_cart;
    end if;
    select coalesce(jsonb_agg(case when (e->>'id')::uuid = v_item.id
             then jsonb_build_object('id', e->>'id', 'qty', (e->>'qty')::int + case when p_action = 'add' then 1 else -1 end) else e end), '[]')
      into v_items from jsonb_array_elements(v_cart.items) e;
    v_found := exists (select 1 from jsonb_array_elements(v_cart.items) e where (e->>'id')::uuid = v_item.id);
    if not v_found and p_action = 'add' then v_items := v_items || jsonb_build_array(jsonb_build_object('id', v_item.id, 'qty', 1)); end if;
    select coalesce(jsonb_agg(e), '[]') into v_items from jsonb_array_elements(v_items) e where (e->>'qty')::int > 0;
    update public.carts set items = v_items, updated_at = now() where line_user_id = p_user;
    return jsonb_build_object('ok', true, 'action', p_action, 'item_name', v_item.name, 'reset', v_reset, 'cart', public._cart_json(p_user));

  elsif p_action = 'cart' then
    return jsonb_build_object('ok', true, 'cart', public._cart_json(p_user));

  elsif p_action = 'clear' then
    delete from public.carts where line_user_id = p_user;
    return jsonb_build_object('ok', true, 'cart', public._cart_json(p_user));

  elsif p_action = 'checkout' then
    v_json := public._cart_json(p_user);
    if coalesce((v_json->>'count')::int, 0) = 0 then return jsonb_build_object('ok', false, 'error', 'empty_cart', 'cart', v_json); end if;
    select m.id, m.name, m.tambon_id, pr.line_user_id into v_shop from public.merchants m left join public.profiles pr on pr.id = m.profile_id
     where m.id = (v_json->>'merchant_id')::uuid and public.shop_open_at(m.is_open,m.hours_enabled,m.opening_hours) and m.is_test = v_is_test and m.tambon_id = v_tambon;
    if not found then return jsonb_build_object('ok', false, 'error', 'shop_closed', 'cart', v_json); end if;
    if v_profile is null then
      insert into public.profiles(role, full_name, line_user_id, tambon_id) values ('customer', 'ลูกค้า LINE', p_user, v_shop.tambon_id) returning id into v_profile;
    end if;
    insert into public.orders(type, status, tambon_id, customer_id, merchant_id, items_subtotal, note)
      values ('food', 'pending', v_shop.tambon_id, v_profile, v_shop.id, (v_json->>'total')::numeric, 'สั่งผ่าน LINE (ตะกร้า)')
      returning id into v_order;
    insert into public.order_items(order_id, menu_item_id, name, qty, price)
      select v_order, (i->>'id')::uuid, i->>'name', (i->>'qty')::int, (i->>'price')::numeric from jsonb_array_elements(v_json->'items') i;
    delete from public.carts where line_user_id = p_user;
    return jsonb_build_object('ok', true, 'order_id', v_order, 'shop_name', v_shop.name, 'merchant_line_user_id', v_shop.line_user_id,
      'items', v_json->'items', 'total', v_json->'total', 'count', v_json->'count');
  end if;
  return jsonb_build_object('ok', false, 'error', 'unknown_action');
end $$;


ALTER FUNCTION "public"."food_flow"("p_action" "text", "p_user" "text", "p_arg" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_notify_secret"() RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'vault', 'pg_temp'
    AS $$
  select jsonb_build_object('secret', decrypted_secret) from vault.decrypted_secrets where name = 'notify_secret' limit 1;
$$;


ALTER FUNCTION "public"."get_notify_secret"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_food_shop_hours"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare m public.merchants%rowtype;
begin
  if new.type='food' and new.merchant_id is not null then
    select * into m from public.merchants where id=new.merchant_id for share;
    if not found or not public.shop_open_at(m.is_open,m.hours_enabled,m.opening_hours) then
      raise exception 'ร้านปิดรับออเดอร์แล้ว กรุณาเลือกร้านอื่น';
    end if;
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."guard_food_shop_hours"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_national_scope"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (select 1 from public.profiles p
                  where p.id = auth.uid() and p.role = 'superadmin')
      or exists (select 1 from public.admin_scopes s
                  where s.profile_id = auth.uid() and s.tambon_id is null);
$$;


ALTER FUNCTION "public"."has_national_scope"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."haversine_km"("lat1" double precision, "lng1" double precision, "lat2" double precision, "lng2" double precision) RETURNS double precision
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select 6371 * 2 * asin(
    sqrt(
      sin(radians(lat2 - lat1) / 2) ^ 2
      + cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lng2 - lng1) / 2) ^ 2
    )
  )
  where lat1 is not null and lng1 is not null and lat2 is not null and lng2 is not null;
$$;


ALTER FUNCTION "public"."haversine_km"("lat1" double precision, "lng1" double precision, "lat2" double precision, "lng2" double precision) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."haversine_km"("lat1" double precision, "lng1" double precision, "lat2" double precision, "lng2" double precision) IS 'Straight-line (great-circle) distance in km between two GPS points. Used for delivery fee calc and nearest-driver matching since routing APIs (Longdo RouteService, Google Maps) are not available for this MVP.';



CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select public.has_national_scope()
      or exists (select 1 from public.profiles p
                  where p.id = auth.uid() and p.role = 'admin' and coalesce(p.approved, false))
      or exists (select 1 from public.admin_scopes s where s.profile_id = auth.uid());
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_approved_driver_in"("t" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select t is not null and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'driver'
      and coalesce(p.approved, false) and p.tambon_id = t
  );
$$;


ALTER FUNCTION "public"."is_approved_driver_in"("t" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_superadmin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'superadmin'
  );
$$;


ALTER FUNCTION "public"."is_superadmin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_tambon_admin"("t" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.approved, false)
      and p.tambon_id = t
  );
$$;


ALTER FUNCTION "public"."is_tambon_admin"("t" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."liff_order"("p_user" "text", "p_text" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  c_max_km constant double precision := 30;
  c_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  c_coord constant text := '^-?[0-9]{1,3}(\.[0-9]{1,8})?$';
  v_code text;
  v_kv jsonb := '{}'::jsonb;
  v_pair text;
  v_eq int;
  v_shop_id uuid;
  v_lat double precision;
  v_lng double precision;
  v_has_pin boolean := false;
  v_wanted jsonb := '{}'::jsonb;
  v_item text;
  v_m text[];
  v_id text;
  v_qty int;
  v_profile uuid;
  v_is_test boolean;
  v_role public.user_role;
  v_ptambon uuid;
  v_shop record;
  v_area record;
  v_lines jsonb;
  v_subtotal numeric;
  v_found int;
  v_address text;
  v_note text;
  v_km double precision;
  v_fee numeric := 0;
  v_order bigint;
  v_sig text;
  v_dup record;
  v_duplicate boolean := false;
  v_pay jsonb;
begin
  if coalesce(btrim(p_user), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'no_user');
  end if;
  if p_text is null or char_length(p_text) > 4000 then
    return jsonb_build_object('ok', false, 'error', 'bad_message');
  end if;

  -- 1) อ่านรหัสบรรทัดสุดท้าย [order:v1 ...]
  v_code := (regexp_match(p_text, '\[order:v1\s+([^\]]*)\]'))[1];
  if v_code is null then
    return jsonb_build_object('ok', false, 'error', 'bad_message');
  end if;
  for v_pair in select unnest(regexp_split_to_array(btrim(v_code), '\s+')) loop
    v_eq := position('=' in v_pair);
    if v_eq > 1 then
      v_kv := v_kv || jsonb_build_object(substr(v_pair, 1, v_eq - 1), substr(v_pair, v_eq + 1));
    end if;
  end loop;

  if coalesce(v_kv->>'shop', '') !~* c_uuid then
    return jsonb_build_object('ok', false, 'error', 'bad_message');
  end if;
  v_shop_id := (v_kv->>'shop')::uuid;

  -- รายการ: <uuid>x<จำนวน> คั่นด้วย , (จำนวน 1-99 รวมรายการซ้ำ ไม่เกิน 30 เมนู)
  for v_item in select unnest(string_to_array(coalesce(v_kv->>'items', ''), ',')) loop
    v_m := regexp_match(v_item, '^([0-9a-fA-F-]{36})x([0-9]{1,3})$');
    if v_m is null or lower(v_m[1]) !~ c_uuid then
      return jsonb_build_object('ok', false, 'error', 'bad_message');
    end if;
    v_id := lower(v_m[1]);
    v_qty := coalesce((v_wanted->>v_id)::int, 0) + v_m[2]::int;
    if v_m[2]::int < 1 or v_qty > 99 then
      return jsonb_build_object('ok', false, 'error', 'bad_message');
    end if;
    v_wanted := v_wanted || jsonb_build_object(v_id, v_qty);
  end loop;
  if v_wanted = '{}'::jsonb or (select count(*) from jsonb_object_keys(v_wanted)) > 30 then
    return jsonb_build_object('ok', false, 'error', 'bad_message');
  end if;

  -- ตำแหน่ง (ไม่บังคับ): ต้องถูกรูปแบบและอยู่ในช่วงพิกัดโลก ไม่งั้นถือว่าไม่ได้ปัก
  if coalesce(v_kv->>'lat', '') ~ c_coord and coalesce(v_kv->>'lng', '') ~ c_coord then
    v_lat := (v_kv->>'lat')::double precision;
    v_lng := (v_kv->>'lng')::double precision;
    if v_lat between -90 and 90 and v_lng between -180 and 180 then
      v_has_pin := true;
    end if;
  end if;

  -- ที่อยู่ (บังคับ อย่างน้อย 5 ตัวอักษร) และหมายเหตุ จากบรรทัดที่คนอ่าน
  v_address := btrim(coalesce((regexp_match(p_text, '(?n)^จุดส่ง: (.*)$'))[1], ''), E' \t\r\n');
  v_note := nullif(btrim(coalesce((regexp_match(p_text, '(?n)^หมายเหตุ: (.*)$'))[1], ''), E' \t\r\n'), '');
  if char_length(v_address) < 5 then
    return jsonb_build_object('ok', false, 'error', 'bad_address');
  end if;
  v_address := left(v_address, 500);
  v_note := left(v_note, 300);

  -- 2) บัญชีลูกค้า (ยังไม่สร้างหรือแก้อะไรจนกว่าข้อมูลทุกอย่างผ่าน)
  select p.id, coalesce(p.is_test, false), p.role, p.tambon_id
    into v_profile, v_is_test, v_role, v_ptambon
    from public.profiles p where p.line_user_id = p_user limit 1;
  v_is_test := coalesce(v_is_test, false);

  -- 3) ร้านและตำบล
  select m.id, m.name, m.tambon_id, m.lat, m.lng, pr.line_user_id as line_user_id
    into v_shop
    from public.merchants m
    join public.profiles pr on pr.id = m.profile_id
   where m.id = v_shop_id and m.is_open and m.is_test = v_is_test and pr.approved;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'shop_closed');
  end if;

  select t.id, t.name, t.is_active, coalesce(t.intake_blocked, false) as intake_blocked
    into v_area from public.tambons t where t.id = v_shop.tambon_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'tambon_unavailable');
  end if;
  if not (v_area.is_active or v_is_test) then
    return jsonb_build_object('ok', false, 'error', 'tambon_unavailable');
  end if;
  if v_area.intake_blocked then
    return jsonb_build_object('ok', false, 'error', 'intake_blocked');
  end if;
  if v_profile is not null and v_role not in ('customer', 'superadmin') and not exists (select 1 from public.profiles x where x.id = v_profile and x.can_order_as_customer) and v_ptambon is distinct from v_shop.tambon_id then
    return jsonb_build_object('ok', false, 'error', 'role_fixed_tambon');
  end if;

  -- 4) รายการสินค้า: ต้องเป็นของร้านนี้ ขายอยู่ และไม่ซ่อน ราคาอ่านจากฐานข้อมูล
  select jsonb_agg(jsonb_build_object('id', mi.id, 'name', mi.name, 'price', mi.price,
                                      'qty', (v_wanted->>(mi.id::text))::int,
                                      'line_total', mi.price * (v_wanted->>(mi.id::text))::int) order by mi.name),
         coalesce(sum(mi.price * (v_wanted->>(mi.id::text))::int), 0),
         count(*)
    into v_lines, v_subtotal, v_found
    from public.menu_items mi
   where mi.merchant_id = v_shop.id
     and mi.is_available and not coalesce(mi.is_hidden, false)
     and jsonb_exists(v_wanted, mi.id::text);
  if v_found <> (select count(*) from jsonb_object_keys(v_wanted)) then
    return jsonb_build_object('ok', false, 'error', 'item_unavailable');
  end if;

  -- 5) ค่าส่งเมื่อมีพิกัด: สูตรของตำบล × ระยะเส้นตรง (ร้านยังไม่ปักหมุด = ค่าส่งเริ่มต้น)
  if v_has_pin then
    if v_shop.lat is not null and v_shop.lng is not null then
      v_km := public.haversine_km(v_shop.lat, v_shop.lng, v_lat, v_lng);
      if v_km > c_max_km then
        return jsonb_build_object('ok', false, 'error', 'too_far', 'distance_km', round(v_km::numeric, 1));
      end if;
      v_km := round(v_km::numeric, 1)::double precision;
    end if;
    v_fee := public.delivery_fee_for(v_shop.tambon_id, v_km);
  end if;

  -- 6) ผ่านการตรวจทั้งหมด: สร้างโปรไฟล์/ย้ายตำบล (ถ้าจำเป็น) แล้วสร้างออเดอร์
  if v_profile is null then
    insert into public.profiles(role, full_name, line_user_id, tambon_id)
    values ('customer', 'ลูกค้า LINE', p_user, v_shop.tambon_id) returning id into v_profile;
  elsif v_role = 'customer' and v_ptambon is distinct from v_shop.tambon_id then
    update public.profiles set tambon_id = v_shop.tambon_id where id = v_profile;
  end if;

  v_sig := (select string_agg(k || 'x' || v, ',' order by k) from jsonb_each_text(v_wanted) as t(k, v));
  select o.id, o.delivery_fee, o.dropoff_lat, o.dropoff_lng
    into v_dup
    from public.orders o
   where o.customer_id = v_profile and o.merchant_id = v_shop.id and o.status = 'pending'
     and o.created_at > now() - interval '10 minutes'
     and (select string_agg(oi.menu_item_id::text || 'x' || oi.qty, ',' order by oi.menu_item_id::text)
            from public.order_items oi where oi.order_id = o.id) = v_sig
   order by o.created_at desc limit 1;

  if found then
    -- ส่งซ้ำ: คืนออเดอร์เดิม ไม่สร้างใหม่
    v_duplicate := true;
    v_order := v_dup.id;
    v_has_pin := v_dup.dropoff_lat is not null;
    v_fee := coalesce(v_dup.delivery_fee, 0);
    v_km := case when v_has_pin and v_shop.lat is not null and v_shop.lng is not null
                 then round(public.haversine_km(v_shop.lat, v_shop.lng, v_dup.dropoff_lat, v_dup.dropoff_lng)::numeric, 1)::double precision
            end;
  else
    insert into public.orders(type, status, tambon_id, customer_id, merchant_id, items_subtotal, note,
                              dropoff, dropoff_lat, dropoff_lng, pickup_lat, pickup_lng, delivery_fee, price)
    values ('food', 'pending', v_shop.tambon_id, v_profile, v_shop.id, v_subtotal,
            'สั่งผ่าน LINE (LIFF)' || coalesce(' · ' || v_note, ''),
            v_address,
            case when v_has_pin then v_lat end, case when v_has_pin then v_lng end,
            case when v_has_pin then v_shop.lat end, case when v_has_pin then v_shop.lng end,
            case when v_has_pin then v_fee else 0 end, case when v_has_pin then v_fee else 0 end)
    returning id into v_order;

    insert into public.order_items(order_id, menu_item_id, name, qty, price)
    select v_order, (l->>'id')::uuid, l->>'name', (l->>'qty')::int, (l->>'price')::numeric
      from jsonb_array_elements(v_lines) l;
  end if;

  -- วิธีชำระเงินของตำบล (ข้อความ + QR พร้อมเพย์ตามยอดรวม) มีเมื่อรู้ค่าส่งแล้วเท่านั้น
  if v_has_pin then
    v_pay := public.line_payment_instructions(v_order);
  end if;

  return jsonb_build_object(
    'ok', true,
    'duplicate', v_duplicate,
    'order_id', v_order,
    'shop_name', v_shop.name,
    'merchant_line_user_id', v_shop.line_user_id,
    'tambon', v_area.name,
    'items', v_lines,
    'items_total', v_subtotal,
    'has_pin', v_has_pin,
    'distance_km', v_km,
    'delivery_fee', case when v_has_pin then v_fee end,
    'grand_total', v_subtotal + case when v_has_pin then v_fee else 0 end,
    'no_merchant_gps', v_has_pin and (v_shop.lat is null or v_shop.lng is null),
    'payment', v_pay
  );
end;
$_$;


ALTER FUNCTION "public"."liff_order"("p_user" "text", "p_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."line_answer_context"("p_line_user_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  started timestamptz := clock_timestamp();
  level_data jsonb;
  staff_data jsonb := null;
  public_data jsonb;
  towns uuid[];
  suspended boolean;
begin
  select coalesce(bool_or(p.suspended_at is not null),false) into suspended
    from public.profiles p where p.line_user_id=p_line_user_id;
  level_data := case when suspended then jsonb_build_object('level',null)
    else public.line_staff_level(p_line_user_id) end;
  if level_data->>'level' is not null then
    staff_data := public.line_staff_context(p_line_user_id);
    select coalesce(array_agg(t.id),'{}'::uuid[]) into towns
      from public.tambons t where exists (
        select 1 from jsonb_array_elements(staff_data->'tambons') x where x->>'slug'=t.slug);
    staff_data := staff_data || jsonb_build_object(
      'people', (select coalesce(jsonb_agg(jsonb_build_object(
        'id',p.id,'name',p.full_name,'role',p.role,'approved',coalesce(p.approved,false),
        'is_agent',((p.role='admin' and coalesce(p.approved,false) and p.tambon_id=any(towns))
          or exists(select 1 from public.admin_scopes s where s.profile_id=p.id and s.tambon_id=any(towns))),
        'with_line',p.line_user_id is not null,'online',coalesce(d.is_online,false),
        'areas',case when p.role='admin' or exists(select 1 from public.admin_scopes s where s.profile_id=p.id and s.tambon_id=any(towns))
          then (select coalesce(jsonb_agg(t.slug),'[]'::jsonb) from public.tambons t where t.id=any(towns) and
             ((p.role='admin' and coalesce(p.approved,false) and p.tambon_id=t.id)
              or exists(select 1 from public.admin_scopes s where s.profile_id=p.id and s.tambon_id=t.id)))
          else (select coalesce(jsonb_agg(t.slug),'[]'::jsonb) from public.tambons t where t.id=p.tambon_id and t.id=any(towns)) end
      ) order by p.id),'[]'::jsonb)
      from public.profiles p left join public.drivers d on d.profile_id=p.id
       where not coalesce(p.is_test,false) and p.suspended_at is null
         and (p.role in ('admin','driver') or exists(select 1 from public.admin_scopes ax where ax.profile_id=p.id and ax.tambon_id=any(towns)))
        and (p.tambon_id=any(towns) or exists(select 1 from public.admin_scopes s where s.profile_id=p.id and s.tambon_id=any(towns)))),
      'settings',(select coalesce(jsonb_agg(jsonb_build_object('slug',t.slug,'name',t.name,
        'payout_cutoff',to_char(t.payout_cutoff_time,'HH24:MI'),'deposit_recorded',t.deposit_amount,
        'customers_total',(select count(*) from public.profiles cp where cp.tambon_id=t.id and cp.role='customer' and not coalesce(cp.is_test,false)),
        'merchants_total',(select count(*) from public.merchants mp where mp.tambon_id=t.id and not coalesce(mp.is_test,false))) order by t.slug),'[]'::jsonb)
        from public.tambons t where t.id=any(towns)));
  end if;
  with shops as (
    select m.id,m.name,m.category,m.is_open,m.tambon_id,t.slug,t.is_active
      from public.merchants m join public.profiles p on p.id=m.profile_id join public.tambons t on t.id=m.tambon_id
     where not coalesce(m.is_test,false) and not coalesce(p.is_test,false)
       and coalesce(p.approved,false) and p.suspended_at is null
  ), catalog as (
    select mi.id,mi.name,mi.price,s.name as merchant,s.slug
      from public.menu_items mi join shops s on s.id=mi.merchant_id
     where s.is_active and s.is_open and coalesce(mi.is_available,true) and not coalesce(mi.is_hidden,false)
  )
  select jsonb_build_object(
    'tambons',(select coalesce(jsonb_agg(jsonb_build_object('name',t.name,'slug',t.slug,'active',t.is_active,
      'opened_at',t.opened_at,'delivery_fee_base',t.delivery_fee_base,'delivery_fee_per_km',t.delivery_fee_per_km,
      'payout_cutoff',to_char(t.payout_cutoff_time,'HH24:MI')) order by t.name),'[]'::jsonb) from public.tambons t),
    'merchants',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'slug',s.slug,'open',s.is_open,'active',s.is_active) order by s.name),'[]'::jsonb) from shops s),
    'catalog',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'price',c.price,'merchant',c.merchant,'slug',c.slug)),'[]'::jsonb) from (select * from catalog order by name,id limit 80) c),
    'catalog_complete',(select count(*)<=80 from catalog)
  ) into public_data;
  return level_data || jsonb_build_object('live_delivery',jsonb_build_object(
    'schema_version',1,'source','delivery_database','generated_at',now(),
    'query_ms',extract(epoch from clock_timestamp()-started)*1000,
    'public',public_data,'staff',staff_data));
end;
$$;


ALTER FUNCTION "public"."line_answer_context"("p_line_user_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."line_answer_context"("p_line_user_id" "text") IS 'Service-only LINE answer context: current Delivery public catalog and existing staff-scoped data; policy knowledge remains in Hermes.';



CREATE OR REPLACE FUNCTION "public"."line_driver_job_action"("p_line_user_id" "text", "p_order_id" bigint, "p_action" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  o public.orders%rowtype;
  v_pid uuid; v_name text; v_phone text; v_plate text; v_rider text; v_shop text;
  v_customer_line text; v_merchant_line text; v_now text; v_fee numeric;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'ไม่มีสิทธิ์'; end if;
  select id into v_pid from public.profiles where line_user_id = p_line_user_id;
  select * into o from public.orders where id = p_order_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_pid is null or o.driver_id is distinct from v_pid then return jsonb_build_object('ok', false, 'reason', 'not_your_job', 'order_id', o.id); end if;
  if o.status = 'cancelled' then return jsonb_build_object('ok', false, 'reason', 'cancelled', 'order_id', o.id); end if;
  if o.status = 'delivered' then return jsonb_build_object('ok', false, 'reason', 'already_delivered', 'order_id', o.id); end if;

  select p.full_name, p.phone, nullif(nullif(btrim(d.plate_number), ''), '-') into v_name, v_phone, v_plate
    from public.profiles p left join public.drivers d on d.profile_id = p.id where p.id = v_pid;
  v_rider := coalesce(v_name, '-') || coalesce(' · ทะเบียน ' || v_plate, '') || coalesce(' · โทร ' || v_phone, '');
  select line_user_id into v_customer_line from public.profiles where id = o.customer_id;
  select m.name, p.line_user_id into v_shop, v_merchant_line
    from public.merchants m left join public.profiles p on p.id = m.profile_id where m.id = o.merchant_id;
  v_now := to_char(now() at time zone 'Asia/Bangkok', 'HH24:MI');
  v_fee := case when o.type = 'ride' then coalesce(o.price, 0) else coalesce(o.delivery_fee, 0) end;

  if p_action = 'pickup' then
    if o.status = 'in_progress' then return jsonb_build_object('ok', false, 'reason', 'already_picked', 'order_id', o.id); end if;
    update public.orders set status = 'in_progress' where id = o.id;
    return jsonb_build_object('ok', true, 'action', 'pickup', 'order_id', o.id,
      'rider_text', '📦 บันทึกแล้ว: รับของออเดอร์ #' || o.id || ' เวลา ' || v_now || E' น.\nส่งถึงลูกค้าแล้วกดปุ่ม "✅ ส่งถึงแล้ว"',
      'merchant_line', v_merchant_line,
      'merchant_text', '✅ ไรเดอร์รับของออเดอร์ #' || o.id || ' แล้ว เวลา ' || v_now || E' น.\nไรเดอร์: ' || v_rider,
      'customer_line', v_customer_line,
      'customer_text', '🛵 ไรเดอร์รับของแล้ว กำลังไปส่ง · ออเดอร์ #' || o.id || E'\nไรเดอร์: ' || v_rider);
  elsif p_action = 'deliver' then
    update public.orders set status = 'delivered', delivered_at = now() where id = o.id;
    return jsonb_build_object('ok', true, 'action', 'deliver', 'order_id', o.id,
      'rider_text', '✅ ปิดงาน #' || o.id || ' แล้ว เวลา ' || v_now || E' น. ขอบคุณครับ\nค่าส่ง ' || to_char(v_fee, 'FM999,999,990.##') || ' บาท ตัวแทนตำบลโอนให้ตามรอบจ่าย',
      'merchant_line', v_merchant_line,
      'merchant_text', '📦 ออเดอร์ #' || o.id || ' ส่งถึงลูกค้าแล้ว เวลา ' || v_now || ' น.',
      'customer_line', v_customer_line,
      'customer_text', '📦 ไรเดอร์แจ้งว่าส่งของถึงแล้ว · ออเดอร์ #' || o.id
        || E'\n\nให้คะแนนความพึงพอใจ พิมพ์ตัวเลข 1-5 ครับ\nถ้ายังไม่ได้รับของ โทรหาไรเดอร์ ' || coalesce(v_phone, '') || ' หรือพิมพ์ "แจ้งเรื่อง"');
  end if;
  return jsonb_build_object('ok', false, 'reason', 'bad_action');
end $$;


ALTER FUNCTION "public"."line_driver_job_action"("p_line_user_id" "text", "p_order_id" bigint, "p_action" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."line_driver_set_online"("p_line_user_id" "text", "p_online" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare v_pid uuid; v_role text; v_active int;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'ไม่มีสิทธิ์'; end if;
  select id, role::text into v_pid, v_role from public.profiles where line_user_id = p_line_user_id;
  if v_pid is null or v_role <> 'driver' then return jsonb_build_object('ok', false, 'reason', 'not_driver'); end if;
  if p_online then
    return jsonb_build_object('ok', true, 'online', (select is_online and location_updated_at > now() - interval '8 hours' from public.drivers where profile_id = v_pid));
  end if;
  update public.drivers set is_online = false where profile_id = v_pid;
  select count(*) into v_active from public.orders where driver_id = v_pid and status in ('accepted', 'in_progress');
  return jsonb_build_object('ok', true, 'online', false, 'active_jobs', v_active);
end $$;


ALTER FUNCTION "public"."line_driver_set_online"("p_line_user_id" "text", "p_online" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."line_finance_digest_targets"() RETURNS TABLE("line_user_id" "text", "tambon_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  with due as (select distinct s.tambon_id from public.settlements s where s.paid_out_at is null)
  select x.line_user_id, due.tambon_id from due cross join lateral public.line_targets_for_tambon_admin(due.tambon_id) x
  union
  select unnest(public.central_admin_line_ids()), due.tambon_id from due
   where not exists (select 1 from public.line_targets_for_tambon_admin(due.tambon_id));
$$;


ALTER FUNCTION "public"."line_finance_digest_targets"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."line_finance_flow"("p_line_user_id" "text", "a" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  scope uuid[] := public.line_finance_tambons(p_line_user_id);
  tb public.tambons%rowtype; slips jsonb; payees jsonb; others jsonb; target uuid; upto bigint; payee record; actor uuid;
  v_total numeric; v_count int; want uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'ไม่มีสิทธิ์' using errcode = '42501'; end if;
  if cardinality(scope) = 0 then return jsonb_build_object('ok', false, 'error', 'not_staff'); end if;
  begin want := nullif(a->>'tambon_id', '')::uuid;
  exception when others then return jsonb_build_object('ok', false, 'error', 'bad_action'); end;
  select * into tb from public.tambons t where t.id = any (scope)
   order by (t.id = want) desc,
            (t.id = (select p.tambon_id from public.profiles p where p.line_user_id = p_line_user_id)) desc, t.name
   limit 1;
  if want is not null and tb.id <> want then return jsonb_build_object('ok', false, 'error', 'not_staff'); end if;

  if a->>'action' in ('payout_prompt', 'payout_sent') then
    -- upto = รหัสรายการล่าสุดที่ตัวแทนเห็นตอนกด ยอดที่เกิดใหม่ระหว่างนั้นไม่ถูกปิดไปด้วย
    begin target := (a->>'payee_id')::uuid; upto := (a->>'upto')::bigint;
    exception when others then return jsonb_build_object('ok', false, 'error', 'bad_action'); end;
    select p.full_name, p.role::text as role, sum(s.amount) as amount, count(*)::int as n into payee
      from public.settlements s join public.profiles p on p.id = s.payee_profile_id
     where s.payee_profile_id = target and s.paid_out_at is null and s.id <= upto and s.tambon_id = tb.id
     group by p.id;
    if payee.n is null then
      return jsonb_build_object('ok', true, 'view', 'partner_result', 'tambon_id', tb.id, 'text', 'รายการนี้บันทึกโอนแล้ว ไม่มียอดค้าง');
    end if;
    if a->>'action' = 'payout_prompt' then
      return jsonb_build_object('ok', true, 'view', 'finance_payout_confirm', 'payee_id', target, 'upto', upto, 'tambon_id', tb.id,
        'tambon', tb.name, 'name', payee.full_name, 'role', payee.role, 'amount', payee.amount, 'count', payee.n);
    end if;

    with u as (
      update public.settlements set paid_out_at = now()
       where payee_profile_id = target and paid_out_at is null and id <= upto and tambon_id = tb.id
      returning amount)
    select coalesce(sum(amount), 0), count(*) into v_total, v_count from u;
    perform public.refresh_intake_block(tb.id);
    select id into actor from public.profiles where line_user_id = p_line_user_id;
    insert into public.admin_actions (actor_id, target_id, action, note)
    values (coalesce(actor, target), target, 'settlement.paid_out_line',
            'บันทึกโอน ' || v_count || ' รายการ ' || v_total || ' บาท ให้ ' || coalesce(payee.full_name, '-') || ' (' || tb.name || ') ผ่าน LINE');
    return jsonb_build_object('ok', true, 'view', 'partner_result', 'tambon_id', tb.id,
      'text', 'บันทึกโอน ' || to_char(v_total, 'FM999,999,990.##') || ' บาท ให้ ' || coalesce(payee.full_name, '-') || ' (' || tb.name || ') แล้ว'
              || E'\nผู้รับจะเห็นปุ่ม ตรวจพบเงินเข้าแล้ว ในงานของตัวเอง');
  end if;

  select coalesce(jsonb_agg(x order by x.slip_at), '[]') into slips from (
    select o.id as order_id, public.order_customer_total(o) as total, o.slip_submitted_at as slip_at
      from public.orders o
     where o.tambon_id = tb.id and not o.is_test and o.status <> 'cancelled'
       and o.slip_submitted_at is not null and o.customer_paid_at is null and o.payment_rejected_at is null
     order by o.slip_submitted_at limit 5) x;

  select coalesce(jsonb_agg(x order by x.due_at), '[]') into payees from (
    select p.id as payee_id, p.full_name as name, p.role::text as role, p.promptpay_id, p.payment_bank_name as bank,
           sum(s.amount) as amount, count(*) as n, max(s.id) as upto, min(s.due_at) as due_at,
           string_agg('#' || s.order_id, ' ' order by s.order_id) as orders
      from public.settlements s join public.profiles p on p.id = s.payee_profile_id
     where s.paid_out_at is null and s.tambon_id = tb.id
     group by p.id order by min(s.due_at) limit 8) x;

  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name) order by t.name), '[]') into others
    from public.tambons t where t.id = any (scope) and t.id <> tb.id;

  return jsonb_build_object('ok', true, 'view', 'finance', 'title', 'การเงิน' || regexp_replace(tb.name, '^ตำบล', '') ,
    'tambon_id', tb.id, 'tambon', tb.name, 'account', tb.settlement_promptpay_id, 'others', others, 'slips', slips, 'payees', payees);
end $$;


ALTER FUNCTION "public"."line_finance_flow"("p_line_user_id" "text", "a" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."line_finance_tambons"("p_line_user_id" "text") RETURNS "uuid"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select coalesce(array_agg(t.id), '{}') from public.tambons t
   where p_line_user_id = any (public.central_admin_line_ids())
      or exists (select 1 from public.line_targets_for_tambon_admin(t.id) x where x.line_user_id = p_line_user_id);
$$;


ALTER FUNCTION "public"."line_finance_tambons"("p_line_user_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."line_job_application_forwarded"("p_application_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'ไม่มีสิทธิ์'; end if;
  update public.tambon_job_applications set status = 'forwarded', forwarded_at = now()
   where id = p_application_id and status = 'new';
end;
$$;


ALTER FUNCTION "public"."line_job_application_forwarded"("p_application_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."line_job_apply"("p_line_user_id" "text", "p_post_id" bigint, "p_name" "text", "p_phone" "text", "p_note" "text" DEFAULT ''::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  p public.tambon_board_posts%rowtype;
  v_app bigint;
  v_employer text;
  v_agents text[];
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'ไม่มีสิทธิ์'; end if;
  select * into p from public.tambon_board_posts where id = p_post_id;
  if not found or p.kind <> 'job' or p.status <> 'approved' or (p.expires_at is not null and p.expires_at <= now()) then
    return jsonb_build_object('ok', false, 'reason', 'post_closed');
  end if;

  insert into public.tambon_job_applications (post_id, tambon_id, line_user_id, applicant_name, applicant_phone, note)
  values (p.id, p.tambon_id, p_line_user_id, btrim(coalesce(p_name, '')),
          regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), left(coalesce(p_note, ''), 500))
  on conflict (post_id, line_user_id) do nothing
  returning id into v_app;
  if v_app is null then return jsonb_build_object('ok', false, 'reason', 'already_applied'); end if;

  select employer_line_user_id into v_employer from public.tambon_board_contacts where post_id = p.id;
  select coalesce(array_agg(distinct pr.line_user_id), '{}') into v_agents
    from public.profiles pr
   where pr.line_user_id is not null
     and (exists (select 1 from public.admin_scopes s where s.profile_id = pr.id and s.tambon_id = p.tambon_id)
          or (pr.role = 'admin' and coalesce(pr.approved, false) and pr.tambon_id = p.tambon_id));

  return jsonb_build_object('ok', true, 'application_id', v_app, 'post_id', p.id, 'title', p.title,
                            'org_name', p.org_name, 'employer_line_user_id', v_employer, 'agent_line_user_ids', to_jsonb(v_agents));
end;
$$;


ALTER FUNCTION "public"."line_job_apply"("p_line_user_id" "text", "p_post_id" bigint, "p_name" "text", "p_phone" "text", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."line_link_board_employer"("p_line_user_id" "text", "p_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  c public.tambon_board_contacts%rowtype;
  v_title text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'ไม่มีสิทธิ์'; end if;
  select * into c from public.tambon_board_contacts where link_code = upper(btrim(coalesce(p_code, ''))) for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  update public.tambon_board_contacts set employer_line_user_id = p_line_user_id, linked_at = now() where post_id = c.post_id;
  select title into v_title from public.tambon_board_posts where id = c.post_id;
  return jsonb_build_object('ok', true, 'post_id', c.post_id, 'title', v_title);
end;
$$;


ALTER FUNCTION "public"."line_link_board_employer"("p_line_user_id" "text", "p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."line_link_profile"("p_line_user_id" "text", "p_code" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'));
  c public.profile_link_codes%rowtype;
  t public.profiles%rowtype;
  o public.profiles%rowtype;
  v_tambon text;
  v_shops text;
  v_test_partner boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'ไม่มีสิทธิ์'; end if;
  if coalesce(btrim(p_line_user_id), '') = '' then return jsonb_build_object('ok', false, 'reason', 'no_line_user'); end if;

  if (select count(*) from public.profile_link_attempts
       where line_user_id = p_line_user_id and not ok and created_at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_attempts');
  end if;

  select * into c from public.profile_link_codes where code = v_code for update;
  if not found or c.revoked_at is not null or c.used_at is not null or c.expires_at < now() then
    insert into public.profile_link_attempts (line_user_id, ok) values (p_line_user_id, false);
    return jsonb_build_object('ok', false, 'reason',
      case when c.code is null then 'not_found' when c.used_at is not null then 'used'
           when c.revoked_at is not null then 'revoked' else 'expired' end);
  end if;

  select * into t from public.profiles where id = c.profile_id for update;
  if t.suspended_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'suspended');
  end if;

  if t.line_user_id is distinct from p_line_user_id then
    select * into o from public.profiles where line_user_id = p_line_user_id and id <> t.id for update;
    if found then
      -- บัญชีทดสอบของร้าน/ไรเดอร์ (เช่นตำบลบุ่งไหม) ปลดได้เสมอ ถ้าไม่ใช่ตัวแทนตำบล
      v_test_partner := coalesce(o.is_test, false)
         or exists (select 1 from public.merchants where profile_id = o.id and is_test);
      if not exists (select 1 from public.admin_scopes where profile_id = o.id)
         and (v_test_partner
              or (o.role = 'customer'
                  and not exists (select 1 from public.orders where customer_id = o.id)
                  and not exists (select 1 from public.merchants where profile_id = o.id)
                  and not exists (select 1 from public.drivers where profile_id = o.id))) then
        update public.profiles set line_user_id = null where id = o.id;
      else
        insert into public.profile_link_attempts (line_user_id, ok) values (p_line_user_id, false);
        return jsonb_build_object('ok', false, 'reason', 'line_in_use', 'other_name', o.full_name, 'other_role', o.role);
      end if;
    end if;
    update public.profiles set line_user_id = p_line_user_id where id = t.id;
  end if;

  update public.profile_link_codes set used_at = now(), used_by_line_user_id = p_line_user_id where code = c.code;
  insert into public.profile_link_attempts (line_user_id, ok) values (p_line_user_id, true);
  insert into public.admin_actions (actor_id, target_id, action, note)
  values (t.id, t.id, 'profile.line_linked',
          left(format('ผูก LINE กับ %s (%s) ด้วยรหัส %s%s', t.full_name, t.role, c.code,
                      case when o.id is not null then ' · ปลด LINE จากบัญชีเดิม (ทดสอบ/ลูกค้าอัตโนมัติ) ' || o.full_name || ' ' || o.id else '' end), 1000));

  select name into v_tambon from public.tambons where id = t.tambon_id;
  select string_agg(name, ', ' order by name) into v_shops from public.merchants where profile_id = t.id;
  return jsonb_build_object('ok', true, 'role', t.role, 'full_name', t.full_name, 'tambon', v_tambon,
                            'shops', v_shops, 'approved', coalesce(t.approved, false));
end $$;


ALTER FUNCTION "public"."line_link_profile"("p_line_user_id" "text", "p_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."line_menu_context"("p_line_user_id" "text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object(
    'memory', coalesce((select m.notes from public.customer_memory m where m.line_user_id = p_line_user_id), ''),
    'status', jsonb_build_object(
      'open_tambons', (select coalesce(jsonb_agg(t.name order by t.name), '[]'::jsonb) from public.tambons t where t.is_active),
      'not_open_tambons', (select coalesce(jsonb_agg(t.name order by t.name), '[]'::jsonb) from public.tambons t where not t.is_active),
      'approved_merchants', (select count(*) from public.merchants m join public.profiles p on p.id = m.profile_id
        where not coalesce(m.is_test, false) and not coalesce(p.is_test, false) and coalesce(p.approved, false)),
      'open_merchants', (select count(*) from public.merchants m join public.profiles p on p.id = m.profile_id
        where not coalesce(m.is_test, false) and not coalesce(p.is_test, false) and coalesce(p.approved, false) and m.is_open),
      'menu_items', (select count(*) from public.menu_items mi join public.merchants m on m.id = mi.merchant_id
        where not coalesce(m.is_test, false) and coalesce(mi.is_available, true) and not coalesce(mi.is_hidden, false)),
      'approved_vehicles', (select coalesce(jsonb_object_agg(x.vt, x.n), '{}'::jsonb) from (
        select d.vehicle_type::text vt, count(*) n from public.drivers d join public.profiles p on p.id = d.profile_id
         where not coalesce(p.is_test, false) and coalesce(p.approved, false) group by 1) x),
      'drivers_online', (select count(*) from public.drivers d join public.profiles p on p.id = d.profile_id
         where d.is_online and not coalesce(p.is_test, false) and coalesce(p.approved, false)),
      'job_seekers', (select count(*) from public.job_seekers),
      'job_posts', (select count(*) from public.tambon_board_posts),
      'places', (select count(*) from public.places),
      'places_verified', (select count(*) from public.places where verified)
    ));
$$;


ALTER FUNCTION "public"."line_menu_context"("p_line_user_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."line_my_status"("p_line_user_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  p record;
  d record;
  m_names text;
  o record;
  lines text[] := '{}';
  orders jsonb := '[]'::jsonb;
  st text;
  pay text;
begin
  select id, role::text as role, full_name, approved, suspended_at
    into p from public.profiles
   where line_user_id = p_line_user_id
   limit 1;

  if p.id is null then
    if exists (select 1 from public.job_seekers where line_user_id = p_line_user_id) then
      return jsonb_build_object('linked', false, 'role', 'job_seeker',
        'text', 'ระบบได้รับข้อมูลสมัครงานของคุณแล้วครับ เมื่อมีนายจ้างในตำบลที่ตรงกับคุณ ทีมงานจะติดต่อกลับครับ');
    end if;
    return jsonb_build_object('linked', false, 'role', null,
      'text', 'ยังไม่พบบัญชีที่ผูกกับ LINE นี้ครับ ถ้าเป็นร้านค้าหรือไรเดอร์ พิมพ์ "ผูกบัญชี" ตามด้วยรหัสที่ได้จากตัวแทนตำบล หรือกดสั่งอาหารเพื่อเริ่มใช้งานครับ');
  end if;

  if p.suspended_at is not null then
    lines := lines || 'บัญชีของคุณถูกระงับชั่วคราว กรุณาติดต่อตัวแทนตำบลครับ'::text;
  elsif not p.approved then
    lines := lines || 'ใบสมัครของคุณยังรอตัวแทนตำบลตรวจและอนุมัติครับ'::text;
  end if;

  if p.role = 'driver' then
    select is_online, today_jobs, today_earn, location_updated_at into d
      from public.drivers where profile_id = p.id;
    if d is not null then
      lines := lines || format('สถานะรับงาน: %s · วันนี้ %s งาน รายได้ %s บาท',
        case when d.is_online then 'เปิดรับงาน' else 'ปิดรับงาน' end,
        coalesce(d.today_jobs, 0), coalesce(d.today_earn, 0)::numeric(12,0));
    end if;
  elsif p.role = 'merchant' then
    select string_agg(name || case when is_open then ' (เปิดร้าน)' else ' (ปิดร้าน)' end, ', ')
      into m_names from public.merchants where profile_id = p.id;
    if m_names is not null then
      lines := lines || ('ร้าน: ' || m_names);
    end if;
  end if;

  for o in
    select o2.*, public.order_customer_total(o2) as total,
           (select max(e.created_at) from public.order_events e where e.order_id = o2.id) as last_event_at
      from public.orders o2
     where (p.role = 'customer' and o2.customer_id = p.id)
        or (p.role = 'driver' and o2.driver_id = p.id and o2.status in ('accepted', 'in_progress'))
        or (p.role = 'merchant' and o2.status in ('pending', 'accepted', 'in_progress')
            and o2.merchant_id in (select id from public.merchants where profile_id = p.id))
     order by o2.created_at desc, o2.id desc
     limit 3
  loop
    st := case o.status::text
      when 'pending' then case when o.type = 'food' then 'รอร้านรับออเดอร์' else 'รอคนรับงาน' end
      when 'accepted' then 'รับงานแล้ว กำลังเตรียม'
      when 'in_progress' then 'กำลังไปส่ง'
      when 'delivered' then 'ส่งถึงแล้ว'
      when 'cancelled' then 'ยกเลิกแล้ว'
      else o.status::text end;
    pay := case
      when o.status = 'cancelled' then ''
      when o.customer_paid_at is not null then 'ชำระแล้ว'
      when o.payment_rejected_at is not null then 'สลิปไม่ผ่าน' || coalesce(': ' || o.payment_reject_reason, '')
      when o.slip_submitted_at is not null then 'ส่งสลิปแล้ว รอตรวจ'
      when o.payment_method like 'เงินสด%' then 'จ่ายเงินสดปลายทาง'
      else 'ยังไม่ชำระ' end;
    lines := lines || format('ออเดอร์ #%s (%s) %s%s%s',
      o.id, to_char(o.created_at at time zone 'Asia/Bangkok', 'DD/MM HH24:MI'), st,
      case when coalesce(o.total, 0) > 0 then format(' · %s บาท', o.total::numeric(12,0)) else '' end,
      case when pay <> '' then ' · ' || pay else '' end);
    orders := orders || jsonb_build_object('id', o.id, 'type', o.type, 'status', o.status,
      'status_th', st, 'payment_th', pay, 'total', o.total, 'created_at', o.created_at,
      'last_event_at', o.last_event_at);
  end loop;

  if jsonb_array_length(orders) = 0 then
    lines := lines || case p.role
      when 'driver' then 'ตอนนี้ไม่มีงานที่ค้างอยู่ครับ'
      when 'merchant' then 'ตอนนี้ไม่มีออเดอร์ที่ค้างอยู่ครับ'
      else 'ยังไม่มีออเดอร์ครับ' end;
  end if;

  return jsonb_build_object('linked', true, 'role', p.role, 'approved', p.approved,
    'orders', orders, 'text', array_to_string(lines, E'\n'));
end;
$$;


ALTER FUNCTION "public"."line_my_status"("p_line_user_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."line_my_status"("p_line_user_id" "text") IS 'ตอบคำถามสถานะของตัวเองใน LINE: ลูกค้า=3 ออเดอร์ล่าสุด · ร้าน=ออเดอร์ค้าง · ไรเดอร์=งานค้าง+ยอดวันนี้ · รวมสถานะอนุมัติ/ระงับ · อ่านอย่างเดียว เรียกจาก n8n (service role)';



CREATE OR REPLACE FUNCTION "public"."line_new_order_notice"("p_order_id" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  o public.orders%rowtype;
  t public.tambons%rowtype;
  v_shop text; v_merchant_line text; v_items text; v_type text; v_total numeric;
  v_agents jsonb; v_base constant text := 'https://delivery-tambon-app-v3.vercel.app';
  v_head text;
begin
  select * into o from public.orders where id = p_order_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  select * into t from public.tambons where id = o.tambon_id;

  select m.name, p.line_user_id into v_shop, v_merchant_line
    from public.merchants m left join public.profiles p on p.id = m.profile_id where m.id = o.merchant_id;

  select string_agg('- ' || oi.name || ' x' || oi.qty || ' = ' || to_char(oi.price * oi.qty, 'FM999,999,990.##') || ' บาท', E'\n' order by oi.name)
    into v_items from public.order_items oi where oi.order_id = o.id;
  v_total := nullif(coalesce(o.items_subtotal, (select sum(price * qty) from public.order_items where order_id = o.id)), 0);
  v_type := case o.type when 'food' then 'สั่งอาหาร/ของแห้ง' when 'parcel' then 'ส่งของ' when 'ride' then 'เรียกรถ/ส่งคน'
                        when 'agri_service' then 'จ้างรถเกษตร' else o.type::text end;
  v_head := case when o.is_test then '[ทดสอบ] ' else '' end || '🛒 ออเดอร์ใหม่ #' || o.id || ' · ' || v_type;

  if o.is_test then
    v_agents := '[]'::jsonb;
  else
    select coalesce(jsonb_agg(x.line_user_id), '[]'::jsonb) into v_agents
      from public.line_targets_for_tambon_admin(o.tambon_id) x
     where x.line_user_id is distinct from v_merchant_line;
  end if;

  return jsonb_build_object(
    'ok', true, 'order_id', o.id, 'is_test', o.is_test, 'tambon', t.name,
    'merchant_line', v_merchant_line,
    'merchant_text', v_head || E'\nร้าน ' || coalesce(v_shop, '-')
        || coalesce(E'\n' || v_items, '') || coalesce(E'\nรวมค่าสินค้า ' || to_char(v_total, 'FM999,999,990.##') || ' บาท', '')
        || E'\n\n' || case when o.type = 'food' then 'ได้รับออเดอร์แล้วครับ รอตัวแทนยืนยันเงินก่อนเตรียมอาหาร ระบบจะแจ้งเมื่อยืนยันแล้ว' else 'ได้รับออเดอร์แล้วครับ ตรวจสอบรายละเอียดและสถานะที่หน้าออเดอร์' end || E'\nดูออเดอร์: ' || v_base || '/merchant/orders',
    'agent_to', v_agents,
    'agent_text', v_head || E'\nพื้นที่: ' || coalesce(t.name, '-')
        || case when v_shop is not null then E'\nร้าน ' || v_shop else '' end
        || coalesce(E'\nรวมค่าสินค้า ' || to_char(v_total, 'FM999,999,990.##') || ' บาท', '')
        || E'\n' || case when coalesce(o.delivery_fee, 0) > 0 then 'ค่าส่ง ' || to_char(o.delivery_fee, 'FM999,999,990.##') || ' บาท · รวมที่ลูกค้าโอน ' || to_char(public.order_customer_total(o), 'FM999,999,990.##') || ' บาท' || chr(10) else '' end
        || case when o.type = 'food' then 'สถานะ: รอตรวจสลิปและยืนยันเงินก่อนจัดไรเดอร์' else 'สถานะ: ตรวจสอบรายละเอียดและการจัดไรเดอร์ที่หน้าออเดอร์' end || E'\nดูออเดอร์: ' || v_base || '/admin/orders' || coalesce('?t=' || t.slug, '')
  );
end $$;


ALTER FUNCTION "public"."line_new_order_notice"("p_order_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."line_paid_dispatch_messages"("p_order_id" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare j jsonb; v_agents jsonb;
begin
  j := public.dispatch_paid_order(p_order_id);
  if coalesce((j->>'ok')::boolean, false) and not coalesce((j->>'is_test')::boolean, false) then
    select coalesce(jsonb_agg(x.line_user_id), '[]'::jsonb) into v_agents
      from public.line_targets_for_tambon_admin((j->>'tambon_id')::uuid) x;
  end if;
  return j || jsonb_build_object('agent_to', coalesce(v_agents, '[]'::jsonb));
end $$;


ALTER FUNCTION "public"."line_paid_dispatch_messages"("p_order_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."line_partner_flow"("p_line_user_id" "text", "p_arg" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare p public.profiles%rowtype; a jsonb; result jsonb; jobs jsonb; shop public.merchants%rowtype; payouts jsonb;
  base constant text:='https://delivery-tambon-app-v3.vercel.app'; target bigint;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'ไม่มีสิทธิ์' using errcode='42501'; end if;
  begin a:=coalesce(p_arg::jsonb,'{}'); exception when others then return jsonb_build_object('ok',false,'error','bad_action'); end;
  select * into p from public.profiles where line_user_id=p_line_user_id;
  if a->>'action'='register' or p.id is null then
    return jsonb_build_object('ok',true,'view','partner','title','สมัครลูกค้าใหม่','text','สมัครครั้งเดียว เลือกตำบล ชื่อ และเบอร์ติดต่อจัดส่ง','links',jsonb_build_object('สมัครลูกค้า',base||'/liff/register'));
  end if;
  if p.suspended_at is not null then return jsonb_build_object('ok',false,'error','account_suspended'); end if;
  if a->>'action' in ('finance','payout_prompt','payout_sent') then
    return public.line_finance_flow(p_line_user_id,a);
  elsif a->>'action'='reject_shop_prompt' then
    if p.role<>'merchant' or not p.approved then return jsonb_build_object('ok',false,'error','not_approved'); end if;
    begin target:=(a->>'order_id')::bigint; exception when others then return jsonb_build_object('ok',false,'error','bad_action'); end;
    if not exists(select 1 from public.orders o join public.merchants m on m.id=o.merchant_id where o.id=target and m.profile_id=p.id
      and o.status='pending' and o.customer_paid_at is null and o.slip_submitted_at is null and o.driver_id is null) then
      return jsonb_build_object('ok',false,'error','contact_agent');
    end if;
    return jsonb_build_object('ok',true,'view','partner_reject_confirm','order_id',target);
  end if;
  if a->>'action' in ('accept_shop','ready','reject_shop','accept_driver','pickup','deliver') then
    begin
      result:=public.partner_order_action_core(p.id,(a->>'order_id')::bigint,a->>'action',(a->>'action_id')::uuid);
    exception when invalid_text_representation then return jsonb_build_object('ok',false,'error','bad_action'); end;
    return result||jsonb_build_object('view','partner_result');
  elsif a->>'action' in ('open_shop','close_shop') then
    if p.role<>'merchant' or not p.approved then return jsonb_build_object('ok',false,'error','not_approved'); end if;
    update public.merchants set is_open=(a->>'action'='open_shop') where profile_id=p.id;
    return jsonb_build_object('ok',found,'view','partner_result','text',case when a->>'action'='open_shop' then 'เปิดรับออเดอร์แล้ว (ตามเวลาร้านที่ตั้งไว้)' else 'พักรับออเดอร์ใหม่แล้ว งานเดิมยังทำต่อได้' end);
  elsif a->>'action' in ('stock','item_on','item_off') then
    if p.role<>'merchant' or not p.approved then return jsonb_build_object('ok',false,'error','not_approved'); end if;
    select * into shop from public.merchants where profile_id=p.id limit 1;
    if a->>'action'<>'stock' then
      begin
        update public.menu_items set is_available=(a->>'action'='item_on') where id=(a->>'item_id')::uuid and merchant_id=shop.id;
      exception when invalid_text_representation then return jsonb_build_object('ok',false,'error','bad_action'); end;
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'available',m.is_available) order by m.name),'[]') into jobs
      from (select * from public.menu_items where merchant_id=shop.id and not is_hidden order by name limit 20) m;
    return jsonb_build_object('ok',true,'view','stock','title','ของหมด / มีของ','items',jobs);
  elsif a->>'action' in ('go_online','go_offline') then
    if p.role<>'driver' or not p.approved then return jsonb_build_object('ok',false,'error','not_approved'); end if;
    update public.drivers set is_online=(a->>'action'='go_online'), updated_at=now() where profile_id=p.id;
    if not found then return jsonb_build_object('ok',false,'error','not_approved'); end if;
    return jsonb_build_object('ok',true,'view','partner_result','text',case when a->>'action'='go_online'
      then 'ออนไลน์แล้ว งานใหม่ในตำบลจะขึ้นใน งานไรเดอร์' else 'ออฟไลน์แล้ว ไม่รับงานใหม่ งานเดิมยังทำต่อได้' end);
  elsif a->>'action'='confirm_payout' then
    begin target:=(a->>'settlement_id')::bigint; exception when others then return jsonb_build_object('ok',false,'error','bad_action'); end;
    perform 1 from public.settlements where id=target and payee_profile_id=p.id and paid_out_at is not null for update;
    if not found then return jsonb_build_object('ok',false,'error','not_your_payout'); end if;
    update public.settlements set confirmed_at=now() where id=target and confirmed_at is null;
    return jsonb_build_object('ok',true,'view','partner_result','text','บันทึกว่าคุณตรวจพบเงินเข้าบัญชีแล้ว');
  end if;
  if p.role='merchant' and p.approved then
    select * into shop from public.merchants where profile_id=p.id limit 1;
    select coalesce(jsonb_agg(j),'[]') into jobs from (
      select o.id,o.status,o.merchant_accepted_at,o.food_ready_at,o.customer_paid_at,
        o.note,o.items_subtotal,o.dropoff,o.slip_submitted_at,o.driver_id,
        (select jsonb_agg(jsonb_build_object('name',oi.name,'qty',oi.qty)) from public.order_items oi where oi.order_id=o.id) items
      from public.orders o where o.merchant_id=shop.id and o.status in ('pending','accepted','in_progress') order by o.created_at limit 10
    ) j;
    select coalesce(jsonb_agg(j),'[]') into payouts from (select id,amount from public.settlements where payee_profile_id=p.id and paid_out_at is not null and confirmed_at is null order by paid_out_at limit 10) j;
    return jsonb_build_object('ok',true,'view','partner','role','merchant','title','งานร้าน '||shop.name,'jobs',jobs,'payouts',payouts,'shop_open',shop.is_open,
      'links',jsonb_build_object('ตั้งเวลา / เมนู',base||'/merchant','QR รับเงิน',base||'/account','ออเดอร์และเสียง',base||'/merchant/orders'));
  elsif p.role='driver' and p.approved then
    select coalesce(jsonb_agg(j),'[]') into jobs from (
      select o.id,o.status,o.driver_id,o.pickup,o.dropoff,o.delivery_fee,o.customer_paid_at from public.orders o
      where o.tambon_id=p.tambon_id and o.is_test=p.is_test and (
        (o.driver_id=p.id and o.status in ('accepted','in_progress')) or
        (o.status='pending' and o.driver_id is null and (o.type<>'food' or o.customer_paid_at is not null) and exists(select 1 from public.drivers dr where dr.profile_id=p.id and dr.is_online and (o.required_vehicle_type is null or dr.vehicle_type=o.required_vehicle_type))))
      order by (o.driver_id=p.id) desc nulls last,o.created_at limit 10
    ) j;
    select coalesce(jsonb_agg(j),'[]') into payouts from (select id,amount from public.settlements where payee_profile_id=p.id and paid_out_at is not null and confirmed_at is null order by paid_out_at limit 10) j;
    return jsonb_build_object('ok',true,'view','partner','role','driver','online',(select d.is_online from public.drivers d where d.profile_id=p.id),'title','งานไรเดอร์ในตำบลของคุณ','jobs',jobs,'payouts',payouts,
      'links',jsonb_build_object('ออนไลน์ / ตำแหน่ง / เสียง',base||'/driver','QR รับเงิน',base||'/account'));
  elsif coalesce((public.line_staff_context(p_line_user_id)->>'is_staff')::boolean,false) then
    return public.line_finance_flow(p_line_user_id,a);
  else
    return jsonb_build_object('ok',true,'view','partner','title','บัญชีลูกค้า','links',jsonb_build_object('เลือกอาหาร',base||'/liff','บัญชีของฉัน',base||'/account'));
  end if;
end $$;


ALTER FUNCTION "public"."line_partner_flow"("p_line_user_id" "text", "p_arg" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."line_payment_instructions"("p_order_id" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  o public.orders%rowtype;
  t public.tambons%rowtype;
  v_total numeric;
  v_amount text;
  v_text text;
  v_qr text;
begin
  select * into o from public.orders where id = p_order_id;
  if not found or o.status = 'cancelled' or o.customer_paid_at is not null or o.slip_submitted_at is not null then
    return jsonb_build_object('text', null, 'qr_url', null);
  end if;
  select * into t from public.tambons where id = o.tambon_id;
  v_total := nullif(public.order_customer_total(o), 0);
  v_amount := to_char(v_total, 'FM999999990.00');

  if t.settlement_promptpay_id is null then
    v_text := 'ชำระเงินตามที่ตัวแทนตำบลแจ้งครับ'
              || coalesce(E'\nยอดที่ต้องชำระ ' || to_char(v_total, 'FM999,999,990.##') || ' บาท', '');
  else
    v_qr := 'https://promptpay.io/' || regexp_replace(t.settlement_promptpay_id, '[^0-9]', '', 'g')
            || coalesce('/' || v_amount, '') || '.png';
    v_text := '💳 ชำระเงินออเดอร์ #' || o.id
              || coalesce(E'\nยอด ' || to_char(v_total, 'FM999,999,990.##') || ' บาท', '')
              || E'\nสแกน QR ด้านล่าง หรือโอนพร้อมเพย์: ' || t.settlement_promptpay_id
              || coalesce(E'\nชื่อบัญชี: ' || t.settlement_account_name, '')
              || E'\n\nโอนแล้ว ส่งรูปสลิปในแชทนี้ได้เลยครับ ตัวแทนตำบลจะตรวจและยืนยันให้';
  end if;
  return jsonb_build_object('text', v_text, 'qr_url', v_qr, 'total', v_total);
end $$;


ALTER FUNCTION "public"."line_payment_instructions"("p_order_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."line_places"("p_line_user_id" "text", "p_category" "text") RETURNS TABLE("id" "uuid", "name" "text", "address" "text", "phone" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select pl.id, pl.name, pl.address, pl.phone
  from public.places pl
  join public.profiles p on p.tambon_id = pl.tambon_id
  where p.line_user_id = p_line_user_id and pl.category = p_category
  order by pl.name;
$$;


ALTER FUNCTION "public"."line_places"("p_line_user_id" "text", "p_category" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."line_pwa_links"("p_line_user_id" "text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  with base as (select 'https://delivery-tambon-app-v3.vercel.app' as url),
  t as (
    select t.id, t.slug, t.is_active,
           (case when t.name like 'ตำบล%' or t.name like 'แขวง%' then t.name
                 when coalesce(t.province, '') like 'กรุงเทพ%' then 'แขวง' || t.name
                 else 'ตำบล' || t.name end) as label,
           nullif(concat_ws(' ', t.district, t.province), '') as area
    from public.tambons t where t.slug is not null
  ),
  me as (select p.tambon_id from public.profiles p where p.line_user_id = p_line_user_id)
  select jsonb_build_object(
    'home', (select url || '/delivery' from base),
    'my', (select jsonb_build_object('slug', t.slug, 'label', t.label, 'area', t.area, 'active', t.is_active,
                                     'url', (select url from base) || '/t/' || t.slug)
             from t join me on me.tambon_id = t.id),
    'tambons', coalesce((select jsonb_agg(jsonb_build_object('slug', t.slug, 'label', t.label, 'area', t.area, 'active', t.is_active,
                                                             'url', (select url from base) || '/t/' || t.slug)
                                          order by t.is_active desc, t.label) from t), '[]'::jsonb)
  );
$$;


ALTER FUNCTION "public"."line_pwa_links"("p_line_user_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."line_refund_notice"("p_order_id" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  o public.orders%rowtype; r public.order_refunds%rowtype; t public.tambons%rowtype;
  v_line text; v_phone text; v_name text; v_agents jsonb; v_amt text;
  v_base constant text := 'https://delivery-tambon-app-v3.vercel.app';
begin
  select * into r from public.order_refunds where order_id = p_order_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_refund'); end if;
  select * into o from public.orders where id = p_order_id;
  select * into t from public.tambons where id = o.tambon_id;
  select line_user_id, phone, full_name into v_line, v_phone, v_name from public.profiles where id = o.customer_id;
  select coalesce(jsonb_agg(x.line_user_id), '[]'::jsonb) into v_agents from public.line_targets_for_tambon_admin(o.tambon_id) x;
  v_amt := to_char(r.amount, 'FM999,999,990.##');
  return jsonb_build_object(
    'ok', true, 'order_id', o.id, 'is_test', o.is_test,
    'customer_line', v_line,
    'customer_text', '❌ ออเดอร์ #' || o.id || ' ถูกยกเลิก เพราะยังไม่มีไรเดอร์รับงาน' || E'\n'
        || 'ตัวแทนตำบลจะโอนเงิน ' || v_amt || ' บาท คืนให้ครับ ขออภัยในความไม่สะดวก',
    'agent_to', v_agents,
    'agent_text', '💸 ต้องคืนเงินลูกค้า ออเดอร์ #' || o.id || E'\nพื้นที่: ' || coalesce(t.name, '-')
        || E'\nยอดคืน ' || v_amt || ' บาท (' || coalesce(r.payment_method, '-') || ')'
        || E'\nลูกค้า: ' || coalesce(v_name, '-') || coalesce(' โทร ' || v_phone, '')
        || E'\nสาเหตุ: ' || r.reason
        || E'\nโอนคืนแล้วกด "โอนคืนแล้ว" ที่หน้างานตำบล: ' || v_base || '/admin/workspace' || coalesce('?t=' || t.slug, ''));
end $$;


ALTER FUNCTION "public"."line_refund_notice"("p_order_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."line_signup_customer"("p_line_user_id" "text", "p_name" "text", "p_phone" "text", "p_tambon_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
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
end $_$;


ALTER FUNCTION "public"."line_signup_customer"("p_line_user_id" "text", "p_name" "text", "p_phone" "text", "p_tambon_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."line_signup_tambon_admins"("p_tambon_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select jsonb_build_object('to', coalesce(jsonb_agg(x.line_user_id), '[]'::jsonb))
  from public.line_targets_for_tambon_admin(p_tambon_id) x;
$$;


ALTER FUNCTION "public"."line_signup_tambon_admins"("p_tambon_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."line_signup_tambons"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select jsonb_build_object('tambons', coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'label', t.label) order by t.label), '[]'::jsonb))
  from (
    select id,
           (case when name like 'ตำบล%' or name like 'แขวง%' then name
                 when coalesce(province, '') like 'กรุงเทพ%' then 'แขวง' || name
                 else 'ตำบล' || name end)
           || coalesce(' · ' || nullif(concat_ws(' ', district, province), ''), '') as label
    from public.tambons
  ) t;
$$;


ALTER FUNCTION "public"."line_signup_tambons"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."line_slip_target"("p_line_user_id" "text") RETURNS TABLE("profile_role" "text", "order_id" bigint, "tambon_id" "uuid", "tambon_slug" "text", "total" numeric, "slip_state" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
       and o2.status in ('pending', 'accepted', 'in_progress', 'delivered')
       and o2.customer_paid_at is null
     order by o2.created_at desc, o2.id desc
     limit 1
  ) o on true
  left join public.tambons t on t.id = o.tambon_id;
$$;


ALTER FUNCTION "public"."line_slip_target"("p_line_user_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."line_staff_context"("p_line_user_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  p record;
  lvl text;
  scope uuid[];
  global boolean := false;
  per_tambon jsonb;
begin
  select level into lvl from public.staff_line_accounts where line_user_id = p_line_user_id;
  select id, role::text as role, full_name, tambon_id, approved into p
    from public.profiles where line_user_id = p_line_user_id limit 1;

  if lvl is null and p.id is not null then
    if p.role = 'superadmin' then
      lvl := 'superadmin';
    elsif exists (select 1 from public.admin_scopes s where s.profile_id = p.id and s.tambon_id is null) then
      lvl := 'admin';
    elsif (p.role = 'admin' and coalesce(p.approved, false) and p.tambon_id is not null)
       or exists (select 1 from public.admin_scopes s where s.profile_id = p.id) then
      lvl := 'tambon_agent';
    end if;
  end if;

  if lvl is null then
    return jsonb_build_object('is_staff', false);
  end if;

  global := lvl in ('superadmin', 'admin');
  if global then
    select array_agg(id) into scope from public.tambons;
  else
    select array_agg(distinct x) into scope from (
      select p.tambon_id as x where p.role = 'admin' and p.tambon_id is not null
      union all
      select s.tambon_id from public.admin_scopes s where s.profile_id = p.id and s.tambon_id is not null
    ) q;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'tambon', t.name,
      'active', t.is_active,
      'orders_today', (select count(*) from public.orders o where o.tambon_id = t.id and not o.is_test
                         and o.created_at >= date_trunc('day', now() at time zone 'Asia/Bangkok') at time zone 'Asia/Bangkok'),
      'orders_open_by_status', (select coalesce(jsonb_object_agg(status, c), '{}'::jsonb) from (
                         select o.status, count(*) c from public.orders o where o.tambon_id = t.id and not o.is_test
                            and o.status in ('pending', 'accepted', 'in_progress') group by o.status) s),
      'orders_pending_over_15min', (select count(*) from public.orders o where o.tambon_id = t.id and not o.is_test
                         and o.status = 'pending' and o.created_at < now() - interval '15 minutes'),
      'slips_waiting_verify', (select count(*) from public.orders o where o.tambon_id = t.id and not o.is_test
                         and o.slip_submitted_at is not null and o.customer_paid_at is null and o.payment_rejected_at is null),
      'settlements_unpaid', (select jsonb_build_object('count', count(*), 'amount', coalesce(sum(amount), 0))
                         from public.settlements st where st.tambon_id = t.id and st.paid_out_at is null),
      'merchants', (select jsonb_build_object('total', count(*), 'open_now', count(*) filter (where m.is_open))
                         from public.merchants m where m.tambon_id = t.id and not m.is_test),
      'drivers_online', (select count(*) from public.drivers d join public.profiles dp on dp.id = d.profile_id
                         where dp.tambon_id = t.id and d.is_online and not dp.is_test),
      'pending_approvals', (select jsonb_object_agg(role, c) from (
                         select pp.role::text as role, count(*) c from public.profiles pp
                          where pp.tambon_id = t.id and not pp.approved and not pp.is_test group by pp.role) a),
      'complaints_open', (select count(*) from public.complaints c where c.tambon_id = t.id and not c.is_test
                         and c.status not in ('closed', 'resolved', 'rejected'))
    ) || public.staff_tambon_detail(t.id) || jsonb_build_object('agent_names', (
        select coalesce(jsonb_agg(ap.full_name order by ap.full_name,ap.id), '[]'::jsonb)
        from public.profiles ap
        where (ap.role='admin' and coalesce(ap.approved,false) and ap.tambon_id=t.id)
           or exists (select 1 from public.admin_scopes axs where axs.profile_id=ap.id and axs.tambon_id=t.id)
      )) order by t.name), '[]'::jsonb)
    into per_tambon
    from public.tambons t where t.id = any(coalesce(scope, '{}'));

  return jsonb_build_object(
    'is_staff', true,
    'level', lvl,
    'level_th', case lvl when 'superadmin' then 'ผู้ดูแลสูงสุด' when 'admin' then 'แอดมินกลาง' else 'ตัวแทนตำบล' end,
    'name', p.full_name,
    'generated_at', now(),
    'tambons', per_tambon,
    'web_applications_pending', case when global
      then (select count(*) from public.web_applications w where w.status = 'pending') end,
    'tambon_applications_pending', case when lvl = 'superadmin'
      then (select count(*) from public.tambon_applications ta where ta.status = 'pending') end,
    'tambon_applications', case when lvl = 'superadmin'
      then (select coalesce(jsonb_agg(jsonb_build_object('tambon', ta.tambon_name, 'district', ta.district, 'province', ta.province,
              'status', ta.status, 'created_at', ta.created_at, 'merchant_count', ta.merchant_count, 'driver_count', ta.driver_count,
              'deposit_received', ta.deposit_received_at is not null, 'review_note', ta.review_note) order by ta.created_at desc), '[]'::jsonb)
            from (select * from public.tambon_applications order by created_at desc limit 10) ta) end,
    'links', jsonb_build_object(
      'หน้าแอดมิน', 'https://delivery-tambon-app-v3.vercel.app/admin',
      'ออเดอร์ (แอดมิน)', 'https://delivery-tambon-app-v3.vercel.app/admin/orders',
      'อนุมัติร้าน/ไรเดอร์', 'https://delivery-tambon-app-v3.vercel.app/admin/approvals',
      'ตั้งค่าตำบล', 'https://delivery-tambon-app-v3.vercel.app/admin/settings',
      'ประกาศ/บอร์ดตำบล', 'https://delivery-tambon-app-v3.vercel.app/admin/board',
      'ขอเปิดตำบลใหม่', 'https://delivery-tambon-app-v3.vercel.app/apply-tambon',
      'สมัครร้านค้า/ไรเดอร์', 'https://delivery-tambon-app-v3.vercel.app/signup',
      'หน้าแรกบริการ', 'https://delivery-tambon-app-v3.vercel.app/delivery')
  );
end;
$$;


ALTER FUNCTION "public"."line_staff_context"("p_line_user_id" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."line_staff_context"("p_line_user_id" "text") IS 'บริบทผู้ช่วยผู้ดูแลใน LINE: ระดับ (superadmin/admin/tambon_agent) + ตัวเลขสดเฉพาะตำบลที่มีสิทธิ์ · ไม่ใช่ผู้ดูแล → is_staff=false · เรียกผ่าน service role (n8n)';



CREATE OR REPLACE FUNCTION "public"."line_staff_level"("p_line_user_id" "text") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select jsonb_build_object('level', coalesce(
    (select level from public.staff_line_accounts where line_user_id = p_line_user_id),
    (select case
       when p.role = 'superadmin' then 'superadmin'
       when exists (select 1 from public.admin_scopes s where s.profile_id = p.id and s.tambon_id is null) then 'admin'
       when (p.role = 'admin' and coalesce(p.approved, false) and p.tambon_id is not null)
         or exists (select 1 from public.admin_scopes s where s.profile_id = p.id) then 'tambon_agent'
     end
     from public.profiles p where p.line_user_id = p_line_user_id limit 1)
  ));
$$;


ALTER FUNCTION "public"."line_staff_level"("p_line_user_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."line_targets_for_new_order"("p_order_id" bigint) RETURNS TABLE("line_user_id" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select p.line_user_id
  from public.orders o
  join public.profiles p on p.tambon_id = o.tambon_id
  where o.id = p_order_id
    and p.role = 'driver'
    and coalesce(p.approved, false)
    and p.line_user_id is not null
    -- ไม่ส่งหาคนสั่งเอง เผื่อลูกค้าเป็นไรเดอร์ด้วย
    and p.id <> o.customer_id
    -- นโยบาย D28 ข้อ 4: ออเดอร์ทดสอบถึงไรเดอร์ทดสอบเท่านั้น ออเดอร์จริงไม่ถึงไรเดอร์ทดสอบ
    and p.is_test = o.is_test;
$$;


ALTER FUNCTION "public"."line_targets_for_new_order"("p_order_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."line_targets_for_tambon_admin"("p_tambon_id" "uuid") RETURNS TABLE("line_user_id" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select distinct p.line_user_id
  from public.profiles p
  where p.line_user_id is not null
    and (
      (p.role = 'admin' and coalesce(p.approved, false) and p.tambon_id = p_tambon_id)
      or exists (select 1 from public.admin_scopes s
                  where s.profile_id = p.id
                    and (s.tambon_id = p_tambon_id or s.tambon_id is null))
    );
$$;


ALTER FUNCTION "public"."line_targets_for_tambon_admin"("p_tambon_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."line_verify_payment"("p_line_user_id" "text", "p_order_id" bigint, "p_action" "text", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  o public.orders%rowtype;
  v_actor uuid;
  v_customer_line text;
  v_total numeric;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'ไม่มีสิทธิ์'; end if;
  select * into o from public.orders where id = p_order_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if not (p_line_user_id = any (public.central_admin_line_ids())
          or exists (select 1 from public.line_targets_for_tambon_admin(o.tambon_id) x where x.line_user_id = p_line_user_id)) then
    return jsonb_build_object('ok', false, 'reason', 'not_agent');
  end if;
  select line_user_id into v_customer_line from public.profiles where id = o.customer_id;
  if v_customer_line = p_line_user_id then return jsonb_build_object('ok', false, 'reason', 'own_order'); end if;
  if o.customer_paid_at is not null then return jsonb_build_object('ok', false, 'reason', 'already_paid', 'order_id', o.id); end if;
  if o.slip_submitted_at is null then return jsonb_build_object('ok', false, 'reason', 'no_slip', 'order_id', o.id); end if;
  if o.status = 'cancelled' then return jsonb_build_object('ok', false, 'reason', 'cancelled', 'order_id', o.id); end if;

  select id into v_actor from public.profiles where line_user_id = p_line_user_id;
  v_total := public.order_customer_total(o);

  if p_action = 'ok' then
    perform public.payment_verify_core(o.id, v_actor);
    insert into public.admin_actions (actor_id, target_id, action, note)
    values (coalesce(v_actor, o.customer_id), o.customer_id, 'order.payment_verified_line', 'ยืนยันเงินเข้า ออเดอร์ #' || o.id || ' ผ่าน LINE');
    return jsonb_build_object('ok', true, 'action', 'ok', 'order_id', o.id, 'total', v_total);
  elsif p_action = 'reject' then
    update public.orders
       set payment_rejected_at = now(),
           payment_reject_reason = left(coalesce(nullif(btrim(p_reason), ''), 'ยังไม่พบยอดเงินเข้าบัญชี'), 300)
     where id = o.id;
    insert into public.admin_actions (actor_id, target_id, action, note)
    values (coalesce(v_actor, o.customer_id), o.customer_id, 'order.payment_rejected_line', 'แจ้งยอดไม่เข้า ออเดอร์ #' || o.id || ' ผ่าน LINE');
    return jsonb_build_object('ok', true, 'action', 'reject', 'order_id', o.id, 'total', v_total,
                              'customer_line', v_customer_line);
  end if;
  return jsonb_build_object('ok', false, 'reason', 'bad_action');
end $$;


ALTER FUNCTION "public"."line_verify_payment"("p_line_user_id" "text", "p_order_id" bigint, "p_action" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."link_platform_listing"("p_sku" "text", "p_platform" "text", "p_url" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare
  item text;
  listing_id uuid;
begin
  if p_platform = 'shopee' then
    item := (regexp_match(p_url, '\.(\d+)\.(\d+)'))[2];
    if item is null then
      item := (regexp_match(p_url, '/product/\d+/(\d+)'))[1];
    end if;
  elsif p_platform = 'lazada' then
    item := (regexp_match(p_url, '-i(\d+)(?:-s\d+)?\.html'))[1];
  else
    raise exception 'platform ต้องเป็น shopee หรือ lazada';
  end if;

  if item is null then
    raise exception 'ไม่พบรหัสสินค้าในลิงก์: %', p_url;
  end if;

  insert into platform_listings (product_id, platform, platform_item_id, affiliate_url)
  select p.id, p_platform, item, p_url
  from products p
  where p.sku = p_sku
  on conflict (platform, platform_item_id) do update
    set product_id = excluded.product_id, affiliate_url = excluded.affiliate_url
  returning id into listing_id;

  if listing_id is null then
    raise exception 'ไม่พบสินค้า sku %', p_sku;
  end if;

  return item;
end $$;


ALTER FUNCTION "public"."link_platform_listing"("p_sku" "text", "p_platform" "text", "p_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."llp_payment_succeeded"("p_event_id" "text", "p_charge_id" "text", "p_amount_satang" bigint, "p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  pay public.llp_payments%rowtype;
  o public.orders%rowtype;
  res jsonb;
begin
  insert into public.llp_payment_events (provider, event_id, payload) values ('opn', p_event_id, p_payload)
    on conflict do nothing;
  if not found then return jsonb_build_object('ok', true, 'duplicate', true); end if;

  select * into pay from public.llp_payments where provider_charge_id = p_charge_id for update;
  if not found then res := jsonb_build_object('ok', false, 'error', 'unknown_charge');
  elsif pay.status = 'paid' then res := jsonb_build_object('ok', true, 'duplicate', true, 'order_id', pay.order_id);
  elsif round(pay.amount * 100) <> p_amount_satang then res := jsonb_build_object('ok', false, 'error', 'amount_mismatch', 'order_id', pay.order_id);
  else
    update public.llp_payments set status = 'paid', paid_at = now() where id = pay.id;
    select * into o from public.orders where id = pay.order_id for update;
    if o.status = 'cancelled' then
      res := jsonb_build_object('ok', false, 'error', 'order_cancelled', 'needs_refund', true, 'order_id', o.id);
    else
      update public.orders set slip_submitted_at = coalesce(slip_submitted_at, now()), payment_method = 'llp_opn' where id = o.id;
      perform public.payment_verify_core(o.id, null);
      res := jsonb_build_object('ok', true, 'newly_paid', true, 'order_id', o.id);
    end if;
  end if;
  update public.llp_payment_events set result = res where provider = 'opn' and event_id = p_event_id;
  return res;
end $$;


ALTER FUNCTION "public"."llp_payment_succeeded"("p_event_id" "text", "p_charge_id" "text", "p_amount_satang" bigint, "p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_order_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if (tg_op = 'INSERT') or (old.status is distinct from new.status) then
    insert into public.order_events(order_id, status, note)
    values (new.id, new.status, case when tg_op = 'INSERT' then 'order created' else null end);
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."log_order_status_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."make_ref"("p_prefix" "text", "p_id" bigint) RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare
  d text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  body text;
  acc int := 0;
  i int;
begin
  if p_id is null then return null; end if;
  body := lpad(public.base36(p_id), 6, '0');
  -- ถ่วงน้ำหนักตามตำแหน่ง จับได้ทั้งพิมพ์ผิดตัวเดียวและสลับตำแหน่งสองตัวติดกัน
  for i in 1..length(body) loop
    acc := acc + (position(substr(body, i, 1) in d) - 1) * i;
  end loop;
  return p_prefix || body || substr(d, (acc % 36) + 1, 1);
end $$;


ALTER FUNCTION "public"."make_ref"("p_prefix" "text", "p_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_payout_sent"("p_settlement_id" bigint, "p_slip_url" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare s public.settlements%rowtype;
begin
  select * into s from public.settlements where id = p_settlement_id for update;
  if not found then raise exception 'ไม่พบรายการ'; end if;
  if not public.can_admin_tambon(s.tambon_id) then raise exception 'ทำได้เฉพาะตัวแทนของตำบลนี้'; end if;
  if s.paid_out_at is not null then raise exception 'รายการนี้โอนออกไปแล้ว'; end if;

  update public.settlements
    set paid_out_at = now(), paid_out_slip_url = p_slip_url
    where id = p_settlement_id;

  perform public.refresh_intake_block(s.tambon_id);
end;
$$;


ALTER FUNCTION "public"."mark_payout_sent"("p_settlement_id" bigint, "p_slip_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."merchants_suspension_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.is_open and (tg_op = 'INSERT' or not old.is_open)
     and exists (select 1 from public.profiles p where p.id = new.profile_id and p.suspended_at is not null) then
    raise exception 'ร้านนี้ถูกระงับอยู่ เปิดร้านไม่ได้จนกว่าตัวแทนตำบลจะคืนสิทธิ์' using errcode = '42501';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."merchants_suspension_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."message_flow"("p_user" "text", "p_input" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_in text := btrim(coalesce(p_input, ''));
  v_prof record; v_sess public.message_sessions;
  v_hq boolean; v_scope uuid[]; v_agent boolean; v_role text; v_tambon uuid; v_tname text;
  v_parts text[]; v_act text; v_arg text; v_d jsonb; v_m public.messages; v_orig public.messages;
  v_to_label text; v_btns jsonb; v_warn boolean; v_ticket text; v_recips text[];
  v_push jsonb := '[]'::jsonb; v_text text; v_aud text[]; v_can boolean; v_nick text; v_real text;
  v_list text; v_res jsonb;
begin
  if v_in like 'msg|%' then
    v_parts := string_to_array(v_in, '|'); v_act := v_parts[2]; v_arg := v_parts[3];
  elsif v_in = 'ส่งข้อความ' then v_act := 'start';
  elsif v_in = 'ติดตามข้อความ' then v_act := 'mine';
  elsif v_in = 'กล่องข้อความ' then v_act := 'inbox';
  elsif v_in ~ '^ตั้งชื่อแสดง\s' then v_act := 'nick'; v_arg := btrim(regexp_replace(v_in, '^ตั้งชื่อแสดง\s*', ''));
  end if;

  select * into v_sess from public.message_sessions where line_user_id = p_user;
  if v_sess.updated_at < now() - interval '30 minutes' then v_sess.step := null; v_sess.draft := '{}'::jsonb; end if;

  -- สอนคำตอบ: superadmin พิมพ์ "สอนคำตอบ" หรือ "สอน" เปล่า ๆ แล้วได้วิธีสอนแบบสั้น (ไม่ใช่เรื่องข้อความ และจบร่างที่ค้างอยู่)
  if v_in in ('สอน','สอนคำตอบ') and (
       exists (select 1 from public.staff_line_accounts s where s.line_user_id = p_user and s.level = 'superadmin')
    or exists (select 1 from public.profiles p where p.line_user_id = p_user and p.role = 'superadmin')) then
    update public.message_sessions set step = null, draft = '{}'::jsonb, updated_at = now() where line_user_id = p_user;
    return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text',
      'สอนคำตอบผ่าน LINE' || E'\n' ||
      'พิมพ์: สอนคำตอบ : คำถาม/คำตอบ' || E'\n' ||
      'ตัวอย่าง: สอนคำตอบ : ตลาดนัดวันไหน/ตลาดนัดเปิดทุกวันพุธ 16:00-20:00' || E'\n' ||
      'คำตอบที่สอนจะรออนุมัติ กดอนุมัติในการ์ดที่บอทส่งกลับ' || E'\n' ||
      'ดูรายการที่รอสอน: พิมพ์ คำถามรอสอน'));
  end if;

  -- ร่างข้อความที่ค้างอยู่ (พิมพ์เรื่อง/ตอบ/เหตุผล) ต้องไม่กลืนคำสั่งของบริการอื่น เช่น "เพิ่มสินค้า":
  -- จบร่างเดิมแล้วคืน handled=false ให้ LINE OA หลักทำงานตามปกติ
  if v_sess.step is not null and v_act is null and public._is_service_command(p_user, v_in) then
    update public.message_sessions set step = null, draft = '{}'::jsonb, updated_at = now() where line_user_id = p_user;
    return jsonb_build_object('ok', true, 'handled', false);
  end if;

  if v_act is null and (v_in like 'dir|%' or v_sess.step = 'await_dnote') then
    return public.directive_flow(p_user, p_input);
  end if;

  if v_act is null then
    if v_in = 'ยกเลิก' and v_sess.step is not null then v_act := 'cancel';
    elsif v_sess.step in ('await_text','await_reply') and v_in <> '' then v_act := 'text'; v_arg := v_in;
    else return jsonb_build_object('ok', true, 'handled', false);
    end if;
  end if;

  insert into public.message_sessions(line_user_id) values (p_user) on conflict do nothing;
  select * into v_sess from public.message_sessions where line_user_id = p_user;
  if v_sess.updated_at < now() - interval '30 minutes' then v_sess.step := null; v_sess.draft := '{}'::jsonb; end if;
  select p.id, p.role::text as role, p.full_name, p.tambon_id, p.approved, coalesce(p.is_test, false) as is_test
    into v_prof from public.profiles p where p.line_user_id = p_user limit 1;
  if v_prof.id is null then
    return jsonb_build_object('ok', true, 'handled', true,
      'reply', jsonb_build_object('text', 'ยังไม่พบบัญชีของคุณ กรุณาผูกบัญชี LINE กับร้าน/ไรเดอร์ หรือเลือกตำบลก่อนใช้ส่งข้อความ ค่ะ'));
  end if;

  v_hq := v_prof.role = 'superadmin'
       or exists (select 1 from public.staff_line_accounts s where s.line_user_id = p_user and s.level in ('superadmin','admin'))
       or exists (select 1 from public.admin_scopes s where s.profile_id = v_prof.id and s.tambon_id is null);
  v_scope := array(select x from (
      select v_prof.tambon_id as x where v_prof.role = 'admin' and coalesce(v_prof.approved, false)
      union select s.tambon_id from public.admin_scopes s where s.profile_id = v_prof.id) q where x is not null);
  v_agent := not v_hq and cardinality(v_scope) > 0;
  v_role := case when v_hq then 'hq' when v_agent then 'agent'
                 when v_prof.role in ('customer','merchant','driver') then v_prof.role else 'customer' end;
  v_tambon := coalesce(v_prof.tambon_id, v_scope[1]);
  select regexp_replace(t.name, '^ตำบล', '') into v_tname from public.tambons t where t.id = v_tambon;
  v_d := v_sess.draft;

  if v_act = 'nick' then
    if v_arg = '' or char_length(v_arg) > 30 then
      return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'พิมพ์ ตั้งชื่อแสดง ตามด้วยชื่อที่ต้องการ (ไม่เกิน 30 ตัวอักษร) เช่น ตั้งชื่อแสดง ป้าบุญ'));
    end if;
    update public.message_sessions set nickname = v_arg, updated_at = now() where line_user_id = p_user;
    return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object(
      'text', 'ตั้งชื่อที่แสดงเป็น "' || v_arg || '" แล้ว' || case when v_sess.show_real then ' (จะแสดงชื่อจริงต่อท้ายด้วย)' else '' end,
      'buttons', jsonb_build_array(
        jsonb_build_object('label', case when v_sess.show_real then 'ซ่อนชื่อจริง' else 'แสดงชื่อจริงด้วย' end, 'data', 'msg|real|' || case when v_sess.show_real then 'off' else 'on' end))));
  end if;

  if v_act = 'real' then
    update public.message_sessions set show_real = (v_arg = 'on'), updated_at = now() where line_user_id = p_user;
    return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', case when v_arg = 'on' then 'จะแสดงชื่อจริงต่อท้ายชื่อที่ตั้ง' else 'จะแสดงเฉพาะชื่อที่ตั้ง' end));
  end if;

  if v_act = 'start' then
    update public.message_sessions set step = null, draft = '{}', updated_at = now() where line_user_id = p_user;
    v_btns := case v_role
      when 'hq' then jsonb_build_array(jsonb_build_object('label', 'ส่งถึงตัวแทนตำบล', 'data', 'msg|pick|agent'), jsonb_build_object('label', 'โพสต์ประกาศ', 'data', 'msg|pick|announce'))
      when 'agent' then jsonb_build_array(jsonb_build_object('label', 'ส่งถึงทีมบวรไทย', 'data', 'msg|pick|hq'))
      else jsonb_build_array(jsonb_build_object('label', 'ตัวแทนตำบลของฉัน', 'data', 'msg|pick|agent'), jsonb_build_object('label', 'ทีมบวรไทย', 'data', 'msg|pick|hq')) end;
    return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'ต้องการส่งข้อความถึงใคร', 'buttons', v_btns));
  end if;

  if v_act = 'pick' then
    if v_arg = 'hq' and v_role <> 'hq' then
      v_d := jsonb_build_object('kind', 'tambon_to_hq');
    elsif v_arg = 'agent' and v_role in ('customer','merchant','driver') then
      if v_tambon is null then
        return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'ยังไม่ได้เลือกตำบล กรุณาเลือกตำบลก่อนส่งข้อความ'));
      end if;
      v_d := jsonb_build_object('kind', 'in_tambon', 'to_tambon', v_tambon);
    elsif v_arg = 'agent' and v_role = 'hq' then
      return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'เลือกตำบลปลายทาง',
        'buttons', coalesce((select jsonb_agg(jsonb_build_object('label', t.name, 'data', 'msg|pick|t:' || t.slug) order by t.name)
                              from public.tambons t where t.is_active and t.slug is not null), '[]'::jsonb)));
    elsif v_arg like 't:%' and v_role = 'hq' then
      if not exists (select 1 from public.tambons t where t.slug = substr(v_arg, 3) and t.is_active) then
        return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'ไม่พบตำบลนี้'));
      end if;
      v_d := jsonb_build_object('kind', 'hq_to_tambon', 'to_tambon', (select t.id from public.tambons t where t.slug = substr(v_arg, 3)));
    elsif v_arg = 'announce' and v_role = 'hq' then
      update public.message_sessions set step = 'await_audience', draft = jsonb_build_object('kind', 'announce'), updated_at = now() where line_user_id = p_user;
      return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'ประกาศถึงใคร',
        'buttons', jsonb_build_array(
          jsonb_build_object('label', 'ทุกคน', 'data', 'msg|aud|all'), jsonb_build_object('label', 'ลูกค้า', 'data', 'msg|aud|customer'),
          jsonb_build_object('label', 'ร้านค้า', 'data', 'msg|aud|merchant'), jsonb_build_object('label', 'ไรเดอร์', 'data', 'msg|aud|driver'),
          jsonb_build_object('label', 'ตัวแทนตำบล', 'data', 'msg|aud|agent'))));
    else
      return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'ตัวเลือกนี้ใช้ไม่ได้กับบทบาทของคุณ พิมพ์ ส่งข้อความ เพื่อเริ่มใหม่'));
    end if;
    update public.message_sessions set step = 'await_text', draft = v_d, updated_at = now() where line_user_id = p_user;
    return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'พิมพ์เรื่องที่ต้องการแจ้ง (ไม่เกิน 500 ตัวอักษร) หรือพิมพ์ ยกเลิก'));
  end if;

  if v_act = 'aud' then
    if v_role <> 'hq' or v_sess.step is distinct from 'await_audience' or v_arg not in ('all','customer','merchant','driver','agent') then
      return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'พิมพ์ ส่งข้อความ เพื่อเริ่มใหม่'));
    end if;
    update public.message_sessions set step = 'await_text', draft = v_d || jsonb_build_object('audience', jsonb_build_array(v_arg)), updated_at = now() where line_user_id = p_user;
    return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'พิมพ์ข้อความประกาศ (ไม่เกิน 500 ตัวอักษร) หรือพิมพ์ ยกเลิก'));
  end if;

  if v_act = 'text' then
    if char_length(v_arg) > 500 then
      return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'ข้อความยาว ' || char_length(v_arg) || ' ตัวอักษร เกิน 500 กรุณาย่อแล้วพิมพ์ใหม่'));
    end if;
    v_warn := v_arg ~ '(0[0-9]{8,9}|[0-9]{13})';
    v_d := v_d || jsonb_build_object('body', v_arg);
    update public.message_sessions set step = 'confirm', draft = v_d, updated_at = now() where line_user_id = p_user;
    v_to_label := case coalesce(v_d ->> 'kind', 'reply')
      when 'in_tambon' then 'ตัวแทนตำบล' || coalesce(v_tname, '')
      when 'tambon_to_hq' then 'ทีมบวรไทย'
      when 'hq_to_tambon' then 'ตัวแทนตำบล' || coalesce((select regexp_replace(t.name, '^ตำบล', '') from public.tambons t where t.id = (v_d ->> 'to_tambon')::uuid), '')
      when 'announce' then 'ประกาศถึง: ' || (select string_agg(case a when 'all' then 'ทุกคน' else public._msg_role_th(a) end, ', ') from jsonb_array_elements_text(v_d -> 'audience') a)
      else 'ผู้ที่เกี่ยวข้องกับเรื่อง ' || (v_d ->> 'reply_ticket') end;
    return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object(
      'text', 'ตรวจก่อนส่ง' || E'\nถึง: ' || v_to_label || E'\nจาก: ' || coalesce(v_sess.nickname, v_prof.full_name, 'ไม่ระบุชื่อ')
              || coalesce(' · ตำบล' || v_tname, '') || ' · ' || public._msg_role_th(v_role) || E'\n\n' || v_arg
              || case when v_warn then E'\n\n⚠ ข้อความมีตัวเลขที่คล้ายเบอร์โทรหรือเลขบัตร ตรวจอีกครั้งว่าต้องการส่งจริง' else '' end,
      'buttons', jsonb_build_array(jsonb_build_object('label', 'ส่ง', 'data', 'msg|send'), jsonb_build_object('label', 'แก้ไข', 'data', 'msg|edit'), jsonb_build_object('label', 'ยกเลิก', 'data', 'msg|cancel'))));
  end if;

  if v_act = 'edit' then
    update public.message_sessions set step = case when v_d ? 'reply_ticket' then 'await_reply' else 'await_text' end, updated_at = now() where line_user_id = p_user;
    return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'พิมพ์ข้อความใหม่ได้เลย'));
  end if;

  if v_act = 'cancel' then
    if v_arg is not null and v_arg like 'MSG-%' then
      update public.messages set status = 'cancelled', updated_at = now()
       where ticket_no = v_arg and from_profile_id = v_prof.id and status = 'sent' and kind <> 'announce' returning * into v_m;
      if v_m.id is null then
        return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'ยกเลิกไม่ได้ เพราะผู้รับเปิดอ่านหรือรับเรื่องไปแล้ว'));
      end if;
      insert into public.message_events(message_id, event, actor_profile_id, actor_role, actor_tambon_id) values (v_m.id, 'cancelled', v_prof.id, v_role, v_tambon);
      return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'ยกเลิกเรื่อง ' || v_arg || ' แล้ว'));
    end if;
    update public.message_sessions set step = null, draft = '{}', updated_at = now() where line_user_id = p_user;
    return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'ยกเลิกแล้ว'));
  end if;

  if v_act = 'send' then
    if v_sess.step is distinct from 'confirm' or coalesce(v_d ->> 'body', '') = '' then
      return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'ไม่มีข้อความรอส่ง พิมพ์ ส่งข้อความ เพื่อเริ่มใหม่'));
    end if;
    if v_role <> 'hq' and (select count(*) from public.messages x where x.from_profile_id = v_prof.id and x.created_at > now() - interval '24 hours') >= 10 then
      return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'วันนี้ส่งครบ 10 เรื่องแล้ว กรุณารอพรุ่งนี้ หรือแจ้งทีมบวรไทย'));
    end if;
    v_nick := v_sess.nickname;
    v_real := case when v_nick is null or v_sess.show_real then v_prof.full_name end;

    if v_d ? 'reply_ticket' then
      select * into v_orig from public.messages where ticket_no = v_d ->> 'reply_ticket' for update;
      v_can := (v_role = 'hq' and v_orig.kind in ('tambon_to_hq','in_tambon'))
            or (v_role = 'agent' and v_orig.to_tambon_id = any (v_scope) and v_orig.kind in ('in_tambon','hq_to_tambon'))
            or v_orig.from_profile_id = v_prof.id;
      if v_orig.id is null or v_orig.status in ('draft','closed','cancelled') or not coalesce(v_can,false) then
        update public.message_sessions set step=null, draft='{}', updated_at=now() where line_user_id=p_user;
        return jsonb_build_object('ok',true,'handled',true,'reply',jsonb_build_object('text','ส่งคำตอบไม่ได้ เรื่องปิดหรือยกเลิกแล้ว หรือคุณไม่มีสิทธิ์ในเรื่องนี้'));
      end if;
      insert into public.message_events(message_id, event, actor_profile_id, actor_role, actor_tambon_id, note)
        values (v_orig.id, 'replied', v_prof.id, v_role, v_tambon, v_d ->> 'body');
      if v_orig.from_profile_id is distinct from v_prof.id then
        update public.messages set status = 'replied', updated_at = now() where id = v_orig.id;
        v_recips := array(select p.line_user_id from public.profiles p where p.id = v_orig.from_profile_id and p.line_user_id is not null);
      else
        update public.messages set updated_at = now() where id = v_orig.id;
        v_recips := public._msg_recipients(v_orig);
      end if;
      v_text := 'ตอบกลับเรื่อง ' || v_orig.ticket_no || E'\nจาก: ' || coalesce(v_nick || coalesce(' (' || v_real || ')', ''), v_real, 'ไม่ระบุชื่อ')
                || coalesce(' · ตำบล' || v_tname, ' · บวรไทย') || ' · ' || public._msg_role_th(v_role) || E'\n\n' || (v_d ->> 'body');
      v_push := jsonb_build_array(jsonb_build_object('to', to_jsonb(array_remove(v_recips, p_user)), 'text', v_text,
        'buttons', jsonb_build_array(jsonb_build_object('label', 'ตอบ', 'data', 'msg|reply|' || v_orig.ticket_no))));
      v_ticket := v_orig.ticket_no;
    else
      v_ticket := 'MSG-' || lpad(nextval('public.messages_ticket_seq')::text, 4, '0');
      insert into public.messages(ticket_no, kind, from_profile_id, from_tambon_id, from_role, from_nickname, from_real_name,
                                  to_tambon_id, to_hq, audience, category, body, status, is_test)
      values (v_ticket, v_d ->> 'kind', v_prof.id, case when v_role = 'hq' then null else v_tambon end, v_role, v_nick, v_real,
              nullif(v_d ->> 'to_tambon', '')::uuid, (v_d ->> 'kind') = 'tambon_to_hq',
              coalesce(array(select jsonb_array_elements_text(v_d -> 'audience')), '{}'),
              case when (v_d ->> 'kind') = 'announce' then 'announce' else 'ask' end, v_d ->> 'body', 'sent', v_prof.is_test)
      returning * into v_m;
      insert into public.message_events(message_id, event, actor_profile_id, actor_role, actor_tambon_id) values (v_m.id, 'sent', v_prof.id, v_role, v_tambon);

      if v_m.kind = 'announce' then
        v_aud := v_m.audience;
        v_recips := array(select p.line_user_id from public.profiles p
          where p.line_user_id is not null and p.line_user_id <> p_user and coalesce(p.is_test, false) = v_prof.is_test
            and ('all' = any (v_aud)
                 or (p.role::text = any (v_aud) and p.role in ('customer','merchant','driver'))
                 or ('agent' = any (v_aud) and ((p.role = 'admin' and coalesce(p.approved, false) and p.tambon_id is not null)
                                                or exists (select 1 from public.admin_scopes s where s.profile_id = p.id)))));
        if coalesce(cardinality(v_recips), 0) > 50 then
          delete from public.messages where id = v_m.id;
          return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text',
            'ประกาศนี้จะส่งถึง ' || cardinality(v_recips) || ' คน เกินที่อนุญาต 50 คนต่อครั้ง (กันโควตา LINE 300 ข้อความ/เดือน) กรุณาเลือกผู้รับเป็นบางประเภท หรือพิมพ์ ยกเลิก'));
        end if;
        v_text := 'ประกาศจากทีมบวรไทย' || E'\nเลขเรื่อง: ' || v_ticket || E'\n\n' || v_m.body;
        v_push := jsonb_build_array(jsonb_build_object('to', to_jsonb(v_recips), 'text', v_text));
      else
        v_recips := array_remove(public._msg_recipients(v_m), p_user);
        v_text := 'ข้อความใหม่' || E'\nจาก: ' || public._msg_label(v_m)
                  || E'\nถึง: ' || case v_m.kind when 'tambon_to_hq' then 'ทีมบวรไทย' else 'ตัวแทนตำบล' || coalesce((select regexp_replace(t.name, '^ตำบล', '') from public.tambons t where t.id = v_m.to_tambon_id), '') end
                  || E'\nเลขเรื่อง: ' || v_ticket || E'\n\n' || v_m.body;
        v_push := jsonb_build_array(jsonb_build_object('to', to_jsonb(v_recips), 'text', v_text,
          'buttons', jsonb_build_array(jsonb_build_object('label', 'รับเรื่อง', 'data', 'msg|accept|' || v_ticket),
                                       jsonb_build_object('label', 'ตอบ', 'data', 'msg|reply|' || v_ticket)
                                       ) || case when v_m.kind = 'in_tambon' then jsonb_build_array(jsonb_build_object('label', 'ส่งต่อบวรไทย', 'data', 'msg|fwd|' || v_ticket)) else '[]'::jsonb end));
      end if;
    end if;

    update public.message_sessions set step = null, draft = '{}', updated_at = now() where line_user_id = p_user;
    return jsonb_build_object('ok', true, 'handled', true, 'ticket', v_ticket,
      'reply', jsonb_build_object('text', 'ส่งแล้ว เลขเรื่อง ' || v_ticket || case when v_m.kind = 'announce' then ' ถึง ' || coalesce(cardinality(v_recips), 0) || ' คน' else '' end || case when coalesce(cardinality(v_recips), 0) = 0 then E'\n⚠ ยังไม่มีผู้รับที่ผูก LINE ไว้ ระบบจะแจ้งทีมบวรไทยหากไม่มีใครรับใน 24 ชม.' else '' end || E'\nพิมพ์ ติดตามข้อความ เพื่อดูสถานะ',
                                  'buttons', case when v_m.kind = 'announce' then '[]'::jsonb else jsonb_build_array(jsonb_build_object('label', 'ยกเลิกเรื่องนี้', 'data', 'msg|cancel|' || v_ticket)) end),
      'push', case when coalesce(cardinality(v_recips), 0) = 0 then '[]'::jsonb else v_push end);
  end if;

  if v_act in ('accept','reply','fwd') then
    select * into v_m from public.messages where ticket_no = v_arg for update;
    if v_m.id is null then
      return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'ไม่พบเรื่อง ' || coalesce(v_arg, '')));
    end if;
    v_can := (v_role = 'hq' and v_m.kind in ('tambon_to_hq','in_tambon'))
          or (v_role = 'agent' and v_m.to_tambon_id = any (v_scope) and v_m.kind in ('in_tambon','hq_to_tambon'));
    if v_act = 'reply' and not v_can and v_m.from_profile_id is distinct from v_prof.id then
      return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'คุณไม่ได้เกี่ยวข้องกับเรื่องนี้'));
    elsif v_act <> 'reply' and not v_can then
      return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'คุณไม่มีสิทธิ์จัดการเรื่องนี้'));
    end if;

    if v_act = 'reply' then
      if v_m.status in ('draft','closed','cancelled') then
        return jsonb_build_object('ok',true,'handled',true,'reply',jsonb_build_object('text','เรื่องนี้ปิดหรือยกเลิกแล้ว ไม่สามารถตอบกลับได้'));
      end if;
      update public.message_sessions set step = 'await_reply', draft = jsonb_build_object('reply_ticket', v_m.ticket_no), updated_at = now() where line_user_id = p_user;
      return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'พิมพ์ข้อความตอบเรื่อง ' || v_m.ticket_no || ' หรือพิมพ์ ยกเลิก'));
    end if;

    if v_act = 'accept' then
      if v_m.status not in ('sent','read','forwarded','overdue') then
        return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'เรื่องนี้สถานะ "' || public._msg_status_th(v_m.status) || '" แล้ว'));
      end if;
      update public.messages set status = 'accepted', updated_at = now() where id = v_m.id;
      insert into public.message_events(message_id, event, actor_profile_id, actor_role, actor_tambon_id) values (v_m.id, 'accepted', v_prof.id, v_role, v_tambon);
      v_recips := array(select p.line_user_id from public.profiles p where p.id = v_m.from_profile_id and p.line_user_id is not null);
      return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'รับเรื่อง ' || v_m.ticket_no || ' แล้ว'),
        'push', jsonb_build_array(jsonb_build_object('to', to_jsonb(v_recips), 'text', 'เรื่อง ' || v_m.ticket_no || ' ถูกรับแล้ว กำลังดำเนินการ')));
    end if;

    if v_m.kind <> 'in_tambon' or v_m.status in ('closed','cancelled','forwarded') then
      return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'ส่งต่อเรื่องนี้ไม่ได้'));
    end if;
    update public.messages set status = 'forwarded', updated_at = now() where id = v_m.id;
    insert into public.message_events(message_id, event, actor_profile_id, actor_role, actor_tambon_id) values (v_m.id, 'forwarded', v_prof.id, v_role, v_tambon);
    v_recips := array(select p.line_user_id from public.profiles p where p.id = v_m.from_profile_id and p.line_user_id is not null);
    return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'ส่งต่อเรื่อง ' || v_m.ticket_no || ' ให้ทีมบวรไทยแล้ว'),
      'push', jsonb_build_array(
        jsonb_build_object('to', to_jsonb(coalesce(public.central_admin_line_ids(), '{}'::text[])), 'text',
          'เรื่องส่งต่อจากตัวแทนตำบล' || E'\nจาก: ' || public._msg_label(v_m) || E'\nเลขเรื่อง: ' || v_m.ticket_no || E'\n\n' || v_m.body,
          'buttons', jsonb_build_array(jsonb_build_object('label', 'รับเรื่อง', 'data', 'msg|accept|' || v_m.ticket_no), jsonb_build_object('label', 'ตอบ', 'data', 'msg|reply|' || v_m.ticket_no))),
        jsonb_build_object('to', to_jsonb(v_recips), 'text', 'เรื่อง ' || v_m.ticket_no || ' ถูกส่งต่อให้ทีมบวรไทยแล้ว')));
  end if;

  if v_act = 'sweep' then
    if v_role <> 'hq' then
      return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'ปุ่มนี้สำหรับทีมบวรไทยเท่านั้น'));
    end if;
    v_res := public.message_sweep();
    return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text',
      'อัปเดตแล้ว: เรื่องเกินเวลา 24 ชม. ' || (v_res ->> 'count') || ' เรื่อง' || case when (v_res ->> 'count') <> '0' then E'\n' || (select string_agg(x, ', ') from jsonb_array_elements_text(v_res -> 'tickets') x) else '' end));
  end if;

  if v_act = 'mine' then
    select string_agg(x.ticket_no || ' · ' || public._msg_status_th(x.status) || ' · ' || to_char(x.created_at at time zone 'Asia/Bangkok', 'DD/MM HH24:MI'), E'\n' order by x.created_at desc)
      into v_list from (select m.ticket_no, m.status, m.created_at from public.messages m where m.from_profile_id = v_prof.id order by m.created_at desc limit 10) x;
    return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text',
      coalesce('เรื่องของฉัน (10 ล่าสุด)' || E'\n' || v_list, 'ยังไม่มีเรื่องที่ส่ง พิมพ์ ส่งข้อความ เพื่อเริ่ม')));
  end if;

  if v_act = 'inbox' then
    if v_role not in ('agent','hq') then
      return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', 'กล่องข้อความใช้ได้เฉพาะตัวแทนตำบลและทีมบวรไทย'));
    end if;
    with opened as (
      update public.messages m set status = 'read', updated_at = now()
       where m.status = 'sent' and m.is_test = v_prof.is_test and m.kind <> 'announce'
         and ((v_role = 'hq' and (m.kind = 'tambon_to_hq' or (m.kind = 'in_tambon' and exists(
           select 1 from public.message_events e where e.message_id=m.id and e.event in ('forwarded','overdue')))))
           or (v_role = 'agent' and m.kind in ('in_tambon','hq_to_tambon') and m.to_tambon_id = any (v_scope)))
      returning m.id)
    insert into public.message_events(message_id, event, actor_profile_id, actor_role, actor_tambon_id)
      select id, 'read', v_prof.id, v_role, v_tambon from opened;
    select string_agg(x.ticket_no || ' · ' || x.lbl || ' · ' || public._msg_status_th(x.status), E'\n' order by x.created_at desc)
      into v_list from (select m.ticket_no, public._msg_label(m) as lbl, m.status, m.created_at from public.messages m where m.status in ('sent','read','accepted','forwarded','overdue') and m.is_test = v_prof.is_test and m.kind <> 'announce'
        and ((v_role = 'hq' and (m.kind = 'tambon_to_hq' or (m.kind = 'in_tambon' and exists(
           select 1 from public.message_events e where e.message_id=m.id and e.event in ('forwarded','overdue')))))
           or (v_role = 'agent' and m.kind in ('in_tambon','hq_to_tambon') and m.to_tambon_id = any (v_scope)))
        order by m.created_at desc limit 10) x;
    return jsonb_build_object('ok', true, 'handled', true, 'reply', jsonb_build_object('text', coalesce('เรื่องที่รอดำเนินการ' || E'\n' || v_list, 'ไม่มีเรื่องค้าง'),
        'buttons', case when v_role = 'hq' then jsonb_build_array(jsonb_build_object('label', 'อัปเดตเรื่องค้าง', 'data', 'msg|sweep')) else '[]'::jsonb end));
  end if;

  return jsonb_build_object('ok', true, 'handled', false);
end
$$;


ALTER FUNCTION "public"."message_flow"("p_user" "text", "p_input" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."message_sweep"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare v_tickets text[];
begin
  with o as (
    update public.messages m set status = 'overdue', updated_at = now()
     where m.status in ('sent','read') and m.kind <> 'announce' and not m.is_test and m.created_at < now() - interval '24 hours'
    returning m.id, m.ticket_no)
  select array_agg(ticket_no) into v_tickets from o;
  insert into public.message_events(message_id, event, actor_role)
    select m.id, 'overdue', 'system' from public.messages m where m.ticket_no = any (coalesce(v_tickets, '{}'));
  return jsonb_build_object('count', coalesce(cardinality(v_tickets), 0), 'tickets', to_jsonb(coalesce(v_tickets, '{}')),
                            'notify', to_jsonb(coalesce(public.central_admin_line_ids(), '{}'::text[])));
end $$;


ALTER FUNCTION "public"."message_sweep"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."my_tambon_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ select tambon_id from public.profiles where id = auth.uid(); $$;


ALTER FUNCTION "public"."my_tambon_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."next_payout_due"("p_tambon" "uuid") RETURNS timestamp with time zone
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select case
    when (now() at time zone 'Asia/Bangkok')::time < t.payout_cutoff_time
      then (((now() at time zone 'Asia/Bangkok')::date + t.payout_cutoff_time) at time zone 'Asia/Bangkok')
    else (((now() at time zone 'Asia/Bangkok')::date + 1 + t.payout_cutoff_time) at time zone 'Asia/Bangkok')
  end
  from public.tambons t where t.id = p_tambon;
$$;


ALTER FUNCTION "public"."next_payout_due"("p_tambon" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_new_order"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'vault', 'extensions', 'pg_temp'
    AS $$
declare
  v_secret text;
  v_url text;
begin
  -- แจ้งเฉพาะงานที่เปิดรับจริง
  if new.status is distinct from 'pending' then
    return new;
  end if;

  begin
    select decrypted_secret into v_secret
      from vault.decrypted_secrets where name = 'notify_secret' limit 1;

    select decrypted_secret into v_url
      from vault.decrypted_secrets where name = 'notify_url' limit 1;

    -- ยังไม่ได้ตั้งค่า ก็แค่ไม่แจ้งเตือน ไม่ใช่เรื่องที่ต้องล้มการสั่งงาน
    if v_secret is null or v_url is null then
      return new;
    end if;

    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-notify-secret', v_secret),
      body    := jsonb_build_object('action', 'new_order', 'order_id', new.id),
      timeout_milliseconds := 5000
    );
  exception when others then
    -- บันทึกไว้ใน log ของฐานข้อมูลแล้วปล่อยผ่าน
    raise warning 'notify_new_order failed for order %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_new_order"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_web_application_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'net'
    AS $$
begin
  perform net.http_post(
    url := 'https://srv2091778.hstgr.cloud/webhook/web-application-new',
    body := jsonb_build_object('secret', 'MieH2GM0DswKE1pY3k-ehZEvNEvBiGt0', 'id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."notify_web_application_insert"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" bigint NOT NULL,
    "type" "public"."order_type" NOT NULL,
    "status" "public"."order_status" DEFAULT 'pending'::"public"."order_status" NOT NULL,
    "tambon_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "merchant_id" "uuid",
    "driver_id" "uuid",
    "pickup" "text",
    "dropoff" "text",
    "note" "text",
    "items_subtotal" numeric(10,2) DEFAULT 0 NOT NULL,
    "delivery_fee" numeric(10,2) DEFAULT 0 NOT NULL,
    "price" numeric(10,2) DEFAULT 0 NOT NULL,
    "payment_method" "text" DEFAULT 'พร้อมเพย์'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "plot_id" "uuid",
    "required_vehicle_type" "public"."vehicle_type",
    "scheduled_date" timestamp with time zone,
    "job_area_rai" numeric,
    "job_duration_hours" numeric,
    "pickup_lat" double precision,
    "pickup_lng" double precision,
    "dropoff_lat" double precision,
    "dropoff_lng" double precision,
    "delivered_at" timestamp with time zone,
    "customer_paid_at" timestamp with time zone,
    "customer_slip_url" "text",
    "payment_ref" "text" GENERATED ALWAYS AS ("public"."make_ref"('BT'::"text", "id")) STORED,
    "is_test" boolean DEFAULT false NOT NULL,
    "slip_submitted_at" timestamp with time zone,
    "payment_verified_by" "uuid",
    "payment_rejected_at" timestamp with time zone,
    "payment_reject_reason" "text",
    "merchant_accepted_at" timestamp with time zone,
    "food_ready_at" timestamp with time zone,
    "is_drill" boolean DEFAULT false NOT NULL,
    CONSTRAINT "orders_drill_is_test" CHECK (((NOT "is_drill") OR "is_test")),
    CONSTRAINT "orders_job_area_rai_check" CHECK ((("job_area_rai" IS NULL) OR ("job_area_rai" >= (0)::numeric))),
    CONSTRAINT "orders_job_duration_hours_check" CHECK ((("job_duration_hours" IS NULL) OR ("job_duration_hours" >= (0)::numeric)))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


COMMENT ON COLUMN "public"."orders"."payment_method" IS 'วิธีชำระเงิน: ค่าเริ่มต้นพร้อมเพย์ โอนเข้าบัญชีตัวแทนตำบลตาม tambons.settlement_promptpay_id และให้ตัวแทนตรวจยืนยันสลิป';



COMMENT ON COLUMN "public"."orders"."dropoff_lat" IS 'Real GPS latitude for delivery destination, captured via LINE location-share message at checkout.';



COMMENT ON COLUMN "public"."orders"."dropoff_lng" IS 'Real GPS longitude for delivery destination, captured via LINE location-share message at checkout.';



COMMENT ON COLUMN "public"."orders"."customer_paid_at" IS 'เวลาที่ตัวแทนตำบลยืนยันว่าเงินเข้าบัญชีตำบลแล้ว (D41 ขั้น 2)';



COMMENT ON COLUMN "public"."orders"."customer_slip_url" IS 'path ใน bucket payment-slips (<tambon_id>/<order_id>-<เวลา>.<ext>)';



COMMENT ON COLUMN "public"."orders"."payment_ref" IS 'เลขอ้างอิงให้ลูกค้าใส่ตอนโอน และให้ธนาคารส่งกลับมาใน webhook เพื่อจับคู่ออเดอร์';



COMMENT ON COLUMN "public"."orders"."is_test" IS 'ข้อมูลทดสอบ (นโยบาย D28) — ไม่นับในรายงาน สรุป อันดับ ยอดชำระ; ติดอัตโนมัติเมื่อลูกค้าหรือร้านเป็นทดสอบ';



CREATE OR REPLACE FUNCTION "public"."order_customer_total"("p_order" "public"."orders") RETURNS numeric
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select coalesce(p_order.items_subtotal, 0)
       + case when p_order.type = 'ride' then coalesce(p_order.price, 0)
              else coalesce(p_order.delivery_fee, 0) end;
$$;


ALTER FUNCTION "public"."order_customer_total"("p_order" "public"."orders") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."order_events_no_dup_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if exists (select 1 from public.order_events e
              where e.order_id = new.order_id and e.status = new.status
                and e.created_at = new.created_at) then
    raise exception 'ออเดอร์ #% มี event สถานะ % ในรายการนี้แล้ว (บันทึกอัตโนมัติจากการเปลี่ยนสถานะ) — ให้แก้ note ของแถวเดิมแทนการเพิ่มแถว',
      new.order_id, new.status using errcode = '23505';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."order_events_no_dup_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."orders_driver_settlement"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare v_amount numeric;
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered'
     and new.customer_paid_at is not null and new.driver_id is not null and not new.is_test then
    v_amount := case when new.type = 'ride' then coalesce(new.price, 0) else coalesce(new.delivery_fee, 0) end;
    if v_amount > 0 then
      insert into public.settlements (order_id, tambon_id, payee_profile_id, payee_role, amount, due_at)
      values (new.id, new.tambon_id, new.driver_id, 'driver', v_amount, public.next_payout_due(new.tambon_id))
      on conflict (order_id, payee_profile_id) do nothing;
    end if;
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."orders_driver_settlement"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."orders_guard_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_actor  uuid;
  v_reason text := btrim(coalesce(current_setting('delivery.delete_reason', true), ''));
begin
  if coalesce(current_setting('delivery.allow_order_delete', true), '') <> 'on' then
    raise exception 'ห้ามลบออเดอร์ถาวร (นโยบาย D28 ข้อ 5) — ให้ยกเลิกพร้อมเหตุผลแทน หรือขออนุมัติเจ้าของ'
      using errcode = '42501';
  end if;

  v_actor := coalesce(auth.uid(),
                      nullif(current_setting('delivery.delete_actor', true), '')::uuid);
  if v_actor is null or not exists (
       select 1 from public.profiles p where p.id = v_actor and p.role = 'superadmin') then
    raise exception 'การลบออเดอร์ต้องระบุผู้อนุมัติที่เป็น superadmin (delivery.delete_actor)'
      using errcode = '42501';
  end if;
  if char_length(v_reason) < 10 then
    raise exception 'การลบออเดอร์ต้องมีเหตุผลอย่างน้อย 10 ตัวอักษร (delivery.delete_reason)'
      using errcode = '22023';
  end if;

  insert into public.admin_actions (actor_id, target_id, action, note)
  values (v_actor, null, 'order.delete',
          left(format('order #%s (%s, %s, is_test=%s) — %s',
                      old.id, old.type, old.status, old.is_test, v_reason), 1000));
  return old;
end;
$$;


ALTER FUNCTION "public"."orders_guard_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."orders_guard_payment_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.customer_paid_at := null;
    new.customer_slip_url := null;
    new.slip_submitted_at := null;
    new.payment_verified_by := null;
    new.payment_rejected_at := null;
    new.payment_reject_reason := null;
    new.payment_ref := null;
    return new;
  end if;
  if new.customer_paid_at      is distinct from old.customer_paid_at
  or new.customer_slip_url     is distinct from old.customer_slip_url
  or new.slip_submitted_at     is distinct from old.slip_submitted_at
  or new.payment_verified_by   is distinct from old.payment_verified_by
  or new.payment_rejected_at   is distinct from old.payment_rejected_at
  or new.payment_reject_reason is distinct from old.payment_reject_reason
  or new.payment_ref           is distinct from old.payment_ref then
    raise exception 'ข้อมูลการชำระเงินแก้ได้ผ่านการส่งสลิปและการตรวจของตัวแทนตำบลเท่านั้น'
      using errcode = '42501';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."orders_guard_payment_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."orders_mark_test"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not new.is_test and (
       exists (select 1 from public.profiles p  where p.id = new.customer_id and p.is_test)
    or exists (select 1 from public.merchants m where m.id = new.merchant_id and m.is_test)) then
    new.is_test := true;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."orders_mark_test"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."orders_paid_dispatch"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'vault', 'extensions', 'pg_temp'
    AS $$
declare v_secret text; v_url text;
begin
  if old.customer_paid_at is null and new.customer_paid_at is not null
     and new.status in ('pending', 'accepted') then
    begin
      select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_secret' limit 1;
      select decrypted_secret into v_url from vault.decrypted_secrets where name = 'notify_url' limit 1;
      if v_secret is not null and v_url is not null then
        perform net.http_post(url := v_url,
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
          body := jsonb_build_object('action', 'paid', 'order_id', new.id),
          timeout_milliseconds := 5000);
      end if;
    exception when others then
      raise warning 'orders_paid_dispatch failed for order %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."orders_paid_dispatch"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."partner_order_action"("p_order_id" bigint, "p_action" "text", "p_action_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select public.partner_order_action_core(auth.uid(),p_order_id,p_action,p_action_id);
$$;


ALTER FUNCTION "public"."partner_order_action"("p_order_id" bigint, "p_action" "text", "p_action_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."partner_order_action_core"("p_actor" "uuid", "p_order_id" bigint, "p_action" "text", "p_action_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare p public.profiles%rowtype; o public.orders%rowtype; m public.merchants%rowtype;
begin
  select * into p from public.profiles where id=p_actor;
  if p.id is null or not p.approved or p.suspended_at is not null then return jsonb_build_object('ok',false,'error','not_approved'); end if;
  select * into o from public.orders where id=p_order_id for update;
  if not found then return jsonb_build_object('ok',false,'error','not_found'); end if;
  select * into m from public.merchants where id=o.merchant_id;
  if p_action in ('accept_shop','ready','reject_shop') then
    if p.role<>'merchant' or m.profile_id is distinct from p.id then return jsonb_build_object('ok',false,'error','not_your_shop'); end if;
    if o.status in ('cancelled','delivered','in_progress') then return jsonb_build_object('ok',false,'error','closed_order'); end if;
    if p_action='reject_shop' then
      if o.customer_paid_at is not null or o.slip_submitted_at is not null or o.driver_id is not null then
        return jsonb_build_object('ok',false,'error','contact_agent','text','ออเดอร์มีสลิป/รับเงิน/มอบหมายไรเดอร์แล้ว ให้ตัวแทนตรวจและจัดการคืนเงินก่อนยกเลิก');
      end if;
      update public.orders set status='cancelled' where id=o.id;
    elsif p_action='ready' then
      if o.customer_paid_at is null then return jsonb_build_object('ok',false,'error','payment_required'); end if;
      if o.food_ready_at is not null then return jsonb_build_object('ok',true,'duplicate',true); end if;
      update public.orders set merchant_accepted_at=coalesce(merchant_accepted_at,now()),food_ready_at=now() where id=o.id;
    else
      if o.merchant_accepted_at is not null then return jsonb_build_object('ok',true,'duplicate',true); end if;
      update public.orders set merchant_accepted_at=now() where id=o.id;
    end if;
  elsif p_action in ('accept_driver','pickup','deliver') then
    if p.role<>'driver' or p.tambon_id is distinct from o.tambon_id or p.is_test is distinct from o.is_test then return jsonb_build_object('ok',false,'error','not_driver'); end if;
    -- Serialize claims by this driver as well as by order, across browser/LINE callers.
    perform 1 from public.drivers where profile_id=p.id for update;
    if p_action='accept_driver' then
      if o.driver_id=p.id and o.status in ('accepted','in_progress','delivered') then return jsonb_build_object('ok',true,'duplicate',true); end if;
      if o.status<>'pending' or o.driver_id is not null or (o.type='food' and o.customer_paid_at is null) then return jsonb_build_object('ok',false,'error','job_not_ready'); end if;
      if not exists(select 1 from public.drivers d where d.profile_id=p.id and d.is_online
        and (o.required_vehicle_type is null or d.vehicle_type=o.required_vehicle_type)) then return jsonb_build_object('ok',false,'error','driver_offline'); end if;
      if (select count(*) from public.orders where driver_id=p.id and status in ('accepted','in_progress')) >= 3 then return jsonb_build_object('ok',false,'error','active_job'); end if; -- ไรเดอร์ถือได้สูงสุด 3 งานพร้อมกัน (12 ต.ค. 2569)
      update public.orders set driver_id=p.id,status='accepted' where id=o.id;
    else
      if o.driver_id is distinct from p.id then return jsonb_build_object('ok',false,'error','not_your_job'); end if;
      if o.status='delivered' or (p_action='pickup' and o.status='in_progress') then return jsonb_build_object('ok',true,'duplicate',true); end if;
      if (p_action='pickup' and o.status<>'accepted') or (p_action='deliver' and o.status<>'in_progress') then return jsonb_build_object('ok',false,'error','wrong_step'); end if;
      update public.orders set status=case when p_action='pickup' then 'in_progress'::public.order_status else 'delivered'::public.order_status end,
        delivered_at=case when p_action='deliver' then now() else delivered_at end where id=o.id;
    end if;
  else return jsonb_build_object('ok',false,'error','bad_action'); end if;
  -- The canonical order trigger may already have logged this status in this transaction.
  -- Append the action audit to that event; never insert the same (order,status,created_at) twice.
  update public.order_events set note=concat_ws(E'\n',nullif(note,''),'partner:'||p_action||' actor='||p.id||' action='||coalesce(p_action_id::text,''))
    where id=(select e.id from public.order_events e join public.orders ord on ord.id=e.order_id
      where e.order_id=o.id and e.status=ord.status and e.created_at=now() order by e.id desc limit 1);
  if not found then
    insert into public.order_events(order_id,status,note) select id,status,'partner:'||p_action||' actor='||p.id||' action='||coalesce(p_action_id::text,'') from public.orders where id=o.id;
  end if;
  return jsonb_build_object('ok',true,'order_id',o.id,'action',p_action);
end $$;


ALTER FUNCTION "public"."partner_order_action_core"("p_actor" "uuid", "p_order_id" bigint, "p_action" "text", "p_action_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."payment_verify_core"("p_order_id" bigint, "p_actor" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  o public.orders%rowtype;
  v_due timestamptz;
  v_driver_amount numeric;
  v_merchant_profile uuid;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'ไม่พบออเดอร์'; end if;
  if o.status = 'cancelled' then raise exception 'ออเดอร์นี้ถูกยกเลิกแล้ว'; end if;
  if o.customer_paid_at is not null then raise exception 'ออเดอร์นี้ยืนยันรับเงินไปแล้ว'; end if;
  if o.slip_submitted_at is null then raise exception 'ลูกค้ายังไม่ได้ส่งสลิป'; end if;

  update public.orders
     set customer_paid_at = now(), payment_verified_by = p_actor,
         payment_rejected_at = null, payment_reject_reason = null
   where id = p_order_id;

  if not o.is_test then
    select public.next_payout_due(o.tambon_id) into v_due;
    if o.merchant_id is not null and coalesce(o.items_subtotal, 0) > 0 then
      select m.profile_id into v_merchant_profile from public.merchants m where m.id = o.merchant_id;
      if v_merchant_profile is not null then
        insert into public.settlements (order_id, tambon_id, payee_profile_id, payee_role, amount, due_at)
        values (o.id, o.tambon_id, v_merchant_profile, 'merchant', o.items_subtotal, v_due)
        on conflict (order_id, payee_profile_id) do nothing;
      end if;
    end if;
    v_driver_amount := case when o.type = 'ride' then coalesce(o.price, 0) else coalesce(o.delivery_fee, 0) end;
    if o.status = 'delivered' and o.driver_id is not null and v_driver_amount > 0 then
      insert into public.settlements (order_id, tambon_id, payee_profile_id, payee_role, amount, due_at)
      values (o.id, o.tambon_id, o.driver_id, 'driver', v_driver_amount, v_due)
      on conflict (order_id, payee_profile_id) do nothing;
    end if;
  end if;
  perform public.refresh_intake_block(o.tambon_id);
end $$;


ALTER FUNCTION "public"."payment_verify_core"("p_order_id" bigint, "p_actor" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."profiles_guard_order_flag"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.can_order_as_customer is distinct from old.can_order_as_customer
     and current_user in ('authenticated', 'anon') then
    raise exception 'can_order_as_customer is set by staff only' using errcode = '42501';
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."profiles_guard_order_flag"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."profiles_guard_self_privilege"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if current_user in ('authenticated', 'anon')
     and old.id = auth.uid()
     and (new.role is distinct from old.role
          or new.approved is distinct from old.approved
          or new.tambon_id is distinct from old.tambon_id) then
    raise exception 'role, approved and tambon_id are set by staff only' using errcode = '42501';
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."profiles_guard_self_privilege"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."profiles_partner_role_line_only"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if current_user in ('authenticated', 'anon')
     and new.role in ('merchant', 'driver')
     and (tg_op = 'INSERT' or old.role is distinct from new.role)
     and not public.is_superadmin() then
    raise exception 'สมัครร้านค้า/ไรเดอร์ผ่าน LINE บวรไทยเท่านั้น · ร้านค้า: https://line.me/R/oaMessage/@227eostj/?สมัครร้านค้า · ไรเดอร์: https://line.me/R/oaMessage/@227eostj/?สมัครไรเดอร์'
      using errcode = '42501';
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."profiles_partner_role_line_only"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."profiles_protect_partner"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if coalesce(auth.role(), '') = 'service_role' and old.role in ('merchant', 'driver') then
    new.role         := old.role;
    new.full_name    := old.full_name;
    new.tambon_id    := old.tambon_id;
    new.approved     := coalesce(old.approved, false) or coalesce(new.approved, false);
    new.phone        := coalesce(nullif(btrim(new.phone), ''), old.phone);
    new.promptpay_id := coalesce(nullif(btrim(new.promptpay_id), ''), old.promptpay_id);
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."profiles_protect_partner"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."profiles_resolve_referrer"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'UPDATE' and (new.referrer_profile_id, new.referrer_phone, new.referrer_first_name, new.referrer_last_name)
        is distinct from (old.referrer_profile_id, old.referrer_phone, old.referrer_first_name, old.referrer_last_name) then
      raise exception 'referrer is set by staff only' using errcode = '42501';
    end if;
    if tg_op = 'INSERT' then new.referrer_profile_id := null; end if;
  end if;
  if new.referrer_profile_id is null and coalesce(new.referrer_phone, new.referrer_first_name, new.referrer_last_name) is not null then
    new.referrer_profile_id := public.resolve_referrer_profile(new.id, new.phone, new.referrer_phone, new.referrer_first_name, new.referrer_last_name);
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."profiles_resolve_referrer"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."profiles_suspension_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.suspended_at := null;
    new.suspended_reason := null;
    new.suspended_by := null;
    return new;
  end if;
  if new.suspended_at is distinct from old.suspended_at
  or new.suspended_reason is distinct from old.suspended_reason
  or new.suspended_by is distinct from old.suspended_by then
    raise exception 'การระงับ/คืนสิทธิ์ทำผ่านปุ่มในหลังบ้านตัวแทนเท่านั้น' using errcode = '42501';
  end if;
  if old.suspended_at is not null and coalesce(new.approved, false) and not coalesce(old.approved, false) then
    raise exception 'บัญชีนี้ถูกระงับอยู่ — ใช้ปุ่ม คืนสิทธิ์ แทนการอนุมัติ' using errcode = '42501';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."profiles_suspension_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."purge_customer_chat"("p_days" integer DEFAULT 30) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_count integer;
begin
  delete from public.customer_chat_turns
   where created_at < now() - make_interval(days => greatest(coalesce(p_days, 30), 1));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


ALTER FUNCTION "public"."purge_customer_chat"("p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."purge_stale_carts"("p_days" integer DEFAULT 7) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_count integer;
begin
  delete from public.carts
   where updated_at < now() - make_interval(days => greatest(coalesce(p_days, 7), 1));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


ALTER FUNCTION "public"."purge_stale_carts"("p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."push_broadcast_targets"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth, 'kind', s.kind)), '[]'::jsonb)
    from public.push_subscriptions s join public.profiles p on p.id = s.profile_id
   where coalesce(p.approved, false) and p.suspended_at is null
$$;


ALTER FUNCTION "public"."push_broadcast_targets"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."push_delete_subscriptions"("p_ids" "uuid"[]) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare n integer;
begin
  delete from public.push_subscriptions where id = any(p_ids);
  get diagnostics n = row_count;
  return n;
end $$;


ALTER FUNCTION "public"."push_delete_subscriptions"("p_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."push_get_keys"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'vault', 'pg_temp'
    AS $$
  select jsonb_build_object(
    'public', (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_public' limit 1),
    'private', (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private' limit 1),
    'notify_secret', (select decrypted_secret from vault.decrypted_secrets where name = 'notify_secret' limit 1))
$$;


ALTER FUNCTION "public"."push_get_keys"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."push_notify_order"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'vault', 'extensions', 'pg_temp'
    AS $$
declare v_secret text; v_event text;
begin
  if tg_op = 'INSERT' then
    if new.status is distinct from 'pending' then return new; end if;
    v_event := 'new';
  elsif old.customer_paid_at is null and new.customer_paid_at is not null and new.status in ('pending', 'accepted') then
    v_event := 'paid';
  else
    return new;
  end if;
  begin
    select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_secret' limit 1;
    if v_secret is not null then
      perform net.http_post(url := 'https://kaeoxqiqonwjoqjoiiho.supabase.co/functions/v1/push-notify',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
        body := jsonb_build_object('order_id', new.id, 'event', v_event), timeout_milliseconds := 10000);
    end if;
  exception when others then
    raise warning 'push_notify_order failed for order %: %', new.id, sqlerrm;
  end;
  return new;
end $$;


ALTER FUNCTION "public"."push_notify_order"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."push_public_key"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'vault', 'pg_temp'
    AS $$
  select decrypted_secret from vault.decrypted_secrets where name = 'vapid_public' limit 1
$$;


ALTER FUNCTION "public"."push_public_key"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."push_remove_app_token"("p_token" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  delete from public.push_subscriptions where endpoint = 'fcm:' || p_token and profile_id = auth.uid();
end $$;


ALTER FUNCTION "public"."push_remove_app_token"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."push_remove_subscription"("p_endpoint" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  delete from public.push_subscriptions where endpoint = p_endpoint and profile_id = auth.uid();
end $$;


ALTER FUNCTION "public"."push_remove_subscription"("p_endpoint" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."push_save_app_token"("p_token" "text", "p_kind" "text", "p_user_agent" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
begin
  if auth.uid() is null then raise exception 'ต้องเข้าสู่ระบบก่อน' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('merchant', 'driver', 'agent') then raise exception 'ชนิดแจ้งเตือนไม่ถูกต้อง' using errcode = '22023'; end if;
  if p_token is null or length(p_token) not between 20 and 900 or p_token !~ '^[A-Za-z0-9_:.-]+$' then raise exception 'ข้อมูลอุปกรณ์ไม่ถูกต้อง' using errcode = '22023'; end if;
  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth, kind, user_agent)
  values (auth.uid(), 'fcm:' || p_token, '', '', p_kind, left(p_user_agent, 200))
  on conflict (endpoint) do update
    set profile_id = auth.uid(), kind = excluded.kind, user_agent = excluded.user_agent, updated_at = now();
end $_$;


ALTER FUNCTION "public"."push_save_app_token"("p_token" "text", "p_kind" "text", "p_user_agent" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."push_save_subscription"("p_endpoint" "text", "p_p256dh" "text", "p_auth" "text", "p_kind" "text", "p_user_agent" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if auth.uid() is null then raise exception 'ต้องเข้าสู่ระบบก่อน' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('merchant', 'driver', 'agent') then raise exception 'ชนิดแจ้งเตือนไม่ถูกต้อง' using errcode = '22023'; end if;
  if p_endpoint is null or p_endpoint not like 'https://%' or length(p_endpoint) > 1000 or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'ข้อมูลอุปกรณ์ไม่ถูกต้อง' using errcode = '22023';
  end if;
  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth, kind, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, p_kind, left(p_user_agent, 200))
  on conflict (endpoint) do update
    set profile_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth, kind = excluded.kind,
        user_agent = excluded.user_agent, updated_at = now();
end $$;


ALTER FUNCTION "public"."push_save_subscription"("p_endpoint" "text", "p_p256dh" "text", "p_auth" "text", "p_kind" "text", "p_user_agent" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."push_set_keys"("p_public" "text", "p_private" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'vault', 'pg_temp'
    AS $$
declare v_id uuid;
begin
  if coalesce(p_public, '') = '' or coalesce(p_private, '') = '' then raise exception 'กุญแจว่าง' using errcode = '22023'; end if;
  select id into v_id from vault.secrets where name = 'vapid_public';
  if v_id is null then perform vault.create_secret(p_public, 'vapid_public', 'Web Push (VAPID) public key'); else perform vault.update_secret(v_id, p_public); end if;
  select id into v_id from vault.secrets where name = 'vapid_private';
  if v_id is null then perform vault.create_secret(p_private, 'vapid_private', 'Web Push (VAPID) private key'); else perform vault.update_secret(v_id, p_private); end if;
end $$;


ALTER FUNCTION "public"."push_set_keys"("p_public" "text", "p_private" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."push_targets"("p_order_id" bigint, "p_event" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare o public.orders%rowtype; v_merchant_profile uuid; v_shop text; v_tambon text;
begin
  if p_event is null or p_event not in ('new', 'paid') then return jsonb_build_object('ok', false, 'reason', 'bad_event'); end if;
  select * into o from public.orders where id = p_order_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  select m.profile_id, m.name into v_merchant_profile, v_shop from public.merchants m where m.id = o.merchant_id;
  select t.name into v_tambon from public.tambons t where t.id = o.tambon_id;
  return jsonb_build_object(
    'ok', true,
    'order', jsonb_build_object('id', o.id, 'type', o.type::text, 'is_test', o.is_test, 'is_drill', o.is_drill, 'event', p_event, 'shop', v_shop, 'tambon', v_tambon),
    'targets', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth, 'kind', s.kind))
        from public.push_subscriptions s
        join public.profiles p on p.id = s.profile_id
       where coalesce(p.approved, false) and p.suspended_at is null
         and p.id <> o.customer_id
         and (o.is_drill or p.is_test = o.is_test)
         and (s.endpoint not like 'fcm:%' or o.is_drill or o.is_test)
         and (
              (s.kind = 'merchant' and p.id = v_merchant_profile and (p_event = 'new' or o.type = 'food'))
           or (s.kind = 'agent' and p_event = 'new' and (
                 p.role = 'superadmin'
              or (p.role = 'admin' and p.tambon_id = o.tambon_id)
              or exists (select 1 from public.admin_scopes a where a.profile_id = p.id and a.tambon_id = o.tambon_id)))
           or (s.kind = 'driver' and p.role = 'driver' and p.tambon_id = o.tambon_id
               and ((p_event = 'new' and (o.type <> 'food' or o.customer_paid_at is not null)) or (p_event = 'paid' and o.type = 'food'))
               and exists (select 1 from public.drivers d where d.profile_id = p.id and d.is_online))
         )), '[]'::jsonb));
end $$;


ALTER FUNCTION "public"."push_targets"("p_order_id" bigint, "p_event" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalc_profile_rating"("p_profile_id" "uuid") RETURNS "void"
    LANGUAGE "sql"
    AS $$
  update public.profiles
  set rating = coalesce((select round(avg(score)::numeric, 1) from public.ratings where to_profile = p_profile_id), rating),
      updated_at = now()
  where id = p_profile_id;
$$;


ALTER FUNCTION "public"."recalc_profile_rating"("p_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_intake_block"("p_tambon" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_float numeric;
  v_deposit numeric;
  v_overdue int;
begin
  select public.tambon_float(p_tambon) into v_float;
  select deposit_amount into v_deposit from public.tambons where id = p_tambon;

  select count(*) into v_overdue
  from public.settlements
  where tambon_id = p_tambon and paid_out_at is null and due_at < now() - interval '3 days';

  if v_overdue > 0 then
    update public.tambons
      set intake_blocked = true,
          intake_blocked_reason = 'มีรายการค้างโอนออกเกิน 3 วัน ' || v_overdue || ' รายการ'
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


ALTER FUNCTION "public"."refresh_intake_block"("p_tambon" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."register_line_customer"("p_name" "text", "p_phone" "text", "p_tambon_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare u uuid:=auth.uid(); line_id text; p public.profiles%rowtype; phone_no text;
begin
  if u is null then return jsonb_build_object('ok',false,'error','login_required'); end if;
  select raw_app_meta_data->>'line_user_id' into line_id from auth.users where id=u;
  if coalesce(line_id,'') !~ '^U[0-9a-f]{32}$' then return jsonb_build_object('ok',false,'error','line_login_required'); end if;
  if length(btrim(coalesce(p_name,''))) not between 2 and 100 then return jsonb_build_object('ok',false,'error','bad_name'); end if;
  phone_no:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
  if phone_no ~ '^0[0-9]{9}$' then phone_no:='66'||substr(phone_no,2); end if;
  if phone_no !~ '^66[0-9]{9}$' then return jsonb_build_object('ok',false,'error','bad_phone'); end if;
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
      tambon_id=case when p.role='customer' then p_tambon_id else p.tambon_id end
      where id=u;
    return jsonb_build_object('ok',true,'tambon_id',p_tambon_id);
  end if;
  insert into public.profiles(id,role,full_name,phone,tambon_id,line_user_id)
    values(u,'customer',btrim(p_name),phone_no,p_tambon_id,line_id);
  return jsonb_build_object('ok',true,'tambon_id',p_tambon_id);
end $_$;


ALTER FUNCTION "public"."register_line_customer"("p_name" "text", "p_phone" "text", "p_tambon_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reject_customer_payment"("p_order_id" bigint, "p_reason" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  o public.orders%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'ไม่พบออเดอร์'; end if;
  if not public.can_admin_tambon(o.tambon_id) then raise exception 'ทำได้เฉพาะตัวแทนของตำบลนี้'; end if;
  if o.customer_paid_at is not null then raise exception 'ออเดอร์นี้ยืนยันรับเงินไปแล้ว'; end if;
  if o.slip_submitted_at is null then raise exception 'ลูกค้ายังไม่ได้ส่งสลิป'; end if;
  if char_length(v_reason) < 3 then raise exception 'กรุณาระบุเหตุผลให้ลูกค้าทราบ'; end if;

  update public.orders
     set payment_rejected_at = now(),
         payment_reject_reason = left(v_reason, 300)
   where id = p_order_id;
end;
$$;


ALTER FUNCTION "public"."reject_customer_payment"("p_order_id" bigint, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_referrer_profile"("p_self" "uuid", "p_self_phone" "text", "p_phone" "text", "p_first" "text", "p_last" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_self9 text := nullif(right(regexp_replace(coalesce(p_self_phone, ''), '\D', '', 'g'), 9), '');
  v_name text := regexp_replace(trim(concat_ws(' ', nullif(trim(p_first), ''), nullif(trim(p_last), ''))), '\s+', ' ', 'g');
  v_ids uuid[];
  v_id uuid;
  v_phone9 text;
begin
  if length(v_digits) >= 9 then
    select array_agg(id) into v_ids from (
      select id from profiles
      where id is distinct from p_self and phone is not null
        and right(regexp_replace(phone, '\D', '', 'g'), 9) = right(v_digits, 9)
      limit 10) s;
    if array_length(v_ids, 1) = 1 then v_id := v_ids[1]; end if;
  end if;

  v_name := regexp_replace(v_name, '^(นาย|นางสาว|นาง|น\.ส\.|ด\.ช\.|ด\.ญ\.)\s*', '');
  if v_id is null and v_name <> '' then
    select array_agg(id) into v_ids from (
      select id from profiles
      where id is distinct from p_self
        and regexp_replace(regexp_replace(trim(full_name), '\s+', ' ', 'g'), '^(นาย|นางสาว|นาง|น\.ส\.|ด\.ช\.|ด\.ญ\.)\s*', '') = v_name
      limit 2) s;
    if array_length(v_ids, 1) = 1 then v_id := v_ids[1]; end if;
  end if;

  -- The person's phone: from the matched account, else from what was typed (shared by several accounts).
  if v_id is not null then
    select nullif(right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9), '') into v_phone9 from profiles where id = v_id;
  elsif length(v_digits) >= 9 then
    v_phone9 := right(v_digits, 9);
  end if;

  -- Same phone = same person: if the match has no LINE (or several accounts share the phone), pick the single one with LINE.
  if length(v_phone9) = 9 and (v_id is null or (select line_user_id is null from profiles where id = v_id)) then
    select array_agg(id) into v_ids from (
      select id from profiles
      where id is distinct from p_self and line_user_id is not null and phone is not null
        and right(regexp_replace(phone, '\D', '', 'g'), 9) = v_phone9
      limit 2) s;
    if array_length(v_ids, 1) = 1 then v_id := v_ids[1]; end if;
  end if;

  if v_id is not null and v_self9 is not null
     and (select right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9) from profiles where id = v_id) = v_self9 then
    return null;
  end if;
  return v_id;
end $$;


ALTER FUNCTION "public"."resolve_referrer_profile"("p_self" "uuid", "p_self_phone" "text", "p_phone" "text", "p_first" "text", "p_last" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_menu"("p_query" "text", "p_tambon" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("merchant_id" "uuid", "merchant_name" "text", "merchant_category" "text", "item_id" "uuid", "item_name" "text", "price" numeric, "photo_url" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select m.id, m.name, m.category, mi.id, mi.name, mi.price, mi.photo_url
    from public.menu_items mi
    join public.merchants m on m.id = mi.merchant_id
   where m.is_open
     and not m.is_test
     and mi.is_available
     and not mi.is_hidden
     and (p_tambon is null or m.tambon_id = p_tambon)
     and length(btrim(p_query)) >= 2
     and mi.name ilike '%' || btrim(p_query) || '%'
   order by mi.price asc, mi.name asc
   limit 30;
$$;


ALTER FUNCTION "public"."search_menu"("p_query" "text", "p_tambon" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."search_menu"("p_query" "text", "p_tambon" "uuid") IS 'ค้นชื่อสินค้า/เมนูของร้านที่เปิดอยู่ ใช้ตอบในแชท LINE OA — อ่านอย่างเดียว คืนเฉพาะข้อมูลที่แสดงหน้าร้าน';



CREATE OR REPLACE FUNCTION "public"."session_used_password"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'auth', 'public', 'pg_temp'
    AS $$
  select case
    -- ไม่มี session_id ใน JWT = ดูไม่ออก ไม่ใช่ "ไม่ผ่าน"
    when nullif(auth.jwt() ->> 'session_id', '') is null then null
    else exists (
      select 1
      from auth.mfa_amr_claims c
      where c.session_id = (auth.jwt() ->> 'session_id')::uuid
        and c.authentication_method = 'password'
    )
  end;
$$;


ALTER FUNCTION "public"."session_used_password"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."session_used_password"() IS 'true = เข้าด้วยรหัสผ่าน · false = เข้าด้วยวิธีอื่น (LINE) · null = ดูไม่ออก (JWT ไม่มี session_id)';



CREATE OR REPLACE FUNCTION "public"."set_default_approval"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  if new.role in ('driver','merchant') and (tg_op = 'INSERT') then
    new.approved := false;
  elsif new.role in ('customer','admin') and (tg_op = 'INSERT') then
    new.approved := true;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_default_approval"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."shares_order_with"("p" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select p is not null and auth.uid() is not null and exists (
    select 1
    from public.orders o
    left join public.merchants m on m.id = o.merchant_id
    where (o.customer_id = auth.uid() and (o.driver_id = p or m.profile_id = p))
       or (o.driver_id   = auth.uid() and (o.customer_id = p or m.profile_id = p))
       or (m.profile_id  = auth.uid() and (o.customer_id = p or o.driver_id = p))
  );
$$;


ALTER FUNCTION "public"."shares_order_with"("p" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."shop_has_pin"("p_merchant_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select coalesce((select m.lat is not null and m.lng is not null from public.merchants m where m.id = p_merchant_id), false);
$$;


ALTER FUNCTION "public"."shop_has_pin"("p_merchant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."shop_is_open"("p_merchant_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select coalesce((select public.shop_open_at(m.is_open,m.hours_enabled,m.opening_hours)
    from public.merchants m join public.profiles p on p.id=m.profile_id
    where m.id=p_merchant_id and p.approved and p.suspended_at is null
      and (not m.is_test or m.profile_id=auth.uid() or public.can_admin_tambon(m.tambon_id)
        or exists(select 1 from public.profiles me where me.id=auth.uid() and (me.is_test or me.llp_tester) and me.tambon_id=m.tambon_id)
        or coalesce(auth.role(),'')='service_role')),false);
$$;


ALTER FUNCTION "public"."shop_is_open"("p_merchant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."shop_open_at"("manually_open" boolean, "enabled" boolean, "h" "jsonb", "at_time" timestamp with time zone DEFAULT "now"()) RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare local_time timestamp:=at_time at time zone 'Asia/Bangkok'; day_no int; clock text; today jsonb; yesterday jsonb;
begin
  if not coalesce(manually_open,false) then return false; end if;
  if not coalesce(enabled,false) then return true; end if;
  if not public.valid_shop_hours(h) then return false; end if;
  day_no:=extract(dow from local_time)::int; clock:=to_char(local_time,'HH24:MI');
  today:=h->day_no; yesterday:=h->((day_no+6)%7);
  return ((today->>'enabled')::boolean and
    case when today->>'open'<today->>'close' then clock>=today->>'open' and clock<today->>'close' else clock>=today->>'open' end)
    or ((yesterday->>'enabled')::boolean and yesterday->>'open'>yesterday->>'close' and clock<yesterday->>'close');
end $$;


ALTER FUNCTION "public"."shop_open_at"("manually_open" boolean, "enabled" boolean, "h" "jsonb", "at_time" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."slip_order_id"("p_name" "text") RETURNS bigint
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select nullif(substring(storage.filename(p_name) from '^([0-9]{1,18})-'), '')::bigint;
$$;


ALTER FUNCTION "public"."slip_order_id"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."staff_tambon_detail"("p_tambon_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  with base as (select 'https://delivery-tambon-app-v3.vercel.app' as url),
  t as (select * from public.tambons where id = p_tambon_id),
  m as (
    select mm.id, mm.name, mm.is_open, (mm.lat is not null and mm.lng is not null) as has_gps,
           coalesce(pp.approved, false) as approved, (pp.line_user_id is not null) as has_line,
           (select count(*) from public.menu_items mi where mi.merchant_id = mm.id
             and coalesce(mi.is_available, true) and not coalesce(mi.is_hidden, false)) as menu_count
      from public.merchants mm left join public.profiles pp on pp.id = mm.profile_id
     where mm.tambon_id = p_tambon_id and not mm.is_test
  ),
  d as (
    select dp.full_name, d.vehicle_type::text as vehicle, d.is_online, coalesce(dp.approved, false) as approved,
           (dp.line_user_id is not null) as has_line, (dp.suspended_at is not null) as suspended
      from public.drivers d join public.profiles dp on dp.id = d.profile_id
     where dp.tambon_id = p_tambon_id and not dp.is_test
  ),
  a as (
    select distinct p.id, (p.line_user_id is not null) as has_line
      from public.profiles p
     where (p.role = 'admin' and coalesce(p.approved, false) and p.tambon_id = p_tambon_id)
        or exists (select 1 from public.admin_scopes s where s.profile_id = p.id and s.tambon_id = p_tambon_id)
  ),
  chk as (
    select jsonb_build_array(
      jsonb_build_object('item', 'เปิดบริการ (is_active)', 'ok', t.is_active),
      jsonb_build_object('item', 'ตั้ง PromptPay บัญชีกลางตำบล (รับโอนลูกค้า)', 'ok', t.settlement_promptpay_id is not null),
      jsonb_build_object('item', 'ตั้งค่าส่งพื้นฐาน', 'ok', t.delivery_fee_base is not null),
      jsonb_build_object('item', 'มีร้านค้าอนุมัติแล้วและมีเมนูอย่างน้อย 1 ร้าน', 'ok', exists (select 1 from m where approved and menu_count > 0)),
      jsonb_build_object('item', 'ร้านค้าปักหมุด GPS ครบ', 'ok', not exists (select 1 from m where not has_gps) and exists (select 1 from m)),
      jsonb_build_object('item', 'ร้านค้าผูก LINE (รับแจ้งออเดอร์)', 'ok', exists (select 1 from m where has_line)),
      jsonb_build_object('item', 'มีไรเดอร์อนุมัติแล้วและผูก LINE อย่างน้อย 1 คน', 'ok', exists (select 1 from d where approved and has_line and not suspended)),
      jsonb_build_object('item', 'มีตัวแทนตำบลผูก LINE (รับแจ้งเตือน/ยืนยันเงิน)', 'ok', exists (select 1 from a where has_line)),
      jsonb_build_object('item', 'ไม่ถูกระงับรับออเดอร์ (intake_blocked)', 'ok', not coalesce(t.intake_blocked, false))
    ) as items
    from t
  )
  select jsonb_build_object(
    'tambon', t.name, 'slug', t.slug, 'active', t.is_active, 'opened_at', t.opened_at,
    'intake_blocked_reason', t.intake_blocked_reason,
    'delivery_fee_base', t.delivery_fee_base, 'delivery_fee_per_km', t.delivery_fee_per_km, 'deposit_amount', t.deposit_amount,
    'readiness', (select items from chk),
    'missing', (select coalesce(jsonb_agg(e->>'item'), '[]'::jsonb) from chk, jsonb_array_elements(chk.items) e where not (e->>'ok')::boolean),
    'merchants', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'open', is_open, 'approved', approved,
                     'menu_items', menu_count, 'gps', has_gps, 'line', has_line) order by name), '[]'::jsonb) from (select * from m limit 30) mx),
    'drivers', (select coalesce(jsonb_agg(jsonb_build_object('name', full_name, 'vehicle', vehicle, 'online', is_online,
                     'approved', approved, 'line', has_line, 'suspended', suspended)), '[]'::jsonb) from (select * from d limit 30) dx),
    'agents', jsonb_build_object('total', (select count(*) from a), 'with_line', (select count(*) from a where has_line)),
    'public_page', (select url from base) || '/t/' || t.slug
  )
  from t;
$$;


ALTER FUNCTION "public"."staff_tambon_detail"("p_tambon_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_board_post"("p_tambon_slug" "text", "p_post" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare
  v_tambon uuid;
  v_kind text := p_post->>'kind';
  v_phone text := nullif(regexp_replace(coalesce(p_post->>'contact_phone', ''), '[^0-9+]', '', 'g'), '');
  v_email text := nullif(lower(btrim(coalesce(p_post->>'contact_email', ''))), '');
  v_link text := nullif(btrim(coalesce(p_post->>'link_url', '')), '');
  v_id bigint;
  v_code text;
begin
  select id into v_tambon from public.tambons where slug = p_tambon_slug;
  if v_tambon is null then raise exception 'ไม่พบตำบลนี้'; end if;
  if v_kind not in ('job', 'announcement') then raise exception 'เลือกประเภทประกาศ'; end if;
  if v_phone is null and v_email is null then raise exception 'กรอกเบอร์โทรหรืออีเมลอย่างน้อย 1 ช่อง (ไม่แสดงบนเว็บ)'; end if;

  -- กันสแปม: ผู้ติดต่อเดียวกันส่งได้ 3 ประกาศต่อวัน · ตำบลหนึ่งรออนุมัติได้ไม่เกิน 100
  if (select count(*) from public.tambon_board_contacts c join public.tambon_board_posts p on p.id = c.post_id
       where p.created_at > now() - interval '1 day'
         and (c.contact_phone = v_phone or c.contact_email = v_email)) >= 3 then
    raise exception 'ส่งประกาศครบ 3 รายการต่อวันแล้ว ลองใหม่พรุ่งนี้';
  end if;
  if (select count(*) from public.tambon_board_posts where tambon_id = v_tambon and status = 'pending') >= 100 then
    raise exception 'ประกาศรอตรวจของตำบลนี้เต็ม ลองใหม่ภายหลัง';
  end if;

  insert into public.tambon_board_posts
    (tambon_id, kind, org_name, org_type, title, body, link_url, job_positions, job_wage, job_location)
  values (v_tambon, v_kind, btrim(coalesce(p_post->>'org_name', '')),
          coalesce(nullif(p_post->>'org_type', ''), 'other'),
          btrim(coalesce(p_post->>'title', '')), left(btrim(coalesce(p_post->>'body', '')), 2000), v_link,
          case when v_kind = 'job' and (p_post->>'job_positions') ~ '^\d{1,3}$' then (p_post->>'job_positions')::int end,
          case when v_kind = 'job' then nullif(left(btrim(coalesce(p_post->>'job_wage', '')), 120), '') end,
          case when v_kind = 'job' then nullif(left(btrim(coalesce(p_post->>'job_location', '')), 200), '') end)
  returning id into v_id;

  loop
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.tambon_board_contacts where link_code = v_code);
  end loop;
  insert into public.tambon_board_contacts (post_id, contact_name, contact_phone, contact_email, link_code)
  values (v_id, btrim(coalesce(p_post->>'contact_name', '')), v_phone, v_email, v_code);

  return jsonb_build_object('id', v_id, 'link_code', v_code);
end;
$_$;


ALTER FUNCTION "public"."submit_board_post"("p_tambon_slug" "text", "p_post" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_payment_slip"("p_order_id" bigint, "p_slip_path" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'ไม่พบออเดอร์'; end if;

  if auth.uid() is not null then
    if o.customer_id <> auth.uid() then raise exception 'ส่งสลิปได้เฉพาะเจ้าของออเดอร์'; end if;
  elsif coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'ไม่มีสิทธิ์ส่งสลิป';
  end if;

  if o.status = 'cancelled' then raise exception 'ออเดอร์นี้ถูกยกเลิกแล้ว'; end if;
  if o.customer_paid_at is not null then raise exception 'ออเดอร์นี้ตัวแทนยืนยันรับเงินแล้ว'; end if;
  if p_slip_path is null
     or p_slip_path not like o.tambon_id::text || '/' || o.id::text || '-%'
     or p_slip_path like '%..%' then
    raise exception 'ที่อยู่ไฟล์สลิปไม่ถูกต้อง';
  end if;

  update public.orders
     set customer_slip_url = p_slip_path,
         slip_submitted_at = now(),
         payment_rejected_at = null,
         payment_reject_reason = null,
         payment_method = 'พร้อมเพย์'
   where id = p_order_id;
end $$;


ALTER FUNCTION "public"."submit_payment_slip"("p_order_id" bigint, "p_slip_path" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_line_direct_from_menu"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  n integer;
begin
  insert into products (sku, name, image_url)
  select mi.id::text, mi.name, mi.photo_url
  from menu_items mi
  join merchants m on m.id = mi.merchant_id
  where mi.is_available and not mi.is_hidden and m.is_open and not m.is_test
  on conflict (sku) do update set name = excluded.name, image_url = excluded.image_url;

  insert into platform_listings (product_id, platform, platform_item_id)
  select p.id, 'line_direct', p.sku
  from products p
  where p.sku in (
    select mi.id::text
    from menu_items mi
    join merchants m on m.id = mi.merchant_id
    where mi.is_available and not mi.is_hidden and m.is_open and not m.is_test
  )
  on conflict (platform, platform_item_id) do update set product_id = excluded.product_id;

  insert into platform_prices (listing_id, price, in_stock, updated_at)
  select l.id, mi.price, true, now()
  from platform_listings l
  join menu_items mi on mi.id::text = l.platform_item_id
  join merchants m on m.id = mi.merchant_id
  where l.platform = 'line_direct'
    and mi.is_available and not mi.is_hidden and m.is_open and not m.is_test
  on conflict (listing_id) do update
    set price = excluded.price, in_stock = true, updated_at = now();
  get diagnostics n = row_count;

  -- เมนูที่ไม่เปิดขายแล้ว: เก็บราคาเดิมไว้ ตั้ง in_stock = false
  update platform_prices pp
  set in_stock = false, updated_at = now()
  from platform_listings l
  where l.id = pp.listing_id
    and l.platform = 'line_direct'
    and pp.in_stock
    and l.platform_item_id not in (
      select mi.id::text
      from menu_items mi
      join merchants m on m.id = mi.merchant_id
      where mi.is_available and not mi.is_hidden and m.is_open and not m.is_test
    );

  return n;
end $$;


ALTER FUNCTION "public"."sync_line_direct_from_menu"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tambon_admin_grant"("p_profile_id" "uuid", "p_tambon_id" "uuid", "p_note" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."tambon_admin_grant"("p_profile_id" "uuid", "p_tambon_id" "uuid", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tambon_admin_revoke"("p_profile_id" "uuid", "p_tambon_id" "uuid", "p_note" "text" DEFAULT NULL::"text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."tambon_admin_revoke"("p_profile_id" "uuid", "p_tambon_id" "uuid", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tambon_complaint_stats"("p_tambon_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  with c as (
    select * from public.complaints
     where tambon_id = p_tambon_id and not is_test and status <> 'rejected'
  )
  select jsonb_build_object(
    'total', (select count(*) from c),
    'in_progress', (select count(*) from c where status in ('received', 'reviewing', 'forwarded')),
    'resolved', (select count(*) from c where status in ('answered', 'closed')),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('category', category, 'count', n) order by n desc)
                              from (select coalesce(category, 'ยังไม่จัดประเภท') category, count(*) n from c group by 1) g), '[]'::jsonb),
    'resolved_titles', coalesce((select jsonb_agg(jsonb_build_object('title', public_title, 'category', category, 'resolved_at', updated_at) order by updated_at desc)
                                   from (select * from c where status in ('answered', 'closed') and public_title is not null
                                          order by updated_at desc limit 10) r), '[]'::jsonb)
  );
$$;


ALTER FUNCTION "public"."tambon_complaint_stats"("p_tambon_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tambon_daily_stats"() RETURNS TABLE("tambon_id" "uuid", "tambon_name" "text", "orders_today" bigint, "delivered_today" bigint, "pending_now" bigint, "drivers_online" bigint, "drivers_total" bigint, "merchants_open" bigint, "waiting_approval" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  with day_start as (
    select (date_trunc('day', (now() at time zone 'Asia/Bangkok')) at time zone 'Asia/Bangkok') as ts
  )
  select
    t.id,
    t.name,
    count(o.id) filter (where o.created_at >= (select ts from day_start)),
    count(o.id) filter (where o.created_at >= (select ts from day_start)
                          and o.status = 'delivered'),
    count(o.id) filter (where o.status = 'pending'),
    (select count(*) from public.drivers d
       join public.profiles dp on dp.id = d.profile_id
      where dp.tambon_id = t.id and d.is_online and coalesce(dp.approved, false) and not dp.is_test),
    (select count(*) from public.profiles dp
      where dp.tambon_id = t.id and dp.role = 'driver' and coalesce(dp.approved, false) and not dp.is_test),
    (select count(*) from public.merchants m
      where m.tambon_id = t.id and m.is_open and not m.is_test),
    (select count(*) from public.profiles ap
      where ap.tambon_id = t.id and not coalesce(ap.approved, false)
        and ap.role in ('driver', 'merchant') and not ap.is_test)
  from public.tambons t
  -- นโยบาย D28 ข้อ 4: ไม่นับออเดอร์ทดสอบ
  left join public.orders o on o.tambon_id = t.id and not o.is_test
  where t.is_active
  group by t.id, t.name
  order by t.name;
$$;


ALTER FUNCTION "public"."tambon_daily_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tambon_float"("p_tambon" "uuid") RETURNS numeric
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select coalesce(sum(amount), 0)
  from public.settlements
  where tambon_id = p_tambon and paid_out_at is null;
$$;


ALTER FUNCTION "public"."tambon_float"("p_tambon" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tambons_central_fields_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  -- security invoker (ตั้งใจ): current_user = authenticated/anon เมื่อแก้ผ่าน API ของผู้ใช้
  -- ส่วนการแก้จากฟังก์ชัน security definer ของระบบ current_user คือเจ้าของฟังก์ชัน จึงไม่ถูกตรวจ
  if current_user in ('authenticated', 'anon') and not public.has_national_scope() then
    if new.is_active is distinct from old.is_active
       or new.opened_at is distinct from old.opened_at
       or new.deposit_amount is distinct from old.deposit_amount
       or new.slug is distinct from old.slug
       or new.agent_share_commission_pct is distinct from old.agent_share_commission_pct
       or new.agent_share_delivery_pct is distinct from old.agent_share_delivery_pct
       or new.ai_content_enabled is distinct from old.ai_content_enabled then
      raise exception 'เปิด/ปิดบริการ เงินค้ำประกัน ลิงก์ตำบล ส่วนแบ่งตัวแทน และการให้ AI ทำข้อมูล แก้ได้เฉพาะส่วนกลาง' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."tambons_central_fields_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."valid_shop_hours"("h" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $_$
declare d jsonb;
begin
  if jsonb_typeof(h) is distinct from 'array' then return false; end if;
  if jsonb_array_length(h)<>7 then return false; end if;
  for d in select value from jsonb_array_elements(h) loop
    if jsonb_typeof(d->'enabled') is distinct from 'boolean'
      or coalesce(d->>'open','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or coalesce(d->>'close','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or ((d->>'enabled')::boolean and d->>'open'=d->>'close') then return false; end if;
  end loop;
  return true;
end $_$;


ALTER FUNCTION "public"."valid_shop_hours"("h" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."vehicle_availability"() RETURNS TABLE("vehicle_type" "public"."vehicle_type", "ready" integer, "offline" integer, "total" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select
    d.vehicle_type,
    count(*) filter (where p.approved and d.is_online)::int,
    count(*) filter (where p.approved and not d.is_online)::int,
    count(*) filter (where p.approved)::int
  from public.drivers d
  join public.profiles p on p.id = d.profile_id
  where p.role = 'driver'
    and p.tambon_id is not null
    and p.tambon_id = public.my_tambon_id()
  group by d.vehicle_type;
$$;


ALTER FUNCTION "public"."vehicle_availability"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."vehicle_availability"() IS 'จำนวนคนขับที่อนุมัติแล้วในตำบลของผู้เรียก แยกตามชนิดรถ — คืนเฉพาะตัวเลข ไม่มีตัวตนคนขับ';



CREATE OR REPLACE FUNCTION "public"."verify_customer_payment"("p_order_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare o public.orders%rowtype;
begin
  select * into o from public.orders where id = p_order_id;
  if not found then raise exception 'ไม่พบออเดอร์'; end if;
  if not public.can_admin_tambon(o.tambon_id) then raise exception 'ยืนยันได้เฉพาะตัวแทนของตำบลนี้'; end if;
  if o.customer_id = auth.uid() and not public.is_superadmin() then
    raise exception 'ออเดอร์ของท่านเองต้องให้ส่วนกลางยืนยัน';
  end if;
  perform public.payment_verify_core(p_order_id, auth.uid());
end $$;


ALTER FUNCTION "public"."verify_customer_payment"("p_order_id" bigint) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "dhamma"."lessons" (
    "seq" integer NOT NULL,
    "title" "text" NOT NULL,
    "topic_query" "text" NOT NULL,
    "refs" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "note" "text"
);


ALTER TABLE "dhamma"."lessons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "dhamma"."prompts" (
    "id" bigint NOT NULL,
    "mode" "text" NOT NULL,
    "version" integer NOT NULL,
    "body" "text" NOT NULL,
    "active" boolean DEFAULT false NOT NULL,
    "note" "text",
    "created_by" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "prompts_mode_check" CHECK (("mode" = ANY (ARRAY['counsel'::"text", 'learn'::"text", 'buddhayana'::"text", 'common'::"text", 'define'::"text"])))
);


ALTER TABLE "dhamma"."prompts" OWNER TO "postgres";


ALTER TABLE "dhamma"."prompts" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "dhamma"."prompts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "dhamma"."settings" (
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "dhamma"."settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "dhamma"."turns" (
    "id" bigint NOT NULL,
    "line_user_id" "text" NOT NULL,
    "mode" "text" NOT NULL,
    "question" "text" NOT NULL,
    "answer" "text",
    "cites" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "model" "text",
    "prompt_version" integer,
    "latency_ms" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "dhamma"."turns" OWNER TO "postgres";


ALTER TABLE "dhamma"."turns" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "dhamma"."turns_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "dhamma"."user_prefs" (
    "line_user_id" "text" NOT NULL,
    "length_pref" integer DEFAULT 3000,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "counsel_length" integer,
    CONSTRAINT "user_prefs_length_pref_check" CHECK (("length_pref" = ANY (ARRAY[1000, 3000, 6000, 12000])))
);


ALTER TABLE "dhamma"."user_prefs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "dhamma"."user_state" (
    "line_user_id" "text" NOT NULL,
    "mode" "text" NOT NULL,
    "lesson_seq" integer DEFAULT 1 NOT NULL,
    "consent_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_state_mode_check" CHECK (("mode" = ANY (ARRAY['counsel'::"text", 'learn'::"text", 'buddhayana'::"text"])))
);


ALTER TABLE "dhamma"."user_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."delivery_command_receipts" (
    "command_id" "uuid" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "receipt" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "private"."delivery_command_receipts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_actions" (
    "id" bigint NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "target_id" "uuid",
    "action" "text" NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_actions" OWNER TO "postgres";


ALTER TABLE "public"."admin_actions" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."admin_actions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."admin_scopes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "tambon_id" "uuid",
    "note" "text",
    "granted_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_scopes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_work_events" (
    "id" "uuid" NOT NULL,
    "task_id" "uuid" NOT NULL,
    "tambon_id" "uuid" NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "status" "text" NOT NULL,
    "note" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_work_events_action_check" CHECK (("action" = ANY (ARRAY['create'::"text", 'start'::"text", 'wait'::"text", 'done'::"text", 'reopen'::"text", 'note'::"text"]))),
    CONSTRAINT "agent_work_events_note_check" CHECK (("char_length"("note") <= 2000)),
    CONSTRAINT "agent_work_events_status_check" CHECK (("status" = ANY (ARRAY['todo'::"text", 'doing'::"text", 'waiting'::"text", 'done'::"text"])))
);


ALTER TABLE "public"."agent_work_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."agent_work_items" (
    "id" "uuid" NOT NULL,
    "tambon_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "detail" "text" DEFAULT ''::"text" NOT NULL,
    "category" "text" NOT NULL,
    "status" "text" DEFAULT 'todo'::"text" NOT NULL,
    "due_on" "date",
    "order_id" bigint,
    "created_by" "uuid" NOT NULL,
    "updated_by" "uuid" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_work_items_category_check" CHECK (("category" = ANY (ARRAY['orders'::"text", 'shops'::"text", 'drivers'::"text", 'finance'::"text", 'members'::"text", 'coordination'::"text"]))),
    CONSTRAINT "agent_work_items_detail_check" CHECK (("char_length"("detail") <= 2000)),
    CONSTRAINT "agent_work_items_status_check" CHECK (("status" = ANY (ARRAY['todo'::"text", 'doing'::"text", 'waiting'::"text", 'done'::"text"]))),
    CONSTRAINT "agent_work_items_title_check" CHECK ((("char_length"("btrim"("title")) >= 3) AND ("char_length"("btrim"("title")) <= 160)))
);


ALTER TABLE "public"."agent_work_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "line_user_id" "text" NOT NULL,
    "role" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_conversations_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text"])))
);


ALTER TABLE "public"."ai_conversations" OWNER TO "postgres";


COMMENT ON TABLE "public"."ai_conversations" IS 'Rolling chat history for the AI assistant, keyed by LINE user id. Used to give the admin assistant conversation memory across messages.';



CREATE TABLE IF NOT EXISTS "public"."ai_usage_ledger" (
    "id" bigint NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "period" "text" DEFAULT "to_char"(("now"() AT TIME ZONE 'Asia/Bangkok'::"text"), 'YYYY-MM'::"text") NOT NULL,
    "feature" "text" NOT NULL,
    "model" "text",
    "cost_usd" numeric(12,6) NOT NULL,
    "cost_thb" numeric(12,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_usage_ledger_cost_thb_check" CHECK (("cost_thb" >= (0)::numeric)),
    CONSTRAINT "ai_usage_ledger_cost_usd_check" CHECK (("cost_usd" >= (0)::numeric))
);


ALTER TABLE "public"."ai_usage_ledger" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."ai_usage_ledger_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."ai_usage_ledger_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."ai_usage_ledger_id_seq" OWNED BY "public"."ai_usage_ledger"."id";



CREATE TABLE IF NOT EXISTS "public"."carts" (
    "line_user_id" "text" NOT NULL,
    "merchant_id" "uuid",
    "items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "delivery_point" "jsonb",
    "awaiting_location" boolean DEFAULT false NOT NULL,
    "checkout_quote" "jsonb",
    "last_checkout" "jsonb",
    "customer_note" "text"
);


ALTER TABLE "public"."carts" OWNER TO "postgres";


COMMENT ON TABLE "public"."carts" IS 'ตะกร้าสั่งอาหารของลูกค้า LINE บวรไทย · เข้าถึงผ่าน food_flow() ด้วย service role เท่านั้น';



CREATE TABLE IF NOT EXISTS "public"."cashbook_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "scope" "text" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "entry_date" "date" NOT NULL,
    "kind" "text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "category" "text" NOT NULL,
    "note" "text" DEFAULT ''::"text" NOT NULL,
    "request_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "voided_at" timestamp with time zone,
    "voided_by" "uuid",
    "void_reason" "text",
    CONSTRAINT "cashbook_entries_amount_check" CHECK ((("amount" > (0)::numeric) AND ("amount" < ('10000000000'::bigint)::numeric))),
    CONSTRAINT "cashbook_entries_category_check" CHECK ((("length"("btrim"("category")) >= 1) AND ("length"("btrim"("category")) <= 80))),
    CONSTRAINT "cashbook_entries_kind_check" CHECK (("kind" = ANY (ARRAY['income'::"text", 'expense'::"text"]))),
    CONSTRAINT "cashbook_entries_note_check" CHECK (("length"("note") <= 1000)),
    CONSTRAINT "cashbook_entries_scope_check" CHECK (("scope" = ANY (ARRAY['personal'::"text", 'delivery'::"text"])))
);


ALTER TABLE "public"."cashbook_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clip_inputs" (
    "id" bigint NOT NULL,
    "line_user_id" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "text_content" "text",
    "storage_path" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "clip_inputs_kind_check" CHECK (("kind" = ANY (ARRAY['text'::"text", 'image'::"text", 'audio'::"text", 'video'::"text", 'file'::"text"])))
);


ALTER TABLE "public"."clip_inputs" OWNER TO "postgres";


ALTER TABLE "public"."clip_inputs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."clip_inputs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."clip_rules" (
    "id" bigint NOT NULL,
    "body" "text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "retired_by" "uuid",
    "retired_at" timestamp with time zone,
    CONSTRAINT "clip_rules_body_check" CHECK ((("char_length"("body") >= 1) AND ("char_length"("body") <= 1000)))
);


ALTER TABLE "public"."clip_rules" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."clip_rules_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."clip_rules_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."clip_rules_id_seq" OWNED BY "public"."clip_rules"."id";



CREATE TABLE IF NOT EXISTS "public"."clip_sessions" (
    "line_user_id" "text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "options" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."clip_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."compare_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "line_user_id" "text" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "total_price" numeric(12,2) NOT NULL,
    "address" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "compare_orders_quantity_check" CHECK (("quantity" > 0)),
    CONSTRAINT "compare_orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'delivering'::"text", 'done'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."compare_orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."complaint_updates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "complaint_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "note" "text",
    "is_public" boolean DEFAULT true NOT NULL,
    "created_by" "text" DEFAULT 'system'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."complaint_updates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."complaints" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_no" "text" NOT NULL,
    "line_user_id" "text" NOT NULL,
    "tambon_id" "uuid",
    "subject" "text",
    "place" "text",
    "occurred_on" "text",
    "detail" "text" NOT NULL,
    "agency_hint" "text",
    "disclose_identity" boolean DEFAULT false NOT NULL,
    "reporter_name" "text",
    "reporter_phone" "text",
    "category" "text",
    "urgency" "text",
    "ai_summary" "text",
    "suggested_agency" "text",
    "status" "text" DEFAULT 'received'::"text" NOT NULL,
    "source" "text" DEFAULT 'line'::"text" NOT NULL,
    "is_test" boolean DEFAULT false NOT NULL,
    "raw_text" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "public_title" "text",
    "public_title_by" "uuid",
    "public_title_at" timestamp with time zone,
    CONSTRAINT "complaints_public_title_check" CHECK ((("public_title" IS NULL) OR (("char_length"("btrim"("public_title")) >= 3) AND ("char_length"("btrim"("public_title")) <= 120)))),
    CONSTRAINT "complaints_status_check" CHECK (("status" = ANY (ARRAY['received'::"text", 'reviewing'::"text", 'forwarded'::"text", 'answered'::"text", 'closed'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."complaints" OWNER TO "postgres";


COMMENT ON TABLE "public"."complaints" IS 'เรื่องร้องเรียน/แจ้งเรื่องจากประชาชนผ่าน LINE OA · ข้อมูลอ่อนไหว: ตัวตนผู้แจ้งเห็นได้เฉพาะผู้ดูแล · เข้าถึงผ่าน service role (n8n) เท่านั้น';



COMMENT ON COLUMN "public"."complaints"."public_title" IS 'หัวเรื่องที่ตัวแทนเกลาแล้วให้แสดงบนหน้าตำบล (เฉพาะเรื่องที่แก้แล้ว ไม่มีข้อมูลระบุตัวผู้แจ้ง)';



CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" bigint NOT NULL,
    "task" "text" NOT NULL,
    "response" "text",
    "model" "text",
    "tokens_used" integer DEFAULT 0,
    "conversation_id" "text",
    "user_id" "text" DEFAULT 'anonymous'::"text",
    "context" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


COMMENT ON TABLE "public"."conversations" IS 'Chat history for Bavorn AI FastAPI - stores inference tasks, responses, and conversation tracking';



COMMENT ON COLUMN "public"."conversations"."task" IS 'Task or question sent to AI';



COMMENT ON COLUMN "public"."conversations"."response" IS 'AI response/answer';



COMMENT ON COLUMN "public"."conversations"."model" IS 'Model name used (e.g., qwen2.5)';



COMMENT ON COLUMN "public"."conversations"."tokens_used" IS 'Total tokens used (prompt + response)';



COMMENT ON COLUMN "public"."conversations"."conversation_id" IS 'Conversation group ID for multi-turn chats';



COMMENT ON COLUMN "public"."conversations"."user_id" IS 'User identifier';



COMMENT ON COLUMN "public"."conversations"."context" IS 'System context/prompt used';



CREATE SEQUENCE IF NOT EXISTS "public"."conversations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."conversations_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."conversations_id_seq" OWNED BY "public"."conversations"."id";



CREATE TABLE IF NOT EXISTS "public"."customer_chat_turns" (
    "id" bigint NOT NULL,
    "line_user_id" "text" NOT NULL,
    "role" "text" NOT NULL,
    "content" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "customer_chat_turns_content_check" CHECK (("length"("content") <= 2000)),
    CONSTRAINT "customer_chat_turns_line_user_id_check" CHECK ((("length"("line_user_id") >= 1) AND ("length"("line_user_id") <= 64))),
    CONSTRAINT "customer_chat_turns_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'assistant'::"text"])))
);


ALTER TABLE "public"."customer_chat_turns" OWNER TO "postgres";


ALTER TABLE "public"."customer_chat_turns" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."customer_chat_turns_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."customer_memory" (
    "line_user_id" "text" NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."customer_memory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."demand_signals" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tambon_id" "uuid",
    "profile_id" "uuid",
    "kind" "text" NOT NULL,
    "value" "text" NOT NULL,
    "detail" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "demand_signals_kind_check" CHECK (("kind" = ANY (ARRAY['search_miss'::"text", 'vehicle_missing'::"text", 'service_open'::"text", 'menu_click'::"text"])))
);


ALTER TABLE "public"."demand_signals" OWNER TO "postgres";


COMMENT ON TABLE "public"."demand_signals" IS 'สิ่งที่ลูกค้าอยากได้แต่ระบบยังให้ไม่ได้ — ใช้ตัดสินว่าควรไปชวนใครมาเปิดร้าน/ขับรถ';



ALTER TABLE "public"."demand_signals" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."demand_signals_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."directive_targets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "directive_id" "uuid" NOT NULL,
    "tambon_id" "uuid" NOT NULL,
    "state" "text" DEFAULT 'pending'::"text" NOT NULL,
    "note" "text",
    "decided_by" "uuid",
    "decided_at" timestamp with time zone,
    CONSTRAINT "directive_targets_note_check" CHECK (("char_length"("note") <= 300)),
    CONSTRAINT "directive_targets_state_check" CHECK (("state" = ANY (ARRAY['pending'::"text", 'ack'::"text", 'approved'::"text", 'conditional'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."directive_targets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."directives" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_no" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "conditions" "text",
    "deadline_at" timestamp with time zone,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "is_test" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "directives_body_check" CHECK ((("char_length"("body") >= 1) AND ("char_length"("body") <= 1000))),
    CONSTRAINT "directives_conditions_check" CHECK (("char_length"("conditions") <= 500)),
    CONSTRAINT "directives_kind_check" CHECK (("kind" = ANY (ARRAY['policy'::"text", 'approval'::"text", 'consult'::"text"]))),
    CONSTRAINT "directives_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'closed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "directives_title_check" CHECK ((("char_length"("title") >= 1) AND ("char_length"("title") <= 120)))
);


ALTER TABLE "public"."directives" OWNER TO "postgres";


COMMENT ON TABLE "public"."directives" IS 'คำขออนุมัติ/ขอความเห็น/นโยบายถึงตัวแทนแต่ละตำบล · service role เท่านั้น · ส่ง LINE จริงโดย n8n หลังเจ้าของอนุมัติ';



CREATE SEQUENCE IF NOT EXISTS "public"."directives_ticket_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."directives_ticket_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "role" "public"."user_role" DEFAULT 'customer'::"public"."user_role" NOT NULL,
    "full_name" "text" NOT NULL,
    "phone" "text",
    "tambon_id" "uuid",
    "promptpay_id" "text",
    "approved" boolean DEFAULT true NOT NULL,
    "rating" numeric(2,1) DEFAULT 5.0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "line_user_id" "text",
    "is_test" boolean DEFAULT false NOT NULL,
    "suspended_at" timestamp with time zone,
    "suspended_reason" "text",
    "suspended_by" "uuid",
    "payment_qr_path" "text",
    "payment_account_name" "text",
    "payment_bank_name" "text",
    "llp_tester" boolean DEFAULT false NOT NULL,
    "referrer_first_name" "text",
    "referrer_last_name" "text",
    "can_order_as_customer" boolean DEFAULT false NOT NULL,
    "referrer_phone" "text",
    "referrer_profile_id" "uuid",
    CONSTRAINT "profiles_payment_qr_owner" CHECK ((("payment_qr_path" IS NULL) OR (("payment_qr_path" ~ (('^'::"text" || ("id")::"text") || '/[a-f0-9-]{36}\.(png|jpg|webp)$'::"text")) AND ("length"("btrim"(COALESCE("payment_account_name", ''::"text"))) > 0))))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."is_test" IS 'บัญชีทดสอบ (นโยบาย D28) — ออเดอร์ของบัญชีนี้เป็นทดสอบเสมอ';



COMMENT ON COLUMN "public"."profiles"."referrer_phone" IS 'เบอร์โทรผู้แนะนำ ตามที่ผู้สมัครกรอก';



COMMENT ON COLUMN "public"."profiles"."referrer_profile_id" IS 'บัญชีผู้แนะนำ ใช้เป็นฐานคำนวณส่วนแบ่ง ผูกอัตโนมัติเมื่อเบอร์หรือชื่อตรงกับบัญชีเดียว';



CREATE TABLE IF NOT EXISTS "public"."ratings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" bigint NOT NULL,
    "from_profile" "uuid" NOT NULL,
    "to_profile" "uuid" NOT NULL,
    "score" integer NOT NULL,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ratings_score_check" CHECK ((("score" >= 1) AND ("score" <= 5)))
);


ALTER TABLE "public"."ratings" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."driver_rankings" AS
 SELECT "p"."id",
    "p"."full_name",
    "count"("r"."id") AS "rating_count",
    "round"("avg"("r"."score"), 1) AS "avg_score"
   FROM ("public"."profiles" "p"
     JOIN "public"."ratings" "r" ON (("r"."to_profile" = "p"."id")))
  WHERE (("p"."role" = 'driver'::"public"."user_role") AND (NOT "p"."is_test"))
  GROUP BY "p"."id", "p"."full_name"
  ORDER BY ("round"("avg"("r"."score"), 1)) DESC, ("count"("r"."id")) DESC;


ALTER VIEW "public"."driver_rankings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drivers" (
    "profile_id" "uuid" NOT NULL,
    "vehicle_type" "public"."vehicle_type" DEFAULT 'motorcycle'::"public"."vehicle_type" NOT NULL,
    "is_online" boolean DEFAULT false NOT NULL,
    "today_jobs" integer DEFAULT 0 NOT NULL,
    "today_earn" numeric(10,2) DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "lat" double precision,
    "lng" double precision,
    "location_updated_at" timestamp with time zone,
    "plate_number" "text"
);


ALTER TABLE "public"."drivers" OWNER TO "postgres";


COMMENT ON COLUMN "public"."drivers"."lat" IS 'Driver''s last known GPS latitude, captured via LINE location-share message (e.g. when toggling online).';



COMMENT ON COLUMN "public"."drivers"."lng" IS 'Driver''s last known GPS longitude, captured via LINE location-share message (e.g. when toggling online).';



COMMENT ON COLUMN "public"."drivers"."plate_number" IS 'หมายเลขทะเบียนรถ (กรอกตอนสมัครผ่าน LINE) · รถเกษตร/โดรนที่ไม่มีทะเบียนเป็น "-" · แสดงให้ร้านและลูกค้าเมื่อได้งาน';



CREATE TABLE IF NOT EXISTS "public"."fx_rates" (
    "id" bigint NOT NULL,
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text" NOT NULL,
    "provider_updated_at" timestamp with time zone,
    "thb_per" "jsonb" NOT NULL,
    CONSTRAINT "fx_rates_source_check" CHECK (("source" = ANY (ARRAY['bot'::"text", 'exchangerate-api'::"text"])))
);


ALTER TABLE "public"."fx_rates" OWNER TO "postgres";


ALTER TABLE "public"."fx_rates" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."fx_rates_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."job_seekers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "line_user_id" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "occupation" "text",
    "skills_experience" "text",
    "phone" "text",
    "area" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."job_seekers" OWNER TO "postgres";


COMMENT ON TABLE "public"."job_seekers" IS 'Job-seeker profiles collected via LINE chat (สมัครงาน / สมัครงานอาชีพ). Profile-only intake for now, no auto-matching yet.';



CREATE OR REPLACE VIEW "public"."line_oa_daily" AS
 SELECT (("messages"."created_at" AT TIME ZONE 'Asia/Bangkok'::"text"))::"date" AS "day",
    'message'::"text" AS "source",
    "messages"."from_tambon_id" AS "tambon_id",
    "count"(*) AS "n"
   FROM "public"."messages"
  WHERE (NOT "messages"."is_test")
  GROUP BY ((("messages"."created_at" AT TIME ZONE 'Asia/Bangkok'::"text"))::"date"), "messages"."from_tambon_id"
UNION ALL
 SELECT (("orders"."created_at" AT TIME ZONE 'Asia/Bangkok'::"text"))::"date" AS "day",
    'order'::"text" AS "source",
    "orders"."tambon_id",
    "count"(*) AS "n"
   FROM "public"."orders"
  WHERE (NOT "orders"."is_test")
  GROUP BY ((("orders"."created_at" AT TIME ZONE 'Asia/Bangkok'::"text"))::"date"), "orders"."tambon_id"
UNION ALL
 SELECT (("complaints"."created_at" AT TIME ZONE 'Asia/Bangkok'::"text"))::"date" AS "day",
    'complaint'::"text" AS "source",
    "complaints"."tambon_id",
    "count"(*) AS "n"
   FROM "public"."complaints"
  WHERE (NOT "complaints"."is_test")
  GROUP BY ((("complaints"."created_at" AT TIME ZONE 'Asia/Bangkok'::"text"))::"date"), "complaints"."tambon_id"
UNION ALL
 SELECT (("customer_chat_turns"."created_at" AT TIME ZONE 'Asia/Bangkok'::"text"))::"date" AS "day",
    'chat'::"text" AS "source",
    NULL::"uuid" AS "tambon_id",
    "count"(*) AS "n"
   FROM "public"."customer_chat_turns"
  WHERE ("customer_chat_turns"."role" = 'user'::"text")
  GROUP BY ((("customer_chat_turns"."created_at" AT TIME ZONE 'Asia/Bangkok'::"text"))::"date"), NULL::"uuid";


ALTER VIEW "public"."line_oa_daily" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."line_users" (
    "line_user_id" "text" NOT NULL,
    "display_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."line_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."llp_payment_events" (
    "provider" "text" NOT NULL,
    "event_id" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "result" "jsonb",
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."llp_payment_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."llp_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" bigint NOT NULL,
    "provider" "text" DEFAULT 'opn'::"text" NOT NULL,
    "provider_charge_id" "text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "qr_image" "text",
    "expires_at" timestamp with time zone,
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "llp_payments_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "llp_payments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'failed'::"text", 'expired'::"text", 'refunded'::"text"])))
);


ALTER TABLE "public"."llp_payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menu_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "merchant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "price" numeric(10,2) NOT NULL,
    "is_available" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "photo_url" "text",
    "is_hidden" boolean DEFAULT false NOT NULL,
    "description" "text",
    CONSTRAINT "menu_items_description_length" CHECK ((("description" IS NULL) OR ("char_length"("description") <= 200))),
    CONSTRAINT "menu_items_price_check" CHECK (("price" >= (0)::numeric))
);


ALTER TABLE "public"."menu_items" OWNER TO "postgres";


COMMENT ON COLUMN "public"."menu_items"."is_hidden" IS 'ร้านเลิกขายเมนูนี้แล้ว — ต่างจาก is_available ที่แปลว่าหมดชั่วคราว';



CREATE TABLE IF NOT EXISTS "public"."merchants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "tambon_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text",
    "address" "text",
    "is_open" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "lat" double precision,
    "lng" double precision,
    "is_test" boolean DEFAULT false NOT NULL,
    "hours_enabled" boolean DEFAULT false NOT NULL,
    "opening_hours" "jsonb",
    "contact_name" "text",
    CONSTRAINT "merchants_valid_opening_hours" CHECK (((("opening_hours" IS NULL) OR "public"."valid_shop_hours"("opening_hours")) AND ((NOT "hours_enabled") OR ("opening_hours" IS NOT NULL))))
);


ALTER TABLE "public"."merchants" OWNER TO "postgres";


COMMENT ON COLUMN "public"."merchants"."lat" IS 'Real GPS latitude captured via LINE location-share message during merchant onboarding.';



COMMENT ON COLUMN "public"."merchants"."lng" IS 'Real GPS longitude captured via LINE location-share message during merchant onboarding.';



COMMENT ON COLUMN "public"."merchants"."is_test" IS 'ร้านทดสอบ (นโยบาย D28) — ออเดอร์ของร้านนี้เป็นทดสอบเสมอ';



COMMENT ON COLUMN "public"."merchants"."contact_name" IS 'ชื่อผู้ติดต่อ/เจ้าของร้าน จากฟอร์มสมัครร้านค้า';



CREATE OR REPLACE VIEW "public"."merchant_rankings" AS
 SELECT "m"."id" AS "merchant_id",
    "m"."name",
    "count"("r"."id") AS "rating_count",
    "round"("avg"("r"."score"), 1) AS "avg_score"
   FROM (("public"."merchants" "m"
     JOIN "public"."profiles" "p" ON (("p"."id" = "m"."profile_id")))
     JOIN "public"."ratings" "r" ON (("r"."to_profile" = "p"."id")))
  WHERE ((NOT "m"."is_test") AND (NOT "p"."is_test"))
  GROUP BY "m"."id", "m"."name"
  ORDER BY ("round"("avg"("r"."score"), 1)) DESC, ("count"("r"."id")) DESC;


ALTER VIEW "public"."merchant_rankings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "event" "text" NOT NULL,
    "actor_profile_id" "uuid",
    "actor_role" "text" NOT NULL,
    "actor_tambon_id" "uuid",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "message_events_event_check" CHECK (("event" = ANY (ARRAY['sent'::"text", 'read'::"text", 'accepted'::"text", 'replied'::"text", 'forwarded'::"text", 'cancelled'::"text", 'closed'::"text", 'overdue'::"text"]))),
    CONSTRAINT "message_events_note_check" CHECK (("char_length"("note") <= 500))
);


ALTER TABLE "public"."message_events" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."message_overview" AS
 SELECT "kind",
    "from_tambon_id",
    "to_tambon_id",
    "status",
    "count"(*) AS "n",
    "count"(*) FILTER (WHERE (("status" = ANY (ARRAY['sent'::"text", 'read'::"text"])) AND ("created_at" < ("now"() - '24:00:00'::interval)))) AS "overdue_24h",
    "max"("updated_at") AS "last_activity"
   FROM "public"."messages"
  WHERE (NOT "is_test")
  GROUP BY "kind", "from_tambon_id", "to_tambon_id", "status";


ALTER VIEW "public"."message_overview" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_sessions" (
    "line_user_id" "text" NOT NULL,
    "step" "text",
    "draft" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "nickname" "text",
    "show_real" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "message_sessions_nickname_check" CHECK (("char_length"("nickname") <= 30)),
    CONSTRAINT "message_sessions_step_check" CHECK (("step" = ANY (ARRAY['await_audience'::"text", 'await_text'::"text", 'await_reply'::"text", 'confirm'::"text", 'await_dnote'::"text"])))
);


ALTER TABLE "public"."message_sessions" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."messages_ticket_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."messages_ticket_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_events" (
    "id" bigint NOT NULL,
    "order_id" bigint NOT NULL,
    "status" "public"."order_status" NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."order_events" OWNER TO "postgres";


COMMENT ON TABLE "public"."order_events" IS 'Status timeline for an order. Readable by anyone who can see the parent order; writes are service-role only by design (no INSERT/UPDATE/DELETE policy).';



ALTER TABLE "public"."order_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."order_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" bigint NOT NULL,
    "menu_item_id" "uuid",
    "name" "text" NOT NULL,
    "qty" integer DEFAULT 1 NOT NULL,
    "price" numeric(10,2) DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."order_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_refunds" (
    "order_id" bigint NOT NULL,
    "tambon_id" "uuid" NOT NULL,
    "amount" numeric NOT NULL,
    "payment_method" "text",
    "reason" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "refunded_at" timestamp with time zone,
    "refunded_by" "uuid",
    "note" "text",
    CONSTRAINT "order_refunds_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "order_refunds_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'done'::"text"])))
);


ALTER TABLE "public"."order_refunds" OWNER TO "postgres";


ALTER TABLE "public"."orders" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."orders_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."pending_menu_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "line_user_id" "text" NOT NULL,
    "merchant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "price" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pending_menu_items_price_check" CHECK (("price" >= (0)::numeric))
);


ALTER TABLE "public"."pending_menu_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."pending_menu_items" IS 'Temporary staging row created when a merchant sends product name+price via LINE chat, before they send the product photo. Deleted once the photo arrives and the real menu_items row is created.';



CREATE TABLE IF NOT EXISTS "public"."places" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tambon_id" "uuid",
    "category" "text" NOT NULL,
    "name" "text" NOT NULL,
    "address" "text",
    "phone" "text",
    "lat" double precision,
    "lng" double precision,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text" DEFAULT 'manual'::"text" NOT NULL,
    "source_url" "text",
    "ai_confidence" numeric,
    "verified" boolean DEFAULT false NOT NULL,
    "note" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "places_category_check" CHECK (("category" = ANY (ARRAY['government'::"text", 'hospital'::"text", 'school'::"text", 'university'::"text", 'temple'::"text"])))
);


ALTER TABLE "public"."places" OWNER TO "postgres";


COMMENT ON TABLE "public"."places" IS 'Directory of notable places in the tambon (government offices, hospitals, schools, universities, temples) for browsing via LINE OA and PWA, and future use as ride-hailing destination presets.';



COMMENT ON COLUMN "public"."places"."source" IS 'manual = แอดมินใส่ · deepseek_web = DeepSeek ค้นเว็บ + Jev ตรวจ';



COMMENT ON COLUMN "public"."places"."verified" IS 'แอดมินตำบลยืนยันแล้ว (ข้อมูลจาก AI เริ่มที่ false และแสดงป้ายยังไม่ยืนยัน)';



CREATE TABLE IF NOT EXISTS "public"."platform_listings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "product_id" "uuid" NOT NULL,
    "platform" "text" NOT NULL,
    "platform_item_id" "text" NOT NULL,
    "affiliate_url" "text",
    CONSTRAINT "platform_listings_platform_check" CHECK (("platform" = ANY (ARRAY['shopee'::"text", 'lazada'::"text", 'tiktok'::"text", 'line_direct'::"text"])))
);


ALTER TABLE "public"."platform_listings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_prices" (
    "listing_id" "uuid" NOT NULL,
    "price" numeric(12,2) NOT NULL,
    "in_stock" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "platform_prices_price_check" CHECK (("price" > (0)::numeric))
);


ALTER TABLE "public"."platform_prices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_profile_id" "uuid" NOT NULL,
    "tambon_id" "uuid" NOT NULL,
    "address" "text",
    "lat" double precision,
    "lng" double precision,
    "area_rai" numeric,
    "crop_type" "text",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "plots_area_rai_check" CHECK ((("area_rai" IS NULL) OR ("area_rai" >= (0)::numeric)))
);


ALTER TABLE "public"."plots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sku" "text" NOT NULL,
    "name" "text" NOT NULL,
    "barcode" "text",
    "image_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profile_link_attempts" (
    "id" bigint NOT NULL,
    "line_user_id" "text" NOT NULL,
    "ok" boolean NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profile_link_attempts" OWNER TO "postgres";


COMMENT ON TABLE "public"."profile_link_attempts" IS 'บันทึกการพิมพ์รหัสผูกบัญชี ใช้จำกัดการเดารหัส';



ALTER TABLE "public"."profile_link_attempts" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."profile_link_attempts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."profile_link_codes" (
    "code" "text" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "issued_by" "uuid",
    "issued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval) NOT NULL,
    "used_at" timestamp with time zone,
    "used_by_line_user_id" "text",
    "revoked_at" timestamp with time zone
);


ALTER TABLE "public"."profile_link_codes" OWNER TO "postgres";


COMMENT ON TABLE "public"."profile_link_codes" IS 'รหัสผูกบัญชี LINE กับร้าน/ไรเดอร์ที่มีอยู่แล้ว · ใช้ครั้งเดียว หมดอายุ 7 วัน · เข้าถึงผ่านฟังก์ชันเท่านั้น';



CREATE TABLE IF NOT EXISTS "public"."push_broadcast_log" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);


ALTER TABLE "public"."push_broadcast_log" OWNER TO "postgres";


ALTER TABLE "public"."push_broadcast_log" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."push_broadcast_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "push_subscriptions_endpoint_check" CHECK ((("length"("endpoint") <= 1000) AND (("endpoint" ~~ 'https://%'::"text") OR (("endpoint" ~ '^fcm:[A-Za-z0-9_:.-]+$'::"text") AND ("length"("endpoint") >= 24))))),
    CONSTRAINT "push_subscriptions_kind_check" CHECK (("kind" = ANY (ARRAY['merchant'::"text", 'driver'::"text", 'agent'::"text"])))
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rich_menu_deploy_log" (
    "id" bigint NOT NULL,
    "step" "text" NOT NULL,
    "data" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rich_menu_deploy_log" OWNER TO "postgres";


ALTER TABLE "public"."rich_menu_deploy_log" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."rich_menu_deploy_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."search_logs" (
    "id" bigint NOT NULL,
    "line_user_id" "text",
    "query" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."search_logs" OWNER TO "postgres";


ALTER TABLE "public"."search_logs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."search_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."settlements" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "order_id" bigint NOT NULL,
    "tambon_id" "uuid" NOT NULL,
    "payee_profile_id" "uuid" NOT NULL,
    "payee_role" "text" NOT NULL,
    "amount" numeric NOT NULL,
    "due_at" timestamp with time zone NOT NULL,
    "paid_out_at" timestamp with time zone,
    "paid_out_slip_url" "text",
    "confirmed_at" timestamp with time zone,
    "payout_ref" "text" GENERATED ALWAYS AS ("public"."make_ref"('PO'::"text", "id")) STORED,
    CONSTRAINT "settlements_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "settlements_payee_role_check" CHECK (("payee_role" = ANY (ARRAY['merchant'::"text", 'driver'::"text"])))
);


ALTER TABLE "public"."settlements" OWNER TO "postgres";


COMMENT ON TABLE "public"."settlements" IS 'ยอดที่ตัวแทนตำบลค้างจ่ายให้ร้านและไรเดอร์ หลังลูกค้าโอนเข้าบัญชีกลางแล้ว';



COMMENT ON COLUMN "public"."settlements"."payout_ref" IS 'เลขอ้างอิงของการโอนออกให้ร้าน/ไรเดอร์ ใช้กระทบยอดขาจ่าย';



ALTER TABLE "public"."settlements" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."settlements_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."staff_line_accounts" (
    "line_user_id" "text" NOT NULL,
    "level" "text" NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "staff_line_accounts_level_check" CHECK (("level" = ANY (ARRAY['superadmin'::"text", 'admin'::"text"])))
);


ALTER TABLE "public"."staff_line_accounts" OWNER TO "postgres";


COMMENT ON TABLE "public"."staff_line_accounts" IS 'LINE ของผู้ดูแลระดับ superadmin/admin กลาง สำหรับผู้ช่วยผู้ดูแลใน LINE · ตัวแทนตำบลดูจาก profiles.role=admin + admin_scopes · เข้าถึงผ่าน service role เท่านั้น';



CREATE TABLE IF NOT EXISTS "public"."tambon_ai_items" (
    "id" bigint NOT NULL,
    "tambon_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "title" "text" NOT NULL,
    "summary" "text" DEFAULT ''::"text" NOT NULL,
    "source_url" "text" NOT NULL,
    "source_name" "text",
    "event_date" "date",
    "content_key" "text" NOT NULL,
    "hidden" boolean DEFAULT false NOT NULL,
    "hidden_by" "uuid",
    "first_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "refreshed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone,
    CONSTRAINT "tambon_ai_items_kind_check" CHECK (("kind" = ANY (ARRAY['news'::"text", 'event'::"text", 'place'::"text", 'product'::"text", 'tradition'::"text", 'fact'::"text", 'education'::"text", 'industry'::"text", 'food'::"text", 'health'::"text", 'shopping'::"text"]))),
    CONSTRAINT "tambon_ai_items_source_name_check" CHECK ((("source_name" IS NULL) OR ("char_length"("source_name") <= 120))),
    CONSTRAINT "tambon_ai_items_source_url_check" CHECK ((("source_url" ~* '^https?://'::"text") AND ("char_length"("source_url") <= 500))),
    CONSTRAINT "tambon_ai_items_summary_check" CHECK (("char_length"("summary") <= 800)),
    CONSTRAINT "tambon_ai_items_title_check" CHECK ((("char_length"("btrim"("title")) >= 3) AND ("char_length"("btrim"("title")) <= 160)))
);


ALTER TABLE "public"."tambon_ai_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."tambon_ai_items" IS 'ข้อมูลสาธารณะของตำบลที่ AI รวบรวมจากเว็บ (D51) ต้องมีลิงก์แหล่งที่มา · ตัวแทนซ่อนได้';



ALTER TABLE "public"."tambon_ai_items" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."tambon_ai_items_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."tambon_ai_runs" (
    "id" bigint NOT NULL,
    "tambon_id" "uuid" NOT NULL,
    "ran_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "model" "text",
    "input_tokens" integer,
    "output_tokens" integer,
    "cost_usd" numeric(10,6),
    "items_received" integer DEFAULT 0 NOT NULL,
    "items_added" integer DEFAULT 0 NOT NULL,
    "items_refreshed" integer DEFAULT 0 NOT NULL,
    "items_rejected" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'ok'::"text" NOT NULL,
    "error" "text",
    "n8n_execution_id" "text",
    CONSTRAINT "tambon_ai_runs_error_check" CHECK ((("error" IS NULL) OR ("char_length"("error") <= 1000))),
    CONSTRAINT "tambon_ai_runs_status_check" CHECK (("status" = ANY (ARRAY['ok'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."tambon_ai_runs" OWNER TO "postgres";


COMMENT ON TABLE "public"."tambon_ai_runs" IS 'บันทึกการรัน AI รวบรวมข้อมูลตำบล: token ค่าใช้จ่าย จำนวนรายการ (D51)';



ALTER TABLE "public"."tambon_ai_runs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."tambon_ai_runs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."tambon_applications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tambon_name" "text" NOT NULL,
    "district" "text" NOT NULL,
    "province" "text" NOT NULL,
    "tambon_code" "text",
    "applicant_name" "text" NOT NULL,
    "applicant_phone" "text" NOT NULL,
    "applicant_line" "text",
    "applicant_profile_id" "uuid",
    "merchant_count" integer,
    "driver_count" integer,
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "pdpa_consent" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "review_note" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "created_tambon_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deposit_amount" numeric,
    "deposit_slip_url" "text",
    "deposit_received_at" timestamp with time zone,
    "settlement_promptpay_id" "text",
    CONSTRAINT "tambon_applications_driver_count_check" CHECK ((("driver_count" IS NULL) OR ("driver_count" >= 0))),
    CONSTRAINT "tambon_applications_merchant_count_check" CHECK ((("merchant_count" IS NULL) OR ("merchant_count" >= 0))),
    CONSTRAINT "tambon_applications_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."tambon_applications" OWNER TO "postgres";


COMMENT ON TABLE "public"."tambon_applications" IS 'ใบขอเปิดตำบลใหม่ — ส่วนกลาง (superadmin) เป็นผู้อนุมัติผ่าน approve_tambon_application()';



CREATE TABLE IF NOT EXISTS "public"."tambon_board_contacts" (
    "post_id" bigint NOT NULL,
    "contact_name" "text" NOT NULL,
    "contact_phone" "text",
    "contact_email" "text",
    "link_code" "text" NOT NULL,
    "employer_line_user_id" "text",
    "linked_at" timestamp with time zone,
    CONSTRAINT "tambon_board_contacts_check" CHECK ((("contact_phone" IS NOT NULL) OR ("contact_email" IS NOT NULL))),
    CONSTRAINT "tambon_board_contacts_contact_email_check" CHECK ((("contact_email" IS NULL) OR (("contact_email" ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'::"text") AND ("char_length"("contact_email") <= 200)))),
    CONSTRAINT "tambon_board_contacts_contact_name_check" CHECK ((("char_length"("btrim"("contact_name")) >= 2) AND ("char_length"("btrim"("contact_name")) <= 120))),
    CONSTRAINT "tambon_board_contacts_contact_phone_check" CHECK ((("contact_phone" IS NULL) OR ("contact_phone" ~ '^[0-9+ -]{9,20}$'::"text")))
);


ALTER TABLE "public"."tambon_board_contacts" OWNER TO "postgres";


COMMENT ON TABLE "public"."tambon_board_contacts" IS 'ข้อมูลติดต่อผู้ลงประกาศ เห็นเฉพาะตัวแทนตำบล · link_code ผูก LINE นายจ้าง (D52)';



CREATE TABLE IF NOT EXISTS "public"."tambon_board_posts" (
    "id" bigint NOT NULL,
    "tambon_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "org_name" "text" NOT NULL,
    "org_type" "text" DEFAULT 'other'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "link_url" "text",
    "job_positions" integer,
    "job_wage" "text",
    "job_location" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reject_reason" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tambon_board_posts_body_check" CHECK (("char_length"("body") <= 2000)),
    CONSTRAINT "tambon_board_posts_job_location_check" CHECK ((("job_location" IS NULL) OR ("char_length"("job_location") <= 200))),
    CONSTRAINT "tambon_board_posts_job_positions_check" CHECK ((("job_positions" IS NULL) OR (("job_positions" >= 1) AND ("job_positions" <= 999)))),
    CONSTRAINT "tambon_board_posts_job_wage_check" CHECK ((("job_wage" IS NULL) OR ("char_length"("job_wage") <= 120))),
    CONSTRAINT "tambon_board_posts_kind_check" CHECK (("kind" = ANY (ARRAY['job'::"text", 'announcement'::"text"]))),
    CONSTRAINT "tambon_board_posts_link_url_check" CHECK ((("link_url" IS NULL) OR (("link_url" ~* '^https?://'::"text") AND ("char_length"("link_url") <= 500)))),
    CONSTRAINT "tambon_board_posts_org_name_check" CHECK ((("char_length"("btrim"("org_name")) >= 2) AND ("char_length"("btrim"("org_name")) <= 120))),
    CONSTRAINT "tambon_board_posts_org_type_check" CHECK (("org_type" = ANY (ARRAY['government'::"text", 'private'::"text", 'community'::"text", 'other'::"text"]))),
    CONSTRAINT "tambon_board_posts_reject_reason_check" CHECK ((("reject_reason" IS NULL) OR ("char_length"("reject_reason") <= 300))),
    CONSTRAINT "tambon_board_posts_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'closed'::"text"]))),
    CONSTRAINT "tambon_board_posts_title_check" CHECK ((("char_length"("btrim"("title")) >= 3) AND ("char_length"("btrim"("title")) <= 120)))
);


ALTER TABLE "public"."tambon_board_posts" OWNER TO "postgres";


COMMENT ON TABLE "public"."tambon_board_posts" IS 'ประกาศรับสมัครงาน/ประกาศจากหน่วยงานบนหน้าตำบล ใครก็ส่งได้ ตัวแทนอนุมัติก่อนขึ้น (D52)';



ALTER TABLE "public"."tambon_board_posts" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."tambon_board_posts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."tambon_job_applications" (
    "id" bigint NOT NULL,
    "post_id" bigint NOT NULL,
    "tambon_id" "uuid" NOT NULL,
    "line_user_id" "text" NOT NULL,
    "applicant_name" "text" NOT NULL,
    "applicant_phone" "text" NOT NULL,
    "note" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "forwarded_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tambon_job_applications_applicant_name_check" CHECK ((("char_length"("btrim"("applicant_name")) >= 2) AND ("char_length"("btrim"("applicant_name")) <= 120))),
    CONSTRAINT "tambon_job_applications_applicant_phone_check" CHECK (("applicant_phone" ~ '^[0-9+ -]{9,20}$'::"text")),
    CONSTRAINT "tambon_job_applications_note_check" CHECK (("char_length"("note") <= 500)),
    CONSTRAINT "tambon_job_applications_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'forwarded'::"text", 'contacted'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."tambon_job_applications" OWNER TO "postgres";


COMMENT ON TABLE "public"."tambon_job_applications" IS 'ใบสมัครงานจาก LINE ส่งต่อให้นายจ้าง (D52)';



ALTER TABLE "public"."tambon_job_applications" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."tambon_job_applications_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."tambon_posts" (
    "id" bigint NOT NULL,
    "tambon_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "image_url" "text",
    "is_published" boolean DEFAULT true NOT NULL,
    "pinned" boolean DEFAULT false NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tambon_posts_body_check" CHECK (("char_length"("body") <= 2000)),
    CONSTRAINT "tambon_posts_image_url_check" CHECK ((("image_url" IS NULL) OR ("char_length"("image_url") <= 500))),
    CONSTRAINT "tambon_posts_title_check" CHECK ((("char_length"("btrim"("title")) >= 3) AND ("char_length"("btrim"("title")) <= 120)))
);


ALTER TABLE "public"."tambon_posts" OWNER TO "postgres";


COMMENT ON TABLE "public"."tambon_posts" IS 'ประกาศ/ข่าวสั้นของตำบลบนหน้า /t/<slug> — ตัวแทนตำบลโพสต์ (D50)';



ALTER TABLE "public"."tambon_posts" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."tambon_posts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."tambon_profiles" (
    "tambon_id" "uuid" NOT NULL,
    "local_gov_name" "text",
    "local_gov_website" "text",
    "population" integer,
    "households" integer,
    "villages" integer,
    "area_sqkm" numeric(10,2),
    "main_economy" "text",
    "culture" "text",
    "attractions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "traditions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "products" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "budget_year" integer,
    "budget_total" numeric(14,2),
    "sources" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tambon_profiles_area_sqkm_check" CHECK ((("area_sqkm" IS NULL) OR ("area_sqkm" > (0)::numeric))),
    CONSTRAINT "tambon_profiles_budget_total_check" CHECK ((("budget_total" IS NULL) OR ("budget_total" >= (0)::numeric))),
    CONSTRAINT "tambon_profiles_budget_year_check" CHECK ((("budget_year" IS NULL) OR (("budget_year" >= 2500) AND ("budget_year" <= 2700)))),
    CONSTRAINT "tambon_profiles_households_check" CHECK ((("households" IS NULL) OR ("households" >= 0))),
    CONSTRAINT "tambon_profiles_population_check" CHECK ((("population" IS NULL) OR ("population" >= 0))),
    CONSTRAINT "tambon_profiles_villages_check" CHECK ((("villages" IS NULL) OR ("villages" >= 0)))
);


ALTER TABLE "public"."tambon_profiles" OWNER TO "postgres";


COMMENT ON TABLE "public"."tambon_profiles" IS 'ข้อมูลประจำตำบล — ประชากร เศรษฐกิจ วัฒนธรรม ประเพณี แหล่งท่องเที่ยว งบประมาณ. ทุกตัวเลขต้องมีที่มาใน sources';



CREATE TABLE IF NOT EXISTS "public"."tambons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "district" "text",
    "province" "text",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "code" "text",
    "name_en" "text",
    "slug" "text" NOT NULL,
    "intro" "text",
    "announcement" "text",
    "cover_url" "text",
    "contact_line" "text",
    "contact_phone" "text",
    "delivery_fee_base" numeric(10,2),
    "delivery_fee_per_km" numeric(10,2),
    "is_active" boolean DEFAULT false NOT NULL,
    "opened_at" timestamp with time zone,
    "settlement_promptpay_id" "text",
    "settlement_account_name" "text",
    "deposit_amount" numeric DEFAULT 0 NOT NULL,
    "payout_cutoff_time" time without time zone DEFAULT '21:00:00'::time without time zone NOT NULL,
    "intake_blocked" boolean DEFAULT false NOT NULL,
    "intake_blocked_reason" "text",
    "agent_share_commission_pct" numeric(5,2) DEFAULT 0 NOT NULL,
    "agent_share_delivery_pct" numeric(5,2) DEFAULT 0 NOT NULL,
    "ai_content_enabled" boolean DEFAULT false NOT NULL,
    CONSTRAINT "tambons_agent_share_range" CHECK (((("agent_share_commission_pct" >= (0)::numeric) AND ("agent_share_commission_pct" <= (100)::numeric)) AND (("agent_share_delivery_pct" >= (0)::numeric) AND ("agent_share_delivery_pct" <= (100)::numeric))))
);


ALTER TABLE "public"."tambons" OWNER TO "postgres";


COMMENT ON COLUMN "public"."tambons"."code" IS 'Official 6-digit Thai subdistrict code. Unique nationwide when present.';



COMMENT ON COLUMN "public"."tambons"."name_en" IS 'Romanised tambon name, used to build a human-readable slug.';



COMMENT ON COLUMN "public"."tambons"."slug" IS 'URL identifier for the public tambon page (/t/<slug>). Stable: never reuse a slug for a different tambon.';



COMMENT ON COLUMN "public"."tambons"."is_active" IS 'เปิดให้บริการจริงแล้วหรือยัง — อนุมัติแล้วแต่ยังไม่พร้อม (ยังไม่มีร้าน/ไรเดอร์) ให้เป็น false';



COMMENT ON COLUMN "public"."tambons"."deposit_amount" IS 'เงินค้ำประกันที่ตัวแทนวางไว้ = เพดานยอดค้างจ่ายสูงสุดที่ยอมให้เกิดได้';



COMMENT ON COLUMN "public"."tambons"."agent_share_commission_pct" IS 'ส่วนแบ่งตัวแทนตำบล % ของค่าคอมจากค่าสินค้า — ส่วนกลางกรอกตามข้อตกลงตำบล (D47)';



COMMENT ON COLUMN "public"."tambons"."agent_share_delivery_pct" IS 'ส่วนแบ่งตัวแทนตำบล % ของส่วนแพลตฟอร์มจากค่าขนส่ง — ส่วนกลางกรอกตามข้อตกลงตำบล (D47)';



COMMENT ON COLUMN "public"."tambons"."ai_content_enabled" IS 'ให้ AI รวบรวมข้อมูลสาธารณะของตำบลจากเว็บทุกวัน (D51) — ส่วนกลางเปิด/ปิด';



CREATE TABLE IF NOT EXISTS "public"."tourism_location_requests" (
    "line_user_id" "text" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "keyword" "text",
    "lat" double precision,
    "lng" double precision,
    "located_at" timestamp with time zone
);


ALTER TABLE "public"."tourism_location_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."web_applications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "role" "text" NOT NULL,
    "tambon_id" "uuid",
    "tambon_confirmed" boolean DEFAULT false NOT NULL,
    "full_name" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "line_id" "text",
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "pdpa_consent" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "web_applications_role_check" CHECK (("role" = ANY (ARRAY['merchant'::"text", 'rider'::"text", 'jobseeker'::"text", 'other'::"text"]))),
    CONSTRAINT "web_applications_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."web_applications" OWNER TO "postgres";


COMMENT ON TABLE "public"."web_applications" IS 'Applications submitted via the national บวรไทย web form (เดิมชื่อ raksthai) (merchant/rider/jobseeker/other), pending admin review. Separate from the LINE OA intake pipeline (profiles/merchants/drivers/job_seekers) by design -- admin manually promotes an approved row into those tables. tambon_confirmed is a self-declared checkbox (no ID-card number/document collected), per project decision to avoid heavy KYC.';



ALTER TABLE ONLY "public"."ai_usage_ledger" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."ai_usage_ledger_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."clip_rules" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."clip_rules_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."conversations" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."conversations_id_seq"'::"regclass");



ALTER TABLE ONLY "dhamma"."lessons"
    ADD CONSTRAINT "lessons_pkey" PRIMARY KEY ("seq");



ALTER TABLE ONLY "dhamma"."prompts"
    ADD CONSTRAINT "prompts_mode_version_key" UNIQUE ("mode", "version");



ALTER TABLE ONLY "dhamma"."prompts"
    ADD CONSTRAINT "prompts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "dhamma"."settings"
    ADD CONSTRAINT "settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "dhamma"."turns"
    ADD CONSTRAINT "turns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "dhamma"."user_prefs"
    ADD CONSTRAINT "user_prefs_pkey" PRIMARY KEY ("line_user_id");



ALTER TABLE ONLY "dhamma"."user_state"
    ADD CONSTRAINT "user_state_pkey" PRIMARY KEY ("line_user_id");



ALTER TABLE ONLY "private"."delivery_command_receipts"
    ADD CONSTRAINT "delivery_command_receipts_pkey" PRIMARY KEY ("command_id");



ALTER TABLE ONLY "public"."admin_actions"
    ADD CONSTRAINT "admin_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_scopes"
    ADD CONSTRAINT "admin_scopes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_work_events"
    ADD CONSTRAINT "agent_work_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_work_items"
    ADD CONSTRAINT "agent_work_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_conversations"
    ADD CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_usage_ledger"
    ADD CONSTRAINT "ai_usage_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."carts"
    ADD CONSTRAINT "carts_pkey" PRIMARY KEY ("line_user_id");



ALTER TABLE ONLY "public"."cashbook_entries"
    ADD CONSTRAINT "cashbook_entries_created_by_request_id_key" UNIQUE ("created_by", "request_id");



ALTER TABLE ONLY "public"."cashbook_entries"
    ADD CONSTRAINT "cashbook_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clip_inputs"
    ADD CONSTRAINT "clip_inputs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clip_rules"
    ADD CONSTRAINT "clip_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clip_sessions"
    ADD CONSTRAINT "clip_sessions_pkey" PRIMARY KEY ("line_user_id");



ALTER TABLE ONLY "public"."compare_orders"
    ADD CONSTRAINT "compare_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."complaint_updates"
    ADD CONSTRAINT "complaint_updates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."complaints"
    ADD CONSTRAINT "complaints_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."complaints"
    ADD CONSTRAINT "complaints_ticket_no_key" UNIQUE ("ticket_no");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_chat_turns"
    ADD CONSTRAINT "customer_chat_turns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_memory"
    ADD CONSTRAINT "customer_memory_pkey" PRIMARY KEY ("line_user_id");



ALTER TABLE ONLY "public"."demand_signals"
    ADD CONSTRAINT "demand_signals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."directive_targets"
    ADD CONSTRAINT "directive_targets_directive_id_tambon_id_key" UNIQUE ("directive_id", "tambon_id");



ALTER TABLE ONLY "public"."directive_targets"
    ADD CONSTRAINT "directive_targets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."directives"
    ADD CONSTRAINT "directives_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."directives"
    ADD CONSTRAINT "directives_ticket_no_key" UNIQUE ("ticket_no");



ALTER TABLE ONLY "public"."drivers"
    ADD CONSTRAINT "drivers_pkey" PRIMARY KEY ("profile_id");



ALTER TABLE ONLY "public"."fx_rates"
    ADD CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_seekers"
    ADD CONSTRAINT "job_seekers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."line_users"
    ADD CONSTRAINT "line_users_pkey" PRIMARY KEY ("line_user_id");



ALTER TABLE ONLY "public"."llp_payment_events"
    ADD CONSTRAINT "llp_payment_events_pkey" PRIMARY KEY ("provider", "event_id");



ALTER TABLE ONLY "public"."llp_payments"
    ADD CONSTRAINT "llp_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."llp_payments"
    ADD CONSTRAINT "llp_payments_provider_charge_id_key" UNIQUE ("provider_charge_id");



ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."merchants"
    ADD CONSTRAINT "merchants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_events"
    ADD CONSTRAINT "message_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_sessions"
    ADD CONSTRAINT "message_sessions_pkey" PRIMARY KEY ("line_user_id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_ticket_no_key" UNIQUE ("ticket_no");



ALTER TABLE ONLY "public"."order_events"
    ADD CONSTRAINT "order_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_refunds"
    ADD CONSTRAINT "order_refunds_pkey" PRIMARY KEY ("order_id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pending_menu_items"
    ADD CONSTRAINT "pending_menu_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."places"
    ADD CONSTRAINT "places_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_listings"
    ADD CONSTRAINT "platform_listings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_listings"
    ADD CONSTRAINT "platform_listings_platform_platform_item_id_key" UNIQUE ("platform", "platform_item_id");



ALTER TABLE ONLY "public"."platform_prices"
    ADD CONSTRAINT "platform_prices_pkey" PRIMARY KEY ("listing_id");



ALTER TABLE ONLY "public"."plots"
    ADD CONSTRAINT "plots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_sku_key" UNIQUE ("sku");



ALTER TABLE ONLY "public"."profile_link_attempts"
    ADD CONSTRAINT "profile_link_attempts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profile_link_codes"
    ADD CONSTRAINT "profile_link_codes_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_line_user_id_key" UNIQUE ("line_user_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_broadcast_log"
    ADD CONSTRAINT "push_broadcast_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_endpoint_key" UNIQUE ("endpoint");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ratings"
    ADD CONSTRAINT "ratings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rich_menu_deploy_log"
    ADD CONSTRAINT "rich_menu_deploy_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."search_logs"
    ADD CONSTRAINT "search_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."settlements"
    ADD CONSTRAINT "settlements_order_id_payee_profile_id_key" UNIQUE ("order_id", "payee_profile_id");



ALTER TABLE ONLY "public"."settlements"
    ADD CONSTRAINT "settlements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."staff_line_accounts"
    ADD CONSTRAINT "staff_line_accounts_pkey" PRIMARY KEY ("line_user_id");



ALTER TABLE ONLY "public"."tambon_ai_items"
    ADD CONSTRAINT "tambon_ai_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tambon_ai_items"
    ADD CONSTRAINT "tambon_ai_items_tambon_id_content_key_key" UNIQUE ("tambon_id", "content_key");



ALTER TABLE ONLY "public"."tambon_ai_runs"
    ADD CONSTRAINT "tambon_ai_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tambon_applications"
    ADD CONSTRAINT "tambon_applications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tambon_board_contacts"
    ADD CONSTRAINT "tambon_board_contacts_link_code_key" UNIQUE ("link_code");



ALTER TABLE ONLY "public"."tambon_board_contacts"
    ADD CONSTRAINT "tambon_board_contacts_pkey" PRIMARY KEY ("post_id");



ALTER TABLE ONLY "public"."tambon_board_posts"
    ADD CONSTRAINT "tambon_board_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tambon_job_applications"
    ADD CONSTRAINT "tambon_job_applications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tambon_job_applications"
    ADD CONSTRAINT "tambon_job_applications_post_id_line_user_id_key" UNIQUE ("post_id", "line_user_id");



ALTER TABLE ONLY "public"."tambon_posts"
    ADD CONSTRAINT "tambon_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tambon_profiles"
    ADD CONSTRAINT "tambon_profiles_pkey" PRIMARY KEY ("tambon_id");



ALTER TABLE ONLY "public"."tambons"
    ADD CONSTRAINT "tambons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tourism_location_requests"
    ADD CONSTRAINT "tourism_location_requests_pkey" PRIMARY KEY ("line_user_id");



ALTER TABLE ONLY "public"."web_applications"
    ADD CONSTRAINT "web_applications_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "prompts_one_active" ON "dhamma"."prompts" USING "btree" ("mode") WHERE "active";



CREATE INDEX "turns_user_time" ON "dhamma"."turns" USING "btree" ("line_user_id", "created_at" DESC);



CREATE INDEX "admin_actions_actor_idx" ON "public"."admin_actions" USING "btree" ("actor_id", "created_at" DESC);



CREATE INDEX "admin_actions_target_idx" ON "public"."admin_actions" USING "btree" ("target_id", "created_at" DESC);



CREATE INDEX "admin_scopes_profile_idx" ON "public"."admin_scopes" USING "btree" ("profile_id");



CREATE UNIQUE INDEX "admin_scopes_profile_tambon_uniq" ON "public"."admin_scopes" USING "btree" ("profile_id", "tambon_id") NULLS NOT DISTINCT;



CREATE UNIQUE INDEX "admin_scopes_unique_idx" ON "public"."admin_scopes" USING "btree" ("profile_id", COALESCE("tambon_id", '00000000-0000-0000-0000-000000000000'::"uuid"));



CREATE INDEX "agent_work_events_area" ON "public"."agent_work_events" USING "btree" ("tambon_id", "created_at" DESC);



CREATE INDEX "agent_work_items_area" ON "public"."agent_work_items" USING "btree" ("tambon_id", "status", "updated_at" DESC);



CREATE INDEX "ai_conversations_user_idx" ON "public"."ai_conversations" USING "btree" ("line_user_id", "created_at");



CREATE INDEX "cashbook_scope_owner_date" ON "public"."cashbook_entries" USING "btree" ("scope", "owner_id", "entry_date");



CREATE INDEX "clip_inputs_user_created" ON "public"."clip_inputs" USING "btree" ("line_user_id", "created_at" DESC);



CREATE INDEX "complaint_updates_complaint_idx" ON "public"."complaint_updates" USING "btree" ("complaint_id", "created_at");



CREATE INDEX "complaints_line_user_idx" ON "public"."complaints" USING "btree" ("line_user_id", "created_at" DESC);



CREATE INDEX "customer_chat_turns_created_idx" ON "public"."customer_chat_turns" USING "btree" ("created_at");



CREATE INDEX "customer_chat_turns_user_idx" ON "public"."customer_chat_turns" USING "btree" ("line_user_id", "created_at" DESC);



CREATE INDEX "demand_signals_tambon_kind_idx" ON "public"."demand_signals" USING "btree" ("tambon_id", "kind", "created_at" DESC);



CREATE INDEX "directive_targets_directive_id_state_idx" ON "public"."directive_targets" USING "btree" ("directive_id", "state");



CREATE INDEX "fx_rates_fetched_at" ON "public"."fx_rates" USING "btree" ("fetched_at" DESC);



CREATE INDEX "idx_conversations_conversation_id" ON "public"."conversations" USING "btree" ("conversation_id");



CREATE INDEX "idx_conversations_created_at" ON "public"."conversations" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_conversations_user_id" ON "public"."conversations" USING "btree" ("user_id");



CREATE INDEX "idx_menu_items_merchant" ON "public"."menu_items" USING "btree" ("merchant_id");



CREATE INDEX "idx_merchants_tambon" ON "public"."merchants" USING "btree" ("tambon_id");



CREATE INDEX "idx_orders_customer" ON "public"."orders" USING "btree" ("customer_id");



CREATE INDEX "idx_orders_driver" ON "public"."orders" USING "btree" ("driver_id");



CREATE INDEX "idx_orders_tambon_status" ON "public"."orders" USING "btree" ("tambon_id", "status");



CREATE INDEX "idx_profiles_tambon" ON "public"."profiles" USING "btree" ("tambon_id");



CREATE UNIQUE INDEX "llp_payments_one_pending" ON "public"."llp_payments" USING "btree" ("order_id") WHERE ("status" = 'pending'::"text");



CREATE INDEX "menu_items_visible_idx" ON "public"."menu_items" USING "btree" ("merchant_id") WHERE (NOT "is_hidden");



CREATE INDEX "message_events_message_id_created_at_idx" ON "public"."message_events" USING "btree" ("message_id", "created_at");



CREATE INDEX "messages_from_tambon_id_to_tambon_id_idx" ON "public"."messages" USING "btree" ("from_tambon_id", "to_tambon_id");



CREATE INDEX "messages_status_created_at_idx" ON "public"."messages" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "order_events_order_id_idx" ON "public"."order_events" USING "btree" ("order_id");



CREATE UNIQUE INDEX "orders_payment_ref_idx" ON "public"."orders" USING "btree" ("payment_ref");



CREATE INDEX "orders_plot_id_idx" ON "public"."orders" USING "btree" ("plot_id");



CREATE INDEX "orders_scheduled_date_idx" ON "public"."orders" USING "btree" ("scheduled_date");



CREATE UNIQUE INDEX "places_tambon_cat_name_uq" ON "public"."places" USING "btree" ("tambon_id", "category", "name");



CREATE INDEX "platform_listings_product_idx" ON "public"."platform_listings" USING "btree" ("product_id");



CREATE INDEX "plots_owner_profile_id_idx" ON "public"."plots" USING "btree" ("owner_profile_id");



CREATE INDEX "plots_tambon_id_idx" ON "public"."plots" USING "btree" ("tambon_id");



CREATE INDEX "products_name_trgm" ON "public"."products" USING "gin" ("name" "extensions"."gin_trgm_ops");



CREATE INDEX "profile_link_attempts_user_idx" ON "public"."profile_link_attempts" USING "btree" ("line_user_id", "created_at");



CREATE INDEX "profile_link_codes_profile_idx" ON "public"."profile_link_codes" USING "btree" ("profile_id");



CREATE INDEX "profiles_line_user_id_idx" ON "public"."profiles" USING "btree" ("line_user_id");



CREATE INDEX "profiles_referrer_profile_id_idx" ON "public"."profiles" USING "btree" ("referrer_profile_id");



CREATE INDEX "push_subscriptions_profile_idx" ON "public"."push_subscriptions" USING "btree" ("profile_id");



CREATE INDEX "settlements_open_idx" ON "public"."settlements" USING "btree" ("tambon_id", "paid_out_at", "due_at");



CREATE INDEX "settlements_payee_idx" ON "public"."settlements" USING "btree" ("payee_profile_id", "confirmed_at");



CREATE UNIQUE INDEX "settlements_payout_ref_idx" ON "public"."settlements" USING "btree" ("payout_ref");



CREATE INDEX "tambon_ai_items_show_idx" ON "public"."tambon_ai_items" USING "btree" ("tambon_id", "kind", "refreshed_at" DESC);



CREATE UNIQUE INDEX "tambon_applications_pending_uniq" ON "public"."tambon_applications" USING "btree" ("tambon_name", "district", "province") WHERE ("status" = 'pending'::"text");



CREATE INDEX "tambon_applications_status_idx" ON "public"."tambon_applications" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "tambon_board_posts_show_idx" ON "public"."tambon_board_posts" USING "btree" ("tambon_id", "status", "created_at" DESC);



CREATE INDEX "tambon_job_applications_tambon_idx" ON "public"."tambon_job_applications" USING "btree" ("tambon_id", "created_at" DESC);



CREATE INDEX "tambon_posts_tambon_idx" ON "public"."tambon_posts" USING "btree" ("tambon_id", "pinned" DESC, "created_at" DESC);



CREATE UNIQUE INDEX "tambons_code_key" ON "public"."tambons" USING "btree" ("code") WHERE ("code" IS NOT NULL);



CREATE UNIQUE INDEX "tambons_slug_key" ON "public"."tambons" USING "btree" ("slug");



CREATE OR REPLACE TRIGGER "cashbook_guard" BEFORE UPDATE ON "public"."cashbook_entries" FOR EACH ROW EXECUTE FUNCTION "public"."cashbook_void_guard"();



CREATE OR REPLACE TRIGGER "complaints_fill_tambon" BEFORE INSERT ON "public"."complaints" FOR EACH ROW EXECUTE FUNCTION "public"."complaints_fill_tambon"();



CREATE OR REPLACE TRIGGER "complaints_touch" BEFORE UPDATE ON "public"."complaints" FOR EACH ROW EXECUTE FUNCTION "public"."complaints_touch_updated_at"();



CREATE OR REPLACE TRIGGER "merchants_suspension_guard" BEFORE INSERT OR UPDATE ON "public"."merchants" FOR EACH ROW EXECUTE FUNCTION "public"."merchants_suspension_guard"();



CREATE OR REPLACE TRIGGER "order_events_no_dup_status" BEFORE INSERT ON "public"."order_events" FOR EACH ROW EXECUTE FUNCTION "public"."order_events_no_dup_status"();



CREATE OR REPLACE TRIGGER "orders_block_when_intake_blocked" BEFORE INSERT ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."block_orders_when_intake_blocked"();



CREATE OR REPLACE TRIGGER "orders_check_shop_hours" BEFORE INSERT ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."guard_food_shop_hours"();



CREATE OR REPLACE TRIGGER "orders_driver_settlement" AFTER UPDATE OF "status" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."orders_driver_settlement"();



CREATE OR REPLACE TRIGGER "orders_guard_delete" BEFORE DELETE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."orders_guard_delete"();



CREATE OR REPLACE TRIGGER "orders_guard_payment_fields" BEFORE INSERT OR UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."orders_guard_payment_fields"();



CREATE OR REPLACE TRIGGER "orders_mark_test" BEFORE INSERT ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."orders_mark_test"();



CREATE OR REPLACE TRIGGER "orders_notify_new" AFTER INSERT ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."notify_new_order"();



CREATE OR REPLACE TRIGGER "orders_paid_dispatch" AFTER UPDATE OF "customer_paid_at" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."orders_paid_dispatch"();



CREATE OR REPLACE TRIGGER "orders_push_new" AFTER INSERT ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."push_notify_order"();



CREATE OR REPLACE TRIGGER "orders_push_paid" AFTER UPDATE OF "customer_paid_at" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."push_notify_order"();



CREATE OR REPLACE TRIGGER "profiles_guard_self_privilege" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."profiles_guard_self_privilege"();



CREATE OR REPLACE TRIGGER "profiles_order_flag_guard" BEFORE UPDATE OF "can_order_as_customer" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."profiles_guard_order_flag"();



CREATE OR REPLACE TRIGGER "profiles_partner_role_line_only" BEFORE INSERT OR UPDATE OF "role" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."profiles_partner_role_line_only"();



CREATE OR REPLACE TRIGGER "profiles_protect_partner" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."profiles_protect_partner"();



CREATE OR REPLACE TRIGGER "profiles_resolve_referrer" BEFORE INSERT OR UPDATE OF "referrer_first_name", "referrer_last_name", "referrer_phone", "referrer_profile_id" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."profiles_resolve_referrer"();



CREATE OR REPLACE TRIGGER "profiles_suspension_guard" BEFORE INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."profiles_suspension_guard"();



CREATE OR REPLACE TRIGGER "tambons_central_fields_guard" BEFORE UPDATE ON "public"."tambons" FOR EACH ROW EXECUTE FUNCTION "public"."tambons_central_fields_guard"();



CREATE OR REPLACE TRIGGER "trg_drivers_updated" BEFORE UPDATE ON "public"."drivers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_log_order_status_change" AFTER INSERT OR UPDATE OF "status" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."log_order_status_change"();



CREATE OR REPLACE TRIGGER "trg_merchants_updated" BEFORE UPDATE ON "public"."merchants" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_notify_web_application_insert" AFTER INSERT ON "public"."web_applications" FOR EACH ROW EXECUTE FUNCTION "public"."notify_web_application_insert"();



CREATE OR REPLACE TRIGGER "trg_orders_updated" BEFORE UPDATE ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_profiles_default_approval" BEFORE INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_default_approval"();



CREATE OR REPLACE TRIGGER "trg_profiles_updated" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_tambon_board_posts_updated" BEFORE UPDATE ON "public"."tambon_board_posts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_tambon_posts_updated" BEFORE UPDATE ON "public"."tambon_posts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."admin_actions"
    ADD CONSTRAINT "admin_actions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."admin_actions"
    ADD CONSTRAINT "admin_actions_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."admin_scopes"
    ADD CONSTRAINT "admin_scopes_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."admin_scopes"
    ADD CONSTRAINT "admin_scopes_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_scopes"
    ADD CONSTRAINT "admin_scopes_tambon_id_fkey" FOREIGN KEY ("tambon_id") REFERENCES "public"."tambons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_work_events"
    ADD CONSTRAINT "agent_work_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."agent_work_events"
    ADD CONSTRAINT "agent_work_events_tambon_id_fkey" FOREIGN KEY ("tambon_id") REFERENCES "public"."tambons"("id");



ALTER TABLE ONLY "public"."agent_work_events"
    ADD CONSTRAINT "agent_work_events_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."agent_work_items"("id");



ALTER TABLE ONLY "public"."agent_work_items"
    ADD CONSTRAINT "agent_work_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."agent_work_items"
    ADD CONSTRAINT "agent_work_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");



ALTER TABLE ONLY "public"."agent_work_items"
    ADD CONSTRAINT "agent_work_items_tambon_id_fkey" FOREIGN KEY ("tambon_id") REFERENCES "public"."tambons"("id");



ALTER TABLE ONLY "public"."agent_work_items"
    ADD CONSTRAINT "agent_work_items_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."ai_usage_ledger"
    ADD CONSTRAINT "ai_usage_ledger_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."carts"
    ADD CONSTRAINT "carts_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cashbook_entries"
    ADD CONSTRAINT "cashbook_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."cashbook_entries"
    ADD CONSTRAINT "cashbook_entries_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."cashbook_entries"
    ADD CONSTRAINT "cashbook_entries_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."clip_rules"
    ADD CONSTRAINT "clip_rules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."clip_rules"
    ADD CONSTRAINT "clip_rules_retired_by_fkey" FOREIGN KEY ("retired_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."compare_orders"
    ADD CONSTRAINT "compare_orders_line_user_id_fkey" FOREIGN KEY ("line_user_id") REFERENCES "public"."line_users"("line_user_id");



ALTER TABLE ONLY "public"."compare_orders"
    ADD CONSTRAINT "compare_orders_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id");



ALTER TABLE ONLY "public"."complaint_updates"
    ADD CONSTRAINT "complaint_updates_complaint_id_fkey" FOREIGN KEY ("complaint_id") REFERENCES "public"."complaints"("id");



ALTER TABLE ONLY "public"."complaints"
    ADD CONSTRAINT "complaints_public_title_by_fkey" FOREIGN KEY ("public_title_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."complaints"
    ADD CONSTRAINT "complaints_tambon_id_fkey" FOREIGN KEY ("tambon_id") REFERENCES "public"."tambons"("id");



ALTER TABLE ONLY "public"."demand_signals"
    ADD CONSTRAINT "demand_signals_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."demand_signals"
    ADD CONSTRAINT "demand_signals_tambon_id_fkey" FOREIGN KEY ("tambon_id") REFERENCES "public"."tambons"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."directive_targets"
    ADD CONSTRAINT "directive_targets_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."directive_targets"
    ADD CONSTRAINT "directive_targets_directive_id_fkey" FOREIGN KEY ("directive_id") REFERENCES "public"."directives"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."directive_targets"
    ADD CONSTRAINT "directive_targets_tambon_id_fkey" FOREIGN KEY ("tambon_id") REFERENCES "public"."tambons"("id");



ALTER TABLE ONLY "public"."drivers"
    ADD CONSTRAINT "drivers_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."llp_payments"
    ADD CONSTRAINT "llp_payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id");



ALTER TABLE ONLY "public"."menu_items"
    ADD CONSTRAINT "menu_items_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."merchants"
    ADD CONSTRAINT "merchants_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."merchants"
    ADD CONSTRAINT "merchants_tambon_id_fkey" FOREIGN KEY ("tambon_id") REFERENCES "public"."tambons"("id");



ALTER TABLE ONLY "public"."message_events"
    ADD CONSTRAINT "message_events_actor_profile_id_fkey" FOREIGN KEY ("actor_profile_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."message_events"
    ADD CONSTRAINT "message_events_actor_tambon_id_fkey" FOREIGN KEY ("actor_tambon_id") REFERENCES "public"."tambons"("id");



ALTER TABLE ONLY "public"."message_events"
    ADD CONSTRAINT "message_events_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_from_profile_id_fkey" FOREIGN KEY ("from_profile_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_from_tambon_id_fkey" FOREIGN KEY ("from_tambon_id") REFERENCES "public"."tambons"("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_to_profile_id_fkey" FOREIGN KEY ("to_profile_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_to_tambon_id_fkey" FOREIGN KEY ("to_tambon_id") REFERENCES "public"."tambons"("id");



ALTER TABLE ONLY "public"."order_events"
    ADD CONSTRAINT "order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_items"("id");



ALTER TABLE ONLY "public"."order_items"
    ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_refunds"
    ADD CONSTRAINT "order_refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."order_refunds"
    ADD CONSTRAINT "order_refunds_refunded_by_fkey" FOREIGN KEY ("refunded_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."order_refunds"
    ADD CONSTRAINT "order_refunds_tambon_id_fkey" FOREIGN KEY ("tambon_id") REFERENCES "public"."tambons"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_payment_verified_by_fkey" FOREIGN KEY ("payment_verified_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_plot_id_fkey" FOREIGN KEY ("plot_id") REFERENCES "public"."plots"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_tambon_id_fkey" FOREIGN KEY ("tambon_id") REFERENCES "public"."tambons"("id");



ALTER TABLE ONLY "public"."pending_menu_items"
    ADD CONSTRAINT "pending_menu_items_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."places"
    ADD CONSTRAINT "places_tambon_id_fkey" FOREIGN KEY ("tambon_id") REFERENCES "public"."tambons"("id");



ALTER TABLE ONLY "public"."platform_listings"
    ADD CONSTRAINT "platform_listings_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."platform_prices"
    ADD CONSTRAINT "platform_prices_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "public"."platform_listings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plots"
    ADD CONSTRAINT "plots_owner_profile_id_fkey" FOREIGN KEY ("owner_profile_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."plots"
    ADD CONSTRAINT "plots_tambon_id_fkey" FOREIGN KEY ("tambon_id") REFERENCES "public"."tambons"("id");



ALTER TABLE ONLY "public"."profile_link_codes"
    ADD CONSTRAINT "profile_link_codes_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_referrer_profile_id_fkey" FOREIGN KEY ("referrer_profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_suspended_by_fkey" FOREIGN KEY ("suspended_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_tambon_id_fkey" FOREIGN KEY ("tambon_id") REFERENCES "public"."tambons"("id");



ALTER TABLE ONLY "public"."push_broadcast_log"
    ADD CONSTRAINT "push_broadcast_log_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ratings"
    ADD CONSTRAINT "ratings_from_profile_fkey" FOREIGN KEY ("from_profile") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."ratings"
    ADD CONSTRAINT "ratings_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ratings"
    ADD CONSTRAINT "ratings_to_profile_fkey" FOREIGN KEY ("to_profile") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."search_logs"
    ADD CONSTRAINT "search_logs_line_user_id_fkey" FOREIGN KEY ("line_user_id") REFERENCES "public"."line_users"("line_user_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."settlements"
    ADD CONSTRAINT "settlements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."settlements"
    ADD CONSTRAINT "settlements_payee_profile_id_fkey" FOREIGN KEY ("payee_profile_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."settlements"
    ADD CONSTRAINT "settlements_tambon_id_fkey" FOREIGN KEY ("tambon_id") REFERENCES "public"."tambons"("id");



ALTER TABLE ONLY "public"."tambon_ai_items"
    ADD CONSTRAINT "tambon_ai_items_hidden_by_fkey" FOREIGN KEY ("hidden_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tambon_ai_items"
    ADD CONSTRAINT "tambon_ai_items_tambon_id_fkey" FOREIGN KEY ("tambon_id") REFERENCES "public"."tambons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tambon_ai_runs"
    ADD CONSTRAINT "tambon_ai_runs_tambon_id_fkey" FOREIGN KEY ("tambon_id") REFERENCES "public"."tambons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tambon_applications"
    ADD CONSTRAINT "tambon_applications_applicant_profile_id_fkey" FOREIGN KEY ("applicant_profile_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."tambon_applications"
    ADD CONSTRAINT "tambon_applications_created_tambon_id_fkey" FOREIGN KEY ("created_tambon_id") REFERENCES "public"."tambons"("id");



ALTER TABLE ONLY "public"."tambon_applications"
    ADD CONSTRAINT "tambon_applications_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."tambon_board_contacts"
    ADD CONSTRAINT "tambon_board_contacts_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."tambon_board_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tambon_board_posts"
    ADD CONSTRAINT "tambon_board_posts_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tambon_board_posts"
    ADD CONSTRAINT "tambon_board_posts_tambon_id_fkey" FOREIGN KEY ("tambon_id") REFERENCES "public"."tambons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tambon_job_applications"
    ADD CONSTRAINT "tambon_job_applications_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."tambon_board_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tambon_job_applications"
    ADD CONSTRAINT "tambon_job_applications_tambon_id_fkey" FOREIGN KEY ("tambon_id") REFERENCES "public"."tambons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tambon_posts"
    ADD CONSTRAINT "tambon_posts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tambon_posts"
    ADD CONSTRAINT "tambon_posts_tambon_id_fkey" FOREIGN KEY ("tambon_id") REFERENCES "public"."tambons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tambon_profiles"
    ADD CONSTRAINT "tambon_profiles_tambon_id_fkey" FOREIGN KEY ("tambon_id") REFERENCES "public"."tambons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tambon_profiles"
    ADD CONSTRAINT "tambon_profiles_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."web_applications"
    ADD CONSTRAINT "web_applications_tambon_id_fkey" FOREIGN KEY ("tambon_id") REFERENCES "public"."tambons"("id");



ALTER TABLE "dhamma"."lessons" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "dhamma"."prompts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "dhamma"."settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "dhamma"."turns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "dhamma"."user_prefs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "dhamma"."user_state" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "private"."delivery_command_receipts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Anyone can view places" ON "public"."places" FOR SELECT USING (true);



CREATE POLICY "Enable all access for service_role" ON "public"."conversations" USING (true) WITH CHECK (true);



ALTER TABLE "public"."admin_actions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_actions_select" ON "public"."admin_actions" FOR SELECT TO "authenticated" USING ((("actor_id" = "auth"."uid"()) OR "public"."can_admin_profile"("actor_id")));



ALTER TABLE "public"."admin_scopes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_scopes_select" ON "public"."admin_scopes" FOR SELECT TO "authenticated" USING ((("profile_id" = "auth"."uid"()) OR "public"."has_national_scope"()));



CREATE POLICY "admin_scopes_write" ON "public"."admin_scopes" TO "authenticated" USING ("public"."has_national_scope"()) WITH CHECK ("public"."has_national_scope"());



ALTER TABLE "public"."agent_work_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_work_events_read" ON "public"."agent_work_events" FOR SELECT TO "authenticated" USING ("public"."agent_dashboard_access"("tambon_id"));



ALTER TABLE "public"."agent_work_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "agent_work_items_read" ON "public"."agent_work_items" FOR SELECT TO "authenticated" USING ("public"."agent_dashboard_access"("tambon_id"));



ALTER TABLE "public"."ai_conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_usage_ledger" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "anon read listings" ON "public"."platform_listings" FOR SELECT TO "anon" USING (true);



CREATE POLICY "anon read prices" ON "public"."platform_prices" FOR SELECT TO "anon" USING (true);



CREATE POLICY "anon read products" ON "public"."products" FOR SELECT TO "anon" USING (true);



CREATE POLICY "board_contacts_agent_read" ON "public"."tambon_board_contacts" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tambon_board_posts" "p"
  WHERE (("p"."id" = "tambon_board_contacts"."post_id") AND "public"."can_admin_tambon"("p"."tambon_id")))));



CREATE POLICY "board_posts_agent_read" ON "public"."tambon_board_posts" FOR SELECT TO "authenticated" USING ("public"."can_admin_tambon"("tambon_id"));



CREATE POLICY "board_posts_public_read" ON "public"."tambon_board_posts" FOR SELECT TO "authenticated", "anon" USING ((("status" = 'approved'::"text") AND (("expires_at" IS NULL) OR ("expires_at" > "now"()))));



ALTER TABLE "public"."carts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cashbook_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cashbook_insert" ON "public"."cashbook_entries" FOR INSERT TO "authenticated" WITH CHECK (("public"."cashbook_can_access"("scope", "owner_id") AND ("owner_id" = "auth"."uid"()) AND ("created_by" = "auth"."uid"()) AND ("voided_at" IS NULL) AND ("voided_by" IS NULL) AND ("void_reason" IS NULL)));



CREATE POLICY "cashbook_read" ON "public"."cashbook_entries" FOR SELECT TO "authenticated" USING ("public"."cashbook_can_access"("scope", "owner_id"));



CREATE POLICY "cashbook_void" ON "public"."cashbook_entries" FOR UPDATE TO "authenticated" USING ("public"."cashbook_can_access"("scope", "owner_id")) WITH CHECK ("public"."cashbook_can_access"("scope", "owner_id"));



ALTER TABLE "public"."clip_inputs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clip_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clip_rules_admin_read" ON "public"."clip_rules" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



ALTER TABLE "public"."clip_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."compare_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."complaint_updates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."complaints" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_chat_turns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_memory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."demand_signals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "demand_signals_insert_self" ON "public"."demand_signals" FOR INSERT TO "authenticated" WITH CHECK ((("profile_id" IS NULL) OR ("profile_id" = "auth"."uid"())));



CREATE POLICY "demand_signals_select_admin" ON "public"."demand_signals" FOR SELECT TO "authenticated" USING ("public"."can_admin_tambon"("tambon_id"));



ALTER TABLE "public"."directive_targets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."directives" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."drivers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "drivers_select_scoped" ON "public"."drivers" FOR SELECT TO "authenticated" USING ((("profile_id" = "auth"."uid"()) OR "public"."shares_order_with"("profile_id") OR "public"."can_admin_profile"("profile_id")));



CREATE POLICY "drivers_update_scoped" ON "public"."drivers" FOR UPDATE TO "authenticated" USING ((("profile_id" = "auth"."uid"()) OR "public"."can_admin_profile"("profile_id"))) WITH CHECK ((("profile_id" = "auth"."uid"()) OR "public"."can_admin_profile"("profile_id")));



ALTER TABLE "public"."fx_rates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "job_applications_agent_read" ON "public"."tambon_job_applications" FOR SELECT TO "authenticated" USING ("public"."can_admin_tambon"("tambon_id"));



CREATE POLICY "job_applications_agent_update" ON "public"."tambon_job_applications" FOR UPDATE TO "authenticated" USING ("public"."can_admin_tambon"("tambon_id")) WITH CHECK ("public"."can_admin_tambon"("tambon_id"));



ALTER TABLE "public"."job_seekers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."line_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."llp_payment_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."llp_payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "llp_payments_select" ON "public"."llp_payments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "llp_payments"."order_id") AND (("o"."customer_id" = "auth"."uid"()) OR "public"."can_admin_tambon"("o"."tambon_id"))))));



ALTER TABLE "public"."menu_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "menu_items_select_authenticated" ON "public"."menu_items" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "menu_items_select_public_open" ON "public"."menu_items" FOR SELECT TO "anon" USING (("is_available" AND (NOT COALESCE("is_hidden", false)) AND (EXISTS ( SELECT 1
   FROM "public"."merchants" "m"
  WHERE ("m"."id" = "menu_items"."merchant_id")))));



CREATE POLICY "menu_items_write_scoped" ON "public"."menu_items" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."merchants" "m"
  WHERE (("m"."id" = "menu_items"."merchant_id") AND (("m"."profile_id" = "auth"."uid"()) OR "public"."can_admin_profile"("m"."profile_id")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."merchants" "m"
  WHERE (("m"."id" = "menu_items"."merchant_id") AND (("m"."profile_id" = "auth"."uid"()) OR "public"."can_admin_profile"("m"."profile_id"))))));



ALTER TABLE "public"."merchants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "merchants_select_public_open" ON "public"."merchants" FOR SELECT TO "anon" USING ((NOT "is_test"));



CREATE POLICY "merchants_select_scoped" ON "public"."merchants" FOR SELECT TO "authenticated" USING (((NOT "is_test") OR ("profile_id" = "auth"."uid"()) OR "public"."can_admin_profile"("profile_id") OR ("is_test" AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "x"
  WHERE (("x"."id" = "auth"."uid"()) AND ("x"."is_test" OR "x"."llp_tester")))))));



CREATE POLICY "merchants_update_scoped" ON "public"."merchants" FOR UPDATE TO "authenticated" USING ((("profile_id" = "auth"."uid"()) OR "public"."can_admin_profile"("profile_id"))) WITH CHECK ((("profile_id" = "auth"."uid"()) OR "public"."can_admin_profile"("profile_id")));



ALTER TABLE "public"."message_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."message_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "order_events_select_relevant" ON "public"."order_events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_events"."order_id") AND (("o"."customer_id" = "auth"."uid"()) OR ("o"."driver_id" = "auth"."uid"()) OR "public"."is_admin"() OR (EXISTS ( SELECT 1
           FROM "public"."merchants" "m"
          WHERE (("m"."id" = "o"."merchant_id") AND ("m"."profile_id" = "auth"."uid"())))))))));



ALTER TABLE "public"."order_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "order_items_insert_owner" ON "public"."order_items" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND ("o"."customer_id" = "auth"."uid"())))));



CREATE POLICY "order_items_select_relevant" ON "public"."order_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_items"."order_id") AND (("o"."customer_id" = "auth"."uid"()) OR ("o"."driver_id" = "auth"."uid"()) OR "public"."is_admin"() OR (EXISTS ( SELECT 1
           FROM "public"."merchants" "m"
          WHERE (("m"."id" = "o"."merchant_id") AND ("m"."profile_id" = "auth"."uid"())))))))));



ALTER TABLE "public"."order_refunds" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "orders_insert_self" ON "public"."orders" FOR INSERT TO "authenticated" WITH CHECK (("customer_id" = "auth"."uid"()));



CREATE POLICY "orders_select_scoped" ON "public"."orders" FOR SELECT TO "authenticated" USING ((("customer_id" = "auth"."uid"()) OR ("driver_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."merchants" "m"
  WHERE (("m"."id" = "orders"."merchant_id") AND ("m"."profile_id" = "auth"."uid"())))) OR (("status" = 'pending'::"public"."order_status") AND "public"."is_approved_driver_in"("tambon_id")) OR "public"."can_admin_tambon"("tambon_id")));



CREATE POLICY "orders_update_scoped" ON "public"."orders" FOR UPDATE TO "authenticated" USING ((("customer_id" = "auth"."uid"()) OR ("driver_id" = "auth"."uid"()) OR (("driver_id" IS NULL) AND ("status" = 'pending'::"public"."order_status") AND "public"."is_approved_driver_in"("tambon_id")) OR (EXISTS ( SELECT 1
   FROM "public"."merchants" "m"
  WHERE (("m"."id" = "orders"."merchant_id") AND ("m"."profile_id" = "auth"."uid"())))) OR "public"."can_admin_tambon"("tambon_id")));



ALTER TABLE "public"."pending_menu_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."places" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_listings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_prices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plots" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "plots_insert_self" ON "public"."plots" FOR INSERT TO "authenticated" WITH CHECK (("owner_profile_id" = "auth"."uid"()));



CREATE POLICY "plots_select_scoped" ON "public"."plots" FOR SELECT TO "authenticated" USING ((("owner_profile_id" = "auth"."uid"()) OR "public"."can_admin_tambon"("tambon_id") OR "public"."is_approved_driver_in"("tambon_id")));



CREATE POLICY "plots_update_scoped" ON "public"."plots" FOR UPDATE TO "authenticated" USING ((("owner_profile_id" = "auth"."uid"()) OR "public"."can_admin_tambon"("tambon_id"))) WITH CHECK ((("owner_profile_id" = "auth"."uid"()) OR "public"."can_admin_tambon"("tambon_id")));



ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile_link_attempts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profile_link_codes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert_self" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "profiles_select_scoped" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR "public"."shares_order_with"("id") OR "public"."can_admin_tambon"("tambon_id")));



CREATE POLICY "profiles_update_scoped" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((("id" = "auth"."uid"()) OR "public"."can_admin_tambon"("tambon_id"))) WITH CHECK ((("id" = "auth"."uid"()) OR "public"."can_admin_tambon"("tambon_id")));



ALTER TABLE "public"."push_broadcast_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ratings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ratings_insert_self" ON "public"."ratings" FOR INSERT TO "authenticated" WITH CHECK (("from_profile" = "auth"."uid"()));



CREATE POLICY "ratings_select_participant" ON "public"."ratings" FOR SELECT TO "authenticated" USING ((("from_profile" = "auth"."uid"()) OR ("to_profile" = "auth"."uid"()) OR "public"."is_admin"()));



ALTER TABLE "public"."rich_menu_deploy_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."search_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."settlements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "settlements_select_scoped" ON "public"."settlements" FOR SELECT TO "authenticated" USING ((("payee_profile_id" = "auth"."uid"()) OR "public"."can_admin_tambon"("tambon_id")));



ALTER TABLE "public"."staff_line_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tambon_ai_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tambon_ai_items_agent_hide" ON "public"."tambon_ai_items" FOR UPDATE TO "authenticated" USING ("public"."can_admin_tambon"("tambon_id")) WITH CHECK ("public"."can_admin_tambon"("tambon_id"));



CREATE POLICY "tambon_ai_items_agent_read" ON "public"."tambon_ai_items" FOR SELECT TO "authenticated" USING ("public"."can_admin_tambon"("tambon_id"));



CREATE POLICY "tambon_ai_items_public_read" ON "public"."tambon_ai_items" FOR SELECT TO "authenticated", "anon" USING (((NOT "hidden") AND (("expires_at" IS NULL) OR ("expires_at" > "now"()))));



ALTER TABLE "public"."tambon_ai_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tambon_ai_runs_agent_read" ON "public"."tambon_ai_runs" FOR SELECT TO "authenticated" USING ("public"."can_admin_tambon"("tambon_id"));



ALTER TABLE "public"."tambon_applications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tambon_applications_read" ON "public"."tambon_applications" FOR SELECT TO "authenticated" USING (("public"."is_superadmin"() OR ("applicant_profile_id" = "auth"."uid"())));



CREATE POLICY "tambon_applications_review" ON "public"."tambon_applications" FOR UPDATE TO "authenticated" USING ("public"."is_superadmin"()) WITH CHECK ("public"."is_superadmin"());



CREATE POLICY "tambon_applications_submit" ON "public"."tambon_applications" FOR INSERT TO "authenticated", "anon" WITH CHECK ((("pdpa_consent" = true) AND ("status" = 'pending'::"text") AND ("reviewed_by" IS NULL) AND ("reviewed_at" IS NULL) AND ("created_tambon_id" IS NULL)));



ALTER TABLE "public"."tambon_board_contacts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tambon_board_posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tambon_job_applications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tambon_posts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tambon_posts_agent_all" ON "public"."tambon_posts" TO "authenticated" USING ("public"."can_admin_tambon"("tambon_id")) WITH CHECK ("public"."can_admin_tambon"("tambon_id"));



CREATE POLICY "tambon_posts_public_read" ON "public"."tambon_posts" FOR SELECT TO "authenticated", "anon" USING ("is_published");



ALTER TABLE "public"."tambon_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tambon_profiles_insert" ON "public"."tambon_profiles" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_admin_tambon"("tambon_id"));



CREATE POLICY "tambon_profiles_public_read" ON "public"."tambon_profiles" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "tambon_profiles_write" ON "public"."tambon_profiles" FOR UPDATE TO "authenticated" USING ("public"."can_admin_tambon"("tambon_id")) WITH CHECK ("public"."can_admin_tambon"("tambon_id"));



ALTER TABLE "public"."tambons" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tambons_select_authenticated" ON "public"."tambons" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "tambons_select_public" ON "public"."tambons" FOR SELECT TO "anon" USING (true);



CREATE POLICY "tambons_write_scoped" ON "public"."tambons" TO "authenticated" USING ("public"."can_admin_tambon"("id")) WITH CHECK ("public"."can_admin_tambon"("id"));



ALTER TABLE "public"."tourism_location_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."web_applications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "web_applications_insert_public" ON "public"."web_applications" FOR INSERT TO "authenticated", "anon" WITH CHECK ((("pdpa_consent" = true) AND ("tambon_confirmed" = true)));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."admin_scopes";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."agent_work_events";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."agent_work_items";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."drivers";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."menu_items";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."merchants";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."orders";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."profiles";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."settlements";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."tambons";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";











































































































































































































































































REVOKE ALL ON FUNCTION "private"."d25_sign"("p_domain" "text", "p_body" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."_cart_json"("p_user" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_cart_json"("p_user" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."_dir_state_th"("s" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_dir_state_th"("s" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."_is_service_command"("p_user" "text", "p_text" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_is_service_command"("p_user" "text", "p_text" "text") TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "service_role";



REVOKE ALL ON FUNCTION "public"."_msg_label"("m" "public"."messages") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_msg_label"("m" "public"."messages") TO "service_role";



REVOKE ALL ON FUNCTION "public"."_msg_recipients"("m" "public"."messages") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_msg_recipients"("m" "public"."messages") TO "service_role";



REVOKE ALL ON FUNCTION "public"."_msg_role_th"("r" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_msg_role_th"("r" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."_msg_status_th"("s" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."_msg_status_th"("s" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_assign_order"("p_order_id" bigint, "p_driver_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_assign_order"("p_order_id" bigint, "p_driver_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_assign_order"("p_order_id" bigint, "p_driver_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_cancel_order"("p_order_id" bigint, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_cancel_order"("p_order_id" bigint, "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_cancel_order"("p_order_id" bigint, "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_issue_link_code"("p_profile_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_issue_link_code"("p_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_issue_link_code"("p_profile_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_push_status"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_push_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_push_status"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_review_board_post"("p_id" bigint, "p_action" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_review_board_post"("p_id" bigint, "p_action" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_review_board_post"("p_id" bigint, "p_action" "text", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_send_drill_order"("p_kind" "text", "p_merchant_id" "uuid", "p_tambon_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_send_drill_order"("p_kind" "text", "p_merchant_id" "uuid", "p_tambon_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_send_drill_order"("p_kind" "text", "p_merchant_id" "uuid", "p_tambon_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_send_sound_test"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_send_sound_test"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_send_sound_test"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_set_agent_share"("p_tambon_id" "uuid", "p_commission_pct" numeric, "p_delivery_pct" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_set_agent_share"("p_tambon_id" "uuid", "p_commission_pct" numeric, "p_delivery_pct" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_set_agent_share"("p_tambon_id" "uuid", "p_commission_pct" numeric, "p_delivery_pct" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_set_shop_open"("p_merchant_id" "uuid", "p_open" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_set_shop_open"("p_merchant_id" "uuid", "p_open" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_set_shop_open"("p_merchant_id" "uuid", "p_open" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_set_suspended"("p_profile_id" "uuid", "p_suspend" boolean, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_set_suspended"("p_profile_id" "uuid", "p_suspend" boolean, "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_set_suspended"("p_profile_id" "uuid", "p_suspend" boolean, "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."admin_stats_snapshot"() TO "anon";
GRANT ALL ON FUNCTION "public"."admin_stats_snapshot"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_stats_snapshot"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_tambon_complaints"("p_tambon_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_tambon_complaints"("p_tambon_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_tambon_complaints"("p_tambon_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_update_complaint"("p_id" "uuid", "p_status" "text", "p_note" "text", "p_public_title" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_update_complaint"("p_id" "uuid", "p_status" "text", "p_note" "text", "p_public_title" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_complaint"("p_id" "uuid", "p_status" "text", "p_note" "text", "p_public_title" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."agent_dashboard"("p_tambon_id" "uuid", "p_status" "text", "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."agent_dashboard"("p_tambon_id" "uuid", "p_status" "text", "p_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."agent_dashboard"("p_tambon_id" "uuid", "p_status" "text", "p_offset" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."agent_dashboard_access"("p_tambon_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."agent_dashboard_access"("p_tambon_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."agent_dashboard_access"("p_tambon_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."agent_dashboard_areas"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."agent_dashboard_areas"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."agent_dashboard_areas"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."agent_memory_snapshot"("p_tambon_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."agent_memory_snapshot"("p_tambon_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."agent_memory_snapshot"("p_tambon_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."agent_refund_done"("p_order_id" bigint, "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."agent_refund_done"("p_order_id" bigint, "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."agent_refund_done"("p_order_id" bigint, "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."agent_refunds"("p_tambon_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."agent_refunds"("p_tambon_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."agent_refunds"("p_tambon_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."agent_work_save"("p_tambon_id" "uuid", "p_request_id" "uuid", "p_title" "text", "p_detail" "text", "p_category" "text", "p_due_on" "date", "p_order_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."agent_work_save"("p_tambon_id" "uuid", "p_request_id" "uuid", "p_title" "text", "p_detail" "text", "p_category" "text", "p_due_on" "date", "p_order_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."agent_work_save"("p_tambon_id" "uuid", "p_request_id" "uuid", "p_title" "text", "p_detail" "text", "p_category" "text", "p_due_on" "date", "p_order_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."agent_work_update"("p_task_id" "uuid", "p_request_id" "uuid", "p_version" integer, "p_action" "text", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."agent_work_update"("p_task_id" "uuid", "p_request_id" "uuid", "p_version" integer, "p_action" "text", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."agent_work_update"("p_task_id" "uuid", "p_request_id" "uuid", "p_version" integer, "p_action" "text", "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ai_budget_check"("p_profile" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ai_budget_check"("p_profile" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ai_is_admin_profile"("p_profile" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ai_is_admin_profile"("p_profile" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ai_upsert_tambon_items"("p_tambon_id" "uuid", "p_items" "jsonb", "p_run" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ai_upsert_tambon_items"("p_tambon_id" "uuid", "p_items" "jsonb", "p_run" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ai_usage_record"("p_profile" "uuid", "p_feature" "text", "p_model" "text", "p_cost_usd" numeric, "p_thb_per_usd" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ai_usage_record"("p_profile" "uuid", "p_feature" "text", "p_model" "text", "p_cost_usd" numeric, "p_thb_per_usd" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."approve_tambon_application"("app_id" "uuid", "tambon_slug" "text", "review_note" "text", "p_make_applicant_admin" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."approve_tambon_application"("app_id" "uuid", "tambon_slug" "text", "review_note" "text", "p_make_applicant_admin" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_tambon_application"("app_id" "uuid", "tambon_slug" "text", "review_note" "text", "p_make_applicant_admin" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."approve_tambon_application_line"("app_id" "uuid", "tambon_slug" "text", "caller_line_user_id" "text", "review_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."approve_tambon_application_line"("app_id" "uuid", "tambon_slug" "text", "caller_line_user_id" "text", "review_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."auth_user_id_for_line"("p_line_user_id" "text", "p_alias_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."auth_user_id_for_line"("p_line_user_id" "text", "p_alias_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."backoffice_session_valid"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."backoffice_session_valid"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."backoffice_session_valid"() TO "service_role";



GRANT ALL ON FUNCTION "public"."base36"("p" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."base36"("p" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."base36"("p" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."block_orders_when_intake_blocked"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."block_orders_when_intake_blocked"() TO "service_role";



GRANT ALL ON FUNCTION "public"."calc_delivery_fee"("distance_km" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."calc_delivery_fee"("distance_km" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calc_delivery_fee"("distance_km" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."can_admin_profile"("p" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_admin_profile"("p" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_admin_profile"("p" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."can_admin_tambon"("t" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_admin_tambon"("t" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_admin_tambon"("t" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cashbook_can_access"("p_scope" "text", "p_owner" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cashbook_can_access"("p_scope" "text", "p_owner" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cashbook_can_access"("p_scope" "text", "p_owner" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cashbook_month"("p_scope" "text", "p_month" "date", "p_page" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cashbook_month"("p_scope" "text", "p_month" "date", "p_page" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."cashbook_month"("p_scope" "text", "p_month" "date", "p_page" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."cashbook_record"("p_scope" "text", "p_date" "date", "p_kind" "text", "p_amount" numeric, "p_category" "text", "p_note" "text", "p_request" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cashbook_record"("p_scope" "text", "p_date" "date", "p_kind" "text", "p_amount" numeric, "p_category" "text", "p_note" "text", "p_request" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cashbook_record"("p_scope" "text", "p_date" "date", "p_kind" "text", "p_amount" numeric, "p_category" "text", "p_note" "text", "p_request" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cashbook_void"("p_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cashbook_void"("p_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cashbook_void"("p_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cashbook_void_guard"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cashbook_void_guard"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."central_admin_line_ids"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."central_admin_line_ids"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."clip_rule_add"("p_body" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clip_rule_add"("p_body" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."clip_rule_add"("p_body" "text", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."clip_rule_retire"("p_id" bigint, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clip_rule_retire"("p_id" bigint, "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."clip_rule_retire"("p_id" bigint, "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."clip_rules_active"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clip_rules_active"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."compare_products_search"("p_query" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."compare_products_search"("p_query" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."complaints_fill_tambon"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complaints_fill_tambon"() TO "service_role";



GRANT ALL ON FUNCTION "public"."complaints_touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."complaints_touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."complaints_touch_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."confirm_customer_payment"("p_order_id" bigint, "p_slip_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_customer_payment"("p_order_id" bigint, "p_slip_url" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."confirm_payout_received"("p_settlement_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."confirm_payout_received"("p_settlement_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_payout_received"("p_settlement_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."customer_chat_add"("p_line_user_id" "text", "p_question" "text", "p_answer" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."customer_chat_add"("p_line_user_id" "text", "p_question" "text", "p_answer" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."customer_chat_add"("p_line_user_id" "text", "p_question" "text", "p_answer" "text", "p_memory" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."customer_chat_add"("p_line_user_id" "text", "p_question" "text", "p_answer" "text", "p_memory" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."customer_chat_context"("p_line_user_id" "text", "p_limit" integer, "p_gap_minutes" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."customer_chat_context"("p_line_user_id" "text", "p_limit" integer, "p_gap_minutes" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."customer_food_confirm"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."customer_food_confirm"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."customer_food_confirm"("p_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."customer_food_review"("p_merchant_id" "uuid", "p_items" "jsonb", "p_point" "jsonb", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."customer_food_review"("p_merchant_id" "uuid", "p_items" "jsonb", "p_point" "jsonb", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."customer_food_review"("p_merchant_id" "uuid", "p_items" "jsonb", "p_point" "jsonb", "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delivery_catalog"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delivery_catalog"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."delivery_command_execute"("p_ticket" "text", "p_signature" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delivery_command_execute"("p_ticket" "text", "p_signature" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delivery_command_execute"("p_ticket" "text", "p_signature" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delivery_fee_for"("p_tambon_id" "uuid", "p_distance_km" double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delivery_fee_for"("p_tambon_id" "uuid", "p_distance_km" double precision) TO "service_role";



REVOKE ALL ON FUNCTION "public"."delivery_line_oa"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delivery_line_oa"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."delivery_overview"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delivery_overview"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."delivery_overview_core"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delivery_overview_core"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."dhamma_begin"("p_user" "text", "p_cmd" "text", "p_text" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dhamma_begin"("p_user" "text", "p_cmd" "text", "p_text" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."dhamma_log"("p_user" "text", "p_mode" "text", "p_question" "text", "p_answer" "text", "p_cites" "jsonb", "p_model" "text", "p_prompt_version" integer, "p_latency_ms" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dhamma_log"("p_user" "text", "p_mode" "text", "p_question" "text", "p_answer" "text", "p_cites" "jsonb", "p_model" "text", "p_prompt_version" integer, "p_latency_ms" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."directive_create"("p_kind" "text", "p_title" "text", "p_body" "text", "p_conditions" "text", "p_tambon_ids" "uuid"[], "p_deadline" timestamp with time zone, "p_is_test" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."directive_create"("p_kind" "text", "p_title" "text", "p_body" "text", "p_conditions" "text", "p_tambon_ids" "uuid"[], "p_deadline" timestamp with time zone, "p_is_test" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."directive_flow"("p_user" "text", "p_input" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."directive_flow"("p_user" "text", "p_input" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."dispatch_paid_order"("p_order_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dispatch_paid_order"("p_order_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."estimate_delivery_fee"("p_shop_id" "uuid", "p_lat" double precision, "p_lng" double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."estimate_delivery_fee"("p_shop_id" "uuid", "p_lat" double precision, "p_lng" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."estimate_delivery_fee"("p_shop_id" "uuid", "p_lat" double precision, "p_lng" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."estimate_delivery_fee"("p_shop_id" "uuid", "p_lat" double precision, "p_lng" double precision) TO "service_role";



REVOKE ALL ON FUNCTION "public"."expire_unassigned_orders"("p_minutes" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."expire_unassigned_orders"("p_minutes" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."expire_unassigned_rides"("p_minutes" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."expire_unassigned_rides"("p_minutes" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."expire_unpaid_food_orders"("p_minutes" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."expire_unpaid_food_orders"("p_minutes" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."find_agri_owner"("p_order_lat" double precision, "p_order_lng" double precision, "p_tambon_id" "uuid", "p_vehicle_type" "text", "p_is_test" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."find_agri_owner"("p_order_lat" double precision, "p_order_lng" double precision, "p_tambon_id" "uuid", "p_vehicle_type" "text", "p_is_test" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."find_nearest_driver"("p_order_lat" double precision, "p_order_lng" double precision, "p_tambon_id" "uuid", "p_vehicle_type" "text", "p_is_test" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."find_nearest_driver"("p_order_lat" double precision, "p_order_lng" double precision, "p_tambon_id" "uuid", "p_vehicle_type" "text", "p_is_test" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."food_chat_flow"("p_action" "text", "p_user" "text", "p_arg" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."food_chat_flow"("p_action" "text", "p_user" "text", "p_arg" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."food_chat_quote"("p_user" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."food_chat_quote"("p_user" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."food_flow"("p_action" "text", "p_user" "text", "p_arg" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."food_flow"("p_action" "text", "p_user" "text", "p_arg" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_notify_secret"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_notify_secret"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."guard_food_shop_hours"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guard_food_shop_hours"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_national_scope"() TO "anon";
GRANT ALL ON FUNCTION "public"."has_national_scope"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_national_scope"() TO "service_role";



GRANT ALL ON FUNCTION "public"."haversine_km"("lat1" double precision, "lng1" double precision, "lat2" double precision, "lng2" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."haversine_km"("lat1" double precision, "lng1" double precision, "lat2" double precision, "lng2" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."haversine_km"("lat1" double precision, "lng1" double precision, "lat2" double precision, "lng2" double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_approved_driver_in"("t" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_approved_driver_in"("t" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_approved_driver_in"("t" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_superadmin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_superadmin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_superadmin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_superadmin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_tambon_admin"("t" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_tambon_admin"("t" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_tambon_admin"("t" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_tambon_admin"("t" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."liff_order"("p_user" "text", "p_text" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."liff_order"("p_user" "text", "p_text" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."line_answer_context"("p_line_user_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."line_answer_context"("p_line_user_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."line_driver_job_action"("p_line_user_id" "text", "p_order_id" bigint, "p_action" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."line_driver_job_action"("p_line_user_id" "text", "p_order_id" bigint, "p_action" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."line_driver_set_online"("p_line_user_id" "text", "p_online" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."line_driver_set_online"("p_line_user_id" "text", "p_online" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."line_finance_digest_targets"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."line_finance_digest_targets"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."line_finance_flow"("p_line_user_id" "text", "a" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."line_finance_flow"("p_line_user_id" "text", "a" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."line_finance_tambons"("p_line_user_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."line_finance_tambons"("p_line_user_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."line_job_application_forwarded"("p_application_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."line_job_application_forwarded"("p_application_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."line_job_apply"("p_line_user_id" "text", "p_post_id" bigint, "p_name" "text", "p_phone" "text", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."line_job_apply"("p_line_user_id" "text", "p_post_id" bigint, "p_name" "text", "p_phone" "text", "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."line_link_board_employer"("p_line_user_id" "text", "p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."line_link_board_employer"("p_line_user_id" "text", "p_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."line_link_profile"("p_line_user_id" "text", "p_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."line_link_profile"("p_line_user_id" "text", "p_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."line_menu_context"("p_line_user_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."line_menu_context"("p_line_user_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."line_my_status"("p_line_user_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."line_my_status"("p_line_user_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."line_new_order_notice"("p_order_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."line_new_order_notice"("p_order_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."line_paid_dispatch_messages"("p_order_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."line_paid_dispatch_messages"("p_order_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."line_partner_flow"("p_line_user_id" "text", "p_arg" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."line_partner_flow"("p_line_user_id" "text", "p_arg" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."line_payment_instructions"("p_order_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."line_payment_instructions"("p_order_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."line_places"("p_line_user_id" "text", "p_category" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."line_places"("p_line_user_id" "text", "p_category" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."line_pwa_links"("p_line_user_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."line_pwa_links"("p_line_user_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."line_refund_notice"("p_order_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."line_refund_notice"("p_order_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."line_signup_customer"("p_line_user_id" "text", "p_name" "text", "p_phone" "text", "p_tambon_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."line_signup_customer"("p_line_user_id" "text", "p_name" "text", "p_phone" "text", "p_tambon_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."line_signup_tambon_admins"("p_tambon_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."line_signup_tambon_admins"("p_tambon_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."line_signup_tambons"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."line_signup_tambons"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."line_slip_target"("p_line_user_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."line_slip_target"("p_line_user_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."line_staff_context"("p_line_user_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."line_staff_context"("p_line_user_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."line_staff_level"("p_line_user_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."line_staff_level"("p_line_user_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."line_targets_for_new_order"("p_order_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."line_targets_for_new_order"("p_order_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."line_targets_for_tambon_admin"("p_tambon_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."line_targets_for_tambon_admin"("p_tambon_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."line_verify_payment"("p_line_user_id" "text", "p_order_id" bigint, "p_action" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."line_verify_payment"("p_line_user_id" "text", "p_order_id" bigint, "p_action" "text", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."link_platform_listing"("p_sku" "text", "p_platform" "text", "p_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."link_platform_listing"("p_sku" "text", "p_platform" "text", "p_url" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."llp_payment_succeeded"("p_event_id" "text", "p_charge_id" "text", "p_amount_satang" bigint, "p_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."llp_payment_succeeded"("p_event_id" "text", "p_charge_id" "text", "p_amount_satang" bigint, "p_payload" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_order_status_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_order_status_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."make_ref"("p_prefix" "text", "p_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."make_ref"("p_prefix" "text", "p_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."make_ref"("p_prefix" "text", "p_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_payout_sent"("p_settlement_id" bigint, "p_slip_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_payout_sent"("p_settlement_id" bigint, "p_slip_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_payout_sent"("p_settlement_id" bigint, "p_slip_url" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."merchants_suspension_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."merchants_suspension_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."merchants_suspension_guard"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."message_flow"("p_user" "text", "p_input" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."message_flow"("p_user" "text", "p_input" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."message_sweep"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."message_sweep"() TO "service_role";



GRANT ALL ON FUNCTION "public"."my_tambon_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."my_tambon_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."my_tambon_id"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."next_payout_due"("p_tambon" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."next_payout_due"("p_tambon" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."next_payout_due"("p_tambon" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_new_order"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_new_order"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_web_application_insert"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_web_application_insert"() TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON FUNCTION "public"."order_customer_total"("p_order" "public"."orders") TO "anon";
GRANT ALL ON FUNCTION "public"."order_customer_total"("p_order" "public"."orders") TO "authenticated";
GRANT ALL ON FUNCTION "public"."order_customer_total"("p_order" "public"."orders") TO "service_role";



REVOKE ALL ON FUNCTION "public"."order_events_no_dup_status"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."order_events_no_dup_status"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."orders_driver_settlement"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."orders_driver_settlement"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."orders_guard_delete"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."orders_guard_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."orders_guard_payment_fields"() TO "anon";
GRANT ALL ON FUNCTION "public"."orders_guard_payment_fields"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."orders_guard_payment_fields"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."orders_mark_test"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."orders_mark_test"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."orders_paid_dispatch"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."orders_paid_dispatch"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."partner_order_action"("p_order_id" bigint, "p_action" "text", "p_action_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."partner_order_action"("p_order_id" bigint, "p_action" "text", "p_action_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."partner_order_action"("p_order_id" bigint, "p_action" "text", "p_action_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."partner_order_action_core"("p_actor" "uuid", "p_order_id" bigint, "p_action" "text", "p_action_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."payment_verify_core"("p_order_id" bigint, "p_actor" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."payment_verify_core"("p_order_id" bigint, "p_actor" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."profiles_guard_order_flag"() TO "anon";
GRANT ALL ON FUNCTION "public"."profiles_guard_order_flag"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."profiles_guard_order_flag"() TO "service_role";



GRANT ALL ON FUNCTION "public"."profiles_guard_self_privilege"() TO "anon";
GRANT ALL ON FUNCTION "public"."profiles_guard_self_privilege"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."profiles_guard_self_privilege"() TO "service_role";



GRANT ALL ON FUNCTION "public"."profiles_partner_role_line_only"() TO "anon";
GRANT ALL ON FUNCTION "public"."profiles_partner_role_line_only"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."profiles_partner_role_line_only"() TO "service_role";



GRANT ALL ON FUNCTION "public"."profiles_protect_partner"() TO "anon";
GRANT ALL ON FUNCTION "public"."profiles_protect_partner"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."profiles_protect_partner"() TO "service_role";



GRANT ALL ON FUNCTION "public"."profiles_resolve_referrer"() TO "anon";
GRANT ALL ON FUNCTION "public"."profiles_resolve_referrer"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."profiles_resolve_referrer"() TO "service_role";



GRANT ALL ON FUNCTION "public"."profiles_suspension_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."profiles_suspension_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."profiles_suspension_guard"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."purge_customer_chat"("p_days" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."purge_customer_chat"("p_days" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."purge_stale_carts"("p_days" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."purge_stale_carts"("p_days" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."push_broadcast_targets"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."push_broadcast_targets"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."push_delete_subscriptions"("p_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."push_delete_subscriptions"("p_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."push_get_keys"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."push_get_keys"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."push_notify_order"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."push_notify_order"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."push_public_key"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."push_public_key"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."push_public_key"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."push_remove_app_token"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."push_remove_app_token"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."push_remove_app_token"("p_token" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."push_remove_subscription"("p_endpoint" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."push_remove_subscription"("p_endpoint" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."push_remove_subscription"("p_endpoint" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."push_save_app_token"("p_token" "text", "p_kind" "text", "p_user_agent" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."push_save_app_token"("p_token" "text", "p_kind" "text", "p_user_agent" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."push_save_app_token"("p_token" "text", "p_kind" "text", "p_user_agent" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."push_save_subscription"("p_endpoint" "text", "p_p256dh" "text", "p_auth" "text", "p_kind" "text", "p_user_agent" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."push_save_subscription"("p_endpoint" "text", "p_p256dh" "text", "p_auth" "text", "p_kind" "text", "p_user_agent" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."push_save_subscription"("p_endpoint" "text", "p_p256dh" "text", "p_auth" "text", "p_kind" "text", "p_user_agent" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."push_set_keys"("p_public" "text", "p_private" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."push_set_keys"("p_public" "text", "p_private" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."push_targets"("p_order_id" bigint, "p_event" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."push_targets"("p_order_id" bigint, "p_event" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."recalc_profile_rating"("p_profile_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recalc_profile_rating"("p_profile_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalc_profile_rating"("p_profile_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_intake_block"("p_tambon" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_intake_block"("p_tambon" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_intake_block"("p_tambon" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."register_line_customer"("p_name" "text", "p_phone" "text", "p_tambon_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."register_line_customer"("p_name" "text", "p_phone" "text", "p_tambon_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."register_line_customer"("p_name" "text", "p_phone" "text", "p_tambon_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reject_customer_payment"("p_order_id" bigint, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reject_customer_payment"("p_order_id" bigint, "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reject_customer_payment"("p_order_id" bigint, "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_referrer_profile"("p_self" "uuid", "p_self_phone" "text", "p_phone" "text", "p_first" "text", "p_last" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_referrer_profile"("p_self" "uuid", "p_self_phone" "text", "p_phone" "text", "p_first" "text", "p_last" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_referrer_profile"("p_self" "uuid", "p_self_phone" "text", "p_phone" "text", "p_first" "text", "p_last" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."search_menu"("p_query" "text", "p_tambon" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."search_menu"("p_query" "text", "p_tambon" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."search_menu"("p_query" "text", "p_tambon" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_menu"("p_query" "text", "p_tambon" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."session_used_password"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."session_used_password"() TO "anon";
GRANT ALL ON FUNCTION "public"."session_used_password"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."session_used_password"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_default_approval"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_default_approval"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_default_approval"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."shares_order_with"("p" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."shares_order_with"("p" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."shares_order_with"("p" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."shop_has_pin"("p_merchant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."shop_has_pin"("p_merchant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."shop_has_pin"("p_merchant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."shop_has_pin"("p_merchant_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."shop_is_open"("p_merchant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."shop_is_open"("p_merchant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."shop_is_open"("p_merchant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."shop_is_open"("p_merchant_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."shop_open_at"("manually_open" boolean, "enabled" boolean, "h" "jsonb", "at_time" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."shop_open_at"("manually_open" boolean, "enabled" boolean, "h" "jsonb", "at_time" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."shop_open_at"("manually_open" boolean, "enabled" boolean, "h" "jsonb", "at_time" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."shop_open_at"("manually_open" boolean, "enabled" boolean, "h" "jsonb", "at_time" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."slip_order_id"("p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."slip_order_id"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."slip_order_id"("p_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."staff_tambon_detail"("p_tambon_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."staff_tambon_detail"("p_tambon_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_board_post"("p_tambon_slug" "text", "p_post" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_board_post"("p_tambon_slug" "text", "p_post" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."submit_board_post"("p_tambon_slug" "text", "p_post" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_board_post"("p_tambon_slug" "text", "p_post" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_payment_slip"("p_order_id" bigint, "p_slip_path" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_payment_slip"("p_order_id" bigint, "p_slip_path" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_payment_slip"("p_order_id" bigint, "p_slip_path" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_line_direct_from_menu"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_line_direct_from_menu"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."tambon_admin_grant"("p_profile_id" "uuid", "p_tambon_id" "uuid", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tambon_admin_grant"("p_profile_id" "uuid", "p_tambon_id" "uuid", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."tambon_admin_grant"("p_profile_id" "uuid", "p_tambon_id" "uuid", "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."tambon_admin_revoke"("p_profile_id" "uuid", "p_tambon_id" "uuid", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tambon_admin_revoke"("p_profile_id" "uuid", "p_tambon_id" "uuid", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."tambon_admin_revoke"("p_profile_id" "uuid", "p_tambon_id" "uuid", "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."tambon_complaint_stats"("p_tambon_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tambon_complaint_stats"("p_tambon_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."tambon_complaint_stats"("p_tambon_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."tambon_complaint_stats"("p_tambon_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."tambon_daily_stats"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tambon_daily_stats"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."tambon_float"("p_tambon" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tambon_float"("p_tambon" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."tambon_float"("p_tambon" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."tambons_central_fields_guard"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tambons_central_fields_guard"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."valid_shop_hours"("h" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."valid_shop_hours"("h" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."valid_shop_hours"("h" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."vehicle_availability"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."vehicle_availability"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."vehicle_availability"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."verify_customer_payment"("p_order_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_customer_payment"("p_order_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_customer_payment"("p_order_id" bigint) TO "service_role";
























GRANT ALL ON TABLE "public"."admin_actions" TO "anon";
GRANT ALL ON TABLE "public"."admin_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_actions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."admin_actions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."admin_actions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."admin_actions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."admin_scopes" TO "anon";
GRANT ALL ON TABLE "public"."admin_scopes" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_scopes" TO "service_role";



GRANT ALL ON TABLE "public"."agent_work_events" TO "service_role";
GRANT SELECT ON TABLE "public"."agent_work_events" TO "authenticated";



GRANT ALL ON TABLE "public"."agent_work_items" TO "service_role";
GRANT SELECT ON TABLE "public"."agent_work_items" TO "authenticated";



GRANT ALL ON TABLE "public"."ai_conversations" TO "anon";
GRANT ALL ON TABLE "public"."ai_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_conversations" TO "service_role";



GRANT ALL ON TABLE "public"."ai_usage_ledger" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ai_usage_ledger_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ai_usage_ledger_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ai_usage_ledger_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."carts" TO "service_role";



GRANT ALL ON TABLE "public"."cashbook_entries" TO "service_role";
GRANT SELECT ON TABLE "public"."cashbook_entries" TO "authenticated";



GRANT INSERT("scope") ON TABLE "public"."cashbook_entries" TO "authenticated";



GRANT INSERT("owner_id") ON TABLE "public"."cashbook_entries" TO "authenticated";



GRANT INSERT("entry_date") ON TABLE "public"."cashbook_entries" TO "authenticated";



GRANT INSERT("kind") ON TABLE "public"."cashbook_entries" TO "authenticated";



GRANT INSERT("amount") ON TABLE "public"."cashbook_entries" TO "authenticated";



GRANT INSERT("category") ON TABLE "public"."cashbook_entries" TO "authenticated";



GRANT INSERT("note") ON TABLE "public"."cashbook_entries" TO "authenticated";



GRANT INSERT("request_id") ON TABLE "public"."cashbook_entries" TO "authenticated";



GRANT UPDATE("voided_at") ON TABLE "public"."cashbook_entries" TO "authenticated";



GRANT UPDATE("void_reason") ON TABLE "public"."cashbook_entries" TO "authenticated";



GRANT ALL ON TABLE "public"."clip_inputs" TO "anon";
GRANT ALL ON TABLE "public"."clip_inputs" TO "authenticated";
GRANT ALL ON TABLE "public"."clip_inputs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."clip_inputs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."clip_inputs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."clip_inputs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."clip_rules" TO "service_role";
GRANT SELECT ON TABLE "public"."clip_rules" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."clip_rules_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."clip_rules_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."clip_rules_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."clip_sessions" TO "anon";
GRANT ALL ON TABLE "public"."clip_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."clip_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."compare_orders" TO "anon";
GRANT ALL ON TABLE "public"."compare_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."compare_orders" TO "service_role";



GRANT ALL ON TABLE "public"."complaint_updates" TO "service_role";



GRANT ALL ON TABLE "public"."complaints" TO "service_role";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."conversations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."conversations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."conversations_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."customer_chat_turns" TO "service_role";



GRANT ALL ON SEQUENCE "public"."customer_chat_turns_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."customer_chat_turns_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."customer_chat_turns_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."customer_memory" TO "service_role";



GRANT ALL ON TABLE "public"."demand_signals" TO "anon";
GRANT ALL ON TABLE "public"."demand_signals" TO "authenticated";
GRANT ALL ON TABLE "public"."demand_signals" TO "service_role";



GRANT ALL ON SEQUENCE "public"."demand_signals_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."demand_signals_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."demand_signals_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."directive_targets" TO "service_role";



GRANT ALL ON TABLE "public"."directives" TO "service_role";



GRANT ALL ON SEQUENCE "public"."directives_ticket_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."directives_ticket_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."directives_ticket_seq" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."ratings" TO "anon";
GRANT ALL ON TABLE "public"."ratings" TO "authenticated";
GRANT ALL ON TABLE "public"."ratings" TO "service_role";



GRANT ALL ON TABLE "public"."driver_rankings" TO "anon";
GRANT ALL ON TABLE "public"."driver_rankings" TO "authenticated";
GRANT ALL ON TABLE "public"."driver_rankings" TO "service_role";



GRANT ALL ON TABLE "public"."drivers" TO "anon";
GRANT ALL ON TABLE "public"."drivers" TO "authenticated";
GRANT ALL ON TABLE "public"."drivers" TO "service_role";



GRANT ALL ON TABLE "public"."fx_rates" TO "anon";
GRANT ALL ON TABLE "public"."fx_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."fx_rates" TO "service_role";



GRANT ALL ON SEQUENCE "public"."fx_rates_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."fx_rates_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."fx_rates_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."job_seekers" TO "anon";
GRANT ALL ON TABLE "public"."job_seekers" TO "authenticated";
GRANT ALL ON TABLE "public"."job_seekers" TO "service_role";



GRANT ALL ON TABLE "public"."line_oa_daily" TO "service_role";



GRANT ALL ON TABLE "public"."line_users" TO "anon";
GRANT ALL ON TABLE "public"."line_users" TO "authenticated";
GRANT ALL ON TABLE "public"."line_users" TO "service_role";



GRANT ALL ON TABLE "public"."llp_payment_events" TO "anon";
GRANT ALL ON TABLE "public"."llp_payment_events" TO "authenticated";
GRANT ALL ON TABLE "public"."llp_payment_events" TO "service_role";



GRANT ALL ON TABLE "public"."llp_payments" TO "anon";
GRANT ALL ON TABLE "public"."llp_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."llp_payments" TO "service_role";



GRANT ALL ON TABLE "public"."menu_items" TO "anon";
GRANT ALL ON TABLE "public"."menu_items" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_items" TO "service_role";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."merchants" TO "anon";
GRANT ALL ON TABLE "public"."merchants" TO "authenticated";
GRANT ALL ON TABLE "public"."merchants" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."merchants" TO "anon";



GRANT SELECT("tambon_id") ON TABLE "public"."merchants" TO "anon";



GRANT SELECT("name") ON TABLE "public"."merchants" TO "anon";



GRANT SELECT("category") ON TABLE "public"."merchants" TO "anon";



GRANT SELECT("is_open") ON TABLE "public"."merchants" TO "anon";



GRANT ALL ON TABLE "public"."merchant_rankings" TO "anon";
GRANT ALL ON TABLE "public"."merchant_rankings" TO "authenticated";
GRANT ALL ON TABLE "public"."merchant_rankings" TO "service_role";



GRANT ALL ON TABLE "public"."message_events" TO "service_role";



GRANT ALL ON TABLE "public"."message_overview" TO "service_role";



GRANT ALL ON TABLE "public"."message_sessions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."messages_ticket_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."messages_ticket_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."messages_ticket_seq" TO "service_role";



GRANT ALL ON TABLE "public"."order_events" TO "anon";
GRANT ALL ON TABLE "public"."order_events" TO "authenticated";
GRANT ALL ON TABLE "public"."order_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."order_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."order_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."order_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."order_items" TO "anon";
GRANT ALL ON TABLE "public"."order_items" TO "authenticated";
GRANT ALL ON TABLE "public"."order_items" TO "service_role";



GRANT ALL ON TABLE "public"."order_refunds" TO "service_role";



GRANT ALL ON SEQUENCE "public"."orders_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."orders_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."orders_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."pending_menu_items" TO "anon";
GRANT ALL ON TABLE "public"."pending_menu_items" TO "authenticated";
GRANT ALL ON TABLE "public"."pending_menu_items" TO "service_role";



GRANT ALL ON TABLE "public"."places" TO "anon";
GRANT ALL ON TABLE "public"."places" TO "authenticated";
GRANT ALL ON TABLE "public"."places" TO "service_role";



GRANT ALL ON TABLE "public"."platform_listings" TO "anon";
GRANT ALL ON TABLE "public"."platform_listings" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_listings" TO "service_role";



GRANT ALL ON TABLE "public"."platform_prices" TO "anon";
GRANT ALL ON TABLE "public"."platform_prices" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_prices" TO "service_role";



GRANT ALL ON TABLE "public"."plots" TO "anon";
GRANT ALL ON TABLE "public"."plots" TO "authenticated";
GRANT ALL ON TABLE "public"."plots" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."profile_link_attempts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."profile_link_attempts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."profile_link_attempts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."profile_link_attempts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."profile_link_codes" TO "service_role";



GRANT ALL ON TABLE "public"."push_broadcast_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."push_broadcast_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."push_broadcast_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."push_broadcast_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."rich_menu_deploy_log" TO "anon";
GRANT ALL ON TABLE "public"."rich_menu_deploy_log" TO "authenticated";
GRANT ALL ON TABLE "public"."rich_menu_deploy_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."rich_menu_deploy_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."rich_menu_deploy_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."rich_menu_deploy_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."search_logs" TO "anon";
GRANT ALL ON TABLE "public"."search_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."search_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."search_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."search_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."search_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."settlements" TO "anon";
GRANT ALL ON TABLE "public"."settlements" TO "authenticated";
GRANT ALL ON TABLE "public"."settlements" TO "service_role";



GRANT ALL ON SEQUENCE "public"."settlements_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."settlements_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."settlements_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."staff_line_accounts" TO "anon";
GRANT ALL ON TABLE "public"."staff_line_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."staff_line_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."tambon_ai_items" TO "service_role";
GRANT SELECT ON TABLE "public"."tambon_ai_items" TO "anon";
GRANT SELECT ON TABLE "public"."tambon_ai_items" TO "authenticated";



GRANT UPDATE("hidden") ON TABLE "public"."tambon_ai_items" TO "authenticated";



GRANT UPDATE("hidden_by") ON TABLE "public"."tambon_ai_items" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."tambon_ai_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tambon_ai_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tambon_ai_items_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."tambon_ai_runs" TO "service_role";
GRANT SELECT ON TABLE "public"."tambon_ai_runs" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."tambon_ai_runs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tambon_ai_runs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tambon_ai_runs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."tambon_applications" TO "service_role";
GRANT INSERT ON TABLE "public"."tambon_applications" TO "anon";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."tambon_applications" TO "authenticated";



GRANT ALL ON TABLE "public"."tambon_board_contacts" TO "service_role";
GRANT SELECT ON TABLE "public"."tambon_board_contacts" TO "authenticated";



GRANT ALL ON TABLE "public"."tambon_board_posts" TO "service_role";
GRANT SELECT ON TABLE "public"."tambon_board_posts" TO "anon";
GRANT SELECT ON TABLE "public"."tambon_board_posts" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."tambon_board_posts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tambon_board_posts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tambon_board_posts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."tambon_job_applications" TO "service_role";
GRANT SELECT ON TABLE "public"."tambon_job_applications" TO "authenticated";



GRANT UPDATE("status") ON TABLE "public"."tambon_job_applications" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."tambon_job_applications_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tambon_job_applications_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tambon_job_applications_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."tambon_posts" TO "anon";
GRANT ALL ON TABLE "public"."tambon_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."tambon_posts" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tambon_posts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tambon_posts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tambon_posts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."tambon_profiles" TO "service_role";
GRANT SELECT ON TABLE "public"."tambon_profiles" TO "anon";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."tambon_profiles" TO "authenticated";



GRANT INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."tambons" TO "anon";
GRANT ALL ON TABLE "public"."tambons" TO "authenticated";
GRANT ALL ON TABLE "public"."tambons" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."tambons" TO "anon";



GRANT SELECT("name") ON TABLE "public"."tambons" TO "anon";



GRANT SELECT("district") ON TABLE "public"."tambons" TO "anon";



GRANT SELECT("province") ON TABLE "public"."tambons" TO "anon";



GRANT SELECT("slug") ON TABLE "public"."tambons" TO "anon";



GRANT SELECT("intro") ON TABLE "public"."tambons" TO "anon";
GRANT SELECT("intro") ON TABLE "public"."tambons" TO "authenticated";



GRANT SELECT("announcement") ON TABLE "public"."tambons" TO "anon";
GRANT SELECT("announcement") ON TABLE "public"."tambons" TO "authenticated";



GRANT SELECT("cover_url") ON TABLE "public"."tambons" TO "anon";
GRANT SELECT("cover_url") ON TABLE "public"."tambons" TO "authenticated";



GRANT SELECT("contact_line") ON TABLE "public"."tambons" TO "anon";
GRANT SELECT("contact_line") ON TABLE "public"."tambons" TO "authenticated";



GRANT SELECT("contact_phone") ON TABLE "public"."tambons" TO "anon";
GRANT SELECT("contact_phone") ON TABLE "public"."tambons" TO "authenticated";



GRANT SELECT("delivery_fee_base") ON TABLE "public"."tambons" TO "anon";
GRANT SELECT("delivery_fee_base") ON TABLE "public"."tambons" TO "authenticated";



GRANT SELECT("delivery_fee_per_km") ON TABLE "public"."tambons" TO "anon";
GRANT SELECT("delivery_fee_per_km") ON TABLE "public"."tambons" TO "authenticated";



GRANT SELECT("is_active") ON TABLE "public"."tambons" TO "anon";
GRANT SELECT("is_active") ON TABLE "public"."tambons" TO "authenticated";



GRANT SELECT("opened_at") ON TABLE "public"."tambons" TO "anon";
GRANT SELECT("opened_at") ON TABLE "public"."tambons" TO "authenticated";



GRANT ALL ON TABLE "public"."tourism_location_requests" TO "anon";
GRANT ALL ON TABLE "public"."tourism_location_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."tourism_location_requests" TO "service_role";



GRANT ALL ON TABLE "public"."web_applications" TO "anon";
GRANT ALL ON TABLE "public"."web_applications" TO "authenticated";
GRANT ALL ON TABLE "public"."web_applications" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
































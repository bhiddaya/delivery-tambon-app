-- 20261004d_tambon_board.sql — ระดับ E (ตารางใหม่ สิทธิ์โพสต์สาธารณะ ข้อมูลติดต่อ) · D52
--
-- เว็บตำบลเป็นศูนย์ประสานงาน — อาจารย์อนุมัติ 4 ต.ค. 69:
--   1. ใครก็ลงประกาศได้ผ่านฟอร์ม แล้วตัวแทนตำบลอนุมัติก่อนขึ้นหน้า
--   2. คนหางานสมัครผ่าน LINE แล้วระบบส่งต่อให้นายจ้าง (ไม่เปิดเบอร์นายจ้างบนเว็บ)
--   3. ปากเสียงตำบล: แสดงตัวเลขสถิติเรื่องร้องเรียน + หัวเรื่องที่แก้แล้ว (เฉพาะที่ตัวแทนอนุมัติหัวเรื่อง)
--   4. ลงประกาศฟรี
--
-- โครงสร้าง:
--   - tambon_board_posts: ประกาศรับสมัครงาน (job) และประกาศจากหน่วยงานรัฐ/เอกชน/ชุมชน (announcement)
--     คนทั่วไปเห็นเฉพาะที่อนุมัติแล้วและยังไม่หมดอายุ (30 วันนับจากวันอนุมัติ)
--   - tambon_board_contacts: ข้อมูลติดต่อผู้ลงประกาศ แยกตารางเพื่อไม่ให้หลุดผ่านสิทธิ์อ่านสาธารณะ
--     เห็นเฉพาะตัวแทนของตำบลนั้น · link_code ใช้ผูก LINE นายจ้างเพื่อรับใบสมัคร
--   - tambon_job_applications: ใบสมัครงานที่มาจาก LINE (service_role เขียน) ตัวแทนเห็นและอัปเดตสถานะได้
--   - complaints: เพิ่ม public_title (หัวเรื่องที่ตัวแทนเกลาแล้ว ไม่มีข้อมูลระบุตัวผู้แจ้ง)
--     + ฟังก์ชันให้ตัวแทนดู/อัปเดตเรื่องร้องเรียนของตำบล (เดิมเข้าถึงได้เฉพาะ n8n)
--
-- แผนกู้: drop ฟังก์ชันและตาราง tambon_board_* / tambon_job_applications ได้โดยไม่กระทบข้อมูลเดิม
--   complaints.public_title_* เป็นคอลัมน์ใหม่ล้วน drop ได้
-- ไม่ใช้ drop ... if exists (MCP ค้างเมื่อได้ NOTICE) · รันซ้ำได้

-- ── ประกาศ ────────────────────────────────────────────────────────────
create table if not exists public.tambon_board_posts (
  id bigint generated always as identity primary key,
  tambon_id uuid not null references public.tambons(id) on delete cascade,
  kind text not null check (kind in ('job', 'announcement')),
  org_name text not null check (char_length(btrim(org_name)) between 2 and 120),
  org_type text not null default 'other' check (org_type in ('government', 'private', 'community', 'other')),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  body text not null default '' check (char_length(body) <= 2000),
  link_url text check (link_url is null or (link_url ~* '^https?://' and char_length(link_url) <= 500)),
  job_positions integer check (job_positions is null or job_positions between 1 and 999),
  job_wage text check (job_wage is null or char_length(job_wage) <= 120),
  job_location text check (job_location is null or char_length(job_location) <= 200),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'closed')),
  reject_reason text check (reject_reason is null or char_length(reject_reason) <= 300),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tambon_board_posts_show_idx on public.tambon_board_posts (tambon_id, status, created_at desc);

create table if not exists public.tambon_board_contacts (
  post_id bigint primary key references public.tambon_board_posts(id) on delete cascade,
  contact_name text not null check (char_length(btrim(contact_name)) between 2 and 120),
  contact_phone text check (contact_phone is null or contact_phone ~ '^[0-9+ -]{9,20}$'),
  contact_email text check (contact_email is null or (contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(contact_email) <= 200)),
  link_code text not null unique,
  employer_line_user_id text,
  linked_at timestamptz,
  check (contact_phone is not null or contact_email is not null)
);

create table if not exists public.tambon_job_applications (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.tambon_board_posts(id) on delete cascade,
  tambon_id uuid not null references public.tambons(id) on delete cascade,
  line_user_id text not null,
  applicant_name text not null check (char_length(btrim(applicant_name)) between 2 and 120),
  applicant_phone text not null check (applicant_phone ~ '^[0-9+ -]{9,20}$'),
  note text not null default '' check (char_length(note) <= 500),
  status text not null default 'new' check (status in ('new', 'forwarded', 'contacted', 'closed')),
  forwarded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (post_id, line_user_id)
);

create index if not exists tambon_job_applications_tambon_idx on public.tambon_job_applications (tambon_id, created_at desc);

alter table public.tambon_board_posts enable row level security;
alter table public.tambon_board_contacts enable row level security;
alter table public.tambon_job_applications enable row level security;

do $$
begin
  if exists (select 1 from pg_policies where schemaname='public' and tablename='tambon_board_posts' and policyname='board_posts_public_read') then
    drop policy board_posts_public_read on public.tambon_board_posts;
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='tambon_board_posts' and policyname='board_posts_agent_read') then
    drop policy board_posts_agent_read on public.tambon_board_posts;
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='tambon_board_contacts' and policyname='board_contacts_agent_read') then
    drop policy board_contacts_agent_read on public.tambon_board_contacts;
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='tambon_job_applications' and policyname='job_applications_agent_read') then
    drop policy job_applications_agent_read on public.tambon_job_applications;
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='tambon_job_applications' and policyname='job_applications_agent_update') then
    drop policy job_applications_agent_update on public.tambon_job_applications;
  end if;
  if exists (select 1 from pg_trigger where tgname='trg_tambon_board_posts_updated' and tgrelid='public.tambon_board_posts'::regclass) then
    drop trigger trg_tambon_board_posts_updated on public.tambon_board_posts;
  end if;
end $$;

create policy board_posts_public_read on public.tambon_board_posts
  for select to anon, authenticated
  using (status = 'approved' and (expires_at is null or expires_at > now()));

create policy board_posts_agent_read on public.tambon_board_posts
  for select to authenticated
  using (public.can_admin_tambon(tambon_id));

create policy board_contacts_agent_read on public.tambon_board_contacts
  for select to authenticated
  using (exists (select 1 from public.tambon_board_posts p where p.id = post_id and public.can_admin_tambon(p.tambon_id)));

create policy job_applications_agent_read on public.tambon_job_applications
  for select to authenticated
  using (public.can_admin_tambon(tambon_id));

create policy job_applications_agent_update on public.tambon_job_applications
  for update to authenticated
  using (public.can_admin_tambon(tambon_id))
  with check (public.can_admin_tambon(tambon_id));

create trigger trg_tambon_board_posts_updated
  before update on public.tambon_board_posts
  for each row execute function public.set_updated_at();

-- เขียนประกาศผ่านฟังก์ชันเท่านั้น (ตรวจข้อมูล จำกัดจำนวน) · ใบสมัครเขียนผ่าน n8n (service_role)
revoke all on public.tambon_board_posts, public.tambon_board_contacts, public.tambon_job_applications from anon, authenticated;
grant select on public.tambon_board_posts to anon, authenticated;
grant select on public.tambon_board_contacts to authenticated;
grant select on public.tambon_job_applications to authenticated;
grant update (status) on public.tambon_job_applications to authenticated;

comment on table public.tambon_board_posts is 'ประกาศรับสมัครงาน/ประกาศจากหน่วยงานบนหน้าตำบล ใครก็ส่งได้ ตัวแทนอนุมัติก่อนขึ้น (D52)';
comment on table public.tambon_board_contacts is 'ข้อมูลติดต่อผู้ลงประกาศ เห็นเฉพาะตัวแทนตำบล · link_code ผูก LINE นายจ้าง (D52)';
comment on table public.tambon_job_applications is 'ใบสมัครงานจาก LINE ส่งต่อให้นายจ้าง (D52)';

-- ส่งประกาศจากฟอร์มสาธารณะ (ไม่ต้องล็อกอิน)
create or replace function public.submit_board_post(p_tambon_slug text, p_post jsonb)
returns jsonb
language plpgsql security definer set search_path = 'public', 'pg_temp'
as $$
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
$$;

revoke all on function public.submit_board_post(text, jsonb) from public;
grant execute on function public.submit_board_post(text, jsonb) to anon, authenticated;

-- ตัวแทนอนุมัติ / ไม่อนุมัติ / ปิดประกาศ
create or replace function public.admin_review_board_post(p_id bigint, p_action text, p_reason text default null)
returns void
language plpgsql security definer set search_path = 'public', 'pg_temp'
as $$
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

revoke all on function public.admin_review_board_post(bigint, text, text) from public, anon;
grant execute on function public.admin_review_board_post(bigint, text, text) to authenticated;

-- n8n: นายจ้างส่ง "ยืนยันนายจ้าง <รหัส>" ใน LINE เพื่อรับใบสมัครทาง LINE
create or replace function public.line_link_board_employer(p_line_user_id text, p_code text)
returns jsonb
language plpgsql security definer set search_path = 'public', 'pg_temp'
as $$
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

-- n8n: คนหางานสมัครผ่าน LINE → บันทึก แล้วคืนผู้รับที่ต้องส่งต่อ (นายจ้างที่ผูก LINE แล้ว + ตัวแทนตำบล)
create or replace function public.line_job_apply(p_line_user_id text, p_post_id bigint, p_name text, p_phone text, p_note text default '')
returns jsonb
language plpgsql security definer set search_path = 'public', 'pg_temp'
as $$
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

create or replace function public.line_job_application_forwarded(p_application_id bigint)
returns void
language plpgsql security definer set search_path = 'public', 'pg_temp'
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'ไม่มีสิทธิ์'; end if;
  update public.tambon_job_applications set status = 'forwarded', forwarded_at = now()
   where id = p_application_id and status = 'new';
end;
$$;

revoke all on function public.line_link_board_employer(text, text) from public, anon, authenticated;
revoke all on function public.line_job_apply(text, bigint, text, text, text) from public, anon, authenticated;
revoke all on function public.line_job_application_forwarded(bigint) from public, anon, authenticated;
grant execute on function public.line_link_board_employer(text, text) to service_role;
grant execute on function public.line_job_apply(text, bigint, text, text, text) to service_role;
grant execute on function public.line_job_application_forwarded(bigint) to service_role;

-- ── ปากเสียงตำบล: เรื่องร้องเรียน ──────────────────────────────────────
alter table public.complaints
  add column if not exists public_title text check (public_title is null or char_length(btrim(public_title)) between 3 and 120),
  add column if not exists public_title_by uuid references public.profiles(id) on delete set null,
  add column if not exists public_title_at timestamptz;

comment on column public.complaints.public_title is 'หัวเรื่องที่ตัวแทนเกลาแล้วให้แสดงบนหน้าตำบล (เฉพาะเรื่องที่แก้แล้ว ไม่มีข้อมูลระบุตัวผู้แจ้ง)';

-- สถิติสาธารณะ: ไม่นับเรื่องทดสอบและเรื่องที่ไม่รับ · หัวเรื่องเฉพาะที่ตัวแทนอนุมัติ
create or replace function public.tambon_complaint_stats(p_tambon_id uuid)
returns jsonb
language sql stable security definer set search_path = 'public', 'pg_temp'
as $$
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

revoke all on function public.tambon_complaint_stats(uuid) from public;
grant execute on function public.tambon_complaint_stats(uuid) to anon, authenticated;

-- ตัวแทนดูเรื่องร้องเรียนของตำบล · ตัวตนผู้แจ้งแสดงเฉพาะเมื่อผู้แจ้งยินยอม (disclose_identity)
create or replace function public.admin_tambon_complaints(p_tambon_id uuid)
returns table (
  id uuid, ticket_no text, subject text, place text, detail text, category text, urgency text,
  ai_summary text, suggested_agency text, status text, public_title text, reporter_name text, reporter_phone text,
  is_test boolean, created_at timestamptz, updated_at timestamptz
)
language plpgsql stable security definer set search_path = 'public', 'pg_temp'
as $$
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

-- ตัวแทนอัปเดตสถานะ + หมายเหตุ (ผู้แจ้งเห็นได้) + หัวเรื่องสาธารณะ (เฉพาะเรื่องที่แก้แล้ว)
create or replace function public.admin_update_complaint(p_id uuid, p_status text, p_note text default null, p_public_title text default null)
returns void
language plpgsql security definer set search_path = 'public', 'pg_temp'
as $$
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

revoke all on function public.admin_tambon_complaints(uuid) from public, anon;
revoke all on function public.admin_update_complaint(uuid, text, text, text) from public, anon;
grant execute on function public.admin_tambon_complaints(uuid) to authenticated;
grant execute on function public.admin_update_complaint(uuid, text, text, text) to authenticated;
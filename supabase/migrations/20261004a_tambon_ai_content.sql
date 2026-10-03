-- 20261004a_tambon_ai_content.sql — ระดับ E (ตารางและฟังก์ชันใหม่) · D51
--
-- ข้อมูลสาธารณะของตำบลที่ AI รวบรวมจากเว็บทุกวัน — อาจารย์อนุมัติ 3 ต.ค. 2569
-- "อนุมัติ AI ทำข้อมูลตำบล ทดลอง 1 ตำบลก่อน คือ ตำบลคลองกุ่ม"
--
-- หลัก: AI ทำร่าง ตัวแทนมีสิทธิ์เหนือกว่า · ทุกรายการต้องมีแหล่งที่มา (ลิงก์) และวันที่ · ไม่มีข้อมูลส่วนบุคคล
--   - tambon_ai_items: รายการที่ AI หาได้ (ข่าว กิจกรรม สถานที่ สินค้า ประเพณี ข้อเท็จจริง)
--     แยกจากข้อมูลที่ตัวแทนกรอก (tambons / tambon_profiles / tambon_posts) จึงไม่เขียนทับกัน
--     คนทั่วไปเห็นเฉพาะที่ไม่ถูกซ่อนและยังไม่หมดอายุ · ตัวแทนซ่อน/แสดงได้
--   - tambon_ai_runs: บันทึกการรันแต่ละครั้ง (โมเดล token ค่าใช้จ่าย จำนวนรายการ) ไว้วัดผลช่วงทดลอง
--   - tambons.ai_content_enabled: สวิตช์เปิดต่อตำบล ส่วนกลางเท่านั้น (ขยาย tambons_central_fields_guard)
--   - ai_upsert_tambon_items: n8n (service_role) ส่งรายการเข้า กันซ้ำด้วย content_key
--
-- เปิดเฉพาะคลองกุ่ม (slug khalong-kum) ตามที่อนุมัติ
-- แผนกู้: update tambons set ai_content_enabled = false; drop ตาราง/ฟังก์ชันใหม่ได้โดยไม่กระทบข้อมูลเดิม
-- ไม่ใช้ drop ... if exists (MCP ค้างเมื่อได้ NOTICE) · รันซ้ำได้

alter table public.tambons
  add column if not exists ai_content_enabled boolean not null default false;

comment on column public.tambons.ai_content_enabled is 'ให้ AI รวบรวมข้อมูลสาธารณะของตำบลจากเว็บทุกวัน (D51) — ส่วนกลางเปิด/ปิด';

create or replace function public.tambons_central_fields_guard()
returns trigger
language plpgsql set search_path to 'public', 'pg_temp'
as $function$
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
end $function$;

create table if not exists public.tambon_ai_items (
  id bigint generated always as identity primary key,
  tambon_id uuid not null references public.tambons(id) on delete cascade,
  kind text not null check (kind in ('news', 'event', 'place', 'product', 'tradition', 'fact')),
  title text not null check (char_length(btrim(title)) between 3 and 160),
  summary text not null default '' check (char_length(summary) <= 800),
  source_url text not null check (source_url ~* '^https?://' and char_length(source_url) <= 500),
  source_name text check (source_name is null or char_length(source_name) <= 120),
  event_date date,
  content_key text not null,
  hidden boolean not null default false,
  hidden_by uuid references public.profiles(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  refreshed_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (tambon_id, content_key)
);

create index if not exists tambon_ai_items_show_idx on public.tambon_ai_items (tambon_id, kind, refreshed_at desc);

create table if not exists public.tambon_ai_runs (
  id bigint generated always as identity primary key,
  tambon_id uuid not null references public.tambons(id) on delete cascade,
  ran_at timestamptz not null default now(),
  model text,
  input_tokens integer,
  output_tokens integer,
  cost_usd numeric(10, 6),
  items_received integer not null default 0,
  items_added integer not null default 0,
  items_refreshed integer not null default 0,
  items_rejected integer not null default 0,
  status text not null default 'ok' check (status in ('ok', 'error')),
  error text check (error is null or char_length(error) <= 1000),
  n8n_execution_id text
);

alter table public.tambon_ai_items enable row level security;
alter table public.tambon_ai_runs enable row level security;

do $$
begin
  if exists (select 1 from pg_policies where schemaname='public' and tablename='tambon_ai_items' and policyname='tambon_ai_items_public_read') then
    drop policy tambon_ai_items_public_read on public.tambon_ai_items;
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='tambon_ai_items' and policyname='tambon_ai_items_agent_read') then
    drop policy tambon_ai_items_agent_read on public.tambon_ai_items;
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='tambon_ai_items' and policyname='tambon_ai_items_agent_hide') then
    drop policy tambon_ai_items_agent_hide on public.tambon_ai_items;
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='tambon_ai_runs' and policyname='tambon_ai_runs_agent_read') then
    drop policy tambon_ai_runs_agent_read on public.tambon_ai_runs;
  end if;
end $$;

create policy tambon_ai_items_public_read on public.tambon_ai_items
  for select to anon, authenticated
  using (not hidden and (expires_at is null or expires_at > now()));

create policy tambon_ai_items_agent_read on public.tambon_ai_items
  for select to authenticated
  using (public.can_admin_tambon(tambon_id));

-- ตัวแทนแก้ได้แค่ซ่อน/แสดง (คอลัมน์อื่นกันด้วย GRANT ระดับคอลัมน์)
create policy tambon_ai_items_agent_hide on public.tambon_ai_items
  for update to authenticated
  using (public.can_admin_tambon(tambon_id))
  with check (public.can_admin_tambon(tambon_id));

create policy tambon_ai_runs_agent_read on public.tambon_ai_runs
  for select to authenticated
  using (public.can_admin_tambon(tambon_id));

revoke all on public.tambon_ai_items from anon, authenticated;
grant select on public.tambon_ai_items to anon, authenticated;
grant update (hidden, hidden_by) on public.tambon_ai_items to authenticated;
revoke all on public.tambon_ai_runs from anon, authenticated;
grant select on public.tambon_ai_runs to authenticated;

comment on table public.tambon_ai_items is 'ข้อมูลสาธารณะของตำบลที่ AI รวบรวมจากเว็บ (D51) ต้องมีลิงก์แหล่งที่มา · ตัวแทนซ่อนได้';
comment on table public.tambon_ai_runs is 'บันทึกการรัน AI รวบรวมข้อมูลตำบล: token ค่าใช้จ่าย จำนวนรายการ (D51)';

-- n8n ส่งผลการรันหนึ่งครั้ง: รายการ + สถิติ → บันทึกและคืนจำนวนที่เพิ่ม/อัปเดต
create or replace function public.ai_upsert_tambon_items(p_tambon_id uuid, p_items jsonb, p_run jsonb)
returns jsonb
language plpgsql security definer set search_path = 'public', 'pg_temp'
as $$
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
    exit when v_received > 60;
    v_kind := it->>'kind';
    v_title := btrim(coalesce(it->>'title', ''));
    v_url := btrim(coalesce(it->>'source_url', ''));
    if v_kind not in ('news', 'event', 'place', 'product', 'tradition', 'fact')
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
$$;

revoke all on function public.ai_upsert_tambon_items(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.ai_upsert_tambon_items(uuid, jsonb, jsonb) to service_role;

-- ทดลองเฉพาะคลองกุ่ม
update public.tambons set ai_content_enabled = true where slug = 'khalong-kum';
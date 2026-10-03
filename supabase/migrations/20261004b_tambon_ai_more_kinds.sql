-- 20261004b_tambon_ai_more_kinds.sql — ระดับ E (ขยายประเภทข้อมูล AI) · D51
--
-- อาจารย์สั่ง 3 ต.ค. 69 ปรับการค้นหา: การศึกษา (โรงเรียน มหาวิทยาลัย หน่วยงานการศึกษา),
-- โรงงาน/ผู้ผลิตสำคัญ, แหล่งท่องเที่ยว (เชื่อม Google Maps), ร้านค้า/ร้านอาหารเด่น, กิจกรรมในพื้นที่
--   - เพิ่ม kind: education, industry, food (place = สถานที่สำคัญ/แหล่งท่องเที่ยว เหมือนเดิม)
--   - ลิงก์ Google Maps สร้างจากชื่อ + ตำบลที่หน้าเว็บ ไม่ต้องเก็บในฐาน ไม่ใช้ API key
-- แผนกู้: คืน check constraint เดิม (ต้องซ่อน/ลบแถว kind ใหม่ก่อน) และฟังก์ชันจาก 20261004a
-- ไม่ใช้ drop ... if exists (MCP ค้างเมื่อได้ NOTICE) · รันซ้ำได้

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'tambon_ai_items_kind_check'
              and conrelid = 'public.tambon_ai_items'::regclass) then
    alter table public.tambon_ai_items drop constraint tambon_ai_items_kind_check;
  end if;
end $$;

alter table public.tambon_ai_items add constraint tambon_ai_items_kind_check
  check (kind in ('news', 'event', 'place', 'product', 'tradition', 'fact', 'education', 'industry', 'food'));

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
    exit when v_received > 80;
    v_kind := it->>'kind';
    v_title := btrim(coalesce(it->>'title', ''));
    v_url := btrim(coalesce(it->>'source_url', ''));
    if v_kind not in ('news', 'event', 'place', 'product', 'tradition', 'fact', 'education', 'industry', 'food')
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
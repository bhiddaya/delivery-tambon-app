-- การเงินตำบลใน LINE แยกบัญชีทีละตำบล (อาจารย์ 12 ต.ค. 2569: ตัวแทนดูแลหลายตำบล ห้ามรวมยอด)
-- * หน้าการเงินแสดงตำบลเดียว: tambon_id ที่ส่งมา → ตำบลของโปรไฟล์ → ตำบลแรกในสิทธิ์ · มีรายชื่อตำบลอื่นให้สลับ
-- * โอนแล้ว ปิดยอดเฉพาะตำบลที่เลือก
-- * สรุป 20:30 ส่งแยกข้อความต่อ (ตัวแทน, ตำบล)
create or replace function public.line_finance_flow(p_line_user_id text, a jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
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
revoke all on function public.line_finance_flow(text, jsonb) from public, anon, authenticated;

-- สรุปประจำวัน: หนึ่งแถวต่อ (ตัวแทน, ตำบลที่มียอดค้างโอน)
drop function public.line_finance_digest_targets();
create function public.line_finance_digest_targets()
returns table(line_user_id text, tambon_id uuid) language sql stable security definer set search_path = public, pg_temp as $$
  with due as (select distinct s.tambon_id from public.settlements s where s.paid_out_at is null)
  select x.line_user_id, due.tambon_id from due cross join lateral public.line_targets_for_tambon_admin(due.tambon_id) x
  union
  select unnest(public.central_admin_line_ids()), due.tambon_id from due
   where not exists (select 1 from public.line_targets_for_tambon_admin(due.tambon_id));
$$;
revoke all on function public.line_finance_digest_targets() from public, anon, authenticated;
grant execute on function public.line_finance_digest_targets() to service_role;

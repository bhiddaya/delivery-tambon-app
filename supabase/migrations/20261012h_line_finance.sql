-- การเงินตำบลใน LINE OA (อาจารย์อนุมัติ 12 ต.ค. 2569): ตัวแทนไม่ต้องเปิด /finance
-- * สลิปลูกค้า: ยังเด้งทันทีจาก D41 (ปุ่ม pay=ok / pay=no → line_verify_payment) และแสดงซ้ำในหน้า การเงินตำบล
-- * โอนให้ร้านค้า/ไรเดอร์: การ์ดต่อผู้รับ + QR พร้อมเพย์ใส่ยอด → 💸 โอนแล้ว → ยืนยันอีกครั้ง → paid_out_at
-- * สรุปวันละครั้งก่อน 21.00 น.: n8n เรียก line_finance_digest_targets() แล้ว push หน้า การเงินตำบล
-- สิทธิ์ตามเดียวกับการแจ้งสลิป: LINE ของตัวแทนตำบล (line_targets_for_tambon_admin) หรือผู้ดูแลกลาง

create or replace function public.line_finance_tambons(p_line_user_id text)
returns uuid[] language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(t.id), '{}') from public.tambons t
   where p_line_user_id = any (public.central_admin_line_ids())
      or exists (select 1 from public.line_targets_for_tambon_admin(t.id) x where x.line_user_id = p_line_user_id);
$$;

create or replace function public.line_finance_flow(p_line_user_id text, a jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  scope uuid[] := public.line_finance_tambons(p_line_user_id);
  slips jsonb; payees jsonb; target uuid; upto bigint; payee record; actor uuid;
  v_total numeric; v_count int; v_tambons uuid[]; t uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'ไม่มีสิทธิ์' using errcode = '42501'; end if;
  if cardinality(scope) = 0 then return jsonb_build_object('ok', false, 'error', 'not_staff'); end if;

  if a->>'action' in ('payout_prompt', 'payout_sent') then
    -- upto = รหัสรายการล่าสุดที่ตัวแทนเห็นตอนกด ยอดที่เกิดใหม่ระหว่างนั้นไม่ถูกปิดไปด้วย
    begin target := (a->>'payee_id')::uuid; upto := (a->>'upto')::bigint;
    exception when others then return jsonb_build_object('ok', false, 'error', 'bad_action'); end;
    select p.full_name, p.role::text as role, sum(s.amount) as amount, count(*)::int as n into payee
      from public.settlements s join public.profiles p on p.id = s.payee_profile_id
     where s.payee_profile_id = target and s.paid_out_at is null and s.id <= upto and s.tambon_id = any (scope)
     group by p.id;
    if payee.n is null then
      return jsonb_build_object('ok', true, 'view', 'partner_result', 'text', 'รายการนี้บันทึกโอนแล้ว ไม่มียอดค้าง');
    end if;
    if a->>'action' = 'payout_prompt' then
      return jsonb_build_object('ok', true, 'view', 'finance_payout_confirm', 'payee_id', target, 'upto', upto,
        'name', payee.full_name, 'role', payee.role, 'amount', payee.amount, 'count', payee.n);
    end if;

    with u as (
      update public.settlements set paid_out_at = now()
       where payee_profile_id = target and paid_out_at is null and id <= upto and tambon_id = any (scope)
      returning tambon_id, amount)
    select coalesce(sum(amount), 0), count(*), array_agg(distinct tambon_id) into v_total, v_count, v_tambons from u;
    foreach t in array coalesce(v_tambons, '{}') loop perform public.refresh_intake_block(t); end loop;
    select id into actor from public.profiles where line_user_id = p_line_user_id;
    insert into public.admin_actions (actor_id, target_id, action, note)
    values (coalesce(actor, target), target, 'settlement.paid_out_line',
            'บันทึกโอน ' || v_count || ' รายการ ' || v_total || ' บาท ให้ ' || coalesce(payee.full_name, '-') || ' ผ่าน LINE');
    return jsonb_build_object('ok', true, 'view', 'partner_result',
      'text', 'บันทึกโอน ' || to_char(v_total, 'FM999,999,990.##') || ' บาท ให้ ' || coalesce(payee.full_name, '-') || ' แล้ว'
              || E'\nผู้รับจะเห็นปุ่ม ตรวจพบเงินเข้าแล้ว ในงานของตัวเอง');
  end if;

  select coalesce(jsonb_agg(x order by x.slip_at), '[]') into slips from (
    select o.id as order_id, public.order_customer_total(o) as total, tb.name as tambon, o.slip_submitted_at as slip_at
      from public.orders o join public.tambons tb on tb.id = o.tambon_id
     where o.tambon_id = any (scope) and not o.is_test and o.status <> 'cancelled'
       and o.slip_submitted_at is not null and o.customer_paid_at is null and o.payment_rejected_at is null
     order by o.slip_submitted_at limit 5) x;

  select coalesce(jsonb_agg(x order by x.due_at), '[]') into payees from (
    select p.id as payee_id, p.full_name as name, p.role::text as role, p.promptpay_id, p.payment_bank_name as bank,
           sum(s.amount) as amount, count(*) as n, max(s.id) as upto, min(s.due_at) as due_at,
           string_agg('#' || s.order_id, ' ' order by s.order_id) as orders
      from public.settlements s join public.profiles p on p.id = s.payee_profile_id
     where s.paid_out_at is null and s.tambon_id = any (scope)
     group by p.id order by min(s.due_at) limit 8) x;

  return jsonb_build_object('ok', true, 'view', 'finance', 'title', 'การเงินตำบล', 'slips', slips, 'payees', payees);
end $$;

-- ผู้รับสรุปประจำวัน: ตัวแทนของตำบลที่มียอดค้างโอน · ตำบลที่ไม่มีตัวแทนผูก LINE ส่งให้ผู้ดูแลกลาง
create or replace function public.line_finance_digest_targets()
returns table(line_user_id text) language sql stable security definer set search_path = public, pg_temp as $$
  with due as (select distinct tambon_id from public.settlements where paid_out_at is null)
  select x.line_user_id from due cross join lateral public.line_targets_for_tambon_admin(due.tambon_id) x
  union
  select unnest(public.central_admin_line_ids()) from due
   where not exists (select 1 from public.line_targets_for_tambon_admin(due.tambon_id));
$$;

revoke all on function public.line_finance_tambons(text) from public, anon, authenticated;
revoke all on function public.line_finance_flow(text, jsonb) from public, anon, authenticated;
revoke all on function public.line_finance_digest_targets() from public, anon, authenticated;
grant execute on function public.line_finance_digest_targets() to service_role;

-- line_partner_flow: การเงินตำบล → หน้าการเงินใน LINE แทนลิงก์ PWA
do $$
declare def text := pg_get_functiondef('public.line_partner_flow(text,text)'::regprocedure);
  old1 text := $o$if a->>'action'='finance' then
    if not coalesce((public.line_staff_context(p_line_user_id)->>'is_staff')::boolean,false) then return jsonb_build_object('ok',false,'error','not_staff'); end if;
    return jsonb_build_object('ok',true,'view','partner','title','การเงินตำบล','links',jsonb_build_object('เปิด PWA การเงิน',base||'/finance'));$o$;
  new1 text := $n$if a->>'action' in ('finance','payout_prompt','payout_sent') then
    return public.line_finance_flow(p_line_user_id,a);$n$;
  old2 text := $o$return jsonb_build_object('ok',true,'view','partner','title','การเงินตำบล','text','ตรวจเงินจริงก่อนยืนยันรับเงิน แล้วโอนต่อให้ร้านค้าและไรเดอร์ตามรอบ','links',jsonb_build_object('เปิด PWA การเงิน',base||'/finance'));$o$;
  new2 text := 'return public.line_finance_flow(p_line_user_id,a);';
begin
  if position(old1 in def) = 0 then raise exception 'line_partner_flow: finance branch not found'; end if;
  if position(old2 in def) = 0 then raise exception 'line_partner_flow: staff branch not found'; end if;
  execute replace(replace(def, old1, new1), old2, new2);
end $$;

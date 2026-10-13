-- แก้ 20261013c: orders.payment_ref เป็น generated column (make_ref('BT', id)) เขียนไม่ได้ → ทุก webhook จ่ายสำเร็จล้ม (เจอ 13 ต.ค. ออเดอร์ทดสอบ #170)
-- เลขอ้างอิง Opn อยู่ที่ llp_payments.provider_charge_id แล้ว
create or replace function public.llp_payment_succeeded(p_event_id text, p_charge_id text, p_amount_satang bigint, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
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
      -- จ่ายหลังระบบยกเลิกครบ 15 นาที → เงินเข้าแล้วแต่ไม่มีออเดอร์ ส่วนกลางต้องคืนเงิน
      res := jsonb_build_object('ok', false, 'error', 'order_cancelled', 'needs_refund', true, 'order_id', o.id);
    else
      update public.orders set slip_submitted_at = coalesce(slip_submitted_at, now()),
        payment_method = 'llp_opn' where id = o.id;
      perform public.payment_verify_core(o.id, null);
      res := jsonb_build_object('ok', true, 'newly_paid', true, 'order_id', o.id,
        'customer_line_user_id', (select line_user_id from public.profiles where id = o.customer_id),
        'merchant_line_user_id', (select p.line_user_id from public.merchants m join public.profiles p on p.id = m.profile_id where m.id = o.merchant_id));
    end if;
  end if;
  update public.llp_payment_events set result = res where provider = 'opn' and event_id = p_event_id;
  return res;
end $$;

revoke all on function public.llp_payment_succeeded(text, text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.llp_payment_succeeded(text, text, bigint, jsonb) to service_role;


-- LLP (docs/60): จ่ายผ่าน Opn (Omise) PromptPay ยืนยันอัตโนมัติ — ตารางใหม่ทั้งหมด ไม่แก้ตาราง/ฟังก์ชันของ LP
-- จุดเชื่อมเดียว: llp_payment_succeeded เรียก payment_verify_core เดิม (สร้าง settlements + ขั้นร้าน/ไรเดอร์ต่อแบบ LP)

create table public.llp_payments (
  id uuid primary key default gen_random_uuid(),
  order_id bigint not null references public.orders(id),
  provider text not null default 'opn',
  provider_charge_id text not null unique,
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending','paid','failed','expired','refunded')),
  qr_image text,
  expires_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
-- ออเดอร์หนึ่งมี QR รอจ่ายได้ทีละอันเดียว (กดซ้ำ/เปิดหน้าซ้ำ ได้ QR เดิม)
create unique index llp_payments_one_pending on public.llp_payments(order_id) where status = 'pending';

create table public.llp_payment_events (
  provider text not null,
  event_id text not null,
  payload jsonb not null,
  result jsonb,
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);

alter table public.llp_payments enable row level security;
alter table public.llp_payment_events enable row level security;
-- ลูกค้าเห็นการจ่ายของออเดอร์ตัวเอง · ตัวแทน/ส่วนกลางเห็นในตำบลที่ดูแล · เขียนได้เฉพาะ service_role (Edge Function / n8n)
create policy llp_payments_select on public.llp_payments for select to authenticated using (
  exists (select 1 from public.orders o where o.id = order_id and (o.customer_id = auth.uid() or public.can_admin_tambon(o.tambon_id)))
);

-- n8n "LLP — Payment Webhook" เรียกหลังดึง charge จาก Opn แล้วเห็น status = successful
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
        payment_ref = p_charge_id, payment_method = 'llp_opn' where id = o.id;
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

-- ย้อนกลับ: drop function public.llp_payment_succeeded(text,text,bigint,jsonb); drop table public.llp_payment_events; drop table public.llp_payments;

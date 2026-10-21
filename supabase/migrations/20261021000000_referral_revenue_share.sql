-- 20261021000000_referral_revenue_share.sql — ระดับ F (เงิน) · ยังไม่ติดตั้ง รอเจ้าของอนุมัติ
--
-- ระบบผู้แนะนำ ตามกติกาส่วนแบ่งรายได้ (เจ้าของตัดสิน 21 ต.ค. 2569, docs/referral-revenue-share.md)
--   ฐาน = ค่า GP ของออเดอร์ = ค่าสินค้า × อัตรา GP ของตำบล (ตัวแทนเสนอ ส่วนกลางตั้ง)
--   หักค่าใช้จ่าย % ของค่า GP: admin, ระบบ/เซิร์ฟเวอร์, ส่วนแบ่งตัวแทน (tambons.agent_share_commission_pct เดิม),
--     ค่าโอน/ภาษี, สำรองและพัฒนา → ค่า GP สุทธิ
--   แบ่ง 30% ผู้แนะนำผู้ขาย · 40% ผู้แนะนำผู้ซื้อ · ที่เหลือ (รวมส่วนที่ไม่มีผู้แนะนำ) สนับสนุน บวร
--   สิทธิ์ 12 เดือนนับจากวันที่ผู้ถูกแนะนำได้รับอนุมัติ · สรุปรายเดือน · จ่ายเมื่อสะสม ≥ 100 บาท
--
-- ⚠️ ระบบนี้ "คำนวณและแสดงยอด" เท่านั้น ไม่โอนเงิน ไม่ส่ง LINE และไม่แก้ settlements
--   (ตอนนี้ร้านยังได้ค่าสินค้าเต็ม 100% ระบบยังไม่ได้เก็บค่า GP จริง — ต้องตัดสินใจแยก)
--
-- ตาราง (เปิด RLS ไม่มี policy = อ่าน/เขียนตรงไม่ได้ ใช้ผ่านฟังก์ชันเท่านั้น):
--   referrers             รหัสแนะนำของสมาชิก LINE บวรไทย 1 คน 1 รหัส
--   referral_claims       คนที่เปิดลิงก์แนะนำ (ผูกด้วย LINE userId) ผู้แนะนำคนแรกเท่านั้น เปลี่ยนไม่ได้
--   referral_tambon_rates อัตรา GP และค่าใช้จ่ายรายตำบล + วันเริ่มคำนวณ (ไม่มีแถว = ตำบลนั้นยังไม่คำนวณ)
--   referral_months       เดือนที่ปิดยอดแล้ว
--   referral_earnings     ส่วนแบ่งรายออเดอร์ของเดือนที่ปิดแล้ว (ตรวจย้อนได้)
--   referral_payouts      ยอดที่ถึงเกณฑ์จ่าย (≥ 100 บาท) — paid_at ว่าง = ยังไม่จ่าย
--
-- ฟังก์ชัน:
--   ผู้ใช้ LINE: referral_claim(code), referral_me()
--   ส่วนกลาง:   referral_set_rates(...), referral_close_month(month), referral_ban(profile, reason)
--   ส่วนกลาง/ตัวแทน (ตำบลที่ดูแล): referral_month_report(month)
--   ภายใน:      referral_month_rows(month) (ไม่ให้ใครเรียกตรง)
--
-- แผนกู้: drop ฟังก์ชันและตาราง referral_* / referrers ทั้งหมด และ trigger profiles_referral_start
--   ไม่มีตารางเดิมถูกแก้ข้อมูล (เพิ่มแค่ trigger บน profiles ที่เขียนเฉพาะ referral_claims)
-- IDEMPOTENT: create ... if not exists / create or replace รันซ้ำได้

-- ── ตาราง ─────────────────────────────────────────────────────────────
create table if not exists public.referrers (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  created_at timestamptz not null default now(),
  banned_at timestamptz,
  banned_reason text,
  banned_by uuid
);

create table if not exists public.referral_claims (
  line_user_id text primary key check (line_user_id ~ '^U[0-9a-f]{32}$'),
  referrer_id uuid not null references public.referrers(profile_id),
  claimed_at timestamptz not null default now(),
  -- วันได้รับอนุมัติ (เริ่มนับสิทธิ์) และวันหมดสิทธิ์ — ต่ออายุ = เลื่อน expires_at ออกไป 12 เดือน
  starts_at timestamptz,
  expires_at timestamptz
);
create index if not exists referral_claims_referrer on public.referral_claims(referrer_id);

create table if not exists public.referral_tambon_rates (
  tambon_id uuid primary key references public.tambons(id),
  gp_pct numeric(5,2) not null check (gp_pct between 0 and 100),
  admin_pct numeric(5,2) not null default 0 check (admin_pct between 0 and 100),
  system_pct numeric(5,2) not null default 0 check (system_pct between 0 and 100),
  transfer_tax_pct numeric(5,2) not null default 0 check (transfer_tax_pct between 0 and 100),
  reserve_pct numeric(5,2) not null default 0 check (reserve_pct between 0 and 100),
  starts_on date not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.referral_months (
  month date primary key check (extract(day from month) = 1),
  closed_at timestamptz not null default now(),
  closed_by uuid
);

create table if not exists public.referral_earnings (
  month date not null references public.referral_months(month),
  order_id bigint not null references public.orders(id),
  side text not null check (side in ('seller', 'buyer')),
  referrer_id uuid not null references public.referrers(profile_id),
  tambon_id uuid not null,
  gp numeric(12,2) not null,
  net_gp numeric(12,2) not null,
  amount numeric(12,2) not null,
  primary key (order_id, side)
);
create index if not exists referral_earnings_referrer on public.referral_earnings(referrer_id, month);

create table if not exists public.referral_payouts (
  id bigserial primary key,
  referrer_id uuid not null references public.referrers(profile_id),
  month date not null references public.referral_months(month),
  amount numeric(12,2) not null check (amount >= 100),
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  paid_ref text,
  unique (referrer_id, month)
);

alter table public.referrers enable row level security;
alter table public.referral_claims enable row level security;
alter table public.referral_tambon_rates enable row level security;
alter table public.referral_months enable row level security;
alter table public.referral_earnings enable row level security;
alter table public.referral_payouts enable row level security;

-- ── เริ่มนับสิทธิ์เมื่อผู้ถูกแนะนำได้รับอนุมัติ ─────────────────────────────
create or replace function public.profiles_referral_start()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if new.approved and new.line_user_id is not null then
    update public.referral_claims
       set starts_at = now(), expires_at = now() + interval '12 months'
     where line_user_id = new.line_user_id and starts_at is null;
  end if;
  return null;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'profiles_referral_start') then
    create trigger profiles_referral_start
      after insert or update of approved, line_user_id on public.profiles
      for each row execute function public.profiles_referral_start();
  end if;
end $$;

-- ── LINE userId ของผู้เรียก (แบบเดียวกับ register_line_customer) ─────────────
create or replace function public.referral_caller_line_id()
returns text
language sql stable security definer set search_path = public, pg_temp
as $$
  select raw_app_meta_data->>'line_user_id' from auth.users where id = auth.uid();
$$;

-- ── ผูกกับผู้แนะนำ (เปิดลิงก์ /liff/ref?c=CODE) ─────────────────────────────
-- ผู้แนะนำคนแรกเท่านั้น · ชวนตัวเองไม่ได้ · ผูกได้เฉพาะคนที่ยังไม่เป็นสมาชิกที่อนุมัติแล้ว
create or replace function public.referral_claim(p_code text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_line text := public.referral_caller_line_id();
  v_ref public.referrers%rowtype;
  v_ref_line text;
  v_existing uuid;
begin
  if coalesce(v_line, '') !~ '^U[0-9a-f]{32}$' then
    return jsonb_build_object('ok', false, 'error', 'line_login_required');
  end if;
  select * into v_ref from public.referrers where code = upper(btrim(coalesce(p_code, '')));
  if v_ref.profile_id is null or v_ref.banned_at is not null then
    return jsonb_build_object('ok', false, 'error', 'bad_code');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('referral-claim:' || v_line, 0));
  select referrer_id into v_existing from public.referral_claims where line_user_id = v_line;
  if v_existing is not null then
    return jsonb_build_object('ok', true, 'already', true, 'same', v_existing = v_ref.profile_id);
  end if;
  select line_user_id into v_ref_line from public.profiles where id = v_ref.profile_id;
  if v_ref.profile_id = auth.uid() or v_ref_line = v_line then
    return jsonb_build_object('ok', false, 'error', 'self');
  end if;
  if exists (select 1 from public.profiles where (id = auth.uid() or line_user_id = v_line) and approved) then
    return jsonb_build_object('ok', false, 'error', 'already_member');
  end if;
  insert into public.referral_claims (line_user_id, referrer_id) values (v_line, v_ref.profile_id);
  return jsonb_build_object('ok', true, 'already', false);
end $$;

-- ── แถวคำนวณของเดือน (ภายใน) ───────────────────────────────────────────
-- นับเฉพาะออเดอร์ที่ส่งสำเร็จ ลูกค้าจ่ายแล้ว ไม่ใช่ทดสอบ/ซ้อม ไม่มีรายการคืนเงิน และมีค่าสินค้า
-- เดือนนับตามเวลาไทยของวันส่งสำเร็จ · ตำบลต้องมีอัตราและถึงวันเริ่มคำนวณแล้ว
create or replace function public.referral_month_rows(p_month date)
returns table (
  order_id bigint, tambon_id uuid, gp numeric, net_gp numeric,
  seller_referrer uuid, seller_amount numeric, buyer_referrer uuid, buyer_amount numeric
)
language sql stable security definer set search_path = public, pg_temp
as $$
  with o as (
    select o.id, o.tambon_id, o.customer_id, m.profile_id as merchant_profile,
           coalesce(o.delivered_at, o.updated_at) as done_at,
           round(o.items_subtotal * r.gp_pct / 100, 2) as gp,
           least(100, r.admin_pct + r.system_pct + r.transfer_tax_pct + r.reserve_pct
                      + coalesce(t.agent_share_commission_pct, 0)) as cost_pct
      from public.orders o
      join public.merchants m on m.id = o.merchant_id
      join public.referral_tambon_rates r on r.tambon_id = o.tambon_id
      join public.tambons t on t.id = o.tambon_id
     where o.status = 'delivered' and not o.is_test and not coalesce(o.is_drill, false)
       and o.customer_paid_at is not null and coalesce(o.items_subtotal, 0) > 0
       and not exists (select 1 from public.order_refunds f where f.order_id = o.id)
       and coalesce(o.delivered_at, o.updated_at) >= (p_month::timestamp at time zone 'Asia/Bangkok')
       and coalesce(o.delivered_at, o.updated_at) < ((p_month + interval '1 month')::timestamp at time zone 'Asia/Bangkok')
       and (coalesce(o.delivered_at, o.updated_at) at time zone 'Asia/Bangkok')::date >= r.starts_on
  ), n as (
    select o.*, round(o.gp * (100 - o.cost_pct) / 100, 2) as net_gp from o
  )
  select n.id, n.tambon_id, n.gp, n.net_gp,
         s.referrer_id, case when s.referrer_id is null then 0 else round(n.net_gp * 0.30, 2) end,
         b.referrer_id, case when b.referrer_id is null then 0 else round(n.net_gp * 0.40, 2) end
    from n
    left join lateral (
      select c.referrer_id from public.profiles p
        join public.referral_claims c on c.line_user_id = p.line_user_id
        join public.referrers rf on rf.profile_id = c.referrer_id
       where p.id = n.merchant_profile and rf.banned_at is null and c.referrer_id <> p.id
         and n.done_at >= c.starts_at and n.done_at < c.expires_at
    ) s on true
    left join lateral (
      select c.referrer_id from public.profiles p
        join public.referral_claims c on c.line_user_id = p.line_user_id
        join public.referrers rf on rf.profile_id = c.referrer_id
       where p.id = n.customer_id and rf.banned_at is null and c.referrer_id <> p.id
         and n.done_at >= c.starts_at and n.done_at < c.expires_at
    ) b on true;
$$;
revoke all on function public.referral_month_rows(date) from public, anon, authenticated;

-- ── ลิงก์และยอดของฉัน ─────────────────────────────────────────────────
-- สมาชิกที่อนุมัติแล้วและผูก LINE แล้วขอรหัสได้ (ออกให้ครั้งแรกที่เรียก)
create or replace function public.referral_me()
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_p public.profiles%rowtype;
  v_ref public.referrers%rowtype;
  v_code text;
  v_month date := date_trunc('month', now() at time zone 'Asia/Bangkok')::date;
begin
  select * into v_p from public.profiles where id = v_uid;
  if v_p.id is null or not v_p.approved or v_p.suspended_at is not null or v_p.line_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'member_required');
  end if;
  select * into v_ref from public.referrers where profile_id = v_uid;
  if v_ref.profile_id is null then
    loop
      v_code := (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
                   from generate_series(1, 6));
      insert into public.referrers (profile_id, code) values (v_uid, v_code) on conflict do nothing;
      select * into v_ref from public.referrers where profile_id = v_uid;
      exit when v_ref.profile_id is not null;
    end loop;
  end if;
  return jsonb_build_object(
    'ok', true,
    'code', v_ref.code,
    'banned', v_ref.banned_at is not null,
    'referred', (select count(*) from public.referral_claims where referrer_id = v_uid),
    'active', (select count(*) from public.referral_claims where referrer_id = v_uid and now() between starts_at and expires_at),
    'months', coalesce((select jsonb_agg(x order by x.month desc) from (
        select month, sum(amount) filter (where side = 'seller') as seller, sum(amount) filter (where side = 'buyer') as buyer,
               sum(amount) as total, count(distinct order_id) as orders
          from public.referral_earnings where referrer_id = v_uid group by month) x), '[]'),
    -- ประมาณการเดือนนี้ (ยังไม่ปิดยอด อาจเปลี่ยนได้)
    'this_month', (select coalesce(sum(case when seller_referrer = v_uid then seller_amount else 0 end)
                                 + sum(case when buyer_referrer = v_uid then buyer_amount else 0 end), 0)
                     from public.referral_month_rows(v_month)),
    'earned', (select coalesce(sum(amount), 0) from public.referral_earnings where referrer_id = v_uid),
    'payable', (select coalesce(sum(amount), 0) from public.referral_payouts where referrer_id = v_uid),
    'paid', (select coalesce(sum(amount), 0) from public.referral_payouts where referrer_id = v_uid and paid_at is not null),
    'promptpay', v_p.promptpay_id is not null
  );
end $$;

-- ── ส่วนกลาง: ตั้งอัตรารายตำบล (ตัวแทนตำบลเสนอ ส่วนกลางกรอก) ───────────────────
create or replace function public.referral_set_rates(
  p_tambon_id uuid, p_gp_pct numeric, p_admin_pct numeric, p_system_pct numeric,
  p_transfer_tax_pct numeric, p_reserve_pct numeric, p_starts_on date)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_superadmin() then raise exception 'ตั้งอัตราได้เฉพาะส่วนกลาง'; end if;
  if p_starts_on is null then raise exception 'ต้องระบุวันเริ่มคำนวณ'; end if;
  if coalesce(p_admin_pct, 0) + coalesce(p_system_pct, 0) + coalesce(p_transfer_tax_pct, 0) + coalesce(p_reserve_pct, 0) > 100 then
    raise exception 'ค่าใช้จ่ายรวมเกิน 100%% ของค่า GP';
  end if;
  insert into public.referral_tambon_rates as r
    (tambon_id, gp_pct, admin_pct, system_pct, transfer_tax_pct, reserve_pct, starts_on, updated_by)
  values (p_tambon_id, p_gp_pct, coalesce(p_admin_pct, 0), coalesce(p_system_pct, 0),
          coalesce(p_transfer_tax_pct, 0), coalesce(p_reserve_pct, 0), p_starts_on, auth.uid())
  on conflict (tambon_id) do update set
    gp_pct = excluded.gp_pct, admin_pct = excluded.admin_pct, system_pct = excluded.system_pct,
    transfer_tax_pct = excluded.transfer_tax_pct, reserve_pct = excluded.reserve_pct,
    starts_on = excluded.starts_on, updated_at = now(), updated_by = auth.uid();
end $$;

-- ── ส่วนกลาง/ตัวแทน: รายงานของเดือน ─────────────────────────────────────
-- เดือนที่ปิดแล้วอ่านจาก referral_earnings (ยอดไม่เปลี่ยน) · ยังไม่ปิด = ประมาณการจากออเดอร์ล่าสุด
-- ตัวแทนเห็นเฉพาะตำบลที่ดูแล (can_admin_tambon)
create or replace function public.referral_month_report(p_month date)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_closed boolean;
begin
  if not public.is_admin() then raise exception 'ดูได้เฉพาะส่วนกลางและตัวแทนตำบล'; end if;
  v_closed := exists (select 1 from public.referral_months where month = v_month);
  return (
    with rows as (select * from public.referral_month_rows(v_month) r where public.can_admin_tambon(r.tambon_id)),
    shares as (
      select e.tambon_id, e.referrer_id, e.side, e.amount, e.order_id
        from public.referral_earnings e where v_closed and e.month = v_month and public.can_admin_tambon(e.tambon_id)
      union all
      select tambon_id, seller_referrer, 'seller', seller_amount, order_id from rows where not v_closed and seller_referrer is not null
      union all
      select tambon_id, buyer_referrer, 'buyer', buyer_amount, order_id from rows where not v_closed and buyer_referrer is not null
    ),
    tam as (
      select r.tambon_id, count(*) as orders, sum(r.gp) as gp, sum(r.net_gp) as net_gp,
             coalesce((select sum(amount) from shares s where s.tambon_id = r.tambon_id and side = 'seller'), 0) as seller,
             coalesce((select sum(amount) from shares s where s.tambon_id = r.tambon_id and side = 'buyer'), 0) as buyer
        from rows r group by r.tambon_id
    )
    select jsonb_build_object(
      'month', v_month,
      'closed', v_closed,
      'note', case when v_closed then null else 'ยังไม่ปิดยอด ตัวเลขเป็นประมาณการ' end,
      'rates', coalesce((select jsonb_agg(jsonb_build_object(
          'tambon_id', r.tambon_id, 'name', tb.name, 'gp_pct', r.gp_pct, 'admin_pct', r.admin_pct,
          'system_pct', r.system_pct, 'agent_pct', tb.agent_share_commission_pct, 'transfer_tax_pct', r.transfer_tax_pct,
          'reserve_pct', r.reserve_pct, 'starts_on', r.starts_on) order by tb.name)
        from public.referral_tambon_rates r join public.tambons tb on tb.id = r.tambon_id
       where public.can_admin_tambon(r.tambon_id)), '[]'),
      'tambons', coalesce((select jsonb_agg(jsonb_build_object(
          'tambon_id', t.tambon_id, 'name', tb.name, 'orders', t.orders, 'gp', t.gp,
          'cost', t.gp - t.net_gp, 'net_gp', t.net_gp, 'seller_share', t.seller, 'buyer_share', t.buyer,
          'bavorn', t.net_gp - t.seller - t.buyer) order by tb.name)
        from tam t join public.tambons tb on tb.id = t.tambon_id), '[]'),
      'referrers', coalesce((select jsonb_agg(x order by x.total desc) from (
          select s.referrer_id, p.full_name, rf.code, rf.banned_at is not null as banned,
                 sum(s.amount) filter (where s.side = 'seller') as seller,
                 sum(s.amount) filter (where s.side = 'buyer') as buyer,
                 sum(s.amount) as total, count(distinct s.order_id) as orders
            from shares s join public.referrers rf on rf.profile_id = s.referrer_id
            join public.profiles p on p.id = s.referrer_id
           group by s.referrer_id, p.full_name, rf.code, rf.banned_at) x), '[]'),
      'payouts', case when public.is_superadmin() then coalesce((select jsonb_agg(jsonb_build_object(
          'referrer_id', po.referrer_id, 'full_name', p.full_name, 'amount', po.amount,
          'promptpay', p.promptpay_id is not null, 'paid_at', po.paid_at) order by po.amount desc)
        from public.referral_payouts po join public.profiles p on p.id = po.referrer_id
       where po.month = v_month), '[]') end
    )
  );
end $$;

-- ── ส่วนกลาง: ปิดยอดเดือน ─────────────────────────────────────────────
-- ปิดได้เมื่อเดือนจบแล้ว ปิดแล้วแก้ไม่ได้ · ยอดสะสมที่ยังไม่ถึงเกณฑ์ (< 100) ยกไปเดือนถัดไป
-- ผู้แนะนำที่ถูกตัดสิทธิ์ไม่ได้ยอดใหม่และไม่ได้รับรายการจ่าย
create or replace function public.referral_close_month(p_month date)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_rows int;
  v_payouts int;
begin
  if not public.is_superadmin() then raise exception 'ปิดยอดได้เฉพาะส่วนกลาง'; end if;
  if v_month + interval '1 month' > date_trunc('month', now() at time zone 'Asia/Bangkok') then
    raise exception 'เดือนนี้ยังไม่จบ ปิดยอดไม่ได้';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('referral-close', 0));
  if exists (select 1 from public.referral_months where month = v_month) then
    raise exception 'เดือนนี้ปิดยอดแล้ว';
  end if;
  insert into public.referral_months (month, closed_by) values (v_month, auth.uid());

  insert into public.referral_earnings (month, order_id, side, referrer_id, tambon_id, gp, net_gp, amount)
  select v_month, order_id, 'seller', seller_referrer, tambon_id, gp, net_gp, seller_amount
    from public.referral_month_rows(v_month) where seller_referrer is not null and seller_amount > 0
  union all
  select v_month, order_id, 'buyer', buyer_referrer, tambon_id, gp, net_gp, buyer_amount
    from public.referral_month_rows(v_month) where buyer_referrer is not null and buyer_amount > 0;
  get diagnostics v_rows = row_count;

  insert into public.referral_payouts (referrer_id, month, amount)
  select rf.profile_id, v_month, bal.amount
    from public.referrers rf
    cross join lateral (
      select coalesce((select sum(amount) from public.referral_earnings e where e.referrer_id = rf.profile_id), 0)
           - coalesce((select sum(amount) from public.referral_payouts po where po.referrer_id = rf.profile_id), 0) as amount
    ) bal
   where rf.banned_at is null and bal.amount >= 100;
  get diagnostics v_payouts = row_count;

  return jsonb_build_object('ok', true, 'month', v_month, 'earnings', v_rows, 'payouts', v_payouts);
end $$;

-- ── ส่วนกลาง: ตัดสิทธิ์เมื่อพบการทุจริต ─────────────────────────────────────
-- ยอดใหม่ไปสนับสนุน บวร · รายการจ่ายที่ยังไม่จ่ายถูกระงับ (ลบออก ยอดยังอยู่ใน referral_earnings เป็นหลักฐาน)
-- การเรียกคืนยอดที่จ่ายไปแล้วทำนอกระบบ
create or replace function public.referral_ban(p_profile_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_superadmin() then raise exception 'ตัดสิทธิ์ได้เฉพาะส่วนกลาง'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'ต้องระบุเหตุผล'; end if;
  update public.referrers set banned_at = now(), banned_reason = btrim(p_reason), banned_by = auth.uid()
   where profile_id = p_profile_id and banned_at is null;
  if not found then raise exception 'ไม่พบผู้แนะนำ หรือถูกตัดสิทธิ์ไปแล้ว'; end if;
  delete from public.referral_payouts where referrer_id = p_profile_id and paid_at is null;
end $$;

revoke all on function public.referral_claim(text), public.referral_me(), public.referral_caller_line_id(),
  public.referral_set_rates(uuid, numeric, numeric, numeric, numeric, numeric, date),
  public.referral_month_report(date), public.referral_close_month(date), public.referral_ban(uuid, text)
  from public, anon;
grant execute on function public.referral_claim(text), public.referral_me(),
  public.referral_set_rates(uuid, numeric, numeric, numeric, numeric, numeric, date),
  public.referral_month_report(date), public.referral_close_month(date), public.referral_ban(uuid, text)
  to authenticated;

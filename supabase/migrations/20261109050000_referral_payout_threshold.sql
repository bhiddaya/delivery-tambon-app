-- เกณฑ์จ่ายค่าแนะนำ: ยอดสะสมถึง 100 บาทจึงเข้ารอบจ่าย แล้วโอนตามรอบ (เจ้าของเลือกเกณฑ์นี้)
-- เพิ่มคอลัมน์เกณฑ์ลงตารางเดิม และให้ RPC ส่งค่านี้ออกไปด้วย ฟอร์มและบอทจะอ่านจากที่เดียวกัน

alter table public.referral_settings
  add column if not exists payout_threshold_baht integer not null default 100
  check (payout_threshold_baht >= 0);

create or replace function public.line_referral_terms()
returns jsonb
language sql stable security definer set search_path = public, pg_temp
as $$
  select coalesce(
    (select jsonb_build_object(
        'seller_referrer_pct', r.seller_referrer_pct,
        'buyer_referrer_pct', r.buyer_referrer_pct,
        'community_pct', r.community_pct,
        'payout_threshold_baht', r.payout_threshold_baht,
        'effective_from', r.effective_from)
       from public.referral_settings r
      where r.effective_from <= now()
      order by r.effective_from desc, r.created_at desc
      limit 1),
    jsonb_build_object('missing', true));
$$;

-- ย้อนกลับ: alter table public.referral_settings drop column payout_threshold_baht; แล้วสร้าง line_referral_terms เดิม

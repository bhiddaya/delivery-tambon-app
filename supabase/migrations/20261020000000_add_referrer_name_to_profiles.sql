-- ระบบแนะนำชั้นเดียว: เก็บชื่อ-นามสกุลของผู้แนะนำตอนสมัคร (ใช้คำนวณแบ่งปันผลประโยชน์ภายหลัง)
alter table public.profiles
  add column if not exists referrer_first_name text,
  add column if not exists referrer_last_name text;

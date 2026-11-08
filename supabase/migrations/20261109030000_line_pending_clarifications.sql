-- คำถามที่บอทถามกลับแล้วยังรอคำตอบ (เช่น "ต้องการตรวจความพร้อมของตำบลไหนครับ")
-- ใช้ให้คำตอบถัดไปของคนเดิมไปที่ผู้ช่วยตอบพร้อมคำถามเดิม แทนที่จะไปขอตำแหน่ง
--
-- ออกแบบ:
--   * หนึ่งแถวต่อ LINE user (ถามค้างได้ครั้งละหนึ่งเรื่อง)
--   * มีอายุ expires_at ให้หมดเองถ้าไม่ตอบ
--   * service_role เท่านั้น (n8n) ไม่เปิดให้ anon/authenticated

create table if not exists public.line_pending_clarifications (
  line_user_id text primary key,
  question text not null,
  source text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.line_pending_clarifications enable row level security;
revoke all on table public.line_pending_clarifications from public, anon, authenticated;
grant select, insert, update, delete on table public.line_pending_clarifications to service_role;

-- ย้อนกลับ: drop table public.line_pending_clarifications;

create table public.job_seekers (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null,
  full_name text not null,
  occupation text,
  skills_experience text,
  phone text,
  area text,
  created_at timestamptz not null default now()
);

comment on table public.job_seekers is 'Job-seeker profiles collected via LINE chat (สมัครงาน / สมัครงานอาชีพ). Profile-only intake for now, no auto-matching yet.';

alter table public.job_seekers enable row level security;

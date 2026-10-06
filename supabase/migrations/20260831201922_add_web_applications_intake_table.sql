create table if not exists public.web_applications (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('merchant','rider','jobseeker','other')),
  tambon_id uuid references public.tambons(id),
  tambon_confirmed boolean not null default false,
  full_name text not null,
  phone text not null,
  line_id text,
  details jsonb not null default '{}'::jsonb,
  pdpa_consent boolean not null default false,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

comment on table public.web_applications is 'Applications submitted via the national raksthai.* PWA web form (merchant/rider/jobseeker/other), pending admin review. Separate from the LINE OA intake pipeline (profiles/merchants/drivers/job_seekers) by design -- admin manually promotes an approved row into those tables. tambon_confirmed is a self-declared checkbox (no ID-card number/document collected), per project decision to avoid heavy KYC.';

alter table public.web_applications enable row level security;

create policy web_applications_insert_public
  on public.web_applications
  for insert
  to anon, authenticated
  with check (pdpa_consent = true and tambon_confirmed = true);

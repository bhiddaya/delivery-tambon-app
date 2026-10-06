create table public.places (
  id uuid primary key default gen_random_uuid(),
  tambon_id uuid references public.tambons(id),
  category text not null check (category in ('government','hospital','school','university','temple')),
  name text not null,
  address text,
  phone text,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);

comment on table public.places is 'Directory of notable places in the tambon (government offices, hospitals, schools, universities, temples) for browsing via LINE OA and PWA, and future use as ride-hailing destination presets.';

alter table public.places enable row level security;

create policy "Anyone can view places"
  on public.places for select
  using (true);

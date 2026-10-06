-- แปลงที่ดิน (สำหรับงานเกษตร: ไถนา/ดำนา/เกี่ยว/โดรน)
create table if not exists public.plots (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles(id),
  tambon_id uuid not null references public.tambons(id),
  address text,
  lat double precision,
  lng double precision,
  area_rai numeric check (area_rai is null or area_rai >= 0),
  crop_type text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists plots_owner_profile_id_idx on public.plots(owner_profile_id);
create index if not exists plots_tambon_id_idx on public.plots(tambon_id);

alter table public.plots enable row level security;

create policy plots_select_authenticated on public.plots
  for select using (true);

create policy plots_insert_self on public.plots
  for insert with check (owner_profile_id = auth.uid());

create policy plots_update_self_or_admin on public.plots
  for update using (owner_profile_id = auth.uid() or is_admin())
  with check (owner_profile_id = auth.uid() or is_admin());

-- ขยาย orders ให้รองรับงานเกษตรแบบผูกแปลง+นัดล่วงหน้า
alter table public.orders
  add column if not exists plot_id uuid references public.plots(id),
  add column if not exists required_vehicle_type vehicle_type,
  add column if not exists scheduled_date timestamptz,
  add column if not exists job_area_rai numeric check (job_area_rai is null or job_area_rai >= 0),
  add column if not exists job_duration_hours numeric check (job_duration_hours is null or job_duration_hours >= 0);

create index if not exists orders_plot_id_idx on public.orders(plot_id);
create index if not exists orders_scheduled_date_idx on public.orders(scheduled_date);


-- ============ Enums ============
create type user_role as enum ('customer','driver','merchant','admin');
create type vehicle_type as enum ('motorcycle','pickup','trike','tractor','bicycle','other');
create type order_type as enum ('food','parcel','ride');
create type order_status as enum ('pending','accepted','in_progress','delivered','cancelled');

-- ============ Tambons (พื้นที่ปฏิบัติการ) ============
create table public.tambons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  district text,
  province text,
  note text,
  created_at timestamptz not null default now()
);

-- ============ Profiles (ผู้ใช้ทุกบทบาท ผูกกับ auth.users) ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'customer',
  full_name text not null,
  phone text,
  tambon_id uuid references public.tambons(id),
  promptpay_id text,
  approved boolean not null default true, -- driver/merchant เริ่มที่ false ผ่าน trigger ด้านล่าง
  rating numeric(2,1) not null default 5.0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============ Driver details ============
create table public.drivers (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  vehicle_type vehicle_type not null default 'motorcycle',
  is_online boolean not null default false,
  today_jobs int not null default 0,
  today_earn numeric(10,2) not null default 0,
  updated_at timestamptz not null default now()
);

-- ============ Merchants ============
create table public.merchants (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  tambon_id uuid not null references public.tambons(id),
  name text not null,
  category text,
  address text,
  is_open boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  name text not null,
  price numeric(10,2) not null check (price >= 0),
  is_available boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============ Orders ============
create table public.orders (
  id bigint generated always as identity primary key,
  type order_type not null,
  status order_status not null default 'pending',
  tambon_id uuid not null references public.tambons(id),
  customer_id uuid not null references public.profiles(id),
  merchant_id uuid references public.merchants(id),
  driver_id uuid references public.profiles(id),
  pickup text,
  dropoff text,
  note text,
  items_subtotal numeric(10,2) not null default 0,
  delivery_fee numeric(10,2) not null default 0,
  price numeric(10,2) not null default 0,
  payment_method text default 'เงินสดปลายทาง',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id bigint not null references public.orders(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id),
  name text not null,
  qty int not null default 1,
  price numeric(10,2) not null default 0
);

create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  order_id bigint not null references public.orders(id) on delete cascade,
  from_profile uuid not null references public.profiles(id),
  to_profile uuid not null references public.profiles(id),
  score int not null check (score between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

-- ============ Indexes ============
create index idx_profiles_tambon on public.profiles(tambon_id);
create index idx_merchants_tambon on public.merchants(tambon_id);
create index idx_orders_tambon_status on public.orders(tambon_id, status);
create index idx_orders_customer on public.orders(customer_id);
create index idx_orders_driver on public.orders(driver_id);
create index idx_menu_items_merchant on public.menu_items(merchant_id);

-- ============ updated_at trigger helper ============
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger trg_merchants_updated before update on public.merchants
  for each row execute function public.set_updated_at();
create trigger trg_orders_updated before update on public.orders
  for each row execute function public.set_updated_at();
create trigger trg_drivers_updated before update on public.drivers
  for each row execute function public.set_updated_at();

-- ============ auto-set approved=false for driver/merchant on insert ============
create or replace function public.set_default_approval()
returns trigger
language plpgsql
as $$
begin
  if new.role in ('driver','merchant') and (tg_op = 'INSERT') then
    new.approved := false;
  elsif new.role in ('customer','admin') and (tg_op = 'INSERT') then
    new.approved := true;
  end if;
  return new;
end;
$$;

create trigger trg_profiles_default_approval before insert on public.profiles
  for each row execute function public.set_default_approval();

-- ============ seed tambon นำร่อง ============
insert into public.tambons (name, district, province, note)
values ('ตำบลคลองใหม่', 'อำเภอเมือง', null, 'ตำบลนำร่อง (ข้อมูลตัวอย่าง แก้ไขได้ภายหลัง)');

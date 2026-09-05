-- รัดกุมสิทธิ์การอ่านข้อมูล: จากเดิม "ใครล็อกอินก็เห็นทั้งประเทศ" เป็น "เห็นเท่าที่เกี่ยวข้อง"
--
-- ที่มา: policy เดิมของ profiles / drivers / merchants ใช้ USING (true)
-- และ orders เปิดให้อ่านออเดอร์สถานะ pending ได้ทุกตำบล ผลคือผู้ใช้ที่ล็อกอิน
-- คนเดียวอ่านชื่อ เบอร์โทร พร้อมเพย์ และ LINE ID ของคนทั้งประเทศได้
-- เรื่องนี้กลายเป็นความเสี่ยงทันทีที่เปิด LINE Login ให้คนทั่วไปสมัครเอง
--
-- อีกจุดหนึ่ง: is_admin() ไม่ผูกกับตำบล ตัวแทนตำบลจึงเห็นและแก้ข้อมูล
-- ของทุกตำบลได้เท่ากับส่วนกลาง ซึ่งไม่ตรงกับที่ออกแบบไว้

-- ---------------------------------------------------------------------------
-- 1. ตารางขอบเขตสิทธิ์ — เตรียมไว้สำหรับ "ผู้ช่วยส่วนกลาง"
-- ---------------------------------------------------------------------------
-- ออกแบบเป็นตารางแทนที่จะเพิ่ม role ใหม่ใน enum เพราะผู้ช่วยส่วนกลางในอนาคต
-- อาจดูแล "บางจังหวัด" หรือ "บางตำบล" ไม่ใช่ทั้งประเทศเสมอไป การเก็บเป็นแถว
-- ทำให้เพิ่ม/ถอนสิทธิ์ทีละตำบลได้โดยไม่ต้องแก้โครงสร้างอีก
--
-- tambon_id = NULL หมายถึงสิทธิ์ระดับประเทศ (ผู้ช่วยส่วนกลางเต็มตัว)
create table if not exists public.admin_scopes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  tambon_id uuid references public.tambons(id) on delete cascade,
  note text,
  granted_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- กันการให้สิทธิ์ซ้ำ — NULL ใน unique index ไม่ชนกันเอง จึงต้องแปลงเป็นค่าคงที่
create unique index if not exists admin_scopes_unique_idx
  on public.admin_scopes (profile_id, coalesce(tambon_id, '00000000-0000-0000-0000-000000000000'::uuid));

create index if not exists admin_scopes_profile_idx on public.admin_scopes (profile_id);

alter table public.admin_scopes enable row level security;

-- ---------------------------------------------------------------------------
-- 2. ฟังก์ชันตัดสินสิทธิ์
-- ---------------------------------------------------------------------------
-- ทุกตัวเป็น security definer เพราะต้องอ่าน profiles/admin_scopes ข้าม RLS
-- ถ้าไม่ทำแบบนี้ policy ที่เรียกฟังก์ชันจะวนอ่านตารางเดิมจนเกิด infinite recursion

create or replace function public.my_tambon_id()
returns uuid language sql stable security definer set search_path = public, pg_temp
as $$ select tambon_id from public.profiles where id = auth.uid(); $$;

-- สิทธิ์ระดับประเทศ: ส่วนกลาง หรือผู้ช่วยที่ได้รับมอบทั้งประเทศ
create or replace function public.has_national_scope()
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (select 1 from public.profiles p
                  where p.id = auth.uid() and p.role = 'superadmin')
      or exists (select 1 from public.admin_scopes s
                  where s.profile_id = auth.uid() and s.tambon_id is null);
$$;

-- ดูแลตำบลนี้ได้ไหม — ส่วนกลาง / ตัวแทนตำบลนั้น / ผู้ช่วยที่ได้รับมอบตำบลนั้น
create or replace function public.can_admin_tambon(t uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select public.has_national_scope()
      or (t is not null and (
            exists (select 1 from public.profiles p
                     where p.id = auth.uid() and p.role = 'admin'
                       and coalesce(p.approved, false) and p.tambon_id = t)
         or exists (select 1 from public.admin_scopes s
                     where s.profile_id = auth.uid() and s.tambon_id = t)));
$$;

-- ดูแล "คนคนนี้" ได้ไหม — ตัดสินจากตำบลที่เขาสังกัด
create or replace function public.can_admin_profile(p uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select public.can_admin_tambon((select tambon_id from public.profiles where id = p))
      or (public.has_national_scope()
          and exists (select 1 from public.profiles x where x.id = p));
$$;

-- ไรเดอร์ที่ผ่านการอนุมัติแล้วในตำบลนี้ — ใช้ตัดสินว่าใครเห็นงานที่ยังไม่มีคนรับ
create or replace function public.is_approved_driver_in(t uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select t is not null and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'driver'
      and coalesce(p.approved, false) and p.tambon_id = t
  );
$$;

-- เคยอยู่ในออเดอร์เดียวกันไหม (คนละฝั่ง) — ลูกค้า/ไรเดอร์/เจ้าของร้าน
-- ใช้เปิดให้เห็นชื่อและเบอร์ของอีกฝ่ายเท่าที่จำเป็นต่อการส่งของจริง
create or replace function public.shares_order_with(p uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select p is not null and auth.uid() is not null and exists (
    select 1
    from public.orders o
    left join public.merchants m on m.id = o.merchant_id
    where (o.customer_id = auth.uid() and (o.driver_id = p or m.profile_id = p))
       or (o.driver_id   = auth.uid() and (o.customer_id = p or m.profile_id = p))
       or (m.profile_id  = auth.uid() and (o.customer_id = p or o.driver_id = p))
  );
$$;

-- is_admin() ยังมีโค้ดเก่าเรียกอยู่ — เปลี่ยนความหมายเป็น "เป็นแอดมินระดับใดก็ได้"
-- ใช้ได้เฉพาะกับคำถามที่ไม่สนขอบเขต ส่วน policy ทั้งหมดย้ายไปใช้ตัวที่ผูกตำบลแล้ว
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$
  select public.has_national_scope()
      or exists (select 1 from public.profiles p
                  where p.id = auth.uid() and p.role = 'admin' and coalesce(p.approved, false))
      or exists (select 1 from public.admin_scopes s where s.profile_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- 3. policy ของ admin_scopes เอง
-- ---------------------------------------------------------------------------
drop policy if exists admin_scopes_select on public.admin_scopes;
create policy admin_scopes_select on public.admin_scopes for select to authenticated
  using (profile_id = auth.uid() or public.has_national_scope());

-- มอบและถอนสิทธิ์ได้เฉพาะระดับประเทศ ตัวแทนตำบลตั้งผู้ช่วยเองไม่ได้
drop policy if exists admin_scopes_write on public.admin_scopes;
create policy admin_scopes_write on public.admin_scopes for all to authenticated
  using (public.has_national_scope()) with check (public.has_national_scope());

grant select, insert, update, delete on public.admin_scopes to authenticated;

-- ---------------------------------------------------------------------------
-- 4. profiles — เดิม USING (true)
-- ---------------------------------------------------------------------------
drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_scoped on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or public.shares_order_with(id)
    or public.can_admin_tambon(tambon_id)
  );

drop policy if exists profiles_update_self_or_admin on public.profiles;
create policy profiles_update_scoped on public.profiles for update to authenticated
  using (id = auth.uid() or public.can_admin_tambon(tambon_id))
  with check (id = auth.uid() or public.can_admin_tambon(tambon_id));

-- ---------------------------------------------------------------------------
-- 5. orders — เดิมเปิดให้อ่าน pending ได้ทุกตำบล
-- ---------------------------------------------------------------------------
drop policy if exists orders_select_relevant on public.orders;
create policy orders_select_scoped on public.orders for select to authenticated
  using (
    customer_id = auth.uid()
    or driver_id = auth.uid()
    or exists (select 1 from public.merchants m
                where m.id = orders.merchant_id and m.profile_id = auth.uid())
    -- งานที่ยังไม่มีคนรับ เห็นได้เฉพาะไรเดอร์ที่อนุมัติแล้วในตำบลเดียวกัน
    or (status = 'pending' and public.is_approved_driver_in(tambon_id))
    or public.can_admin_tambon(tambon_id)
  );

drop policy if exists orders_update_relevant on public.orders;
create policy orders_update_scoped on public.orders for update to authenticated
  using (
    customer_id = auth.uid()
    or driver_id = auth.uid()
    or (driver_id is null and status = 'pending' and public.is_approved_driver_in(tambon_id))
    or exists (select 1 from public.merchants m
                where m.id = orders.merchant_id and m.profile_id = auth.uid())
    or public.can_admin_tambon(tambon_id)
  );

-- ---------------------------------------------------------------------------
-- 6. drivers / merchants — เดิม USING (true)
-- ---------------------------------------------------------------------------
drop policy if exists drivers_select_authenticated on public.drivers;
create policy drivers_select_scoped on public.drivers for select to authenticated
  using (
    profile_id = auth.uid()
    or public.shares_order_with(profile_id)
    or public.can_admin_profile(profile_id)
  );

drop policy if exists drivers_update_self_or_admin on public.drivers;
create policy drivers_update_scoped on public.drivers for update to authenticated
  using (profile_id = auth.uid() or public.can_admin_profile(profile_id))
  with check (profile_id = auth.uid() or public.can_admin_profile(profile_id));

-- ร้านที่เปิดขายยังเห็นได้ทั่วไป เพราะเป็นข้อมูลหน้าร้านที่ตั้งใจให้ลูกค้าเห็น
drop policy if exists merchants_select_authenticated on public.merchants;
create policy merchants_select_scoped on public.merchants for select to authenticated
  using (
    is_open = true
    or profile_id = auth.uid()
    or public.can_admin_profile(profile_id)
  );

drop policy if exists merchants_update_self_or_admin on public.merchants;
create policy merchants_update_scoped on public.merchants for update to authenticated
  using (profile_id = auth.uid() or public.can_admin_profile(profile_id))
  with check (profile_id = auth.uid() or public.can_admin_profile(profile_id));

-- ---------------------------------------------------------------------------
-- 7. menu_items / tambons / plots — ตัดสิทธิ์ข้ามตำบลออก
-- ---------------------------------------------------------------------------
drop policy if exists menu_items_write_owner_or_admin on public.menu_items;
create policy menu_items_write_scoped on public.menu_items for all to authenticated
  using (exists (select 1 from public.merchants m
                  where m.id = menu_items.merchant_id
                    and (m.profile_id = auth.uid() or public.can_admin_profile(m.profile_id))))
  with check (exists (select 1 from public.merchants m
                  where m.id = menu_items.merchant_id
                    and (m.profile_id = auth.uid() or public.can_admin_profile(m.profile_id))));

-- เดิมตัวแทนตำบลแก้ข้อมูลตำบลอื่นได้ด้วย
drop policy if exists tambons_write_admin on public.tambons;
create policy tambons_write_scoped on public.tambons for all to authenticated
  using (public.can_admin_tambon(id)) with check (public.can_admin_tambon(id));

-- แปลงที่ดินเปิดให้ anon อ่านได้หมด ทั้งที่มีเจ้าของ ที่อยู่ และพิกัด
drop policy if exists plots_select_authenticated on public.plots;
create policy plots_select_scoped on public.plots for select to authenticated
  using (
    owner_profile_id = auth.uid()
    or public.can_admin_tambon(tambon_id)
    -- ไรเดอร์/ผู้ให้บริการเกษตรในตำบลเดียวกันต้องเห็นแปลง เพื่อรับงานในแปลงนั้นได้
    or public.is_approved_driver_in(tambon_id)
  );

drop policy if exists plots_update_self_or_admin on public.plots;
create policy plots_update_scoped on public.plots for update to authenticated
  using (owner_profile_id = auth.uid() or public.can_admin_tambon(tambon_id))
  with check (owner_profile_id = auth.uid() or public.can_admin_tambon(tambon_id));

drop policy if exists plots_insert_self on public.plots;
create policy plots_insert_self on public.plots for insert to authenticated
  with check (owner_profile_id = auth.uid());

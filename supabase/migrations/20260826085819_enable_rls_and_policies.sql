
-- ============ Helper: is_admin (security definer เพื่อเลี่ยง RLS recursion) ============
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ============ Enable RLS ============
alter table public.tambons enable row level security;
alter table public.profiles enable row level security;
alter table public.drivers enable row level security;
alter table public.merchants enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.ratings enable row level security;

-- ============ tambons: อ่านได้ทุกคนที่ล็อกอิน, แก้ไขได้เฉพาะแอดมิน ============
create policy "tambons_select_authenticated" on public.tambons
  for select to authenticated using (true);
create policy "tambons_write_admin" on public.tambons
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ============ profiles ============
create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated using (true);
create policy "profiles_insert_self" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "profiles_update_self_or_admin" on public.profiles
  for update to authenticated using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- ============ drivers ============
create policy "drivers_select_authenticated" on public.drivers
  for select to authenticated using (true);
create policy "drivers_insert_self" on public.drivers
  for insert to authenticated with check (profile_id = auth.uid());
create policy "drivers_update_self_or_admin" on public.drivers
  for update to authenticated using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

-- ============ merchants ============
create policy "merchants_select_authenticated" on public.merchants
  for select to authenticated using (true);
create policy "merchants_insert_self" on public.merchants
  for insert to authenticated with check (profile_id = auth.uid());
create policy "merchants_update_self_or_admin" on public.merchants
  for update to authenticated using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

-- ============ menu_items (สิทธิ์อิงเจ้าของร้าน) ============
create policy "menu_items_select_authenticated" on public.menu_items
  for select to authenticated using (true);
create policy "menu_items_write_owner_or_admin" on public.menu_items
  for all to authenticated using (
    public.is_admin() or exists (
      select 1 from public.merchants m where m.id = menu_items.merchant_id and m.profile_id = auth.uid()
    )
  ) with check (
    public.is_admin() or exists (
      select 1 from public.merchants m where m.id = menu_items.merchant_id and m.profile_id = auth.uid()
    )
  );

-- ============ orders ============
-- select: เจ้าของออเดอร์, ไรเดอร์ที่รับงาน, ร้านค้าที่เกี่ยวข้อง, แอดมิน, หรือออเดอร์ที่ยังรอคนขับรับ (ให้ไรเดอร์ทุกคนเห็นงานว่าง)
create policy "orders_select_relevant" on public.orders
  for select to authenticated using (
    customer_id = auth.uid()
    or driver_id = auth.uid()
    or status = 'pending'
    or public.is_admin()
    or exists (select 1 from public.merchants m where m.id = orders.merchant_id and m.profile_id = auth.uid())
  );
create policy "orders_insert_self" on public.orders
  for insert to authenticated with check (customer_id = auth.uid());
-- update: ลูกค้ายกเลิกออเดอร์ตัวเอง, ไรเดอร์รับ/อัปเดตงาน, ร้านค้าอัปเดตออเดอร์ของร้าน, แอดมินทำได้ทุกอย่าง
create policy "orders_update_relevant" on public.orders
  for update to authenticated using (
    customer_id = auth.uid()
    or driver_id = auth.uid()
    or (driver_id is null and status = 'pending')
    or public.is_admin()
    or exists (select 1 from public.merchants m where m.id = orders.merchant_id and m.profile_id = auth.uid())
  ) with check (
    customer_id = auth.uid()
    or driver_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.merchants m where m.id = orders.merchant_id and m.profile_id = auth.uid())
  );

-- ============ order_items ============
create policy "order_items_select_relevant" on public.order_items
  for select to authenticated using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
      and (o.customer_id = auth.uid() or o.driver_id = auth.uid() or public.is_admin()
           or exists (select 1 from public.merchants m where m.id = o.merchant_id and m.profile_id = auth.uid()))
    )
  );
create policy "order_items_insert_owner" on public.order_items
  for insert to authenticated with check (
    exists (select 1 from public.orders o where o.id = order_items.order_id and o.customer_id = auth.uid())
  );

-- ============ ratings ============
create policy "ratings_select_participant" on public.ratings
  for select to authenticated using (from_profile = auth.uid() or to_profile = auth.uid() or public.is_admin());
create policy "ratings_insert_self" on public.ratings
  for insert to authenticated with check (from_profile = auth.uid());

-- ============ Realtime: เปิดสำหรับตารางที่ต้อง sync สด ============
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.drivers;
alter publication supabase_realtime add table public.merchants;
alter publication supabase_realtime add table public.menu_items;

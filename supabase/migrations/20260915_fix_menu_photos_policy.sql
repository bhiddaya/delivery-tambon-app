-- [D33] กู้จากฐานจริง: supabase_migrations.schema_migrations version 20260915064426 (fix_menu_photos_policy)
-- ข้อความ SQL ด้านล่างตรงกับที่รันบนฐานจริงทุกตัวอักษร (md5 80f3d97f019ac7b25da1eedd8d0840f6) — ฐานจริงมีแล้ว ไม่ต้องรันซ้ำ
--
-- แก้บั๊ก: ของเดิมใช้ storage.foldername(m.name) ซึ่ง m.name คือชื่อร้าน ไม่ใช่ path ของไฟล์
-- ทำให้เงื่อนไขเป็นเท็จเสมอ ร้านค้าอัปโหลดรูปจากเบราว์เซอร์ไม่ได้
drop policy if exists "menu_photos_owner_insert" on storage.objects;
drop policy if exists "menu_photos_owner_update" on storage.objects;
drop policy if exists "menu_photos_owner_delete" on storage.objects;

create policy "menu_photos_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'menu-photos'
    and exists (
      select 1 from public.merchants m
      where m.id::text = (storage.foldername(storage.objects.name))[1]
        and (m.profile_id = auth.uid() or public.can_admin_profile(m.profile_id))
    )
  );

create policy "menu_photos_owner_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'menu-photos'
    and exists (
      select 1 from public.merchants m
      where m.id::text = (storage.foldername(storage.objects.name))[1]
        and (m.profile_id = auth.uid() or public.can_admin_profile(m.profile_id))
    )
  );

create policy "menu_photos_owner_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'menu-photos'
    and exists (
      select 1 from public.merchants m
      where m.id::text = (storage.foldername(storage.objects.name))[1]
        and (m.profile_id = auth.uid() or public.can_admin_profile(m.profile_id))
    )
  );

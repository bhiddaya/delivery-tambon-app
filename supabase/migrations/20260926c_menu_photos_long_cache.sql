-- [D33] กู้จากฐานจริง: supabase_migrations.schema_migrations version 20260926092047 (menu_photos_long_cache)
-- ข้อความ SQL ด้านล่างตรงกับที่รันบนฐานจริงทุกตัวอักษร (md5 b1b0b64a0c50e2445707b4da51b5988c) — ฐานจริงมีแล้ว ไม่ต้องรันซ้ำ
-- หมายเหตุ: trigger และฟังก์ชันนี้ถูกลบทิ้งในไฟล์ถัดไป (20260926d_drop_menu_photos_long_cache_trigger.sql)
create or replace function public.menu_photos_long_cache() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.bucket_id = 'menu-photos' and new.metadata is not null then
    new.metadata := jsonb_set(new.metadata, '{cacheControl}', '"max-age=31536000"');
  end if;
  return new;
end $$;
revoke all on function public.menu_photos_long_cache() from public, anon, authenticated;
drop trigger if exists menu_photos_long_cache on storage.objects;
create trigger menu_photos_long_cache before insert or update of metadata on storage.objects
for each row execute function public.menu_photos_long_cache();

-- [D33] กู้จากฐานจริง: supabase_migrations.schema_migrations version 20260926092142 (drop_menu_photos_long_cache_trigger)
-- ข้อความ SQL ด้านล่างตรงกับที่รันบนฐานจริงทุกตัวอักษร (md5 eb7ccad176950f2a312f9fd0143395d4) — ฐานจริงมีแล้ว ไม่ต้องรันซ้ำ
--
drop trigger if exists menu_photos_long_cache on storage.objects;
drop function if exists public.menu_photos_long_cache();

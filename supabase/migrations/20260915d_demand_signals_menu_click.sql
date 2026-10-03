-- [D33] กู้จากฐานจริง: supabase_migrations.schema_migrations version 20260915101843 (demand_signals_menu_click)
-- ข้อความ SQL ด้านล่างตรงกับที่รันบนฐานจริงทุกตัวอักษร (md5 0de293e71c4c02f4e395b22819f7bf11) — ฐานจริงมีแล้ว ไม่ต้องรันซ้ำ
--
alter table public.demand_signals drop constraint if exists demand_signals_kind_check;
alter table public.demand_signals add constraint demand_signals_kind_check
  check (kind in ('search_miss','vehicle_missing','service_open','menu_click'));

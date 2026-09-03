-- เพิ่ม slug ให้ตำบล สำหรับ URL สาธารณะ /t/<slug>
--
-- ทำไมต้องมี:
--   ชื่อตำบลในไทยซ้ำกันข้ามจังหวัด ("บ้านใหม่" "ในเมือง" "ท่าช้าง" มีหลายจังหวัด)
--   ใช้ชื่อเป็น URL ตรง ๆ จะชนกันแน่นอนเมื่อขยายครบ ~7,000 ตำบล
--
-- โครงที่เลือก:
--   code     รหัสตำบลราชการ 6 หลัก — ไม่ซ้ำทั้งประเทศ
--   name_en  ชื่อโรมัน — ให้คนอ่าน URL พอเดาได้
--   slug     ตัวที่ใช้จริงใน URL เช่น "340115-bungmai"
--
-- slug แยกจาก code เพื่อให้เปลี่ยนหน้าตา URL ได้ภายหลังโดยไม่แตะข้อมูลราชการ
-- และเปลี่ยนชื่อตำบลได้โดยลิงก์เก่าไม่ตาย

alter table public.tambons
  add column if not exists code    text,
  add column if not exists name_en text,
  add column if not exists slug    text;

-- เติมค่าให้แถวที่มีอยู่:
--   มี code + name_en  -> "340115-bungmai"
--   มีแต่ code         -> "340115"
--   ไม่มีอะไรเลย       -> 8 ตัวแรกของ id (ชั่วคราว รอเติม code ทีหลัง)
update public.tambons
set slug = case
  when code is not null and name_en is not null and btrim(name_en) <> ''
    then code || '-' || lower(regexp_replace(btrim(name_en), '[^A-Za-z0-9]+', '-', 'g'))
  when code is not null
    then code
  else left(replace(id::text, '-', ''), 8)
end
where slug is null;

-- ต้องมีเสมอ และห้ามซ้ำ — URL ชี้ตำบลผิดคือเรื่องใหญ่
alter table public.tambons
  alter column slug set not null;

create unique index if not exists tambons_slug_key on public.tambons (slug);

-- code ไม่บังคับ (ตำบลที่ยังไม่ได้ผูกข้อมูลราชการ) แต่ถ้ามีต้องไม่ซ้ำ
create unique index if not exists tambons_code_key
  on public.tambons (code) where code is not null;

-- ใช้ค้นตำบลจาก URL — เป็น query หลักของหน้า /t/<slug>
comment on column public.tambons.slug is
  'URL identifier for the public tambon page (/t/<slug>). Stable: never reuse a slug for a different tambon.';
comment on column public.tambons.code is
  'Official 6-digit Thai subdistrict code. Unique nationwide when present.';
comment on column public.tambons.name_en is
  'Romanised tambon name, used to build a human-readable slug.';

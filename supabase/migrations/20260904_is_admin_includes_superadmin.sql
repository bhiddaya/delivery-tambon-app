-- is_admin() เดิมเทียบบทบาทแบบตรงตัว role = 'admin'
--
-- policy ของหน้าตัวแทนตำบลเรียกใช้ฟังก์ชันนี้ ส่วนกลาง (superadmin) จึงมองไม่เห็น
-- อะไรเลยในหน้า /admin ทั้งที่ควรเห็นได้มากกว่าตัวแทนตำบลด้วยซ้ำ
--
-- ให้ส่วนกลางนับเป็น admin ด้วย — เป็นการ "ขยาย" สิทธิ์เฉพาะบทบาทใหม่
-- ไม่ได้เปลี่ยนสิทธิ์ของ admin เดิมแม้แต่นิดเดียว
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'superadmin')
  );
$function$;

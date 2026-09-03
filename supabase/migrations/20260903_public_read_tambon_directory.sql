-- เปิดสิทธิ์อ่านสาธารณะสำหรับหน้า /t/<slug>
--
-- เดิมหน้านี้อ่านผ่าน service role ทำให้หน้าสาธารณะต้องพึ่ง secret key
-- เปลี่ยนมาเปิดสิทธิ์อ่านให้ anon แทน — ตรงกับธรรมชาติของข้อมูล
-- (ชื่อตำบล ชื่อร้านที่เปิดอยู่ คือสิ่งที่ตั้งใจให้คนทั่วไปเห็น)
--
-- คุมเป็นรายคอลัมน์ ไม่ใช่เปิดทั้งแถว:
-- ค่าเริ่มต้นของ Supabase ให้ anon มีสิทธิ์ SELECT ทั้งตาราง โดยมี RLS เป็นด่านเดียว
-- ถ้าใส่แค่ policy คนนอกจะอ่านได้ทุกคอลัมน์ รวมถึง merchants.profile_id
-- (ผูกร้านเข้ากับบัญชีผู้ใช้) และพิกัด lat/lng ซึ่งไม่จำเป็นต้องเปิด
--
-- authenticated ไม่ถูกแตะ — flow ที่ล็อกอินแล้วทำงานเหมือนเดิม

-- ---------- tambons ----------
revoke select on public.tambons from anon;
grant select (id, name, district, province, slug) on public.tambons to anon;

create policy "tambons_select_public"
on public.tambons for select to anon
using (true);

-- ---------- merchants ----------
revoke select on public.merchants from anon;
grant select (id, name, category, tambon_id, is_open) on public.merchants to anon;

-- เห็นเฉพาะร้านที่เปิดรับออร์เดอร์ ร้านที่ปิดไม่โผล่ในหน้าสาธารณะ
create policy "merchants_select_public_open"
on public.merchants for select to anon
using (is_open = true);

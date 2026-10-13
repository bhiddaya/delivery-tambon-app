# เข้าหน้าทำงานจาก LINE ตามสิทธิ์บัญชีเดิม

เจ้าของสั่ง 14 ต.ค. 2569 ให้ทุกบทบาทใช้ LINE ID ที่ระบบจดจำเพื่อเข้าถึงหน้าของตน ไม่บังคับอีเมล/เบอร์และรหัสผ่านซ้ำ

## ทางเข้าหลัก

เปิด `https://liff.line.me/2011443365-RD1UinVM/liff/entry` จาก LINE OA ระบบยืนยัน LINE แล้วเปิดบัญชีที่ผูกไว้

- Super Admin และ admin/ตัวแทนตำบล: `/admin/workspace` ตามขอบเขตพื้นที่เดิม
- ร้านค้า: `/merchant/orders`
- ไรเดอร์: `/driver`
- ลูกค้า: `/customer` (ปุ่มสั่งอาหารเดิมยังใช้หน้า LIFF สั่งอาหารเดิม)
- ปุ่มตัวแทนใช้ `/liff/entry?role=admin`; ร้านค้าใช้ `?role=merchant`; ไรเดอร์ใช้ `?role=driver`
- ร้าน/ไรเดอร์ที่ได้รับแต่งตั้งตัวแทนเพิ่ม เข้า Dashboard ได้จากปุ่มตัวแทน โดยอ่าน admin_scopes ของบัญชีจริง
- กดปุ่มผิดบทบาทจะเปิดหน้าของบัญชีตน ไม่เพิ่มสิทธิ์ตามพารามิเตอร์
- ผู้ยังไม่อนุญาต LINE ต้องให้ความยินยอมครั้งแรก บัญชีใหม่ยังต้องสมัคร ผู้รออนุมัติ/ถูกระงับไปหน้าบัญชี
- อีเมล/เบอร์+รหัสผ่านยังเป็นทางเข้าสำรอง

## การยืนยันตัวตนและสิทธิ์

หน้า unprotected `/liff/entry` ใช้ useLineSession ซึ่งแลก LINE ID token ใหม่ผ่าน Edge Function line-login เดิมทุกครั้ง ไม่ใช้ session เก่าที่อาจเป็นคนอื่นต่อโดยเงียบ
Edge Function v9 ตรวจ token กับ LINE รวม issuer/audience และเขียน LINE binding ลง app_metadata ฝั่ง server จากนั้น verifyOtp แลก Supabase session ตามเดิม ไม่รับ LINE ID ดิบจาก URL เพื่อออก session

backoffice_session_valid ตรวจ auth.sessions ว่า session_id เป็นของ auth.uid จริง ยังไม่ถูกลบ/หมดอายุ และ auth.users ไม่ถูก ban จากนั้นรับ AMR password หรือ AMR otp ที่ raw_app_meta_data.line_user_id (server-controlled) ตรง profiles.line_user_id ไม่ใช้ raw_user_meta_data หรือ claims บทบาทจากผู้เรียก
anonymous ไม่มี EXECUTE; authenticated ได้เฉพาะ boolean ของตน ฟังก์ชันใช้ SECURITY DEFINER เพราะต้องอ่าน private auth tables ตั้ง search_path ว่างและไม่มี argument สำหรับเลือก user/session อื่น

requireRole ยังตรวจบทบาท/admin_scopes เหมือนเดิม เปลี่ยนเฉพาะด่านรหัสผ่านเป็นด่านเซสชันที่ยืนยันแล้ว และ fail closed เมื่ออ่านไม่ได้
agent_dashboard_access คง can_admin_tambon, approved, suspended_at และ RLS เดิม เปลี่ยนเฉพาะการรับ LINE session ไม่มีการเปลี่ยน role/scope/ข้อมูลบัญชีผู้ใช้จริง

## การตรวจ

- SQL rollback: 20 identity/session/scope cases รวม editable metadata, LINE mismatch, missing/malformed/other-user/expired/revoked session, approval/suspension, password regression และ authenticated/anon ACL
- Dashboard SQL regression เดิม19 cases ผ่านใน transaction เดียวกันแล้ว rollback ไม่มี fixtures ค้าง
- Offline UI/guard: ครบ5 stored roles (adminและตัวแทนใช้roleเดียวกัน), multi-role admin scope, wrong-role menu, denied exchange/stale account, initial consent, new/suspended account, failed session checks
- Login account switch regression เดิม5กลุ่มยังผ่าน
- หลักฐาน production และ LINE OA ที่อัปเดตภายหลังเก็บใน outputs/line-direct-access ของงาน Codex

## ย้อนกลับ

ก่อนย้อน migration ต้องเผยแพร่เว็บรุ่นก่อนที่ยังใช้ session_used_password ก่อน แล้วคืน agent_dashboard_access ให้ตรวจ session_used_password จาก migration D55 เดิม จึงค่อยลบ backoffice_session_valid
เก็บเมนูก่อนเปลี่ยนลิงก์และaliasesไว้ ไม่ลบเมนูเก่าและไม่แก้workflow n8n หรือการ์ดการเงินเดิม

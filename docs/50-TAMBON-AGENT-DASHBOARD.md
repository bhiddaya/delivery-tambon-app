# D55 — Dashboard งานตัวแทนตำบล

## วิธีใช้เมื่อเผยแพร่แล้ว

เปิด `/admin/workspace` ด้วยบัญชีตัวแทนที่ได้รับแต่งตั้ง ผ่าน LINE ที่ยืนยันแล้วหรือรหัสผ่าน
ผู้ดูแลหลายพื้นที่เลือกได้เฉพาะตำบลที่มีสิทธิ์ ใช้ลิงก์ `?t=<slug>` เปิดพื้นที่นั้นโดยตรงได้

- ดูออเดอร์วันนี้ งานค้าง ร้านเปิด ไรเดอร์ออนไลน์ และยอดรอจ่าย
- กดดูออเดอร์ ร้านค้า/ไรเดอร์ สมาชิก หรือการเงิน เพื่อทำรายการในหน้าเดิม
- กด **บันทึกงานใหม่** ระบุเรื่อง ประเภท รายละเอียด และกำหนดเสร็จถ้ามี
- กด **เริ่มทำ / รอประสาน / งานเสร็จ / เปิดงานอีกครั้ง** และบันทึกความคืบหน้า
- กดติดตามจากการ์ดออเดอร์เพื่อผูกเรื่องกับออเดอร์ในตำบลเดียวกัน
- ดูประวัติและกรองงานตามสถานะ งานหน้าละ 100 รายการ ประวัติล่าสุด 50 รายการ

หน้านี้มีเฉพาะงานดิลิเวอรี่ ไม่มีคำสั่ง Agent หรือข้อมูลระบบเทคนิค
ปุ่มงานเสร็จปิดเฉพาะเรื่องติดตาม การยืนยันเงินและสถานะจัดส่งยังใช้ขั้นตอนเดิม

## ข้อมูลสดและความจำกลาง

บันทึกลง Delivery ก่อน แล้วโหลดผลจริงกลับทันที หน้าอื่นในพื้นที่รับ Supabase Realtime
มีการรีเฟรชสำรองทุก 30 วินาทีขณะเปิดหน้า และโหลดใหม่เมื่อกลับเข้าแอป/กลับมาออนไลน์
กรณีคำตอบหาย กดลองบันทึกเดิมอีกครั้งใช้ request ID เดิม ไม่สร้างงานหรือประวัติซ้ำ
การแก้พร้อมกันตรวจ version; รายการเก่าเขียนทับรายการใหม่ไม่ได้

หลังข้อมูลเปลี่ยน หน้าเชื่อมสรุปจำนวนและสถานะผ่าน Dashboard Worker ไป AI Memory เดิม
อ่านหน้าที่บันทึกกลับมาตรงกันจึงแสดงว่าเชื่อมสำเร็จ ถ้าส่วนกลางไม่พร้อม บันทึกในตำบลยังอยู่
และลองเชื่อมใหม่ทุกนาทีขณะที่เปิดหน้าออนไลน์ หรือเมื่อเปิดหน้าอีกครั้ง
ระบบนี้ไม่ใช่ตัวประมวลผลเบื้องหลังตลอดเวลาเมื่อปิดทุกหน้า

รายละเอียดบันทึกและชื่อเรื่องเก็บเฉพาะ Delivery ตามสิทธิ์ ไม่ส่งชื่อบุคคล เบอร์โทร ที่อยู่
สลิป เลขบัญชี ยอดเงิน หรือข้อความอิสระไปความจำกลาง
Worker ใช้เฉพาะจำนวนที่สร้างจาก RPC จริง ไม่รับ path/scope/content จากผู้ใช้
หน้าความจำแยกตำบลและรุ่นข้อมูล `operations/tambons/<uuid>/<revision>.md`

## สิทธิ์และการเปิดใช้

เพิ่ม `agent_work_items` และ `agent_work_events` เปิด RLS; authenticated อ่านตามพื้นที่
ไม่มีสิทธิ์เขียนตารางตรง ใช้ RPC ที่ตรวจการแต่งตั้ง approved/non-suspended/password session ทุกครั้ง
ไม่ใช้ service-role และไม่ให้ตัวแทนเข้าฐาน Hermes หรือความจำทั่วไปของส่วนกลาง
SECURITY DEFINER ที่ advisor แจ้งเป็นการตั้งใจใช้กับข้อมูล private เดิม
ทุกฟังก์ชันตั้ง search_path ว่าง ตรวจพื้นที่ก่อนอ่าน/เขียน และ revoke EXECUTE จาก PUBLIC/anon

Migration `20261012052732_tambon_agent_dashboard.sql` ใช้แล้วใน Delivery วันที่ 12 ต.ค. 2569
เวลา 12:27 น. BKK; ชื่อ/รุ่นตรงกับ `supabase_migrations.schema_migrations`
ทดสอบใน transaction แล้ว rollback ไม่มีบัญชี QA หรืองานทดสอบค้าง
เผยแพร่ Worker ของ `bhiddaya/bavorn-ai-dashboard` (D55 memory bridge) ก่อนเว็บ Delivery
Worker ใช้ AI_MEMORY_MCP_URL และ AI_MEMORY_TOKEN เดิม ไม่เพิ่ม secret ใหม่
เพิ่มทางเข้าใน Dashboard เดิมส่วนลิงก์ตัวแทนตำบล และเมนูหลังบ้าน Delivery

## หลักฐานการตรวจ ณ 12 ต.ค. 2569

- TypeScript และ ESLint ไฟล์ที่แก้ผ่าน
- SQL rollback checks 19 ข้อผ่านก่อนและหลัง migration: scope/RLS, auth, suspension,
  exact retry, optimistic concurrency รวม version ว่าง, private summary, anonymous denial
- `tests/agent-dashboard-ui.test.mjs` ผ่าน 4 กลุ่ม offline: บันทึก/เปลี่ยนสถานะ,
  retry สร้างและแก้, สลับพื้นที่, memory failure แสดงตามจริง
- Node regression 60 tests + PWA 9 tests ผ่าน (มี workflow check ภายในเพิ่มเติม 12 ข้อ)
- Dashboard Worker build ผ่านและ Vitest 66 tests ผ่าน รวม bridge ใหม่ 7 ข้อ
- Production build Delivery compile และ TypeScript ผ่าน แต่ prerender `/admin` ติด
  EPERM mkdir ในเครื่อง Windows นี้; Vercel build ของ PR58 commit e825392 ผ่านแล้ว
- ชุด `rebuilt-ui.test.mjs` เดิมไม่ผ่านเพราะ mock next/navigation ไม่มี useSearchParams
  ตาม QuickFoodOrder ปัจจุบัน ไม่แก้ flow สั่งอาหารนอกขอบเขต D55

PR: Delivery https://github.com/bhiddaya/delivery-tambon-app/pull/58 และ Worker https://github.com/bhiddaya/bavorn-ai-dashboard/pull/31

ยังต้องอนุมัติ merge PR, ตรวจ deployment จริง, บัญชีตัวแทนจริง, การซิงก์จริงจากหน้าเว็บ
และ layout/PWA บนมือถือก่อนถือว่าเปิดใช้ครบ ไม่ได้สร้างออเดอร์ จ่ายเงิน หรือส่ง LINE ในการตรวจ

ทดสอบ UI ใหม่ด้วยเครื่องมือ QA แยกตาม docs/46:
`DELIVERY_QA_TOOLS=<qa-tools-dir> node tests/agent-dashboard-ui.test.mjs`

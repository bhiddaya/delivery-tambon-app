# Delivery PWA — ขอบเขตการส่งเว็บ 4 ตุลาคม 2569

ระดับ B/C: เพิ่มหน้าจอและตรรกะค้นหา พร้อมเปลี่ยนการเปิด PWA และแคช
ผู้ใช้ใหม่เข้าหน้า `/delivery`; ผู้ใช้ที่ล็อกอินแล้วเข้าหน้าบทบาทเดิมจาก `/`
หน้าใหม่มีพื้นที่บริการจาก `tambons`, ค้นหาตำบล/อำเภอ/จังหวัด, แบ่งหน้าละ 12 รายการ,
วิธีสั่ง, สมัครร้านค้า/ไรเดอร์/พื้นที่ใหม่, คำถามที่พบบ่อย และปุ่มติดตั้งพร้อมคำแนะนำ iPhone/Android

## ข้อมูลและสิทธิ์

อ่านเฉพาะ `id,name,slug,district,province,is_active` ผ่าน client เดิมและ RLS
ค้นหาที่เซิร์ฟเวอร์แทนโหลดรายชื่อตำบลทั้งหมดเข้าเบราว์เซอร์
สถานะเปิดตำบลไม่ได้ยืนยันว่าร้านค้าและไรเดอร์พร้อมรับงาน; แสดงคำอธิบายนี้บนหน้า
ไม่ได้เปลี่ยน schema, policy, credential, n8n, LINE หรือข้อมูลธุรกิจ

## PWA

- Manifest เก็บ identity `/` เดิม และเปิด `/delivery` เมื่อกดไอคอนแอป
- ไอคอน any 192/512 และ maskable 512 ใช้ไฟล์เดิม
- ปุ่มติดตั้งใช้ beforeinstallprompt เมื่อ browser รองรับ; หากไม่รองรับ แสดงวิธีติดตั้ง
- หน้า `/offline.html` เป็นหน้าแจ้งสถานะสาธารณะ ไม่มีข้อมูลผู้ใช้และไม่ขึ้นกับ JavaScript
- Service worker v3 เก็บเฉพาะไฟล์สาธารณะและ static assets
- ไม่เก็บ HTML บัญชี/ออเดอร์, RSC, API, request เปลี่ยนข้อมูล หรือ Supabase response
- สั่งและติดตามงานต้องออนไลน์ ไม่มีคิวสั่งออฟไลน์หรือการแจ้ง push ใหม่ในงานนี้
- เปิดให้ผู้ใช้ซูมหน้าจอได้

## ตรวจที่ต้องทำ

```sh
npm run build
node --experimental-strip-types --test tests/delivery-pwa.test.mjs
```

ตรวจ anonymous database read ใน transaction ที่ rollback และ lint ไฟล์ที่เปลี่ยน
ทดสอบ server response, DOM จำลองของปุ่ม/ลิงก์/การติดตั้ง และ GitHub Vercel status
แยกจากการคลิก production, ติดตั้งบนมือถือจริง และ E2E ออเดอร์ซึ่งยังต้องยืนยันแยก

ความเสี่ยง: session/network เดิมยังมีผลต่อหน้าที่ต้องล็อกอิน; PWA ต้องเคยเปิดออนไลน์ก่อนมี fallback
หากผิดพลาด ดู deployment status และ revert commit ตาม `DEPLOYMENT.md`

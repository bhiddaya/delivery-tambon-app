# Deploy บวรไทย Delivery บน Vercel

ใช้ repo เดิม `bhiddaya/delivery-tambon-app` และ Vercel project `delivery-tambon-app-v3`
Production URL: https://delivery-tambon-app-v3.vercel.app

## ก่อนส่งโค้ด

```sh
npm ci
npm run build
node --experimental-strip-types --test tests/delivery-pwa.test.mjs
```

ตรวจ lint ของไฟล์ที่แก้และแยกข้อผิดพลาดเดิมออกจากการเปลี่ยนแปลงใหม่
ตรวจ diff, รายการไฟล์ และข้อมูลลับก่อน push; `.env*`, กุญแจลับ, `.git`, `node_modules` และ runtime ไม่ใช่ไฟล์ส่งมอบ
ตรวจ remote main ล่าสุดและส่งแบบ fast-forward เท่านั้น

## การตั้งค่าบริการ

ใช้ค่าที่ Vercel project เดิมตั้งไว้อยู่แล้ว ไม่คัดลอกข้อมูลลับลง repo
`NEXT_PUBLIC_SUPABASE_URL` และ `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key) ใช้อ่านข้อมูลภายใต้ RLS
กุญแจสำหรับ LINE และ endpoint ผู้ดูแลเป็นค่า server ตาม `README.md` และซอร์สที่เกี่ยวข้อง
ไม่เปลี่ยน DNS, credential, auth หรือ migration ด้วยคำสั่ง deploy หน้าเว็บ

## หลังส่งโค้ด

1. อ่าน commit ของ main กลับจาก GitHub
2. ตรวจ GitHub status `Vercel` ให้เป็น success และต้องตรงกับ commit ที่ส่ง
3. ตรวจ `/`, `/delivery`, ค้นหาพื้นที่, เข้าหน้าตำบล, สมัครและเข้าสู่ระบบบนเว็บจริง
4. ใช้มือถือทดสอบติดตั้ง PWA เปิดจากไอคอน แล้วลองตัดอินเทอร์เน็ตเพื่อดูหน้าออฟไลน์

CI success ยืนยัน deployment แต่ยังไม่ยืนยันว่าตะกร้า การล็อกอิน LINE หรือการส่งของจริงทำงานครบ
หาก browser ถูกปฏิเสธสิทธิ์ ให้รายงานข้อจำกัดและไม่อ้างว่าคลิกผ่าน

## ถอยโค้ด

Revert commit ที่เพิ่มหน้า Delivery/PWA แล้วส่ง commit ใหม่ตามขั้นตอนเดิม ห้าม force push
Service worker v3 จะล้างเฉพาะ cache รุ่นเก่าของแอป ไม่แตะฐานข้อมูล
เมื่อ revert ให้เพิ่มหมายเลข cache รุ่นใหม่อีกครั้งเพื่อให้เครื่องที่ติดตั้งอยู่รับการแก้

เอกสารเก่าระบุว่า repo ยังไม่สร้าง และ API shops deploy แล้ว ซึ่งไม่ตรงกับระบบปัจจุบัน

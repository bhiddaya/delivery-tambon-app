# เริ่มต้นใช้งานบวรไทย Delivery

ตรวจซอร์สใหม่วันที่ 4 ตุลาคม 2569

- GitHub: https://github.com/bhiddaya/delivery-tambon-app
- Vercel project: `delivery-tambon-app-v3` (เชื่อม repo นี้อยู่แล้ว)
- เว็บ: https://delivery-tambon-app-v3.vercel.app
- หน้าเข้าเว็บสาธารณะ: `/delivery` — ค้นหาตำบล วิธีใช้งาน สมัครแต่ละบทบาท และติดตั้ง PWA
- หน้าชุมชน: `/t/<slug>` — รายละเอียดร้าน ข่าว ประกาศ และข้อมูลพื้นที่
- ผู้ใช้ที่เข้าสู่ระบบแล้ว: หน้า `/` ไปหน้าบทบาทเดิม

## รันซอร์ส

```sh
npm ci
npm run build
npm start
```

ตั้งค่า Supabase ในเครื่องหรือ Vercel ตาม `README.md`; ห้าม commit `.env` ทุกชนิดหรือกุญแจลับ
หน้า `/delivery` ยังแสดงคำแนะนำได้เมื่อไม่มีค่าเชื่อมต่อ โดยแจ้งว่ารายการพื้นที่ยังโหลดไม่ได้

## เอกสารที่ตรงกับซอร์ส

- [DEPLOYMENT.md](DEPLOYMENT.md) — ส่งขึ้น GitHub และตรวจ Vercel
- [docs/45-DELIVERY-PWA.md](docs/45-DELIVERY-PWA.md) — ขอบเขต PWA และการตรวจ
- [README.md](README.md) — การตั้งค่าและสถาปัตยกรรม

ฉบับเก่าของ START-HERE ระบุ API `/api/shops` และขั้นตอนสร้าง repo ใหม่ ซึ่งไม่ตรงกับซอร์สปัจจุบัน
โค้ด API shops อยู่ใน `wip/` และไม่ได้ deploy; ไม่ต้องสร้าง repo หรือ Vercel project ซ้ำ

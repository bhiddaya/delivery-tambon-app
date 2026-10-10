# บอท LINE: รับออเดอร์จากหน้า LIFF (order:v1)

สำเนาโค้ดของ Code node ใน n8n (instance pittaya1.app.n8n.cloud) ไว้ให้ตรวจ ทดสอบ และกู้คืน ตัวจริงอยู่ใน n8n ไฟล์ในโฟลเดอร์นี้ต้องตรงกับ node ที่ใช้งานอยู่

| ไฟล์ | อยู่ใน workflow | node |
| --- | --- | --- |
| `read-message.js` | `lx3bNuwJsXSSbrMV` บวรไทย LINE – รับออเดอร์จาก LIFF (order:v1) | อ่านข้อความสั่งซื้อ |
| `build-reply.js` | `lx3bNuwJsXSSbrMV` | สร้างข้อความตอบ |
| `compute-fee-and-pickup.js` | `l2E6ad3OTi9zsyMT` บวรไทย LINE OA v2 (บอทหลัก) | Compute Fee And Pickup |

## ทางเดินของข้อความ "สั่งเลย"

1. ลูกค้ากด "สั่งเลย" ในหน้า `/liff/shop/<id>` ได้ข้อความ `🛒 รายการสั่งซื้อ ... [order:v1 shop=... items=... lat=... lng=...]` ส่งเข้าแชต OA (อัตโนมัติด้วย `liff.sendMessages` หรือกดปุ่ม "เปิด LINE เพื่อยืนยัน")
2. บอทหลัก: จุดแยก `Is LIFF Order?` (หลัง `คืนข้อมูลเหตุการณ์`) ส่งข้อความที่มี `[order:v1 ` ไป workflow ใหม่ ข้อความอื่นไปทางเดิมทั้งหมด
3. workflow ใหม่เรียก `rpc/liff_order` (ฟังก์ชันฐานข้อมูล เรียกได้เฉพาะ service_role ไฟล์ `supabase/migrations/20261011b_liff_order.sql`) สร้างออเดอร์ `food` สถานะ `pending` พร้อมที่อยู่ พิกัด ค่าส่ง
4. ตอบลูกค้าด้วย reply token เดียว: สรุปยอด + ค่าส่ง + ข้อความชำระเงิน + QR พร้อมเพย์ (ถ้ามีพิกัด) หรือปุ่มส่งตำแหน่ง (ถ้าไม่มี แล้วบอทหลักเดิมคิดค่าส่งต่อเมื่อรับตำแหน่ง)
5. ที่เหลือใช้ระบบเดิม: สลิป → ตัวแทนตำบลยืนยัน → ไรเดอร์

## ค่าส่ง

สูตรเดียวกันทุกที่ = `delivery_fee_for(ตำบล, ระยะเส้นตรง กม.)` ในฐานข้อมูล: `delivery_fee_base + delivery_fee_per_km × กม.` (คลองกุ่ม 35 + 10) ปัดเป็นบาท ตำบลที่ยังไม่ตั้งค่าใช้สูตรเดิม 10 + 5/กม. ขั้นต่ำ 15
`compute-fee-and-pickup.js` ทำเรื่องเดียวกันฝั่งบอทหลักสำหรับออเดอร์ที่ลูกค้าแชร์ตำแหน่งในแชต (เฉพาะออเดอร์ `food` ประเภทอื่นคงสูตรเดิม) ต้องดึง `tambons(delivery_fee_base,delivery_fee_per_km)` มาพร้อมแถวร้านใน node `Supabase: Get Merchant For Pickup`

## กู้คืน

- workflow ใหม่: ปิดการใช้งานหรือถอดจุดแยก `Is LIFF Order?` ข้อความจะกลับไปทางเดิม
- บอทหลัก: n8n เก็บประวัติเวอร์ชัน (ก่อนแก้คือ versionId `958db83e-d946-40e2-871b-544b25df82f9`) ใช้ restore ย้อนกลับได้
- ฟังก์ชันฐานข้อมูล: `drop function if exists public.liff_order(text, text);`

## ทดสอบ

`node --test tests/n8n-liff-order.test.cjs tests/n8n-compute-fee.test.cjs`

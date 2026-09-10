# ๔๓ — สถานะเอกสารทุกฉบับ

> เอกสารไหนเชื่อได้ เอกสารไหนเป็นประวัติศาสตร์
> สำรวจเมื่อ 10 กันยายน 2569 · เทียบกับฐานข้อมูลจริง production จริง และ workflow จริง

---

## ทำไมต้องมีเอกสารฉบับนี้

โครงการมีเอกสาร 44 ฉบับ ส่วนใหญ่เขียนช่วงต้นเดือนกันยายน ตอนที่ยังออกแบบระบบด้วยสถาปัตยกรรม
คนละชุดกับที่สร้างจริง เอกสารเหล่านั้นยังอ่านเหมือนเป็นคำสั่งที่ใช้ได้อยู่ ทั้งที่ไม่ตรงกับระบบแล้ว

**อันตรายจริง ๆ ไม่ได้อยู่ที่เอกสารเก่า แต่อยู่ที่เอกสารเก่าที่อ่านเหมือนของใหม่**
AI ที่อ่าน `08-Database-Migrations.sql` แล้วเชื่อ จะไปสร้างตาราง `riders` และ `shops` ขึ้นมาใหม่
ทั้งที่ของจริงชื่อ `drivers` และ `merchants` — ซึ่งเป็นความผิดข้อ ๑ ที่ธรรมนูญห้ามไว้

---

## ความจริงที่ใช้เป็นเกณฑ์ตัดสิน (ตรวจเมื่อ 10 ก.ย. 2569)

- ตารางจริงไม่มี `riders` · `shops` · `products` · `users` · `customers` · `areas`
  ของจริงคือ `drivers` · `merchants` · `menu_items` · `profiles` · `tambons`
- **PostGIS ไม่ได้ติดตั้ง**
- stack จริง: Next.js 16 App Router + React 19 + Tailwind v4 บน Vercel + Supabase
  **ไม่ใช่** create-react-app · **ไม่ใช่** NestJS · **ไม่ใช่** Heroku/Railway/AWS RDS
- ทิศทางการชำระเงินคือ PromptPay · **Xendit ไม่ได้ใช้**
- การใช้งานจริงส่วนใหญ่วิ่งผ่าน LINE OA + n8n (`My workflow 3`, 158 node) ไม่ใช่ผ่านเว็บแอป

---

## ✅ เชื่อได้ — อยู่ใน repo แล้ว

| เอกสาร | เป็นอะไร |
|---|---|
| `00-START-HERE.md` | ทางเข้า · ห้าแหล่งหลักฐาน · แบบ SESSION START REPORT |
| `30-n8n-Usage-Across-Projects.md` | กฎว่างานไหนควรอยู่ใน n8n งานไหนไม่ควร |
| `32-LINE-Login-Bridge.md` | กลไกเข้าสู่ระบบด้วย LINE |
| `33-สิทธิ์การเข้าถึงข้อมูล.md` | ใครเห็นอะไรได้บ้าง |
| `34-ระบบแจ้งเตือน-LINE.md` | ช่องทางแจ้งเตือนสามทาง |
| `36-PROJECT-CONSTITUTION-v2.0.md` | **กฎสูงสุด** (v2.2) |
| `37-CLAUDE-CODE-MASTER-PROMPT.md` | prompt สำหรับเปิด session |
| `38-Local-Search-Architecture.md` | สถาปัตยกรรมการค้นหา |
| `39-SYSTEM-MAP.md` | ระบบสี่ส่วน |
| `40-CURRENT-STATE.md` | สถานะ + คำสั่งตรวจ |
| `41-DECISIONS.md` | ADR |
| `42-SESSION-LOG.md` | บันทึกรอบทำงาน |
| `43-DOC-STATUS.md` | ฉบับนี้ |

เอกสารสองฉบับที่ยังเชื่อได้แต่ยังไม่ได้ย้ายลง repo:
`claude/25-Password-Reset-and-Remember-Me.md` (เขียนใหม่แล้ว 9 ก.ย.) ·
`claude/31-Opening-New-Tambons.md` (ใช้ชื่อตารางจริง)

---

## ⛔ ล้าสมัย — ห้ามใช้เป็นคำสั่ง

อ่านเพื่อรู้ว่าเคยคิดอะไรไว้ได้ **แต่ห้ามทำตาม** และห้ามใช้ยืนยันว่าระบบมีหรือไม่มีอะไร

| เอกสาร | ขัดกับความจริงตรงไหน |
|---|---|
| `00-สถานะโครงการ` | "Delivery Management 🟡 Planning" — ขึ้น production มีออร์เดอร์จริงแล้ว |
| `02-รายชื่อโครงการย่อย` | "สถานะ: กำลังวางแผน" |
| `05-LIFF-Development-Guide` | `create-react-app` · deploy ขึ้น Heroku/Railway |
| `06-Backend-Architecture` | NestJS · Xendit · PostgreSQL + PostGIS |
| `07-API-Specification` | ตอบกลับด้วย `payment_url: checkout.xendit.co` |
| `08-Database-Migrations.sql` | `CREATE EXTENSION postgis` + ตาราง `users` `riders` `shops` `products` |
| `11-Quick-Start-Guide` | docker-compose · `npm run start:dev` · บัตรทดสอบ Xendit |
| `12-Complete-Documentation-Index` | ชี้ไปที่คู่มือ NestJS ว่าเป็นเอกสารอ้างอิงปัจจุบัน |
| `13-Frontend-Component-Templates` | "เชื่อมกับ NestJS backend · ตั้งค่า Xendit" |
| `14-External-Services-Setup-Guide` | "Phase 2: Xendit" · "ติดตั้ง PostGIS" |
| `15-Testing-Strategy-and-Templates` | ทดสอบการสร้าง invoice ของ Xendit บน NestJS |
| `16-Deployment-and-Go-Live-Guide` | AWS RDS · `railway redeploy` · `heroku rollback` |
| `17-Security-and-Compliance-Checklist` | "Xendit integration verified" · ใช้ JWT/NestJS แทน RLS |
| `18-Operations-and-Monitoring-Runbook` | ขั้นตอนถอยคือ `railway redeploy` |
| `22-Phase-2-Supabase-Setup` | `CREATE EXTENSION postgis` · ตรวจตาราง `users` `shops` `products` `riders` |
| `24-Phase-2-API-Implementation` | "API Implementation Complete ✅ (7 ตาราง)" |
| `25-Phase-2-Integration-Steps` | "ใช้งานได้แล้ว: สมัครร้าน ✅ ดูร้าน ✅" |
| `26-Phone-Only-Registration-Support` | อ้างตาราง `users` — ของจริงคือ `profiles` |
| `27-Deploy-Build-Fixes-and-Status` | "ไม่ต้องใส่ `SUPABASE_SERVICE_ROLE_KEY`" — `src/lib/supabase/admin.ts` ใช้อยู่ |
| `28-Deploy-คืออะไร` | "วิธีที่เราใช้อยู่ (ZIP)" — ตอนนี้ deploy อัตโนมัติจาก GitHub |
| `29-โครงสร้างโดเมนและซับโดเมน` | "คอลัมน์ `slug` ยังไม่มี" — `20260903_add_tambon_slug.sql` มีอยู่แล้ว |
| `35-Master-Plan-และสถานะจริง` | ลด n8n เหลือ "สรุปรายวัน + เฝ้าระบบ" — ความจริงคือมันคือระบบหลัก |
| `สถาปัตยกรรมระบบและแผนพัฒนา` | NestJS · PostGIS · Heroku/Railway · Xendit |
| `projects/00-Projects-Overview` | "🟡 Planning" · ยังใช้ชื่อแบรนด์เดิม |

**`35-Master-Plan` ถูกแทนที่ด้วย `40-CURRENT-STATE.md`**

---

## 📜 ประวัติศาสตร์ — เป็นข้อเสนอ ไม่เคยเป็นคำอธิบายระบบ

เอกสารกลุ่มนี้ประกาศตัวเองว่าเป็นแผน/พิมพ์เขียว/ข้อเสนอ ไม่ได้ตั้งใจบอกว่าระบบเป็นอย่างไร
จึงไม่ผิด แต่ก็ใช้อ้างอิงสถานะไม่ได้

`01-คู่มือตัวแทนตำบล` · `03-Glossary-Buddhist-Knowledge-Base` ·
`04-LINE-OA-SuperApp-Architecture` · `09-Backend-Starter-Structure` ·
`10-Development-Roadmap` · `20-แนวคิดใช้ประโยชน์เพื่อชุมชน` ·
`21-Phase-2-Backend-Architecture` · `23-Phase-2-Vercel-API-Structure` ·
`projects/01-Delivery-System/05-Payment-Settlement-Flow` ·
`projects/01-Delivery-System/06-PromptPay-API-Integration` ·
`projects/01-Delivery-System/07-Platform-Payment-Instructions`

---

## กฎการใช้เอกสารเก่า

1. **ห้ามใช้เอกสารในสองกลุ่มล่างยืนยันว่าระบบมีหรือไม่มีอะไร** — ให้ query ของจริง
2. **ห้ามลบทิ้ง** — มันบันทึกว่าเคยคิดอะไรไว้ และบางข้อเสนอจะกลับมามีประโยชน์
3. เมื่อเอกสารเก่าขัดกับระบบจริง **ระบบจริงชนะเสมอ** และให้รายงาน ไม่ใช่แก้ระบบตามเอกสาร
4. ถ้าจะรื้อเอกสารเก่าฉบับไหนขึ้นมาใช้ ต้องเขียนใหม่ทั้งฉบับให้ตรงกับระบบปัจจุบัน
   แล้วให้เลขใหม่ อย่าแก้ทับของเดิม

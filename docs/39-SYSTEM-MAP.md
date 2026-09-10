# ๓๙ — แผนที่ระบบ

> ระบบ **บวรไทย** มีกี่ส่วน อะไรอยู่ที่ไหน และส่วนไหนคนใช้จริง
> ตรวจกับของจริง: 10 กันยายน 2569

---

## ภาพรวม — ระบบมี ๔ ส่วน ไม่ใช่ ๒

```
                        ลูกค้า / ร้าน / ไรเดอร์
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
          ╔══════════════╗                ┌─────────────┐
          ║   LINE OA    ║                │     PWA     │
          ║  (แชท)       ║                │  (เว็บแอป)  │
          ╚══════╤═══════╝                └──────┬──────┘
                 │                               │
                 ▼                               │
        ┌──────────────────┐                     │
        │  n8n Cloud       │                     │
        │  My workflow 3   │                     │
        │  158 node        │                     │
        └────────┬─────────┘                     │
                 │                               │
                 └───────────┬───────────────────┘
                             ▼
                    ┌──────────────────┐
                    │    Supabase      │
                    │  ฐานข้อมูล + RLS │
                    │  + Storage       │
                    │  + Edge Function │
                    └──────────────────┘
```

**สัดส่วนการใช้งานจริง (นับจากออร์เดอร์ทั้งหมดถึง 10 ก.ย. 2569)**

| เส้นทาง | ออร์เดอร์ | คนใช้ |
|---|---:|---:|
| LINE OA → n8n | **34** | **9** |
| PWA | 2 | 2 |

**LINE คือระบบหลักในทางปฏิบัติ ไม่ใช่ทางเข้า**

---

## ๑ LINE OA + n8n — `My workflow 3`

- instance: `pittaya1.app.n8n.cloud`
- workflow id: `pGsVgZOiQ5jYDw2f`
- **158 node · 47 node คุยกับ Supabase · 2 node เรียก AI**
- ตัวกระตุ้น ๓ ตัว: `Webhook` (LINE) · `Schedule Trigger: Daily Settlement` · `Webhook: New Web Application`

### สิ่งที่ทำได้ — ทั้งหมดนี้อยู่ในแชท

| กลุ่ม | node สำคัญ |
|---|---|
| สมัครสมาชิก | `Insert Merchant` · `Insert Driver` · `Insert Job Seeker` |
| ร้านลงสินค้าผ่านแชท | `Insert Pending Menu Item` → `LINE: Download Image` → `Supabase: Upload Photo` → `Insert Menu Item` |
| พิกัด | `Update Merchant GPS` · `Update Driver GPS` · `Update Order Location` |
| คิดค่าส่ง | `Is Ready For Fee?` → `Compute Fee And Pickup` → `Update Order Fee` |
| จ่ายงานไรเดอร์ | `Find Nearest Driver` → `Determine Dispatch` → `Push: Notify Driver` → `Set Order Driver` |
| ปิดงาน | `Is Confirm Receipt?` → `Mark Order Delivered` → `Ask For Rating` |
| ให้คะแนน | `Insert Driver Rating` · `Recalc Driver Rating` · (และฝั่งร้าน) |
| สรุปรายวัน | `Merchant Daily Summary` · `Driver Daily Summary` · `Push: Daily Summary To Recipient` |
| อันดับ | `Get Driver Rankings` · `Get Merchant Rankings` |
| อนุมัติสมาชิกด้วยปุ่มใน LINE | `Approve Profile Via Button` · `Approve WebApp Via Button` |
| ผู้ช่วย AI ของแอดมิน | `Fetch Admin History` → `Admin Stats` → `AI: Admin Assistant` → บันทึกบทสนทนา |
| ทะเบียนสถานที่ | `Get Places By Category` → `Format Places List` |
| PDPA | `Is Privacy Policy?` → `Reply: Privacy Policy` |

### สิ่งที่ **ไม่มี** ใน workflow นี้

- ค้นหาสินค้า/เมนูจากชื่อ (มีแค่ค้นสถานที่ กับ AI ตอบคำถามทั่วไป)

### วิธีตรวจ workflow โดยไม่ทำให้ session หลุด

เปิดหน้า workflow ในเบราว์เซอร์ที่ล็อกอินแล้ว จากนั้นอ่านจาก DOM:

```js
[...document.querySelectorAll('[data-test-id="canvas-node"]')]
  .map(n => n.getAttribute('data-node-name'))
```

**ห้ามเรียก `/rest/workflows/...`** — n8n ตอบ 401 แล้วฆ่า session ของเจ้าของโครงการทิ้ง
(พิสูจน์แล้วสองครั้งเมื่อ 10 ก.ย. 2569)

---

## ๒ PWA — `delivery-tambon-app`

- repo: `bhiddaya/delivery-tambon-app` · production: `delivery-tambon-app-v3.vercel.app`
- Next.js 16 (App Router · middleware อยู่ที่ `src/proxy.ts`) · React 19 · Tailwind v4

| หน้า | ทำอะไร |
|---|---|
| `/customer/...` | ดูร้าน ดูเมนู สั่งของ ส่งของ เรียกรถ |
| `/merchant` | หลังบ้านร้าน — แก้เมนู ราคา รูป ซ่อนสินค้า แก้ข้อมูลร้าน |
| `/driver` | หน้ารับงานไรเดอร์ |
| `/admin` | ตัวแทนตำบล |
| `/api/line/webhook` | webhook ของ LINE **ยังไม่ทำงาน** (ไม่มี token) |
| `/api/admin/reset-password` | ตั้งรหัสผ่านใหม่โดยผู้ดูแล |

**นโยบายทางเข้า:** หน้าหลังบ้าน (ไรเดอร์ · ร้าน · ตัวแทนตำบล · ส่วนกลาง) ต้องเข้าด้วย
เบอร์/อีเมล + รหัสผ่าน · ปุ่ม LINE เข้าได้ทุกคนแต่เห็นเฉพาะหน้าบ้าน
ตัวตัดสินคือฟังก์ชัน `session_used_password()` ที่อ่าน `auth.mfa_amr_claims`

---

## ๓ Supabase

- project ref: `kaeoxqiqonwjoqjoiiho`
- 19 ตารางหลัก + view อันดับ · RLS เปิดทุกตาราง · Storage เก็บรูปเมนู
- Edge Functions: `line-login` (แลก LINE ID token เป็น session) · `notify` (ที่เดียวที่ส่ง LINE ออก)

**ดูรายชื่อตารางจริงเสมอ ห้ามเชื่อเอกสาร:**

```sql
select table_name, string_agg(column_name, ', ' order by ordinal_position)
from information_schema.columns where table_schema='public'
group by table_name order by table_name;
```

---

## ๔ Vercel

deploy อัตโนมัติจาก `main` · ตรวจว่า production ตั้งค่าครบไหม:

```
GET https://delivery-tambon-app-v3.vercel.app/api/line/webhook
```

`configured:false` = ยังไม่ได้ตั้ง `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN`

---

## เส้นแบ่งงานที่ยังไม่ได้ตัดสิน

ปัจจุบัน **n8n ถือทั้งบทสนทนาและตรรกะธุรกิจ** (เงิน สิทธิ์ การสร้างบัญชี)
ซึ่งขัดกับเอกสาร ๓๐ ที่ตกลงกันไว้ว่า *"n8n คือกาว ไม่ใช่แกน"*

ข้อเสนอที่ยังรอเจ้าของโครงการตัดสิน — ดู `41-DECISIONS.md` ADR-004

# บวรไทย — ระบบ Delivery ระดับตำบล

ระบบสั่งอาหาร ส่งของ และเรียกรถ **ภายในตำบลเดียวกัน** โดยคนในตำบล
ค่าส่งถูกกว่า ถึงเร็วกว่า และเงินหมุนอยู่ในชุมชน

ออกแบบให้รองรับได้ถึงระดับ ~7,000 ตำบลทั่วประเทศ โดยแยกข้อมูลแต่ละตำบลที่ชั้นฐานข้อมูล
(`tambon_id`) ไม่ใช่ที่ URL — เว็บเดียวจึงเสิร์ฟได้ทุกตำบล

## เทคโนโลยี

| ส่วน | ใช้ |
|---|---|
| Frontend + API | Next.js 16 (App Router) · React 19 · TypeScript |
| Styling | Tailwind CSS v4 |
| ฐานข้อมูล + Auth | Supabase (PostgreSQL + Row Level Security) |
| Hosting | Vercel |
| ช่องทางผู้ใช้ | PWA + LINE OA / LIFF |

## โครงสร้าง

```
src/
├── app/
│   ├── customer/        ลูกค้า — สั่งอาหาร ส่งของ เรียกรถ ติดตามออร์เดอร์
│   ├── driver/          ไรเดอร์ — รับงาน ดูรายได้
│   ├── merchant/        ร้านค้า — คิวออร์เดอร์ เมนู
│   ├── admin/           ตัวแทนตำบล — อนุมัติสมาชิก ตั้งค่า
│   ├── t/[slug]/        หน้าสาธารณะของตำบล (ไม่ต้องล็อกอิน แชร์ลิงก์ได้)
│   └── api/line/        LINE Messaging API webhook
├── components/          UI ที่ใช้ร่วมกัน + LiffProvider
├── lib/
│   ├── supabase/        client (เบราว์เซอร์) · server (session) · admin (service role)
│   ├── auth-guard.ts    ตรวจบทบาทก่อนเข้าหน้า
│   └── line.ts          ตรวจลายเซ็น webhook · ส่งข้อความ · สร้างลิงก์ LIFF
├── proxy.ts             middleware — รีเฟรช session cookie
└── services/            เรียก API ฝั่ง client

supabase/migrations/     migration ของฐานข้อมูล
wip/                     โค้ดที่พักไว้ ยังไม่พร้อมใช้ (ดู wip/api-shops/README.md)
```

## Environment Variables

| ตัวแปร | จำเป็น | หมายเหตุ |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | ใส่ **publishable key** (`sb_publishable_…`) — เปิดเผยได้ ความปลอดภัยอยู่ที่ RLS |
| `LINE_CHANNEL_SECRET` | เฉพาะ LINE OA | ใช้ตรวจว่า request มาจาก LINE จริง |
| `LINE_CHANNEL_ACCESS_TOKEN` | เฉพาะ LINE OA | ใช้ส่งข้อความกลับ |
| `NEXT_PUBLIC_LIFF_ID` | เฉพาะ LINE OA | รหัส LIFF app |
| `SUPABASE_SERVICE_ROLE_KEY` | ❌ | ไม่มีโค้ดส่วนไหนใช้แล้ว — ทุกหน้าใช้สิทธิ์ผู้ใช้/สาธารณะผ่าน RLS |

> ⚠️ ตัวแปรที่ขึ้นต้น `NEXT_PUBLIC_` ต้องตั้ง Type เป็น **Config** ใน Vercel
> ถ้าตั้งเป็น Secret จะไม่ถูกส่งให้ build ค่าจึงไม่ถูกฝังลงโค้ด แล้วแอปจะต่อฐานข้อมูลไม่ได้

> 🔑 **legacy key ถูกปิดถาวรแล้ว** (4 ก.ย. 2569) — anon/service_role แบบ JWT ใช้ไม่ได้อีก
> โปรเจกต์นี้ใช้ระบบ key แบบใหม่เท่านั้น (`sb_publishable_…` / `sb_secret_…`)
> ซึ่งหมุนแยกกันได้ ต่างจาก legacy ที่หมุนทีเดียวโดนทั้งคู่และทำให้เว็บล่ม

## ⚠️ ตั้งค่า Supabase ที่ห้ามแตะ

**Authentication → Sign In / Providers → User Signups → Confirm email ต้อง "ปิด"**

ผู้ใช้ที่สมัครด้วยเบอร์โทรจะได้อีเมลแฝงที่ส่งจริงไม่ได้ (ดู `src/lib/identifier.ts`)
ถ้าเปิด Confirm email ระบบจะพยายามส่งเมลยืนยันไปยังอีเมลแฝงนั้น แล้ว
**การสมัครด้วยเบอร์โทรจะพังทั้งระบบ** — พังแบบเงียบ ๆ ไม่มี error ให้เห็นบนหน้าเว็บ
ผู้ใช้แค่สมัครไม่ผ่านเฉย ๆ และจะโดน rate limit ของผู้ให้บริการเมลตามมา

การยืนยันตัวตนจริงของระบบนี้คือ **ตัวแทนตำบลกดอนุมัติ** (`profiles.approved`)
ไม่ใช่การยืนยันอีเมล จึงไม่ได้สูญเสียอะไรจากการปิดสวิตช์นี้

## รันในเครื่อง

```bash
npm install
cp .env.example .env.local   # แล้วเติมค่า Supabase
npm run dev
```

เปิด http://localhost:3000

**ก่อน deploy ควรทดสอบแบบไม่มี env vars ด้วย** เพื่อจำลองสภาพ deploy ครั้งแรก:

```bash
mv .env.local .env.local.bak && npm run build && mv .env.local.bak .env.local
```

build ต้องผ่าน — โค้ดถูกออกแบบให้สร้าง Supabase client ตอนเรียกใช้จริง ไม่ใช่ตอน import
เพราะ `next build` จะ evaluate ทุก route module

> `next build` ผ่านไม่ได้แปลว่าเว็บใช้ได้ — บั๊กบางแบบ (เช่นชื่อ dynamic segment ชนกัน)
> โผล่ตอนรันเซิร์ฟเวอร์เท่านั้น ควร `npm start` แล้วลองเปิดสักหน้าก่อนเสมอ

## ฐานข้อมูล

migration อยู่ใน `supabase/migrations/` เรียงตามวันที่

RLS เปิดครบทุกตาราง การเข้าถึงคุมที่ policy ไม่ใช่ที่โค้ด:

- ผู้ใช้เห็นออร์เดอร์ของตัวเอง · ไรเดอร์เห็นงานที่รับ · ร้านเห็นออร์เดอร์ของร้าน
- `order_events` เขียนได้เฉพาะ trigger ของระบบ ผู้ใช้อ่านได้เท่าที่เห็นออร์เดอร์แม่
- หน้าสาธารณะ `/t/<slug>` อ่านด้วยสิทธิ์ anon และจำกัดคอลัมน์ด้วย GRANT

## เอกสาร

เอกสารสถาปัตยกรรม แผนพัฒนา และคู่มือตัวแทนตำบล อยู่ใน Claude Project
"โครงการ Delivery" ไม่ได้อยู่ใน repo นี้

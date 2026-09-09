# n8n workflows — บวรไทย

สองไฟล์ในโฟลเดอร์นี้เป็น workflow ที่ import เข้า n8n ได้เลย
(n8n → Workflows → Import from File)

| ไฟล์ | ทำอะไร | ตั้งเวลา |
|---|---|---|
| `daily-summary.json` | สรุปยอดรายวันส่งเข้า LINE ของตัวแทนตำบล | ทุกวัน 18:00 น. (Asia/Bangkok) |
| `health-watch.json` | เช็คว่าระบบยังตอบอยู่ไหม ถ้าเงียบให้เตือน | ทุก 15 นาที |

## ทำไม "ออเดอร์ใหม่" ไม่อยู่ในนี้

ตั้งใจให้อยู่ที่ฐานข้อมูล ไม่ใช่ n8n — ดู
`supabase/migrations/20260905_notify_on_new_order.sql`

เหตุผลสองข้อ:

1. **ความเร็ว** — n8n ที่ poll ทุก 1 นาที แปลว่าไรเดอร์อาจรู้ตัวช้าถึง
   60 วินาที ซึ่งนานเกินไปสำหรับอาหารร้อน database trigger ยิงภายในเสี้ยววินาที
2. **ความทนทาน** — ถ้า n8n ล่ม (เครื่องดับ, container ตาย, ลืมต่ออายุ)
   ออเดอร์ใหม่จะเงียบสนิทโดยไม่มีใครรู้ trigger อยู่ในฐานข้อมูลเดียวกับ
   ที่รับออเดอร์ ถ้ามันตายก็แปลว่าไม่มีออเดอร์ให้แจ้งอยู่แล้ว

ส่วนงานที่ "ช้าได้" — สรุปรายวัน, health check — เหมาะกับ n8n เพราะแก้เงื่อนไข
ได้โดยไม่ต้อง deploy ใหม่ ตัวแทนตำบลอยากเปลี่ยนเวลาส่ง หรืออยากเพิ่มบรรทัด
ในสรุป ก็ลากใน n8n ได้เอง

## ต้องตั้งค่าอะไรก่อนใช้

ทั้งสอง workflow ยิงไปที่ Edge Function `notify` เดียวกัน:

```
POST https://kaeoxqiqonwjoqjoiiho.supabase.co/functions/v1/notify
Header: x-notify-secret: <NOTIFY_SECRET>
Body:   {"action": "daily_summary"}  หรือ  {"action": "health"}
```

**ในไฟล์ JSON มีคำว่า `PUT_NOTIFY_SECRET_HERE` อยู่ ต้องแทนที่ด้วยค่าจริง
หลัง import** (ทางที่ดีกว่า: สร้าง Credential แบบ Header Auth ใน n8n แล้วผูก
กับ node แทนการพิมพ์ค่าลงในไฟล์ตรง ๆ — ไฟล์ workflow มักถูก export
และแชร์ต่อโดยไม่ทันคิด)

ฝั่ง Supabase ต้องมี secrets สองตัว (Dashboard → Edge Functions → Secrets):

- `NOTIFY_SECRET` — ค่าเดียวกับที่ n8n ส่งมาใน header
- `LINE_CHANNEL_ACCESS_TOKEN` — ของ Messaging API channel (2011292213)

และสำหรับ trigger ออเดอร์ใหม่ ต้องมี Vault secrets (Dashboard → Vault):

- `notify_secret` — ค่าเดียวกับ `NOTIFY_SECRET`
- `notify_url` — `https://kaeoxqiqonwjoqjoiiho.supabase.co/functions/v1/notify`

ถ้ายังไม่ตั้ง: trigger จะเงียบ ไม่ error และ `notify` จะตอบว่า not_configured
ระบบสั่งของยังทำงานปกติทุกอย่าง แค่ไม่มีใครได้รับแจ้งเตือน

## ทดสอบก่อนเปิดใช้จริง — สำคัญ

ทุก action รับ `"dry_run": true` ได้ ซึ่งจะคำนวณทุกอย่างและตอบกลับว่า
*จะ* ส่งหาใครบ้าง ข้อความหน้าตาอย่างไร **แต่ไม่ยิงไป LINE จริง**

```json
{"action": "daily_summary", "dry_run": true}
```

ใช้ dry_run ก่อนเสมอ เหตุผลตรงไปตรงมา: LINE Messaging API แบบฟรี
นับโควตาเป็น "จำนวนผู้รับ" ไม่ใช่จำนวนข้อความ — multicast หาไรเดอร์ 50 คน
คือ 50 ข้อความในโควตา workflow ที่ตั้งผิดแล้ววนส่งซ้ำ กินโควตาทั้งเดือน
ได้ในคืนเดียว และที่แย่กว่านั้นคือคนเริ่ม mute LINE OA ของเรา ซึ่งเรียกกลับ
คืนยาก

## สถานะตอนนี้

ยังส่งจริงไม่ได้ — `NOTIFY_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN` และ Vault
ยังไม่ได้ตั้ง และยังไม่มีผู้ใช้คนไหนมี `line_user_id` เพราะ LINE Login
ยังไม่เคยสำเร็จกับบัญชีจริงสักครั้ง พูดอีกอย่างคือ ตอนนี้ยังไม่มีใครให้แจ้ง

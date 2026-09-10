# 34 — ระบบแจ้งเตือน LINE

สร้างเมื่อ 2026-09-05 · โครงการบวรไทย (delivery-tambon-app)

## สามช่องทาง คนละเครื่องมือ

| แจ้งเตือน | ทำด้วยอะไร | ทำไม |
|---|---|---|
| ออเดอร์ใหม่ → ไรเดอร์ในตำบล | Database trigger (`orders_notify_new`) | ต้องเร็วระดับวินาที และต้องไม่ตายพร้อม n8n |
| สรุปรายวัน → ตัวแทนตำบล (18:00 น.) | n8n `daily-summary.json` | ช้าได้ และตัวแทนอยากแก้เงื่อนไขเองโดยไม่ต้อง deploy |
| ระบบมีปัญหา → เตือน (ทุก 15 นาที) | n8n `health-watch.json` | เหมือนกัน |

ทั้งสามยิงเข้า Edge Function เดียวกัน: `notify`
(`https://kaeoxqiqonwjoqjoiiho.supabase.co/functions/v1/notify`)
แยกด้วยฟิลด์ `action`: `new_order` / `daily_summary` / `health`

## เหตุผลที่ "ออเดอร์ใหม่" ไม่ใช้ n8n

1. **ความเร็ว** — n8n ที่ poll ทุก 1 นาที ทำให้ไรเดอร์รู้ช้าได้ถึง 60 วินาที
   นานเกินไปสำหรับอาหาร trigger ยิงภายในเสี้ยววินาที
2. **ความทนทาน** — ถ้า n8n ล่ม ออเดอร์ใหม่จะเงียบสนิทโดยไม่มีใครรู้
   trigger อยู่ในฐานข้อมูลเดียวกับที่รับออเดอร์ ถ้ามันตายก็แปลว่าไม่มี
   ออเดอร์ให้แจ้งอยู่แล้ว

## หลักการที่ยึดไว้

- **แจ้งเตือนล้มเหลว ต้องไม่ทำให้สั่งของไม่ได้** — ทั้งก้อนของ trigger
  อยู่ใน `exception when others then raise warning` ทดสอบแล้วโดย insert
  ออเดอร์ตอนที่ยังไม่ได้ตั้งค่าอะไรเลย: insert ผ่านปกติ
- **"วันนี้" นับตามเวลาไทย ไม่ใช่ UTC** — ไม่งั้นสรุปตอนเย็นจะไม่ตรงกับ
  ที่ตัวแทนตำบลเห็นบนหน้าจอ ซึ่งทำให้เขาเลิกเชื่อรายงาน
- **มี `dry_run` ทุก action** — ต้องใช้ก่อนเปิดจริงเสมอ เพราะ LINE
  นับโควตาฟรีเป็น *จำนวนผู้รับ* ไม่ใช่จำนวนข้อความ multicast หาไรเดอร์
  50 คน = 50 ข้อความ workflow ที่ตั้งผิดกินโควตาทั้งเดือนได้ในคืนเดียว
  และที่แย่กว่าคือคน mute LINE OA ของเรา ซึ่งเรียกคืนยาก
- **ฟังก์ชันช่วยทั้งหมดเป็น SECURITY DEFINER + grant ให้ service_role
  เท่านั้น** — เบราว์เซอร์ของผู้ใช้เรียกไม่ได้ มีแต่ Edge Function
  ที่ถือ secret key

## ไฟล์ที่เกี่ยวข้อง

```
supabase/functions/notify/index.ts
supabase/migrations/20260905_notification_helpers.sql
supabase/migrations/20260905_notify_on_new_order.sql
n8n/daily-summary.json
n8n/health-watch.json
n8n/README.md
```

## ยังส่งจริงไม่ได้ — ต้องตั้งค่า 4 อย่าง

1. Supabase → Edge Functions → Secrets: `NOTIFY_SECRET` (สุ่มเอง)
2. Supabase → Edge Functions → Secrets: `LINE_CHANNEL_ACCESS_TOKEN`
   (ของ Messaging API channel 2011292213)
3. Supabase → Vault: `notify_secret` (ค่าเดียวกับข้อ 1)
4. Supabase → Vault: `notify_url` = URL ของ Edge Function ด้านบน

**และข้อที่ห้า ซึ่งสำคัญที่สุด:** ตอนนี้ยังไม่มีผู้ใช้คนไหนมี `line_user_id`
เพราะ LINE Login ยังไม่เคยสำเร็จกับบัญชีจริงสักครั้ง (โปรไฟล์ "ลูกค้า LINE"
6 รายเป็นข้อมูลตัวอย่าง ไม่มี auth.users) พูดตรง ๆ คือ **ต่อให้ตั้งค่าครบ
ทั้งสี่ข้อ ก็ยังไม่มีใครให้แจ้ง** ต้องแก้ LINE Login ให้ผ่านก่อน

## หมายเหตุความปลอดภัย

`LINE_CHANNEL_SECRET` และ `LINE_CHANNEL_ACCESS_TOKEN` เคยหลุดออกมาใน
เอาต์พุตของเครื่องมือระหว่างการพัฒนา — ควร re-issue ทั้งสองค่าก่อนนำไปตั้ง

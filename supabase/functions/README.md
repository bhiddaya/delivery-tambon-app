# Supabase Edge Functions

โค้ดในโฟลเดอร์นี้ **ไม่ได้รันบน Vercel** — รันบน Deno ที่ Supabase
จึงใช้ API คนละชุดกับแอป Next.js (`Deno.env`, `import` แบบ `jsr:` / `npm:`)

ด้วยเหตุนี้ `tsconfig.json` ของโปรเจกต์จึง **exclude โฟลเดอร์นี้ทิ้ง**
ถ้าไม่ exclude `next build` จะ fail ด้วย `Cannot find name 'Deno'`
ซึ่งไม่ใช่บั๊กจริง — แค่เอา type ของ Node/เบราว์เซอร์ไปตรวจโค้ด Deno

**ผลข้างเคียงที่ต้องรู้: `npm run build` ไม่ตรวจไฟล์ในนี้ให้**
แก้อะไรตรงนี้แล้วต้อง deploy ขึ้นไปทดสอบจริงเสมอ

## line-login

แลก ID token ของ LINE เป็น session ของ Supabase — รายละเอียดอยู่ในหัวไฟล์

ทดสอบว่าตั้งค่าครบไหมโดยไม่ต้องมี token จริง:

```
https://<project-ref>.supabase.co/functions/v1/line-login?probe=1
```

ต้องได้ `"probe":"ok"` — ถ้าได้ `"failed"` แปลว่า secret key ที่ฟังก์ชันหยิบมา
ใช้เรียก API ไม่ได้ (ดูคำอธิบายเรื่อง legacy key ในหัวไฟล์ `index.ts`)

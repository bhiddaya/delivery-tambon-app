# LINE Agent ระยะที่ 1: อ่านอย่างเดียว + ร่าง PR

สั่งงานพัฒนาโปรเจกต์จาก LINE OA โดยผู้ดูแลระดับ superadmin และ admin เท่านั้น

## ทำอะไรได้ / ไม่ได้

| ทำได้ | ทำไม่ได้ (ระยะที่ 1) |
|---|---|
| อ่านไฟล์ ค้นโค้ด ดูรายชื่อไฟล์ในโปรเจกต์ | แก้ฐานข้อมูลหรือ migration |
| อธิบายโค้ดและตอบคำถามจากโค้ดที่อ่านจริง | แก้ workflow n8n หรือ publish |
| เขียนไฟล์ใน `src/` และ `docs/` แล้วเปิด **PR แบบ draft** (ไม่เกิน 10 ไฟล์ ต่องาน) | merge, deploy, push เข้า `main` |

PR ที่ได้จะเป็น draft เสมอ เจ้าของตรวจบน PC แล้วค่อย merge เอง

## การทำงาน

1. ข้อความ LINE ที่ขึ้นต้นด้วย `งาน` ถูก n8n ส่งมาที่ `POST /line-event` พร้อม header `x-bridge-secret`
2. บริการตรวจ LINE ID กับ `line_staff_level` ที่ฐานข้อมูลอีกครั้ง (ไม่เชื่อค่าจาก n8n)
3. ถ้าระดับเป็น `superadmin` หรือ `admin` จึงสร้างพื้นที่งานใหม่จาก `origin/main` แล้วให้ Claude ทำงานผ่านเครื่องมือ 5 ตัว
4. ส่งผลกลับ LINE ด้วย push message พร้อมลิงก์ PR ถ้ามี แล้วลบพื้นที่งาน

ทีละงาน (คิวเดียว) จำกัด 20 งานต่อคนต่อวัน และ 12 ขั้นตอนต่อคำสั่ง

## Environment (ตั้งใน Render)

มีแค่ 2 ค่าที่ต้องใส่เอง: `BRIDGE_SECRET` และ `GITHUB_TOKEN` ค่าอื่นมีค่าเริ่มต้นแล้ว

การเรียก LINE, Supabase และ OpenRouter ผ่าน webhook ของ n8n ซึ่งใช้ credential เดิมที่มีอยู่แล้ว บริการนี้จึงไม่ต้องเก็บคีย์เหล่านั้น

## n8n ที่ต้องมี (workflow "LINE Agent Bridge (n8n proxy)")

- `POST /webhook/agent-staff-level` ตรวจระดับผู้ดูแลผ่าน `line_staff_level`
- `POST /webhook/agent-push` ส่งข้อความ LINE แบบ push
- `POST /webhook/agent-llm` ส่งคำขอ chat completions ไป OpenRouter

ทั้งสามตรวจ header `x-bridge-secret` ก่อนทำงาน

## Deploy บน Render

- Root Directory: `line-agent`
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/health`
- Runtime: Node 20 หรือใหม่กว่า

## ทดสอบในเครื่อง

```bash
cd line-agent
npm test
```

## ต่อกับ n8n (ยังไม่ได้ทำ ต้อง publish)

เพิ่มก่อนขั้นตอน Jev ใน workflow LINE หลัก:
- IF: ข้อความตรงกับ `^งาน[\s:：]` หรือ `^งานช่วยเหลือ`
- True: HTTP Request `POST {BRIDGE_URL}/line-event` ส่ง JSON `{ "userId": "...", "text": "..." }` พร้อม header `x-bridge-secret`
- False: ไปขั้นตอนเดิมทุกอย่าง

## ความปลอดภัย

- เส้นทางไฟล์ถูกกรอง ไม่ให้ออกนอกโปรเจกต์ และไม่อ่าน `.env`, key, token หรือไฟล์ที่มีคำว่า secret/service role
- เขียนได้เฉพาะ `src/` และ `docs/` ไม่มี shell และไม่มีเครื่องมือเขียนฐานข้อมูล
- ข้อความจาก LINE, ไฟล์ และผลเครื่องมือถูกปฏิบัติเป็นข้อมูล ไม่ใช่คำสั่งระบบ
- Log ไม่บันทึก LINE ID ตรง ๆ (เก็บเป็น hash) และไม่บันทึกเนื้อหางาน
- Token ของ GitHub ถูกฝังใน remote URL ของพื้นที่คัดลอกบน server ซึ่งเป็นพื้นที่ชั่วคราว ควรใช้ fine-grained token ที่จำกัดเฉพาะ repo นี้

## ข้อจำกัดที่รู้อยู่

- โควตาต่อวันเก็บในหน่วยความจำ จะรีเซ็ตเมื่อ server รีสตาร์ต
- ยังไม่มีปุ่มยืนยันก่อนเปิด PR (ระยะที่ 2)
- ระดับ `tambon_agent` ยังไม่เปิดใช้

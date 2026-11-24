# ติดตั้ง counsel-pwa บน Hostinger VPS (srv2091778, Docker)

VPS นี้รันทุกอย่างใน Docker และมี Caddy (`qdrant-caddy-1`) ถือพอร์ต 80/443 อยู่แล้ว จึงไม่ติดตั้ง Node หรือ Caddy เพิ่มบนเครื่อง
โดเมน `*.srv2091778.hstgr.cloud` ชี้มาที่ VPS อยู่แล้ว ใช้ `counsel.srv2091778.hstgr.cloud`

## 1. วางโค้ด
คัดลอกโฟลเดอร์ `counsel-pwa` ไปไว้ที่ `/opt/counsel-pwa` (ไม่รวม `node_modules`)

## 2. ค่าลับ
```bash
cp /opt/counsel-pwa/deploy/counsel-pwa.env.example /opt/counsel-pwa/.env
chmod 600 /opt/counsel-pwa/.env
nano /opt/counsel-pwa/.env   # GEMINI_API_KEY, INVITE_TOKEN (openssl rand -hex 24), CF_ACCOUNT_ID, CF_API_TOKEN, QDRANT_READ_KEY, LLM_BRIDGE_SECRET
```
- `QDRANT_READ_KEY` ใช้ค่า `QDRANT__SERVICE__READ_ONLY_API_KEY` จาก `/opt/qdrant/.env`
- `LLM_BRIDGE_SECRET` ใช้ค่า `x-bridge-secret` ของ workflow n8n "LINE Agent Bridge (n8n proxy)" (Haiku ในโหมดถามธรรมะเรียก OpenRouter ผ่าน n8n)

## 3. พรอมต์สองโหมด (มาจาก `dhamma.prompts` โปรเจกต์ `kaeoxqiqonwjoqjoiiho`)
- `prompt/counsel.txt` = `select body from dhamma.prompts where mode = 'counsel' and active;`
- `prompt/dhamma.txt` = body ของ `common` ขึ้นบรรทัดว่าง แล้วต่อด้วย body ของ `buddhayana`

ตรวจไฟล์กับฐานข้อมูลด้วย md5: `md5(body)` ของ counsel และ `md5(common || E'\n\n' || buddhayana)` ต้องตรงกับ `md5sum` ของไฟล์ (ไม่มีขึ้นบรรทัดท้ายไฟล์)

- โหมดปรึกษา: Gemini ตอบเองด้วย `counsel.txt` + กติกาเสียงในโค้ด (`COUNSEL_RULES`)
- โหมดถามธรรมะ: Haiku เรียบเรียงด้วย `dhamma.txt` แล้ว Gemini อ่านออกเสียง (`DHAMMA_READER`)

## 4. เปิดบริการ
```bash
cd /opt/counsel-pwa && docker compose up -d --build
docker logs counsel-pwa --tail 20    # ต้องเห็น "listening on 8080 + teachings search"
```

## 5. เปิด HTTPS
เพิ่มบล็อกนี้ท้าย `/opt/qdrant/Caddyfile` (สำรองไฟล์ก่อน) แล้วตรวจและโหลดใหม่
```
counsel.srv2091778.hstgr.cloud {
	encode gzip
	reverse_proxy counsel-pwa:8080
}
```
```bash
cp /opt/qdrant/Caddyfile /opt/qdrant/Caddyfile.bak-$(date +%Y%m%d-%H%M%S)
docker exec qdrant-caddy-1 caddy validate --config /etc/caddy/Caddyfile
docker exec qdrant-caddy-1 caddy reload --config /etc/caddy/Caddyfile
```

## 6. ทดสอบ
- เปิด `https://counsel.srv2091778.hstgr.cloud` บนมือถือ ใส่รหัสเชิญ แล้วลองทั้งสองโหมด
- โหมดถามธรรมะ ต้องเห็น "ที่มาที่ค้นเจอ" บนจอก่อนเสียงตอบ
- ยังไม่เปลี่ยนปุ่มในริชเมนู จนกว่าเจ้าของจะอนุมัติ

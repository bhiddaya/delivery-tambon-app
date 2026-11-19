# ตอบกลับเป็นเสียงพูด (LINE OA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ผู้ใช้ส่งข้อความเสียงมา → บอทตอบเป็นเสียงพูดไทยสั้น ๆ + ข้อความเดิม ใน reply เดียว

**Architecture:**
- Hermes router (FastAPI บน Render) ได้ `POST /tts` ใหม่ทำหน้าที่ 4 อย่าง
  - แปลงข้อความเป็นภาษาพูดด้วย `to_spoken`
  - สังเคราะห์เสียง ใช้ edge-tts ก่อน ถ้าล้มค่อยใช้ Paxa
  - เก็บไฟล์ mp3 ใน Supabase Storage bucket `tts`
  - คืน URL และความยาวเสียง
- n8n มีตัวช่วยกลาง "ตอบพร้อมเสียง" ที่บริการต่าง ๆ เรียกแทนการตอบ LINE เอง
  - ถ้าทำเสียงไม่สำเร็จ ให้ตอบข้อความตามเดิม

**Tech Stack:** Python 3.11, FastAPI, `edge-tts`, `httpx`, `mutagen`, supabase-py storage, n8n (Hostinger), LINE Messaging API

**Spec:** `docs/superpowers/specs/2026-11-19-line-voice-reply-design.md` (repo delivery-tambon-app) — อ่านคู่กับแผนนี้

## Global Constraints
- **เมื่อไหร่ตอบเสียง:** เฉพาะเมื่อผู้ใช้พูดมา (`voice === true`) ถ้าพิมพ์มาให้ตอบข้อความเหมือนเดิมทุกไบต์
- **ห้ามบอทเงียบ:** ถ้า TTS, Hermes หรือ storage ล้ม หรือรวมกันเกิน 8000 ms ต้องส่งข้อความเดิม
- **LINE audio:**
  - `originalContentUrl` ต้องเป็น HTTPS และเป็น mp3
  - ต้องมี `duration` เป็นมิลลิวินาที
  - reply หนึ่งครั้งได้ไม่เกิน 5 ข้อความ ถ้ามีครบ 5 แล้วไม่ต้องใส่เสียง
- **Paxa:**
  - ถูกเรียกเฉพาะเมื่อ edge ล้ม หรือคำขอระบุ `provider: "paxa"` และต้องมี env `PAXA_API_KEY`
  - ใช้ได้เฉพาะ `lang` ใน `th`, `en`, `zh`
- **ห้ามวาง key หรือ token ในแชต หรือใน repo:** `PAXA_API_KEY` เจ้าของใส่เองใน Render
- **ทดสอบ n8n:** ห้ามยิง reply token ปลอมไปที่ LINE จริง (จะส่งอีเมลเตือนถึงเจ้าของ) ให้ pin โหนดตอบ LINE ไว้ หรือให้เจ้าของพูดจริงใน LINE
- **ต้องขออนุมัติเจ้าของก่อน:** apply migration บน production, merge หรือ push, publish workflow ที่ใช้งานจริง
- **ลำดับ router:** ตรวจลายเซ็น LINE ก่อนเสมอ ห้ามย้ายลำดับนี้
- **Hermes repo:** `C:\Users\pittaya\hermes-router`
  - ตอนนี้ checkout อยู่บน `fix/admin-owner-approval-migration-old` ให้แตก branch ใหม่ `feat/tts` จาก `origin/main` (800df22)
- **Dockerfile:** มีบรรทัด `COPY main.py .` อย่างเดียว ไฟล์ใหม่ต้องเพิ่มใน COPY ด้วย

## Review Focus
1. **ข้อความไทยมีทศนิยม** เช่น "3.50 บาท" ห้ามกลายเป็นเวลา → test `test_decimal_not_time` (Task 2)
2. **ข้อความที่มีแต่ลิงก์หรืออีโมจิ:** `to_spoken` คืน `""` แล้ว `/tts` ต้องตอบ 422 ไม่ใช่เสียงว่าง → `test_tts_empty_after_spoken_422` (Task 4)
3. **ข้อความเดิมซ้ำ:** ต้องได้ path เดิม และอัปโหลดทับได้ ไม่ใช่ error 409 → `test_same_text_same_path` (Task 4)
4. **edge ค้าง (ไม่ตอบ):** ต้องหมดเวลาใน 6 วินาทีแล้วไปลอง Paxa → `test_edge_timeout_falls_back` (Task 3)
5. **บริการส่ง flex message ไม่มี `text`:** ตัวช่วยต้องใช้ `altText` ไม่ใช่ส่งเสียงว่าง → เคสทดสอบที่ 3 ใน Task 6

---

### Task 1: เสียงตัวอย่างให้เจ้าของเลือก (spike ไม่ commit)

**Files:** scratchpad เท่านั้น
**Interfaces:**
- Produces: ค่า `TTS_VOICE_TH` และ `TTS_RATE` ที่เจ้าของเลือก
- Produces: เวอร์ชัน `edge-tts` ที่ใช้ได้จริง (ใช้ pin ใน Task 3)

- [ ] **Step 1:** สร้าง venv ใน scratchpad แล้ว `pip install edge-tts` ตามด้วย `edge-tts --list-voices | grep th-TH` คาดว่าจะเห็น `th-TH-NiwatNeural` และ `th-TH-PremwadeeNeural`
- [ ] **Step 2:** สร้างไฟล์ 4 ไฟล์ด้วยประโยค "สวัสดีครับ ร้านเปิดแปดโมงเช้าถึงเที่ยงครึ่ง วันนี้ส่งฟรีในตำบลคลองกุ่ม รายละเอียดอ่านในข้อความได้เลยครับ"
  - เสียง Niwat และ Premwadee อย่างละ 2 ความเร็ว คือ `--rate=-5%` และ `--rate=-10%`
  - ชื่อไฟล์ `niwat-5.mp3` `niwat-10.mp3` `premwadee-5.mp3` `premwadee-10.mp3`
- [ ] **Step 3:** ตรวจว่าความยาวเสียงคำนวณถูก
  - `duration_ms = bytes/6` ต้องใกล้ค่าจาก `mutagen.mp3.MP3(path).info.length*1000` ไม่เกิน ±5%
  - ถ้าไม่ใกล้ แสดงว่า bitrate ไม่ใช่ 48k ให้ใช้ mutagen กับทุกผู้ให้บริการใน Task 3
- [ ] **Step 4:** ส่งไฟล์ทั้ง 4 ให้เจ้าของฟังด้วย SendUserFile แล้วรอให้เลือกเสียงและความเร็ว
  - **ขั้นนี้ต้องรอเจ้าของ:** ถ้าเจ้าของเลือก Premwadee คำลงท้ายใน Task 2 ต้องเปลี่ยนเป็น "ค่ะ"

### Task 2: `to_spoken` แปลงเป็นภาษาพูด

**Files:**
- Create: `hermes-router/tts.py`
- Test: `hermes-router/test_tts.py`

**Interfaces:**
- Produces:
  - `thai_number(n: int) -> str` (0–99)
  - `spoken_time(h: int, m: int) -> str`
  - `to_spoken(text: str, ending: str = "ครับ", limit: int = 200) -> str`

- [ ] **Step 1: เขียน test ที่ต้องล้มก่อน** (`test_tts.py`)

```python
import pytest
from tts import to_spoken, spoken_time, thai_number
TAIL = "รายละเอียดอ่านในข้อความได้เลยครับ"

def test_thai_number(): assert [thai_number(n) for n in (1, 11, 15, 21, 45)] == ["หนึ่ง", "สิบเอ็ด", "สิบห้า", "ยี่สิบเอ็ด", "สี่สิบห้า"]
@pytest.mark.parametrize("h,m,want", [(8,0,"แปดโมงเช้า"), (12,30,"เที่ยงครึ่ง"), (14,15,"บ่ายสองโมงสิบห้านาที"),
    (19,0,"หนึ่งทุ่ม"), (0,0,"เที่ยงคืน"), (5,30,"ตีห้าครึ่ง"), (16,0,"สี่โมงเย็น"), (16,30,"สี่โมงครึ่ง"),
    (13,0,"บ่ายโมง"), (7,21,"เจ็ดโมงยี่สิบเอ็ดนาที"), (23,0,"ห้าทุ่ม")])
def test_spoken_time(h, m, want): assert spoken_time(h, m) == want
def test_times_in_text():
    out = to_spoken("เปิด 08:00 ถึง 12.30 น.")
    assert "แปดโมงเช้า" in out and "เที่ยงครึ่ง" in out and "08" not in out and "น." not in out
def test_decimal_not_time(): assert "3.50" in to_spoken("ราคา 3.50 บาท")
def test_strips_markup():
    out = to_spoken("**สำคัญ** ดู https://x.co/a 😀\n- ข้อแรก\n1. ข้อสอง [1]")
    for bad in ("*", "http", "😀", "- ", "1.", "[1]"): assert bad not in out
def test_abbrev():
    out = to_spoken("19 พ.ย. 2569 ต.คลองกุ่ม อ.เมือง จ.ขอนแก่น 5 กม.")
    for w in ("พฤศจิกายน", "ตำบลคลองกุ่ม", "อำเภอเมือง", "จังหวัดขอนแก่น", "กิโลเมตร"): assert w in out
def test_money(): out = to_spoken("รวม 1,250 บาท ค่าส่ง ฿40"); assert "1250" in out and "฿" not in out and "บาท" in out
def test_long_text_cut():
    out = to_spoken("ข้อความยาว " * 100)
    assert out.endswith(TAIL) and len(out) <= 200 + len(TAIL) + 1
def test_adds_ending(): assert to_spoken("เรียบร้อยแล้ว").endswith("ครับ")
def test_keeps_ending(): assert to_spoken("ได้เลยค่ะ") == "ได้เลยค่ะ"
def test_custom_ending(): assert to_spoken("เรียบร้อยแล้ว", ending="ค่ะ").endswith("ค่ะ")
def test_empty(): assert to_spoken("https://x.co 😀") == ""
```

- [ ] **Step 2:** `cd hermes-router && .venv/Scripts/python -m pytest test_tts.py -q` → FAIL (`ModuleNotFoundError: tts`)
- [ ] **Step 3:** เขียน `to_spoken` ใน `tts.py` ตามกฎใน spec หัวข้อ 2 ทำตามลำดับนี้
  1. ตัด URL, markdown, หัวรายการ, `[n]`, อีโมจิ
  2. แปลงเวลา: `HH:MM` ทุกกรณี ส่วน `HH.MM` แปลงเฉพาะเมื่อตามด้วย `น.`
  3. ขยายตัวย่อ: 12 เดือน, `ต.` `อ.` `จ.` (เมื่อติดชื่อ), `กม.` `ชม.`
  4. ตัวเลข: เอา `,` ในตัวเลขออก และแปลง `฿` เป็นบาท
  5. ยุบช่องว่างและขึ้นบรรทัดให้เหลือช่องว่างเดียว
  6. ตัดความยาวที่ช่องว่างสุดท้าย ไม่เกิน `limit` ถ้าถูกตัด ต่อท้าย " " + TAIL
  7. ถ้าไม่ได้ลงท้ายด้วย ครับ หรือ ค่ะ ให้เติม `ending`
- [ ] **Step 4:** รัน pytest เดิม → PASS
- [ ] **Step 5:** commit `git add tts.py test_tts.py && git commit -m "feat(tts): spoken Thai text formatter"`

### Task 3: ผู้ให้บริการเสียง (adapter)

**Files:**
- Modify: `hermes-router/tts.py`, `hermes-router/test_tts.py`, `hermes-router/requirements.txt`
  - เพิ่ม `edge-tts==<เวอร์ชันจาก Task 1>` และ `mutagen==1.47.0`

**Interfaces:**
- Consumes: env ตามรายการด้านล่าง
  - `TTS_PROVIDER` (ค่าเริ่มต้น `edge`)
  - `TTS_VOICE_TH` (ค่าเริ่มต้นจาก Task 1)
  - `TTS_RATE` (ค่าเริ่มต้นจาก Task 1)
  - `PAXA_API_KEY`
  - `PAXA_VOICE` (ค่าเริ่มต้น `khanomkrok` ถ้าเจ้าของเลือกเสียงหญิงใช้ `nomyen`)
- Produces:
  - `class TTSFailed(Exception)`
  - `async edge_mp3(text: str, voice: str, rate: str) -> bytes`
  - `async paxa_mp3(text: str, voice: str) -> bytes`
  - `voice_for(lang: str) -> str` คืนเสียง edge ตามภาษา 14 ภาษาที่บริการแปลรองรับ
    - ภาษาไทยใช้ `TTS_VOICE_TH` ภาษาอื่นผู้สร้างเลือกจาก `--list-voices`
  - `async synthesize(text: str, lang: str = "th", provider: str | None = None) -> tuple[bytes, str]` คืน (mp3, ชื่อผู้ให้บริการที่ใช้จริง)
  - `duration_ms(mp3: bytes) -> int` ใช้ mutagen ทุกกรณี ยกเว้น Task 1 ยืนยันว่า `bytes/6` แม่นสำหรับ edge

- [ ] **Step 1: เขียน test ที่ต้องล้มก่อน** โดย monkeypatch `edge_mp3` และ `paxa_mp3`
  - `test_edge_first`: edge คืน `b"E"` → `synthesize("x")` ต้องได้ `(b"E", "edge")`
  - `test_paxa_fallback`: edge ยก `TTSFailed` และตั้ง `PAXA_API_KEY` ไว้ → ต้องได้ `(…, "paxa")`
  - `test_no_paxa_without_key`: edge ล้มและไม่มี key → `TTSFailed`
  - `test_paxa_only_th_en_zh`: lang `ja` และ edge ล้ม → `TTSFailed` และต้องไม่มีการเรียก paxa
  - `test_explicit_paxa_then_edge`: เรียกด้วย `provider="paxa"` แล้ว paxa ล้ม → ต้องได้ `(…, "edge")`
  - `test_edge_timeout_falls_back`: edge ค้างด้วย `asyncio.sleep(10)` → ต้องได้ผลจาก paxa ภายในไม่เกินราว 6.5 วินาที
    - ใช้ `monkeypatch.setattr(tts, "EDGE_TIMEOUT", 0.2)` เพื่อให้ test เร็ว
  - `test_duration_ms`: ใช้ไฟล์ mp3 จริงสั้น ๆ จาก Task 1 คัดลอกไปไว้ที่ `tests_data/sample.mp3` ผลต้องอยู่ในช่วง ±5% ของค่า mutagen
- [ ] **Step 2:** รัน pytest → FAIL
- [ ] **Step 3:** เขียนโค้ด
  - ลำดับการลอง = `[provider or TTS_PROVIDER, "edge", "paxa"]` ตัดตัวซ้ำออก และข้าม paxa เมื่อไม่มี key หรือ lang ไม่อยู่ใน `th`, `en`, `zh`
  - ทุกครั้งที่เรียก ครอบด้วย `asyncio.wait_for(…, EDGE_TIMEOUT=6)`
  - `paxa_mp3`: `httpx.AsyncClient().post("https://api.paxalabs.com/v1/tts", headers={"x-api-key": key}, json=…)`
    - ให้ body ใช้ชื่อฟิลด์ตามโหนด Paxa ใน workflow คลิปสั้นที่ใช้งานอยู่ และใส่ `model="paxa-tts-flash-v2"`, `format="mp3"`
    - ยืนยันชื่อฟิลด์ด้วย `get_workflow_details` ก่อน ห้ามเดา
- [ ] **Step 4:** รัน pytest → PASS
- [ ] **Step 5:** commit `feat(tts): edge-tts first, Paxa fallback`

### Task 4: route `POST /tts` + เก็บไฟล์

**Files:**
- Modify: `hermes-router/main.py` (เพิ่ม route ต่อจาก `/projects/{project_id}/memory/hybrid`)
- Modify: `hermes-router/Dockerfile` เปลี่ยน `COPY main.py .` เป็น `COPY main.py tts.py ./`
- Modify: `hermes-router/README.md` (เพิ่มคำอธิบาย endpoint และ env ใหม่)
- Test: `hermes-router/test_router.py`

**Interfaces:**
- Consumes: `tts.to_spoken`, `tts.synthesize`, `tts.duration_ms`, `tts.TTSFailed`, `current_user`, `limiter`, `_too_many`
- Produces:
  - `POST /tts` รับ body `TTSIn{text: str (1..2000), lang: str = "th", provider: Literal["edge","paxa"] | None = None, spoken: bool = True}`
  - ตอบกลับ `{url: str, duration_ms: int, spoken_text: str, provider: str}`
  - `_upload_tts(user: CurrentUser, path: str, data: bytes) -> str` คืน public URL
- Env:
  - `TTS_ALLOWED_USERS`: UUID คั่นด้วยจุลภาค ถ้าว่าง ทุกคนได้ 403
- path ไฟล์: `tts/{sha256(provider_hint + voice + rate + spoken_text)[:32]}.mp3` โดย `provider_hint` = provider ที่ขอ หรือ `TTS_PROVIDER`

- [ ] **Step 1: เขียน test ที่ต้องล้มก่อน**
  - monkeypatch `tts.synthesize` → `(b"\xff"*6000, "edge")`, `tts.duration_ms` → `1000`, `main._upload_tts` → `"https://s/tts/a.mp3"`
  - ตั้ง `TTS_ALLOWED_USERS=ALICE`

```python
def test_tts_requires_token(): assert c.post("/tts", json={"text": "สวัสดี"}).status_code == 401
def test_tts_not_allowed_403(monkeypatch): monkeypatch.setenv("TTS_ALLOWED_USERS", ""); assert c.post("/tts", headers=G, json={"text": "สวัสดี"}).status_code == 403
def test_tts_ok(): r = c.post("/tts", headers=G, json={"text": "เปิด 08:00"}).json(); assert r["url"].startswith("https://") and r["duration_ms"] == 1000 and r["provider"] == "edge" and "แปดโมงเช้า" in r["spoken_text"]
def test_tts_all_failed_503(monkeypatch): ...synthesize raises TTSFailed → 503
def test_tts_empty_after_spoken_422(): assert c.post("/tts", headers=G, json={"text": "https://x.co"}).status_code == 422
def test_tts_translation_too_long_422(): assert c.post("/tts", headers=G, json={"text": "a"*301, "lang": "en", "spoken": False}).status_code == 422
def test_tts_translation_untouched(): r = c.post("/tts", headers=G, json={"text": "Good morning", "lang": "en", "spoken": False}).json(); assert r["spoken_text"] == "Good morning"
def test_tts_too_long_422(): assert c.post("/tts", headers=G, json={"text": "ก"*2001}).status_code == 422
def test_tts_rate_limit_429(): codes = [c.post("/tts", headers=G, json={"text": "สวัสดี"}).status_code for _ in range(31)]; assert codes[-1] == 429
def test_same_text_same_path(): ...two calls same text → _upload_tts got the same path both times
```

- [ ] **Step 2:** รัน `pytest -q` → test ใหม่ FAIL ส่วน test เดิมต้องยังผ่าน
- [ ] **Step 3:** เขียน route
  - `main.py` ต้อง `import tts` แล้วเรียกเป็น `tts.synthesize` หรือ `tts.duration_ms` ห้ามใช้ `from tts import …` ไม่งั้น monkeypatch ใน test จะไม่มีผล
  - เรียงขั้นตอน: ตรวจ allow-list → ตรวจ limit `limiter.check(f"tts:{user.id}", 30, 60)` → ถ้าเกิน `_too_many(wait)` → `limiter.record(key, 60)`
  - เลือกข้อความ: `spoken and lang=="th"` → `to_spoken` ถ้าเป็น `spoken=False` ใช้ข้อความเดิมและต้องไม่เกิน 300 ตัวอักษร
  - จากนั้น synthesize → upload → คืนผล
  - `_upload_tts` ใช้ `_client(user.token).storage.from_("tts").upload(path, data, {"content-type": "audio/mpeg", "upsert": "true"})` แล้วคืน `get_public_url(path)`
- [ ] **Step 4:** รัน `pytest -q` → ทุก test PASS
- [ ] **Step 5:** commit `feat(tts): POST /tts with allow-list, rate limit and storage`

### Task 5: bucket `tts` + ขึ้น production

**Files:**
- Create: `hermes-router/supabase/migrations/20261119120000_tts_bucket.sql`

- [ ] **Step 1:** หา user id ของบอท n8n โดยรัน SQL บน Hermes `vgnauwwoqzdpunavbace`
  - `select id, email from auth.users where email ilike '%bot%' or email ilike '%n8n%'`
  - ถ้าเจอมากกว่า 1 แถว ให้ถามเจ้าของ
- [ ] **Step 2:** เขียน migration
  - `insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('tts','tts',true,1048576,array['audio/mpeg']) on conflict (id) do nothing;`
  - policy insert และ update (เพราะ upsert ต้องใช้ทั้งคู่) บน `storage.objects` เงื่อนไข `bucket_id='tts' and auth.uid() = '<bot uuid>'`
- [ ] **Step 3:** เปิด PR `feat/tts` ใน `bhiddaya/hermes-router` แล้ว **ขออนุมัติเจ้าของ** สำหรับ apply migration และ merge
  - เมื่ออนุมัติ: apply ด้วย `apply_migration` → merge → Render deploy อัตโนมัติ
  - ตรวจว่า `/health` ขึ้นเวอร์ชันใหม่
- [ ] **Step 4:** ตั้ง env ใน Render
  - `TTS_ALLOWED_USERS=<bot uuid>` ถามเจ้าของก่อนว่าใช้ workspace ไหน
  - `TTS_VOICE_TH` และ `TTS_RATE` ใช้ค่าจาก Task 1
  - `PAXA_API_KEY` **เจ้าของใส่เอง** โดยสร้าง key ใหม่ใน Paxa พร้อมเพดานเครดิต
- [ ] **Step 5:** ทดสอบจริงผ่าน execution ใน n8n (Login Hermes แล้วเรียก `/tts` ด้วยข้อความ "ทดสอบ 08:00")
  - ต้องได้ 200 และเปิด `url` แล้วได้ไฟล์ mp3

### Task 6: n8n sub-workflow "ตอบพร้อมเสียง"

**Files:**
- n8n Hostinger: workflow ใหม่
- `n8n/voice-reply/reply-with-voice.json` ใน repo delivery (export เก็บไว้)

**Interfaces:**
- Produces: Execute Workflow input `{replyToken: string, messages: object[], voice: boolean, lang?: string, speakText?: string, spoken?: boolean}`
- ผลลัพธ์: ส่ง LINE reply ไปหนึ่งครั้ง

- [ ] **Step 1:** อ่าน `get_user_preferences` และ SDK reference แล้วคัดลอกการตั้งค่าโหนดตอบ LINE จาก `ตอบฟังเสียงไม่ชัด` ใน router `l2E6ad3OTi9zsyMT` (credential `iHzBgLbvsEddIxq2`)
- [ ] **Step 2:** สร้างโหนดตามลำดับ
  1. Trigger
  2. Code `เตรียมเสียง`: ถ้า `!voice` หรือ `messages.length >= 5` หรือไม่มีคำให้พูด → `skip`
     - คำให้พูด = `speakText` หรือ join `text`/`altText` ของ messages
  3. IF
  4. HTTP `Login Hermes` (credential `Hermes bot login` `2n0MfzWuxgUw15zU` timeout 3000)
  5. HTTP `/tts` (timeout 5000, `neverError`, `onError: continueRegularOutput`)
  6. Code `รวมข้อความ`: ถ้าได้ 200 ให้ prepend `{type:"audio", originalContentUrl:url, duration:duration_ms}` แล้ว `.slice(0,5)` ถ้าไม่ได้ใช้ messages เดิม
  7. HTTP ตอบ LINE
  - ทั้งสองทาง (ใส่เสียงหรือไม่ใส่) ต้องมาจบที่โหนดตอบ LINE โหนดเดียวกัน
- [ ] **Step 3:** ทดสอบด้วย `test_workflow` โดย pin โหนดตอบ LINE ไว้ ใช้ 4 เคส
  1. `voice:false` → messages ออกมาเท่าเดิม
  2. `voice:true` text → ข้อความแรกเป็น audio
  3. `voice:true` flex ที่มี altText → มี audio
  4. Hermes ตอบ 503 → messages เท่าเดิม
- [ ] **Step 4:** export JSON ลง repo แล้ว commit `feat(n8n): reply-with-voice helper`

### Task 7–10: ต่อเข้าบริการทีละจุด (ทำทีละ task และเจ้าของทดสอบด้วยการพูดจริงก่อนไป task ถัดไป)

ทุก task ทำ 4 ขั้นเหมือนกัน
1. หาว่า `voice` (จาก `message.voice` หรือ `nlVoice`) มาถึงโหนดตอบได้ทางไหน
2. เปลี่ยนโหนดตอบ LINE เป็น Execute Workflow "ตอบพร้อมเสียง" โดยส่ง messages ชุดเดิม
3. **ขออนุมัติก่อน publish** แล้ว publish
4. บันทึก versionId ก่อนแก้ไว้สำหรับย้อนกลับ

| Task | จุด | ส่งเพิ่ม | เจ้าของทดสอบโดย |
|------|-----|---------|------------------|
| 7 | router `ตอบฟังเสียงไม่ชัด` | — | พูดเสียงอู้อี้ / ภาษาอื่น |
| 8 | กฎหมาย `LYSRwMo5ysT8IEIG` | — | พูดคำถามกฎหมาย |
| 9 | ธรรมะ `wq9J2lcAcIIKv7x7` | — | พูดเรื่องเครียด |
| 10 | แปล `vEyB7WVsVETMUM94` | `lang` = ภาษาปลายทาง, `speakText` = คำแปล, `spoken:false` | พูด "แปลเป็นภาษาอังกฤษว่า สวัสดีตอนเช้า" |

- [ ] หลัง Task 10: อัปเดตไฟล์ความจำ `project-line-voice-nl-front-door.md` (เวอร์ชัน workflow, env และจุดที่มีเสียงแล้ว)

# ตอบพร้อมเสียง (LINE OA บวรไทย)

- n8n workflow `DRujoPqgXs4e7E72` "บวรไทย LINE – ตอบพร้อมเสียง (ตัวช่วย)" — source: `reply-with-voice.workflow.js` (n8n Workflow SDK)
- เรียกด้วย Execute Workflow: `{replyToken, messages, voice, lang?, speakText?, spoken?}`
- `voice === true` → Login Hermes → `POST https://hermes-router.onrender.com/tts` → audio + ข้อความเดิมใน reply เดียว; ล้มหรือช้า → ข้อความเดิม
- `samples/` เสียงตัวอย่าง edge-tts ให้เจ้าของเลือก (Premwadee ล้มบ่อย จึงใช้ Niwat)
- Spec: `docs/superpowers/specs/2026-11-19-line-voice-reply-design.md` · Plan: `docs/superpowers/plans/2026-11-19-line-voice-reply.md`

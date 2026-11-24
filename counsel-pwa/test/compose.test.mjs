import { test } from "node:test";
import assert from "node:assert/strict";
import { createComposer, finishAnswer } from "../src/compose.mjs";

const sources = [
  { type: "tipitaka", cite: "พระไตรปิฎกฉบับหลวง เล่ม 19 ข้อ 1678 หน้า 422 · ขันธสูตร", text: "ทุกขอริยสัจ คือ อุปาทานขันธ์ ๕" },
  { type: "book", cite: 'หนังสือ "วิถีพุทธ" หน้า 35', text: "อริยสัจ ๔ คือ ทุกข์ สมุทัย นิโรธ มรรค" },
  { type: "sermon", cite: '"ผู้อยู่เหนือความตาย" · การแสดงธรรม · (80ai โลกุตระ เรื่อง ๑)', text: "ไม่ได้ใช้" },
];

test("ตัดคำพูดที่ไม่มีในคลัง เก็บคำพูดที่มีจริง ลบรหัสและหัวข้อแบบฟอร์ม", () => {
  const raw = 'เนื้อหาหลัก:\nอริยสัจมีสี่ข้อ “อริยสัจ ๔ คือ ทุกข์ สมุทัย นิโรธ มรรค” [S2]\n\nที่มาในคัมภีร์: ท่านว่า “ข้อความที่แต่งขึ้นเอง” [S1]';
  const out = finishAnswer(raw, sources);
  assert.equal(out.removed, 1);
  assert.equal(out.text, "อริยสัจมีสี่ข้อ “อริยสัจ ๔ คือ ทุกข์ สมุทัย นิโรธ มรรค”\nท่านว่า");
});

test("ที่มาบนจอเฉพาะชิ้นที่ใช้จริง เรียง หนังสือ ก่อน พระไตรปิฎก", () => {
  const out = finishAnswer("ข้อหนึ่ง [S1] ข้อสอง [S2][S2] รหัสเกิน [S9]", sources);
  assert.deepEqual(out.cites, ['หนังสือ: หนังสือ "วิถีพุทธ" หน้า 35', "พระไตรปิฎก: พระไตรปิฎกฉบับหลวง เล่ม 19 ข้อ 1678 หน้า 422 · ขันธสูตร"]);
});

test("เรียก OpenRouter ตรงเมื่อมีคีย์ ไม่งั้นเรียกผ่าน n8n bridge", async () => {
  const seen = [];
  const fetchFn = async (url, init) => {
    seen.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    return { ok: true, json: async () => ({ choices: [{ message: { content: "ตอบ [S1]" } }] }) };
  };
  const base = { composeModel: "anthropic/claude-haiku-5.5" };
  await createComposer({ ...base, openrouterKey: "or" }, fetchFn)({ systemPrompt: "sys", question: "ถาม", sourcesText: "<sources></sources>" });
  await createComposer({ ...base, llmBridgeUrl: "http://n8n:5678/webhook/agent-llm", llmBridgeSecret: "bs" }, fetchFn)({ systemPrompt: "sys", question: "ถาม", sourcesText: "" });
  assert.equal(seen[0].url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(seen[0].headers.authorization, "Bearer or");
  assert.equal(seen[1].url, "http://n8n:5678/webhook/agent-llm");
  assert.equal(seen[1].headers["x-bridge-secret"], "bs");
  assert.equal(seen[0].body.model, "anthropic/claude-haiku-5.5");
  assert.match(seen[0].body.messages[1].content, /คำถาม: ถาม[\s\S]*2-3 ประโยค/);
});

test("แจ้งข้อผิดพลาดเมื่อ LLM ไม่มีคำตอบ", async () => {
  const fetchFn = async () => ({ ok: true, json: async () => ({ error: { message: "rate limited" } }) });
  const compose = createComposer({ composeModel: "m", openrouterKey: "k" }, fetchFn);
  await assert.rejects(compose({ systemPrompt: "", question: "", sourcesText: "" }), /rate limited/);
});

test("ภาษาที่เลือก: Haiku และ Gemini ตอบภาษานั้น ไม่เลือก = ตามภาษาคำถาม", async () => {
  const { geminiLanguageRule, langOf, languageNote } = await import("../src/compose.mjs");
  assert.match(languageNote("บุญคืออะไร", "en"), /ภาษาอังกฤษเท่านั้น/);
  assert.equal(languageNote("บุญคืออะไร", null), "");
  assert.match(languageNote("What is merit?", null), /ไม่ใช่ภาษาไทย/);
  assert.match(geminiLanguageRule("ja"), /only in Japanese/);
  assert.equal(geminiLanguageRule(null), "");
  assert.equal(langOf("xx"), null);
  assert.equal(langOf("zh"), "zh");
});

test("แปลสด: พรอมต์ล่ามสองภาษา แปลอย่างเดียว", async () => {
  const { interpretPrompt } = await import("../src/compose.mjs");
  const p = interpretPrompt("th", "ja");
  assert.match(p, /Person 1 speaks Thai\. Person 2 speaks Japanese\./);
  assert.match(p, /When you hear Japanese, say the same thing in Thai/);
  assert.match(p, /Interpret only/);
});

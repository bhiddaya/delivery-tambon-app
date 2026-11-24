// Claude Haiku เรียบเรียงคำตอบจาก <sources> ด้วยพรอมต์เดียวกับ LINE
//   ถามธรรมะ: common + buddhayana | ปรึกษา (เมื่อเลือกเสียง Paxa): counsel
// แล้วตรวจแบบเดียวกับ n8n "ตรวจอ้างอิงและจัดรูป": ตัดคำพูดใน “ ” ที่ไม่มีจริงในคลัง และลบรหัส [S#]/[P#]

import { KIND_TH, shortCite } from "./teachings.mjs";
import { isMostlyThai } from "./paxa.mjs";

const RANK = { book: 0, sermon: 1, tipitaka: 2 };

// ความยาวคำตอบ 5 ระดับ (NOVA บน PC เลือกได้ เว็บใช้ระดับ 2)
//   say = กติกาที่บอก Haiku, cap = ตัดท้ายที่ช่องว่างถ้ายาวเกิน (capSpeech), list = ตอบเป็นข้อได้
export const LENGTHS = {
  1: { say: "สั้นมาก 1-2 ประโยค ไม่เกิน 150 ตัวอักษร", cap: 220, list: false },
  2: { say: "กระชับ 2-3 ประโยค ประมาณ 200 ตัวอักษร ห้ามเกิน 300", cap: 420, list: false },
  3: { say: "4-5 ประโยค ไม่เกิน 500 ตัวอักษร", cap: 650, list: false },
  4: { say: "6-8 ประโยค ไม่เกิน 800 ตัวอักษร", cap: 1000, list: true },
  5: { say: "อธิบายละเอียด ไม่เกิน 1,500 ตัวอักษร ให้ความหมายและคำอธิบายครบ", cap: 1800, list: true },
};
export const lengthOf = (level) => LENGTHS[level] || LENGTHS[2];

// คำลงท้ายให้ตรงกับเพศของเสียงที่อ่าน (เสียงผู้ชายพูด "ค่ะ" ฟังเป็นเสียงกะเทย)
export const SPEAKER_RULE = {
  male: "ผู้อ่านคำตอบเป็นเสียงผู้ชาย ใช้คำลงท้าย ครับ แทนตัวว่า ผม ห้ามใช้ ค่ะ คะ ดิฉัน",
  female: "ผู้อ่านคำตอบเป็นเสียงผู้หญิง ใช้คำลงท้าย ค่ะ หรือ คะ แทนตัวว่า ดิฉัน ห้ามใช้ ครับ ผม",
};

// ส่วนท้ายคำถามแต่ละโหมด (แบบเดียวกับ reminder ใน n8n แต่สั้นสำหรับเสียง)
// ผู้ถามพูดภาษาอื่นได้ (หูและปากรองรับหลายภาษา): ตอบภาษาเดียวกับคำถาม แปลเนื้อหาจากต้นฉบับภาษาไทย
const LANGUAGE_RULE =
  "ตอบเป็นภาษาเดียวกับคำถาม ถ้าคำถามเป็นภาษาอื่นให้แปลเนื้อหาจาก <sources> ภาษาไทยเป็นภาษานั้น และคงชื่อเฉพาะภาษาบาลีไว้";

export function spokenRule(mode, level = 2, speaker = null) {
  const voiceRule = SPEAKER_RULE[speaker] ? ` ${SPEAKER_RULE[speaker]}` : "";
  return spokenRuleBase(mode, level).replace(/\)$/, `${voiceRule} ${LANGUAGE_RULE})`);
}

function spokenRuleBase(mode, level) {
  const L = lengthOf(level);
  const shape = L.list ? "ถ้าคำตอบเป็นรายการ ตอบเป็นข้อได้ ข้อละประโยคสั้นพร้อมความหมาย" : "ไม่มีรายการเลขข้อ";
  if (mode === "counsel") {
    return (
      "(ใช้หลัก P1-P6 และ <sources> เป็นฐานคิดหลัก ทุกประโยคที่ให้แนวคิดหรือคำแนะนำต้องมีรหัส [P#] และ/หรือ [S#] " +
      `ระบบจะลบรหัสออกเอง คำตอบนี้จะถูกอ่านออกเสียง เป็นกันเองแบบเพื่อน ภาษาพูด ${L.say} ` +
      `${shape} ไม่ต้องครบทุกส่วนของแบบคำตอบ ไม่ต้องถามกลับ)`
    );
  }
  return (
    `(คำตอบนี้จะถูกอ่านออกเสียง ตอบตรงคำถาม ${L.say} ` +
    `ภาษาพูด ไม่มีหัวข้อแบบฟอร์ม ${shape} ยกคำพูดตรงเฉพาะวลีสั้นที่มีใน <sources> ` +
    "ทุกประโยคที่มาจากต้นฉบับต้องจบด้วย [S#])"
  );
}
export const SPOKEN = { dhamma: spokenRule("dhamma"), counsel: spokenRule("counsel") };

// รหัสทุกรูปที่เจอ: [S2] [P1] [S110, P1] [S1][S2]
const TAG = /\s*\[[^\]]*?\b[SP]\d+[^\]]*\]/g;

// คำตอบดิบจาก Haiku -> ข้อความสำหรับอ่านออกเสียง + ที่มาเฉพาะชิ้นที่ใช้จริง
export function finishAnswer(raw, sources) {
  const norm = (s) => String(s).replace(/\s+/g, "");
  const corpus = sources.map((s) => norm(s.text));
  let removed = 0;
  let text = String(raw || "").replace(/\*\*/g, "");
  // คำตอบภาษาอื่น: คำพูดในเครื่องหมายเป็นคำแปล ไม่มีทางตรงกับต้นฉบับไทย ไม่ตัด (เดิมตัดจนประโยคจีนขาดเป็นช่วง)
  // ความถูกต้องของคำตอบภาษาอื่นตรวจด้วยส่วน "ภาษาอื่น" ในหน้า /lab แทน
  const verifyQuotes = isMostlyThai(text);
  text = text.replace(/“([^”]{4,})”/g, (all, quote) => {
    if (!verifyQuotes) return all;
    const parts = quote.split(/…|\.\.\./).map(norm).filter((x) => x.length >= 4);
    if (parts.length && parts.every((x) => corpus.some((c) => c.includes(x)))) return all;
    removed++;
    return "";
  });
  const tagged = (text.match(TAG) || []).join(" ");
  const used = [...new Set([...tagged.matchAll(/\bS(\d+)\b/g)].map((m) => Number(m[1]) - 1))]
    .filter((i) => sources[i])
    .sort((a, b) => (RANK[sources[a].type] ?? 3) - (RANK[sources[b].type] ?? 3));
  const cites = [...new Set(used.map((i) => `${KIND_TH[sources[i].type] || sources[i].type}: ${shortCite(sources[i].cite)}`))];
  text = text
    .replace(TAG, "")
    .replace(/^\s*(เนื้อหาหลัก|ที่มาในคัมภีร์)\s*:?\s*/gm, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
  return { text, cites, removed };
}

// คำถามที่ไม่มีอักษรไทย: ย้ำชัด ๆ ท้ายคำขอ (ทดสอบแล้วถามภาษาจีน Haiku ยังตอบไทย เพราะต้นฉบับและ prompt เป็นไทย)
// ระบุชื่อภาษาตามตัวอักษร (ทดสอบแล้วถามจีน แต่บอกแค่ "ภาษาเดียวกับคำถาม" Haiku ตอบอังกฤษ) ญี่ปุ่นก่อนจีนเพราะใช้คันจิร่วม
const SCRIPTS = [
  [/[぀-ヿ]/, "ภาษาญี่ปุ่น"],
  [/[가-힯]/, "ภาษาเกาหลี"],
  [/[一-鿿]/, "ภาษาจีน (ตัวอักษรแบบเดียวกับคำถาม)"],
  [/[Ѐ-ӿ]/, "ภาษารัสเซีย"],
  [/[؀-ۿ]/, "ภาษาอาหรับ"],
  [/[ऀ-ॿ]/, "ภาษาฮินดี"],
  [/[຀-໿]/, "ภาษาลาว"],
  [/[က-႟]/, "ภาษาพม่า"],
  [/[ក-៿]/, "ภาษาเขมร"],
];
export const foreignNote = (question) => {
  if (/[ก-๛]/.test(question)) return "";
  const lang = SCRIPTS.find(([re]) => re.test(question))?.[1] || "ภาษาเดียวกับคำถาม";
  return `\n\n(คำถามนี้ไม่ใช่ภาษาไทย ต้องตอบทั้งหมดเป็น${lang}เท่านั้น ห้ามตอบเป็นภาษาไทยหรือภาษาอื่น แม้ไม่พบคำตอบในต้นฉบับก็ให้บอกเป็นภาษานั้น)`;
};

// ภาษาสนทนาที่ผู้ใช้เลือกได้ (เว็บและ NOVA บน PC): [ชื่อในภาษานั้น, ชื่อไทย, ชื่ออังกฤษ]
// ไม่เลือก ("auto") = ตอบตามภาษาที่ผู้ใช้พูด (foreignNote ดูจากตัวอักษร)
export const LANGS = {
  th: ["ไทย", "ไทย", "Thai"],
  en: ["English", "อังกฤษ", "English"],
  zh: ["中文", "จีน", "Chinese (Mandarin)"],
  ja: ["日本語", "ญี่ปุ่น", "Japanese"],
  ko: ["한국어", "เกาหลี", "Korean"],
  lo: ["ລາວ", "ลาว", "Lao"],
  my: ["မြန်မာ", "พม่า", "Burmese"],
  km: ["ខ្មែរ", "เขมร", "Khmer"],
  vi: ["Tiếng Việt", "เวียดนาม", "Vietnamese"],
  hi: ["हिन्दी", "ฮินดี", "Hindi"],
  de: ["Deutsch", "เยอรมัน", "German"],
  fr: ["Français", "ฝรั่งเศส", "French"],
  es: ["Español", "สเปน", "Spanish"],
};
export const langOf = (code) => (LANGS[code] ? code : null);

// คำกำกับท้ายคำขอให้ Haiku: เลือกภาษาไว้ = ตอบภาษานั้นเสมอ ไม่ว่าคำถามเป็นภาษาอะไร
export const languageNote = (question, lang) =>
  LANGS[lang]
    ? `\n\n(ผู้ใช้เลือกภาษาสนทนาเป็นภาษา${LANGS[lang][1]} ต้องตอบทั้งหมดเป็นภาษา${LANGS[lang][1]}เท่านั้น ไม่ว่าคำถามจะเป็นภาษาใด และคงชื่อเฉพาะภาษาบาลีไว้)`
    : foreignNote(question);

// Gemini คุยสด: กติกาภาษาต่อท้าย system prompt
export const geminiLanguageRule = (lang) =>
  LANGS[lang]
    ? `\n\nConversation language chosen by the user: ${LANGS[lang][2]}. Always speak and answer only in ${LANGS[lang][2]}, ` +
      "whatever language the user speaks. Keep proper names and Pali terms as they are."
    : "";

// คำถามภาษาอื่น -> คำค้นภาษาไทยด้วยศัพท์ธรรมะ ก่อนค้นคลัง (คลังเป็นภาษาไทย คำค้นจีน "八明" หา "วิชชา ๘" ไม่เจอ)
// คำตอบยังเป็นภาษาของผู้ถามตามเดิม ถ้าแปลไม่สำเร็จ ค้นด้วยคำถามเดิม
export function createQueryTranslator(config, fetchFn = fetch) {
  const direct = !!config.openrouterKey;
  const url = direct ? "https://openrouter.ai/api/v1/chat/completions" : config.llmBridgeUrl;
  const auth = direct ? { authorization: `Bearer ${config.openrouterKey}` } : { "x-bridge-secret": config.llmBridgeSecret };
  return async function toThaiQuery(question) {
    if (/[ก-๛]/.test(question)) return question;
    try {
      const res = await fetchFn(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...auth },
        body: JSON.stringify({
          model: config.composeModel,
          max_tokens: 200,
          reasoning: { enabled: false },
          messages: [
            {
              role: "user",
              content:
                "แปลคำถามต่อไปนี้เป็นภาษาไทย ใช้ศัพท์ธรรมะและคำบาลีแบบที่ใช้ในพุทธศาสนาไทย " +
                `(เช่น 八明 / eight knowledges = วิชชา ๘) ตอบเฉพาะคำแปลบรรทัดเดียว:\n${question}`,
            },
          ],
        }),
        signal: AbortSignal.timeout(20000),
      });
      const text = (await res.json())?.choices?.[0]?.message?.content?.trim();
      return text && /[ก-๛]/.test(text) ? text.split("\n")[0] : question;
    } catch {
      return question;
    }
  };
}

// เรียก OpenRouter ตรงด้วย OPENROUTER_API_KEY หรือผ่าน n8n bridge (agent-llm) ที่ถือ credential OpenRouter อยู่แล้ว
// -> JSON เต็มของ OpenRouter (choices, model, usage.cost) ใช้ทั้งคำตอบเสียงและ LINE
export function createChat(config, fetchFn = fetch) {
  const direct = !!config.openrouterKey;
  const url = direct ? "https://openrouter.ai/api/v1/chat/completions" : config.llmBridgeUrl;
  const auth = direct ? { authorization: `Bearer ${config.openrouterKey}` } : { "x-bridge-secret": config.llmBridgeSecret };
  return async function chat({ messages, max_tokens = 1500, timeout = 60000 }) {
    const res = await fetchFn(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...auth },
      body: JSON.stringify({ model: config.composeModel, max_tokens, reasoning: { enabled: false }, usage: { include: true }, messages }),
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    const json = await res.json();
    if (!json?.choices?.[0]?.message?.content) throw new Error(json?.error?.message || json?.error?.description || "LLM ไม่มีคำตอบ");
    return json;
  };
}

export function createComposer(config, fetchFn = fetch) {
  const chat = createChat(config, fetchFn);
  return async function compose({ systemPrompt, question, sourcesText, mode = "dhamma", length = 2, speaker = null, lang = null }) {
    const json = await chat({
      max_tokens: length >= 4 ? 3500 : 1500, // ภาษาไทยใช้ token มาก คำตอบยาวต้องเผื่อ
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `${sourcesText}\nคำถาม: ${question}\n\n${spokenRule(mode, length, speaker)}${languageNote(question, lang)}` },
      ],
    });
    return json.choices[0].message.content;
  };
}

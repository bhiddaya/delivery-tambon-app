// เซิร์ฟเวอร์ counsel-pwa: เสิร์ฟหน้าเว็บ PWA และรับ WebSocket สำหรับเสียงสองทาง
// ขั้นแรกใช้โทเค็นเชิญ ยังไม่ผูกกับ LINE Login

import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { findPerson, loadConfig, VOICES } from "./config.mjs";
import { hasCrisisSignal } from "./safety.mjs";
import { createDailyLimiter } from "./ratelimit.mjs";
import { connectGeminiLive, createFakeProvider } from "./provider.mjs";
import { createTeachingSearch, formatSources } from "./teachings.mjs";
import {
  SPEAKER_RULE,
  createChat,
  createComposer,
  createQueryTranslator,
  finishAnswer,
  geminiLanguageRule,
  interpretPrompt,
  langOf,
  lengthOf,
} from "./compose.mjs";
import { LINE_PIECE_CHARS, lineMessages, linePlan, trimTagDumps } from "./line.mjs";
import { checkAttachment } from "./feedback.mjs";
import { createLab, LAB_LANGS, LAB_VOCAB, pcmToWav } from "./lab.mjs";
import {
  ELEVEN_PREFIX,
  PAXA_VOICES,
  speedOf,
  createChunker,
  createEleven,
  createPaxa,
  keepSpaces,
  pcmChunks,
  splitForSpeech,
  tidyThai,
} from "./paxa.mjs";
import { COUNSEL_RULES, NOVA_PROMPT, READERS, voiceCounselPrompt } from "./prompts.mjs";
import { PRONOUNCE, sayWords } from "./pronounce.mjs";
import { createKeyPicker } from "./gemini-keys.mjs";

// ใครเขียนคำตอบ:
//   ถามธรรมะ (ทุกเสียง)          -> Haiku จากคลัง แล้วอ่านออกเสียง
//   ปรึกษา + เสียง Gemini        -> Gemini คิดและพูดเอง (คุยลื่น)
//   ปรึกษา + เสียง Paxa          -> Haiku ทั้งก้อน แล้ว Paxa อ่าน (รอคำถอดเสียงของ Gemini ทำให้เสียงขาดเป็นช่วง)

const MODES = {
  counsel: { promptFile: "counsel.txt" },
  dhamma: { promptFile: "dhamma.txt" },
  nova: { promptFile: null }, // หน้า /nova เฉพาะรหัสเจ้าของ คุยสด ค้น Google + คำสอน
  interpret: { promptFile: null }, // แปลสดระหว่างสองคน (langA <-> langB) ไม่มีเครื่องมือ
};

const here = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(here, "..", "public");
const promptDir = process.env.PROMPT_DIR || join(here, "..", "prompt");

const config = loadConfig();
const geminiKeys = createKeyPicker(config.geminiApiKey, config.geminiApiKeyPaid);
const limiter = createDailyLimiter(config.dailyLimitPerToken);
const useFake = process.env.PROVIDER === "fake";
const canSearch = !!(config.cfAccountId && config.cfApiToken && config.qdrantReadKey);
const searchTeachings = canSearch ? createTeachingSearch(config) : null;
const canCompose = !!(config.openrouterKey || (config.llmBridgeUrl && config.llmBridgeSecret));
const compose = canSearch && canCompose ? createComposer(config) : null;
const chat = canSearch && canCompose ? createChat(config) : null;
// คำถามภาษาอื่น: แปลเป็นคำค้นไทยก่อนค้นคลัง (คำตอบยังเป็นภาษาของผู้ถาม)
const toThaiQuery = canCompose ? createQueryTranslator(config) : async (q) => q;
const paxa = config.paxaApiKey ? createPaxa(config.paxaApiKey) : null;
const eleven = config.elevenApiKey ? createEleven(config.elevenApiKey) : null;
// เสียงพูดแทน Gemini: "el:<voice_id>" = ElevenLabs, ชื่อใน PAXA_VOICES = Paxa
const isElevenVoice = (v) => !!eleven && typeof v === "string" && v.startsWith(ELEVEN_PREFIX) && v.length > ELEVEN_PREFIX.length;
// speed: ความเร็วพูด 0.7-1.2 (แถบเลื่อนบนเว็บและ NOVA บน PC) ใช้ได้กับ Paxa และ ElevenLabs เท่านั้น
const synth = (text, voice, speed = 1) =>
  isElevenVoice(voice) ? eleven(text, voice.slice(ELEVEN_PREFIX.length), speed) : paxa(text, voice, speed);

// รายชื่อเสียง ElevenLabs ในบัญชี (โหลดครั้งแรกที่มีคนขอ แล้วจำไว้ 1 ชั่วโมง)
let elevenVoiceCache = { at: 0, voices: {} };
async function elevenVoiceList() {
  if (!eleven) return {};
  if (Date.now() - elevenVoiceCache.at < 3_600_000) return elevenVoiceCache.voices;
  try {
    const list = await lab.elevenVoices();
    elevenVoiceCache = { at: Date.now(), voices: Object.fromEntries(list.map((v) => [ELEVEN_PREFIX + v.id, v.name])) };
  } catch (e) {
    console.error("eleven voices failed:", e.message);
  }
  return elevenVoiceCache.voices;
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

async function readPrompt(mode) {
  try {
    return (await readFile(join(promptDir, MODES[mode].promptFile), "utf8")).trim();
  } catch {
    return "";
  }
}

// Haiku บางครั้งเขียนยาวเกินที่สั่ง: ตัดที่ช่องว่างสุดท้ายก่อน 420 ตัวอักษร (ราว 30 วินาทีเมื่อพูด)
const capSpeech = (text, max = 420) => {
  if (text.length <= max) return text;
  const cut = text.lastIndexOf(" ", max);
  return text.slice(0, cut > max / 2 ? cut : max).trim();
};

// เครื่องมือที่ Gemini เรียก: คืน <sources> ให้ Gemini คิดเอง หรือคืนคำตอบของ Haiku ให้อ่าน
// onAnswer(text): เสียง Paxa อ่านคำตอบของ Haiku ตรงตัว ไม่ต้องรอคำถอดเสียงของ Gemini
// Haiku เขียนคำตอบจากผลค้น ด้วย prompt ของโหมด (counsel.txt / dhamma.txt จาก dhamma.prompts) -> { text, cites }
async function haikuAnswer(mode, query, found, length = 2, speaker = null, lang = null) {
  const raw = await compose({ systemPrompt: await readPrompt(mode), question: query, sourcesText: found.text, mode, length, speaker, lang });
  const answer = finishAnswer(raw, found.sources);
  return { text: capSpeech(answer.text, lengthOf(length).cap), cites: answer.cites };
}

// เพศของเสียงที่ผู้ใช้เลือก -> "male" | "female" | null (ใช้เลือกคำลงท้าย ครับ/ค่ะ ให้ตรงเสียง)
async function voiceGender(voice) {
  if (VOICES.female.includes(voice)) return "female";
  if (VOICES.male.includes(voice)) return "male";
  const label = PAXA_VOICES[voice] || (isElevenVoice(voice) ? (await elevenVoiceList())[voice] : "") || "";
  if (/หญิง|female/i.test(label)) return "female";
  if (/ชาย|\bmale/i.test(label)) return "male";
  return null;
}
const geminiSpeakerRule = (speaker) =>
  SPEAKER_RULE[speaker] ? `\n\n${SPEAKER_RULE[speaker].replace("ผู้อ่านคำตอบเป็น", "คุณพูดด้วย")}` : "";

async function runTool(mode, query, send, { haiku, onAnswer, length = 2, speaker = null, lang = null }) {
  send({ type: "searching" });
  const found = await searchTeachings(await toThaiQuery(query), mode);
  // ข้อความที่ Gemini จะอ่านออกเสียงเอง: เปลี่ยนคำที่อ่านผิดเป็นตัวสะกดตามเสียง (pronounce.mjs) บอกในพรอมต์แล้ว Gemini อ่านคำอธิบายออกมาด้วย
  if (!haiku) return sayWords(formatSources(found.sources, mode === "nova" ? "named" : false)); // ไม่มีรหัส [S#] ให้ Gemini พูดตาม
  try {
    const { text, cites } = await haikuAnswer(mode, query, found, length, speaker, lang);
    if (mode === "dhamma" && cites.length) send({ type: "sources", items: cites });
    if (onAnswer) {
      onAnswer(text);
      // เสียง Paxa พูดคำตอบให้ผู้ใช้แล้ว: บอก Gemini ไม่ต้องอ่านซ้ำ จะได้จบเทิร์นเร็วและฟังผู้ใช้ต่อทันที
      // (เสียงของ Gemini ถูกทิ้งอยู่แล้ว ถ้าอ่านข้อความนี้ออกมาผู้ใช้ก็ไม่ได้ยิน) คำตอบใส่ไว้ให้ Gemini รู้บริบทคำถามถัดไป
      return `ระบบพูดคำตอบนี้ให้ผู้ใช้ฟังแล้ว ไม่ต้องอ่านซ้ำ ตอบสั้น ๆ ว่า "ครับ" แล้วรอฟังผู้ใช้\n\n${text}`;
    }
    return sayWords(text); // ไม่ใส่คำสั่งนำหน้า (Gemini อ่านคำสั่งออกเสียงด้วย) กติกาการอ่านอยู่ใน READERS
  } catch (e) {
    console.error("compose failed:", e.message);
    return "ระบบเรียบเรียงคำตอบขัดข้อง ให้บอกผู้ใช้ว่าขออภัย ลองถามใหม่อีกครั้งครับ ห้ามตอบเอง";
  }
}

// ใครถือรหัสนี้: เจ้าของ / รหัสเชิญรวม / ชื่อจากไฟล์รหัสรายคน / null
const whoIs = async (token) =>
  config.ownerToken && token === config.ownerToken
    ? "เจ้าของ"
    : config.inviteToken && token === config.inviteToken
      ? "รหัสเชิญรวม"
      : findPerson(config.codesFile, token);

const bearer = (req) => String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
const reply = (res, code, obj) => res.writeHead(code, { "content-type": MIME[".json"] }).end(JSON.stringify(obj));
// ต่อเป็น Buffer ก่อนแปลง ตัวอักษรไทยที่ถูกตัดคร่อมสองท่อนจะไม่เพี้ยน
async function readJson(req, max = 20_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw new Error("too big");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

// POST /api/ask (รหัสเจ้าของ): NOVA บน PC ถามแล้วได้คำตอบชุดเดียวกับเว็บ
// body { question, mode: "dhamma" | "counsel" } -> { text, cites, crisis }
const apiLimiter = createDailyLimiter(200);
async function handleAsk(req, res) {
  const token = bearer(req);
  if (!config.ownerToken || token !== config.ownerToken) return reply(res, 401, { error: "รหัสไม่ถูกต้อง" });
  if (!compose) return reply(res, 503, { error: "ยังไม่เปิดใช้การเรียบเรียงคำตอบ" });
  let question, mode, length, speaker, lang;
  try {
    const data = await readJson(req);
    question = String(data.question || "").trim().slice(0, 1000);
    mode = data.mode === "counsel" ? "counsel" : "dhamma";
    length = Math.min(5, Math.max(1, Math.round(Number(data.length) || 2))); // ความยาวคำตอบ 1-5 (NOVA เลือก)
    speaker = SPEAKER_RULE[data.speaker] ? data.speaker : null; // เพศเสียงของ NOVA -> ครับ/ค่ะ
    lang = langOf(data.lang); // ภาษาสนทนาที่เลือกใน NOVA (ไม่เลือก = ตามภาษาคำถาม)
  } catch {
    return reply(res, 400, { error: "รูปแบบข้อมูลไม่ถูกต้อง" });
  }
  if (!question) return reply(res, 400, { error: "ไม่มีคำถาม" });
  if (!apiLimiter.allow(token)) return reply(res, 429, { error: "วันนี้ใช้งานครบจำนวนแล้ว" });
  try {
    const answer = await haikuAnswer(mode, question, await searchTeachings(await toThaiQuery(question), mode), length, speaker, lang);
    // เก็บคำถามและที่มาไว้ใน log ของเจ้าของ เปิดดูย้อนหลังได้ว่า NOVA ตอบจากแหล่งไหน (docker logs counsel-pwa | grep api/ask)
    console.log(`api/ask: เจ้าของ โหมด ${mode} ยาว ${length}${lang ? ` ภาษา ${lang}` : ""} | ถาม: ${question.slice(0, 200)} | ที่มา: ${answer.cites.join(" ; ") || "-"}`);
    const crisisText = lang && lang !== "th" ? config.crisisMessageEn : config.crisisMessage;
    reply(res, 200, { ...answer, crisis: hasCrisisSignal(question) ? crisisText : null });
  } catch (e) {
    console.error("api/ask failed:", e.message);
    reply(res, 502, { error: "ค้นหรือเรียบเรียงคำตอบไม่สำเร็จ" });
  }
}

// POST /api/read (รหัสเจ้าของ): สมองกลางของ NOVA บน PC — ทุกเครื่องมือที่ต้องคิด (วางแผน เขียนโค้ด อ่านภาพ/PDF) ใช้ Haiku ที่นี่
// body { system?, web?, parts: [{type:"text",text} | {type:"image",mime,data} | {type:"pdf",name,data}], max_tokens } -> { text }
// web: true = ค้นเว็บก่อนตอบ (OpenRouter :online ~0.01 USD/ครั้ง) แทน Google Search ของ Gemini บน PC
async function handleRead(req, res) {
  const token = bearer(req);
  if (!config.ownerToken || token !== config.ownerToken) return reply(res, 401, { error: "รหัสไม่ถูกต้อง" });
  if (!config.llmBridgeUrl) return reply(res, 503, { error: "ยังไม่ได้ตั้ง LLM bridge" });
  if (!apiLimiter.allow(`read|${token}`)) return reply(res, 429, { error: "วันนี้ใช้งานครบจำนวนแล้ว" });
  let d;
  try {
    d = await readJson(req, 14_000_000); // ไฟล์ ~10 MB เป็น base64
  } catch {
    return reply(res, 400, { error: "รูปแบบข้อมูลไม่ถูกต้องหรือใหญ่เกิน" });
  }
  const content = (Array.isArray(d.parts) ? d.parts : []).slice(0, 20).map((p) =>
    p.type === "image"
      ? { type: "image_url", image_url: { url: `data:${String(p.mime || "image/png")};base64,${p.data}` } }
      : p.type === "pdf"
        ? { type: "file", file: { filename: String(p.name || "file.pdf"), file_data: `data:application/pdf;base64,${p.data}` } }
        : { type: "text", text: String(p.text ?? "").slice(0, 200_000) },
  );
  if (!content.length) return reply(res, 400, { error: "ไม่มีเนื้อหา" });
  try {
    const r = await fetch(config.llmBridgeUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bridge-secret": config.llmBridgeSecret },
      body: JSON.stringify({
        model: d.web ? `${config.composeModel}:online` : config.composeModel,
        max_tokens: Math.min(Number(d.max_tokens) || 4000, 8000),
        messages: [
          ...(d.system || d.web ? [{ role: "system", content: [
            // ค้นเว็บ: บอกวันนี้ให้ Haiku ไม่งั้นเดาวันในสัปดาห์ผิดและเลือกข่าวเก่า
            d.web ? `วันนี้คือ${new Date().toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "full" })}` : "",
            String(d.system || "").slice(0, 100_000),
          ].filter(Boolean).join("\n") }] : []),
          { role: "user", content },
        ],
      }),
      signal: AbortSignal.timeout(120000),
    });
    const json = await r.json().catch(() => ({}));
    const text = json?.choices?.[0]?.message?.content;
    if (!r.ok || typeof text !== "string") throw new Error(json?.error?.message || json?.error?.description || `HTTP ${r.status}`);
    console.log(`api/read: ${d.web ? "web+" : ""}${d.system ? "system+" : ""}${content.map((c) => c.type).join("+")}`);
    reply(res, 200, { text });
  } catch (e) {
    console.error("api/read failed:", e.message);
    reply(res, 502, { error: `Haiku อ่านไม่สำเร็จ: ${e.message}` });
  }
}

// POST /api/line/answer (กุญแจ LINE_API_TOKEN ของ n8n): LINE OA บวรไทยค้นและเรียบเรียงคำตอบธรรมะที่นี่ ที่เดียวกับเว็บและ NOVA
// body { question, query, mode, define, voice, length, history: [คำถามก่อนหน้า], lesson, prompts: {common, mode, define} }
// -> JSON ของ OpenRouter (choices, model, usage) + sources [{id,type,cite,text,tag}] ให้ n8n "ตรวจอ้างอิงและจัดรูป" ใช้ต่อ
const lineLimiter = createDailyLimiter(2000); // กันค่าใช้จ่ายบานถ้ามีคนยิงซ้ำ ปกติ LINE ใช้วันละหลักสิบ
async function handleLineAnswer(req, res) {
  if (!config.lineToken || bearer(req) !== config.lineToken) return reply(res, 401, { error: "กุญแจไม่ถูกต้อง" });
  if (!chat) return reply(res, 503, { error: "ยังไม่เปิดใช้การค้นและเรียบเรียง" });
  let d;
  try {
    d = await readJson(req, 400_000); // พรอมต์ทั้งชุดมากับคำขอ
  } catch {
    return reply(res, 400, { error: "รูปแบบข้อมูลไม่ถูกต้อง" });
  }
  const question = String(d.question || "").trim().slice(0, 4000);
  const query = String(d.query || question).trim().slice(0, 1000);
  if (!question || !d.prompts?.mode) return reply(res, 400, { error: "ไม่มีคำถามหรือพรอมต์" });
  if (!lineLimiter.allow("line")) return reply(res, 429, { error: "วันนี้ใช้งานครบจำนวนแล้ว" });
  const plan = linePlan(d);
  try {
    const found = await searchTeachings(await toThaiQuery(query), d.mode, { quota: plan.quota, pieceChars: LINE_PIECE_CHARS });
    found.sources.forEach((s, i) => (s.tag = `S${i + 1}`));
    const json = await chat({ messages: lineMessages({ ...d, question }, plan, found.sources), max_tokens: 16000, timeout: 230000 });
    json.choices[0].message.content = trimTagDumps(json.choices[0].message.content);
    console.log(`api/line: ${d.mode}${d.define ? "+นิยาม" : ""} ยาว ${plan.length} ชิ้น ${found.sources.length} | ${question.slice(0, 80)}`);
    reply(res, 200, { ...json, sources: found.sources });
  } catch (e) {
    console.error("api/line failed:", e.message);
    reply(res, 502, { error: `ค้นหรือเรียบเรียงไม่สำเร็จ: ${e.message}` });
  }
}

// POST /api/stt (รหัสเจ้าของ): NOVA บน PC ใช้ ElevenLabs เป็นหู ส่งเสียงทีละประโยค (wav) -> { text }
async function handleStt(req, res) {
  const token = bearer(req);
  if (!config.ownerToken || token !== config.ownerToken) return reply(res, 401, { error: "รหัสไม่ถูกต้อง" });
  if (!config.elevenApiKey) return reply(res, 503, { error: "ยังไม่ได้ใส่คีย์ ElevenLabs" });
  if (!ttsLimiter.allow(`stt|${token}`)) return reply(res, 429, { error: "วันนี้ใช้งานครบจำนวนแล้ว" });
  let wav, lang;
  try {
    const d = await readJson(req, 14_000_000);
    wav = Buffer.from(String(d.wav || ""), "base64");
    lang = langOf(d.lang); // ภาษาที่เลือกใน NOVA ช่วยให้ฟังประโยคสั้นแม่นขึ้น
  } catch {
    return reply(res, 400, { error: "รูปแบบข้อมูลไม่ถูกต้องหรือใหญ่เกิน" });
  }
  if (wav.length < 1000) return reply(res, 400, { error: "ไม่มีเสียง" });
  try {
    const out = await lab.ears.eleven(wav, null, lang);
    reply(res, 200, { text: out.text });
  } catch (e) {
    console.error("api/stt failed:", e.message);
    reply(res, 502, { error: `ElevenLabs ฟังไม่สำเร็จ: ${e.message}` });
  }
}

// POST /api/tts (รหัสเจ้าของ): NOVA บน PC พูดด้วยเสียง Paxa หรือ ElevenLabs ("el:<voice_id>") ผ่านคิวเดียวกับเว็บ
// body { text, voice } -> pcm 16 บิต 24 kHz mono
const ttsLimiter = createDailyLimiter(3000);
async function handleTts(req, res) {
  const token = bearer(req);
  if (!config.ownerToken || token !== config.ownerToken) return reply(res, 401, { error: "รหัสไม่ถูกต้อง" });
  let text, voice, speed;
  try {
    const d = await readJson(req);
    speed = speedOf(d.speed ?? 1);
    // raw = ข้อความที่ Haiku เขียน (เก็บช่องว่าง) ไม่ใช่ raw = คำถอดเสียงของ Gemini (ลบช่องว่างกลางคำ)
    text = d.raw ? keepSpaces(String(d.text || "").slice(0, 2000)) : tidyThai(String(d.text || "").slice(0, 800));
    voice = (paxa && PAXA_VOICES[d.voice]) || isElevenVoice(d.voice) ? d.voice : null;
  } catch {
    return reply(res, 400, { error: "รูปแบบข้อมูลไม่ถูกต้อง" });
  }
  if (!text || !voice) return reply(res, 400, { error: "ไม่มีข้อความ หรือเสียงนี้ยังไม่เปิดใช้" });
  if (!ttsLimiter.allow(token)) return reply(res, 429, { error: "วันนี้ใช้งานครบจำนวนแล้ว" });
  try {
    const pcm = await synth(text, voice, speed);
    res.writeHead(200, { "content-type": "audio/pcm", "content-length": pcm.length }).end(pcm);
  } catch (e) {
    console.error("api/tts failed:", e.message);
    reply(res, 502, { error: "เสียง Paxa ขัดข้อง" });
  }
}

// POST /api/feedback (รหัสใดก็ได้ที่เข้าใช้ได้): ปุ่ม "ตอบไม่ถูก" บนเว็บ และ NOVA บน PC
// เก็บทีละบรรทัด JSON ไว้ใช้แก้ prompt และทำข้อสอบ  ดู: jq . /opt/counsel-pwa/feedback/feedback.jsonl
// ponytail: ไฟล์บน VPS ไฟล์เดียว ย้ายไปตารางใน Supabase เมื่ออยากให้เปิดดู/ค้นจากหน้าแอดมิน
const feedbackFile = process.env.FEEDBACK_FILE || "feedback/feedback.jsonl";
async function handleFeedback(req, res) {
  const token = bearer(req);
  const who = await whoIs(token);
  if (!who) return reply(res, 401, { error: "รหัสไม่ถูกต้อง" });
  if (!apiLimiter.allow(`feedback|${token}`)) return reply(res, 429, { error: "วันนี้ส่งครบจำนวนแล้ว" });
  let d;
  try {
    d = await readJson(req, 15_000_000); // ไฟล์แนบ 10 MB เป็น base64 ราว 13.4 MB
  } catch {
    return reply(res, 400, { error: "รูปแบบข้อมูลไม่ถูกต้องหรือไฟล์ใหญ่เกิน" });
  }
  const cut = (v, n = 3000) => String(v ?? "").trim().slice(0, n);
  const at = new Date().toISOString();
  const entry = {
    at,
    who,
    from: cut(d.from, 20),
    mode: cut(d.mode, 20),
    question: cut(d.question),
    answer: cut(d.answer),
    sources: cut(d.sources),
    correct: cut(d.correct),
  };
  if (!entry.answer) return reply(res, 400, { error: "ไม่มีคำตอบที่จะรายงาน" });
  let attachment = null;
  if (d.file) {
    try {
      attachment = checkAttachment(d.file);
    } catch (e) {
      return reply(res, 400, { error: e.message });
    }
    // ชื่อไฟล์บนดิสก์ตั้งเอง ไม่ใช้ชื่อที่ผู้ส่งให้ (กันชื่อแปลก/../) เก็บชื่อเดิมไว้ในรายการแทน
    entry.file = `files/${at.replace(/[:.]/g, "-")}-${randomBytes(3).toString("hex")}${attachment.ext}`;
    entry.fileName = cut(d.file.name, 200);
  }
  try {
    if (attachment) {
      const dest = join(dirname(feedbackFile), entry.file);
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, attachment.buf);
    }
    await appendFile(feedbackFile, JSON.stringify(entry) + "\n");
  } catch (e) {
    console.error("feedback save failed:", e.message);
    return reply(res, 500, { error: "บันทึกไม่สำเร็จ" });
  }
  console.log(`feedback: ${who} ${entry.from} ${entry.mode}${entry.file ? " + ไฟล์แนบ" : ""}`);
  reply(res, 200, { ok: true });
}

// POST /api/lab/{stt,brain,tts} (รหัสเจ้าของ): หน้า /lab เทียบหู สมอง ปาก หลายแบบ
const lab = createLab(config, { searchTeachings, readPrompt, paxa, eleven, toThaiQuery });
async function handleLab(req, res, what) {
  const token = bearer(req);
  if (!config.ownerToken || token !== config.ownerToken) return reply(res, 401, { error: "รหัสไม่ถูกต้อง" });
  if (!apiLimiter.allow(`lab|${token}`)) return reply(res, 429, { error: "วันนี้ใช้งานครบจำนวนแล้ว" });
  let d;
  try {
    d = await readJson(req, 14_000_000); // เสียงอัด wav 16 kHz ราว 4 นาที
  } catch {
    return reply(res, 400, { error: "รูปแบบข้อมูลไม่ถูกต้องหรือใหญ่เกิน" });
  }
  try {
    if (what === "voices") return reply(res, 200, { voices: await lab.elevenVoices() });
    if (what === "multilang") {
      const question = String(d.question || "").trim().slice(0, 300);
      const langs = [...new Set((Array.isArray(d.langs) ? d.langs : []).filter((c) => LAB_LANGS[c]))].slice(0, 6);
      if (!question || !langs.length || !searchTeachings) return reply(res, 400, { error: "ใส่คำถามและเลือกภาษาอย่างน้อย 1 ภาษา" });
      const keyterms = String(d.keyterms || "").split(/[,\n]/).map((t) => t.trim()).filter(Boolean).slice(0, 30);
      const voiceId = isElevenVoice(d.voice) ? d.voice.slice(ELEVEN_PREFIX.length) : null;
      const length = Math.min(5, Math.max(1, Math.round(Number(d.length) || 2)));
      return reply(res, 200, await lab.multilang({ question, langs, mode: d.mode === "counsel" ? "counsel" : "dhamma", length, keyterms, voiceId }));
    }
    if (what === "stt") {
      const ear = lab.ears[d.ear];
      const wav = Buffer.from(String(d.wav || ""), "base64");
      if (!ear || wav.length < 1000) return reply(res, 400, { error: "ไม่มีเสียงหรือไม่รู้จักหูตัวนี้" });
      const out = await ear(wav, d.vocab ? LAB_VOCAB : null); // ข้อความ หรือ { text, via }
      return reply(res, 200, typeof out === "string" ? { text: out } : out);
    }
    if (what === "brain") {
      const question = String(d.question || "").trim().slice(0, 500);
      if (!question || !searchTeachings) return reply(res, 400, { error: "ไม่มีคำถาม หรือยังไม่เปิดการค้นคำสอน" });
      return reply(res, 200, { results: await lab.brains(question, d.mode === "counsel" ? "counsel" : "dhamma") });
    }
    const mouth = lab.mouths[d.mouth];
    const text = String(d.text || "").trim().slice(0, 1500);
    if (!mouth || !text) return reply(res, 400, { error: "ไม่มีข้อความหรือไม่รู้จักปากตัวนี้" });
    if (d.mouth === "paxa" && !paxa) return reply(res, 503, { error: "ยังไม่ได้ตั้งเสียง Paxa" });
    const out = await mouth(d.mouth === "paxa" ? tidyThai(text) : text, d.mouth === "paxa" && !PAXA_VOICES[d.voice] ? "baitoey" : d.voice);
    res.writeHead(200, { "content-type": out.type, "content-length": out.body.length }).end(out.body);
  } catch (e) {
    console.error(`lab ${what} failed:`, e.message);
    reply(res, 502, { error: e.message });
  }
}

const server = createServer(async (req, res) => {
  const path = req.url.split("?")[0].replace(/\/$/, "") || "/";
  const labPath = path.match(/^\/api\/lab\/(stt|brain|tts|voices|multilang)$/);
  if (labPath && req.method === "POST") return handleLab(req, res, labPath[1]);
  if (path === "/api/ask" && req.method === "POST") return handleAsk(req, res);
  if (path === "/api/feedback" && req.method === "POST") return handleFeedback(req, res);
  if (path === "/api/tts" && req.method === "POST") return handleTts(req, res);
  if (path === "/api/read" && req.method === "POST") return handleRead(req, res);
  if (path === "/api/line/answer" && req.method === "POST") return handleLineAnswer(req, res);
  if (path === "/api/stt" && req.method === "POST") return handleStt(req, res);
  const urlPath = path === "/" || path === "/nova" ? "/index.html" : path === "/lab" ? "/lab.html" : path; // /nova = หน้าเดียวกัน แสดงแบบ NOVA
  if (urlPath === "/config.json") {
    res.writeHead(200, { "content-type": MIME[".json"], "cache-control": "no-store" });
    // elevenVoices: เลือกได้ทุกคน แต่ใช้จริงได้เฉพาะรหัสเจ้าของ (คนอื่นจะได้เสียง Gemini แทน)
    // pronounce: คำอ่านเฉพาะ NOVA บน PC เอาไปใส่ system prompt ของ Gemini (แก้ที่ pronounce.mjs ที่เดียว)
    res.end(JSON.stringify({ paxaVoices: paxa ? PAXA_VOICES : {}, elevenVoices: await elevenVoiceList(), elevenEar: !!eleven, pronounce: PRONOUNCE }));
    return;
  }
  const filePath = normalize(join(publicDir, urlPath));
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { "content-type": MIME[extname(filePath)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});

const wss = new WebSocketServer({ server, path: "/ws" });

// เสียงเงียบ 0.1 วินาที (pcm 16 kHz) ไว้กันการเชื่อมต่อ Gemini หลุดตอนใช้หู ElevenLabs
const SILENCE_100MS = Buffer.alloc(3200).toString("base64");
const MAX_UTTER_BYTES = 16000 * 2 * 60; // ประโยคยาวสุด 60 วินาที

wss.on("connection", (ws) => {
  let session = null;
  let authed = false;
  let elevenEar = false; // หู ElevenLabs (รหัสเจ้าของ)
  let lang = null; // ภาษาสนทนาที่ผู้ใช้เลือก (null = ตามภาษาที่พูด)
  let interpreting = false; // โหมดแปลสด: หน้าเว็บส่ง utterance_start / utterance_end
  let crisisText = config.crisisMessage;
  let utter = []; // เสียงของประโยคที่กำลังพูด
  let utterBytes = 0;
  let keepAlive = null;
  let newUserTurn = () => {};

  const send = (obj) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  };

  const handleUserText = (text) => {
    if (hasCrisisSignal(text)) {
      send({ type: "crisis", text: crisisText });
    }
    send({ type: "user_text", text });
  };

  ws.on("message", async (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return send({ type: "error", message: "รูปแบบข้อความไม่ถูกต้อง" });
    }

    if (!authed) {
      if (msg.type !== "auth") return send({ type: "error", message: "โทเค็นไม่ถูกต้อง" });
      const isOwner = !!config.ownerToken && msg.token === config.ownerToken;
      const person = await whoIs(msg.token);
      if (!person) return send({ type: "error", message: "โทเค็นไม่ถูกต้อง" });
      const mode = MODES[msg.mode] ? msg.mode : "counsel";
      if (mode === "nova" && !isOwner) {
        return send({ type: "error", message: "หน้า NOVA ใช้รหัสเจ้าของเท่านั้น" });
      }
      if (!limiter.allow(msg.token)) {
        return send({ type: "error", message: "วันนี้ใช้งานครบจำนวนแล้ว" });
      }
      lang = langOf(msg.lang);
      if (lang && lang !== "th") crisisText = config.crisisMessageEn;
      // แปลสด: สองภาษาของสองคน (ค่าเริ่มต้น ไทย <-> อังกฤษ) หูไม่ได้รับคำใบ้ภาษาเดียว เพราะได้ยินสองภาษา
      const pair = mode === "interpret" ? [langOf(msg.langA) || "th", langOf(msg.langB) || "en"] : null;
      if (pair && pair[0] === pair[1]) return send({ type: "error", message: "เลือกสองภาษาที่ต่างกัน · Choose two different languages" });
      if (pair) lang = null;
      interpreting = !!pair;
      console.log(`เข้าใช้: ${person} โหมด ${mode}${pair ? ` ${pair.join("<->")}` : lang ? ` ภาษา ${lang}` : ""}`);
      authed = true;
      if (mode === "dhamma" && !compose && !useFake) {
        authed = false;
        return send({ type: "error", message: "โหมดถามธรรมะยังไม่เปิดใช้งาน" });
      }
      // เสียง Paxa/ElevenLabs: ทิ้งเสียงของ Gemini แล้วสังเคราะห์ใหม่จากข้อความ (ทั้งเทิร์น หรือคำตอบ Haiku ตรงตัว)
      // ElevenLabs ("el:<id>") เฉพาะรหัสเจ้าของ เพราะเครดิตแผนฟรีน้อย คนอื่นเลือกแล้วจะได้เสียง Gemini
      // แปลสด: ใช้เสียงของ Gemini เอง (เร็วที่สุด) ไม่ผ่าน Paxa/ElevenLabs
      const paxaVoice = !pair && ((paxa && PAXA_VOICES[msg.voice]) || (isOwner && isElevenVoice(msg.voice))) ? msg.voice : null;
      // หู ElevenLabs: ไม่ส่งเสียงให้ Gemini ฟัง แต่เก็บทีละประโยค ถอดเป็นข้อความ แล้วส่งข้อความให้ Gemini
      elevenEar = !pair && isOwner && msg.ear === "eleven" && !!config.elevenApiKey;
      if (elevenEar) {
        // Gemini ปิด session ที่เงียบนาน: ส่งเสียงเงียบ 0.1 วินาทีทุก 10 วินาที
        keepAlive = setInterval(() => session?.sendAudio(SILENCE_100MS), 10_000);
      }
      const voice = [...VOICES.female, ...VOICES.male].includes(msg.voice) ? msg.voice : config.voice;
      const speed = speedOf(msg.speed ?? 1); // ความเร็วพูดของเสียง Paxa/ElevenLabs (เสียง Gemini ปรับไม่ได้)
      let toolSpoke = false; // คำตอบของ Haiku เข้า Paxa ไปแล้ว ทิ้งคำถอดเสียงที่ Gemini อ่านตามในเทิร์นนี้
      let generation = 0; // ผู้ใช้พูดแทรก = เลิกส่งเสียงที่ยังค้างคิว
      // ส่งข้อความคู่กับเสียงของช่วงนั้น หน้าเว็บแสดงข้อความตอนเสียงช่วงนั้นเริ่มเล่น
      const speakPaxa = async (text, raw = false) => {
        const clean = raw ? keepSpaces(text) : tidyThai(text);
        if (!clean) return;
        const mine = generation;
        try {
          const pcm = await synth(clean, paxaVoice, speed);
          if (mine !== generation) return;
          send({ type: "speech", text, chunks: pcmChunks(pcm) });
        } catch (e) {
          console.error("tts failed:", e.message);
          if (mine === generation) send({ type: "bot_text", text });
          send({ type: "error", message: "เสียงพูดขัดข้อง อ่านคำตอบบนจอได้เลยครับ" });
        }
      };
      // ทุกช่วงเข้าคิว Paxa พร้อมกัน คิวทำทีละงานตามลำดับ ช่วงถัดไปจึงเสร็จระหว่างที่ช่วงก่อนกำลังเล่น
      // คำตอบของ Haiku: เก็บช่องว่าง และแบ่งเป็นช่วงยาว (ช่วงแรก ~60 ตัวอักษรให้เริ่มพูดเร็ว ที่เหลือช่วงละ ~400)
      // ช่วงน้อย = น้ำเสียงเริ่มใหม่กลางประโยคน้อยลง
      const speakAll = (text) => splitForSpeech(text, 60, 400).forEach((part) => speakPaxa(part, true));
      const chunker = createChunker(speakPaxa);
      const onAnswer = paxaVoice ? (text) => { toolSpoke = true; chunker.reset(); speakAll(text); } : null;
      const haiku = !!compose && (mode === "dhamma" || (mode === "counsel" && !!paxaVoice));
      // ความยาวคำตอบ 1-5 ที่ผู้ใช้เลือกบนหน้าเว็บ (2 = เท่าเดิม): Haiku เขียนตามระดับ
      // ส่วนคำตอบที่ Gemini เขียนเอง (หน้า NOVA, ปรึกษา+เสียง Gemini) ใส่กติกาความยาวต่อท้าย prompt
      // (ไม่ใส่ในโหมดที่ Gemini แค่อ่านคำตอบของ Haiku เพราะจะไปย่อคำตอบ)
      const length = Math.min(5, Math.max(1, Math.round(Number(msg.length) || 2)));
      const L = lengthOf(length);
      const lengthNote =
        length === 2
          ? ""
          : `\n\nความยาวคำตอบที่ผู้ใช้เลือก: ระดับ ${length} จาก 5 (${L.say}${L.list ? " ตอบเป็นข้อได้เมื่อคำตอบเป็นรายการ" : ""}) ใช้แทนกติกาความยาวด้านบน`;
      // เพศของเสียงที่จะได้ยินจริง (Paxa/ElevenLabs ถ้าเลือก ไม่งั้นเสียง Gemini) -> คำลงท้ายครับ/ค่ะ ให้ตรง
      const speaker = await voiceGender(paxaVoice || voice);
      const systemPrompt = pair
        ? interpretPrompt(...pair) + geminiSpeakerRule(speaker)
        : (mode === "nova"
          ? NOVA_PROMPT + lengthNote
          : haiku
            ? READERS[mode]
            : voiceCounselPrompt(await readPrompt("counsel")) + (searchTeachings ? COUNSEL_RULES : "") + lengthNote) +
        geminiSpeakerRule(speaker) +
        geminiLanguageRule(lang);
      const search = !pair && searchTeachings && ((query) => runTool(mode, query, send, { haiku, onAnswer, length, speaker, lang }));
      const callbacks = {
        onAudio: (data) => paxaVoice || send({ type: "audio", data }),
        onUserText: (text) => {
          toolSpoke = false; // ผู้ใช้เริ่มเทิร์นใหม่ (เทิร์นก่อนอาจถูกแทรกจนไม่มี turnComplete)
          handleUserText(text);
        },
        // หู ElevenLabs ส่งข้อความเอง (ไม่มีคำถอดเสียงจาก Gemini)
        onUserTurnFromText: () => {
          toolSpoke = false;
        },
        onBotText: (text) => {
          if (!paxaVoice) return send({ type: "bot_text", text });
          if (!toolSpoke) chunker.push(text); // ข้อความไปกับเสียง Paxa ใน "speech"
        },
        onTurnComplete: () => {
          if (!paxaVoice) return;
          if (toolSpoke) chunker.reset();
          else chunker.end();
          toolSpoke = false;
        },
        onInterrupted: () => {
          generation++;
          toolSpoke = false;
          chunker.reset();
          send({ type: "interrupted" });
        },
        onClose: (reason) => {
          session = null;
          // Gemini ปิด session เอง (หมดเวลา เครือข่าย) ระหว่างที่ผู้ใช้ยังเปิดหน้าอยู่: ต่อใหม่ให้เอง ไม่ต้องกดเริ่มอีก
          if (geminiKeys.noteError(reason)) reconnects = 0; // โควตาฟรีหมด: ต่อใหม่ด้วยคีย์เสียเงิน
          if (ws.readyState === ws.OPEN && reconnects < 3) {
            reconnects++;
            console.error(`gemini closed (${reason}), reconnect ${reconnects}`);
            send({ type: "reconnecting" });
            setTimeout(openSession, 1000);
          } else {
            send({ type: "closed", reason });
          }
        },
      };
      let reconnects = 0;
      const openSession = async () => {
        if (ws.readyState !== ws.OPEN) return;
        try {
          session = useFake
            ? createFakeProvider(callbacks)
            : await connectGeminiLive({
                config: { ...config, voice, geminiApiKey: geminiKeys.current() },
                systemPrompt,
                callbacks,
                searchTeachings: search,
                googleSearch: mode === "nova",
                manualTurns: !!pair,
              });
          newUserTurn = callbacks.onUserTurnFromText;
          const voiceLabel = !paxaVoice ? voice : isElevenVoice(paxaVoice) ? "ElevenLabs" : `Paxa ${paxaVoice}`;
          send({ type: "ready", voice: voiceLabel, ear: elevenEar ? "ElevenLabs" : "Gemini", length, mode });
        } catch (e) {
          if (geminiKeys.noteError(e.message)) return openSession(); // โควตาฟรีหมด: ลองคีย์เสียเงินทันที
          send({ type: "error", message: `เชื่อมต่อไม่สำเร็จ: ${e.message}` });
        }
      };
      await openSession();
      return;
    }

    if (!session) return send({ type: "error", message: "ยังไม่ได้เชื่อมต่อกับโมเดล" });

    if (msg.type === "audio" && typeof msg.data === "string") {
      if (!elevenEar) return session.sendAudio(msg.data);
      if (utterBytes < MAX_UTTER_BYTES) {
        const chunk = Buffer.from(msg.data, "base64");
        utter.push(chunk);
        utterBytes += chunk.length;
      }
    } else if ((msg.type === "utterance_start" || msg.type === "utterance_end") && interpreting) {
      // แปลสด: หน้าเว็บบอกว่าเริ่มพูด/พูดจบ (เงียบ 0.5 วินาที) แปลทันทีไม่รอ VAD ของ Google
      session.activity(msg.type === "utterance_start");
    } else if (msg.type === "utterance_end" && elevenEar) {
      // จบประโยค: ถอดด้วย ElevenLabs แล้วส่งเป็นข้อความให้ Gemini (สั้นกว่าครึ่งวินาทีถือว่าเป็นเสียงรบกวน)
      const pcm = Buffer.concat(utter);
      utter = [];
      utterBytes = 0;
      if (pcm.length < 16_000) return;
      try {
        const { text } = await lab.ears.eleven(pcmToWav(pcm, 16000), null, lang);
        if (!text || !session) return;
        newUserTurn();
        handleUserText(text);
        session.sendText(text);
      } catch (e) {
        console.error("eleven ear failed:", e.message);
        send({ type: "error", message: "หู ElevenLabs ฟังไม่สำเร็จ พูดใหม่อีกครั้ง หรือพิมพ์แทนได้" });
      }
    } else if (msg.type === "text" && typeof msg.text === "string") {
      const text = msg.text.slice(0, 1000);
      if (hasCrisisSignal(text)) {
        send({ type: "crisis", text: crisisText });
        return;
      }
      session.sendText(text);
    }
  });

  ws.on("close", () => {
    clearInterval(keepAlive);
    session?.close();
    session = null;
  });
});

server.listen(config.port, () => {
  console.log(`counsel-pwa listening on ${config.port}${useFake ? " (fake provider)" : ""}${searchTeachings ? " + teachings search" : ""}`);
});

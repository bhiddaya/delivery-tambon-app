// เสียง Paxa Labs: Gemini Live ยังฟัง คิด และเรียกเครื่องมือเหมือนเดิม แต่เสียงที่ผู้ใช้ได้ยินมาจาก Paxa TTS
// ส่งคำขอแบบเดียวกับ Hermes tts.py (x-api-key, paxa-tts-flash-v2) แต่ขอ pcm 24 kHz ให้เล่นในหน้าเว็บได้ทันที

// เลือกเสียงที่เหมาะกับการปรึกษาและสอนธรรมะจาก list_voices
export const PAXA_VOICES = {
  foithong: "ฝอยทอง (หญิง นักเล่าเรื่อง)",
  sanaechan: "เสน่ห์จันทร์ (หญิง อบอุ่น)",
  baitoey: "ใบเตย (หญิง ใจเย็น ให้กำลังใจ)",
  khanomkrok: "ขนมครก (ชาย สุขุม)",
  khaoniao: "ข้าวเหนียว (ชาย เสียงต่ำ ช้า)",
  krayasat: "กระยาสารท (ชาย คุณตาใจดี)",
};

import { spawn } from "node:child_process";

const PAXA_URL = "https://api.paxalabs.com/v1/tts";

// ความเร็วพูดที่ผู้ใช้เลื่อนได้: ช่วงที่ทั้ง Paxa (0.5-1.5) และ ElevenLabs (0.7-1.2) รองรับ ขั้นละ 0.05
// เสียงของ Gemini ปรับความเร็วไม่ได้
export const SPEEDS = { min: 0.7, max: 1.2, step: 0.05 };
export const speedOf = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.round(Math.min(SPEEDS.max, Math.max(SPEEDS.min, n)) / SPEEDS.step) * SPEEDS.step;
};

// ponytail: คิวเดียวทั้งเซิร์ฟเวอร์ เพราะแผนฟรีของ Paxa ทำได้ทีละงาน ถ้าอัปแผนแล้วค่อยขยายเป็นหลายงานพร้อมกัน
let queue = Promise.resolve();

export function createPaxa(apiKey, fetchFn = fetch) {
  return function synthesize(text, voice, speed = 1) {
    const job = queue.then(async () => {
      const res = await fetchFn(PAXA_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify({
          text, voice, model: "paxa-tts-flash-v2", format: "pcm", sample_rate: 24000,
          ...(speed !== 1 ? { speed: Number(speed.toFixed(2)) } : {}),
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new Error(`Paxa HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    });
    queue = job.catch(() => {});
    return job;
  };
}

// เสียง ElevenLabs: ชื่อเสียงขึ้นต้นด้วย "el:" ตามด้วย voice_id ของ ElevenLabs (ใช้ได้เฉพาะรหัสเจ้าของ เครดิตแผนฟรีน้อย)
// ขอ pcm 24 kHz เหมือน Paxa จึงใช้ทางเล่นเสียงเดิมได้ทั้งเว็บและ NOVA บน PC
// คิวของตัวเอง: ช่วงคำตอบต้องออกตามลำดับ และแผนฟรีทำพร้อมกันได้น้อย
export const ELEVEN_PREFIX = "el:";
export const ELEVEN_MODEL = "eleven_v4_turbo"; // พูดไทยได้ เร็วสุดในที่ทดสอบ (3.7 วินาที)
let elevenQueue = Promise.resolve();

export function createEleven(apiKey, fetchFn = fetch) {
  return function synthesize(text, voiceId, speed = 1) {
    const job = elevenQueue.then(async () => {
      const res = await fetchFn(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=pcm_24000`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "xi-api-key": apiKey },
          // ระบุไทยเฉพาะข้อความที่เป็นไทยเป็นหลัก ภาษาอื่น (รวมจีนที่มีคำบาลีไทยในวงเล็บ) ให้รุ่นเลือกเอง
          body: JSON.stringify({
            text,
            model_id: ELEVEN_MODEL,
            ...(isMostlyThai(text) ? { language_code: "th" } : {}),
          }),
          signal: AbortSignal.timeout(30000),
        },
      );
      if (!res.ok) throw new Error(`ElevenLabs HTTP ${res.status}`);
      const pcm = Buffer.from(await res.arrayBuffer());
      return speed === 1 ? pcm : changeTempo(pcm, speed).catch(() => pcm); // ปรับไม่ได้ก็พูดความเร็วปกติ
    });
    elevenQueue = job.catch(() => {});
    return job;
  };
}

// ElevenLabs รุ่นที่พูดไทย (v4 Turbo) ไม่รับค่า speed: ทดสอบ 25 พ.ย. 2569 ที่ 0.7 และ 1.2 เท่ายาว 7.4 วินาทีเท่ากัน
// จึงยืด/หดเสียงเองด้วย ffmpeg atempo (ระดับเสียงไม่เพี้ยน) pcm 16 บิต 24 kHz mono เข้าและออก
export function changeTempo(pcm, speed, run = spawn) {
  if (speed === 1) return Promise.resolve(pcm);
  const fmt = ["-f", "s16le", "-ar", "24000", "-ac", "1"];
  return new Promise((resolve, reject) => {
    const ff = run("ffmpeg", ["-hide_banner", "-loglevel", "error", ...fmt, "-i", "pipe:0", "-filter:a", `atempo=${speed.toFixed(2)}`, ...fmt, "pipe:1"]);
    const out = [];
    ff.stdout.on("data", (chunk) => out.push(chunk));
    ff.on("error", reject);
    ff.on("close", (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`ffmpeg exit ${code}`))));
    ff.stdin.on("error", () => {});
    ff.stdin.end(pcm);
  });
}

// คำถอดเสียงของ Gemini เว้นวรรคกลางคำไทย ("หงุดหงิด กับ คน ในบ้าน") ถ้าไม่ตัดออก Paxa จะเว้นจังหวะผิดที่
// ตัดทุกอย่างในวงเล็บเหลี่ยม: Paxa ถือว่าเป็นคำสั่งน้ำเสียง และรหัสอย่าง [S110, P1] ต้องไม่ถูกอ่าน
export const tidyThai = (text) =>
  sayable(
    String(text)
      .replace(/\[[^\]]*\]/g, " ")
      .replace(/[[\]]/g, " ")
      .replace(/([฀-๿])\s+(?=[฀-๿])/g, "$1")
      .replace(/\s+/g, " ")
      .trim(),
  );

// ข้อความที่ Haiku เขียนเอง (ช่องว่างถูกต้อง เป็นจุดเว้นหายใจ): ลบแค่วงเล็บเหลี่ยม ไม่ลบช่องว่างระหว่างคำไทย
// (tidyThai ลบช่องว่างทั้งหมด ElevenLabs/Paxa จึงอ่านติดกันเป็นพืด ใช้ tidyThai เฉพาะคำถอดเสียงของ Gemini)
export const keepSpaces = (text) =>
  sayable(
    String(text)
      .replace(/\[[^\]]*\]/g, " ")
      .replace(/[[\]]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );

// ---------- ทำข้อความให้เครื่องอ่านออกเสียงจังหวะเป็นธรรมชาติ ----------
// เจ้าของฟังแล้วบอกว่า "จังหวะอ่านแปลก": เลขไทย ๘ ๑๕ เครื่องหมายคำพูด วงเล็บ และ "แท้ ๆ" ทำให้หยุดผิดที่/อ่านแปลก
const DIGIT_TH = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const PLACE_TH = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

// "127" -> "หนึ่งร้อยยี่สิบเจ็ด" (ถึงหลักล้าน ยาวกว่านั้นอ่านทีละตัว)
export function thaiNumber(digits) {
  const s = String(digits).replace(/^0+(?=\d)/, "");
  if (s.length > 12) return [...s].map((d) => DIGIT_TH[d]).join("");
  if (s.length > 6) return `${thaiNumber(s.slice(0, -6))}ล้าน${s.slice(-6) === "000000" ? "" : thaiNumber(s.slice(-6))}`;
  if (s === "0") return DIGIT_TH[0];
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const d = Number(s[i]);
    const place = s.length - 1 - i;
    if (d === 0) continue;
    if (place === 1) out += d === 1 ? "สิบ" : d === 2 ? "ยี่สิบ" : `${DIGIT_TH[d]}สิบ`;
    else if (place === 0) out += d === 1 && s.length > 1 ? "เอ็ด" : DIGIT_TH[d];
    else out += DIGIT_TH[d] + PLACE_TH[place];
  }
  return out;
}

// ข้อความเป็นภาษาไทยเป็นหลักไหม (อักษรไทย >= 30% ของตัวอักษรทั้งหมด) ภาษาอื่นไม่แปลงเลขเป็นคำไทย
// มีอักษรจีน ญี่ปุ่น เกาหลี รัสเซีย อาหรับ ฮินดี = คำตอบภาษานั้น (คำบาลีไทยในวงเล็บไม่นับ)
// ไม่งั้นมีเลขไทยก็นับเป็นไทย เพราะภาษาอื่นไม่ใช้เลขไทย
export const isMostlyThai = (text) => {
  if (/[぀-ヿ가-힯一-鿿Ѐ-ӿ؀-ۿऀ-ॿ຀-໿က-႟ក-៿]/.test(text)) return false;
  if (/[๐-๙]/.test(text)) return true;
  const letters = String(text).match(/\p{L}/gu) || [];
  return letters.length > 0 && letters.filter((c) => /[ก-๛]/.test(c)).length / letters.length >= 0.3;
};

export function sayable(input) {
  const text = String(input).replace(/[*_#`]+/g, ""); // markdown (*puñña*, **หัวข้อ**) ไม่ให้เครื่องอ่านออกเสียง
  if (!isMostlyThai(text)) {
    // ภาษาอื่น: ตัดแค่เครื่องหมายคำพูด/วงเล็บ ตัวเลขให้เครื่องอ่านตามภาษานั้นเอง ("Chapter 9" ไม่กลายเป็น "เก้า")
    return String(text).replace(/["“”‘’()«»]/g, " ").replace(/\s+/g, " ").trim();
  }
  return String(text)
    .replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50)) // เลขไทย -> เลขอารบิก แล้วอ่านเป็นคำ
    // อ้างอิงที่เขียนติดกัน "พระไตรปิฎกเล่ม9ข้อ127" -> "พระไตรปิฎก เล่ม 9 ข้อ 127" ไม่ให้อ่านเป็นพืด
    .replace(/([ก-๏])(เล่ม|ข้อ|หน้า|บรรทัด)(?=\s*\d)/g, "$1 $2")
    .replace(/([ก-๏])(\d)/g, "$1 $2")
    .replace(/(\d)([ก-๏])/g, "$1 $2")
    .replace(/(\d+)\.(\d+)/g, (_, a, b) => `${thaiNumber(a)}จุด${[...b].map((d) => DIGIT_TH[d]).join("")}`)
    .replace(/(\d+)\s*-\s*(\d+)/g, (_, a, b) => `${thaiNumber(a)} ถึง ${thaiNumber(b)}`)
    .replace(/\d+/g, (n) => thaiNumber(n))
    .replace(/["“”‘’'()«»]/g, " ") // เครื่องหมายคำพูด วงเล็บ: เครื่องอ่านหยุดแปลก ๆ
    .replace(/\s+ๆ/g, "ๆ") // "แท้ ๆ" -> "แท้ๆ" ไม่หยุดก่อนไม้ยมก
    .replace(/\s+/g, " ")
    .trim();
}

// คำถอดเสียงของ Gemini มาทีละคำ: ส่งเข้า Paxa เป็นช่วง ๆ ไม่ต้องรอจบทั้งเทิร์น
// ช่วงแรกสั้น (first) ให้เริ่มพูดเร็ว ช่วงต่อไปยาวขึ้น (next) ให้เรียก Paxa น้อยครั้ง ตัดที่ช่องว่างสุดท้ายเพื่อไม่ตัดกลางคำ
export function createChunker(onChunk, first = 40, next = 120) {
  let buf = "";
  let sent = false;
  return {
    push(text) {
      buf += text;
      if (buf.length < (sent ? next : first)) return;
      if (buf.lastIndexOf("[") > buf.lastIndexOf("]")) return; // รอวงเล็บปิดก่อน จะได้ตัดรหัสทิ้งได้ทั้งก้อน
      let cut = buf.lastIndexOf(" ");
      const close = buf.lastIndexOf("]");
      if (close > cut) cut = close + 1; // ช่องว่างสุดท้ายอยู่ในวงเล็บ ให้ตัดหลังวงเล็บปิดแทน
      if (cut <= 0) return;
      onChunk(buf.slice(0, cut));
      buf = buf.slice(cut);
      sent = true;
    },
    end() {
      if (buf.trim()) onChunk(buf);
      buf = "";
      sent = false;
    },
    reset() {
      buf = "";
      sent = false;
    },
  };
}

// แบ่งคำตอบที่ได้มาทั้งก้อนเป็นช่วงสำหรับอ่าน: ช่วงแรกสั้นให้เริ่มพูดเร็ว ช่วงต่อไปยาวขึ้น
// ตัดที่ช่องว่างหรือขึ้นบรรทัดเท่านั้น ต่อทุกช่วงกลับแล้วต้องได้ข้อความเดิมทุกตัวอักษร (ใช้แสดงบนจอคู่กับเสียง)
export function splitForSpeech(text, first = 40, next = 100) {
  const parts = [];
  let cur = "";
  const pieces = String(text).split(/(?<=\s)/);
  for (const [i, piece] of pieces.entries()) {
    cur += piece;
    // ไม่ตัดก่อนตัวเลข ("สัทธรรม | ๗" ฟังขาดกลางคำ)
    if (cur.trim().length >= (parts.length ? next : first) && !/^[0-9๐-๙]/.test(pieces[i + 1] || "")) {
      parts.push(cur);
      cur = "";
    }
  }
  if (cur.trim()) parts.push(cur);
  else if (cur && parts.length) parts[parts.length - 1] += cur;
  // เศษท้ายสั้น (เช่น "... ครับ") รวมกับช่วงก่อนหน้า ไม่ให้น้ำเสียงเริ่มใหม่ตอนจบ (ต่อกลับแล้วยังได้ข้อความเดิม)
  if (parts.length >= 3 && parts[parts.length - 1].trim().length < first) parts[parts.length - 2] += parts.pop();
  return parts;
}

// แบ่ง pcm เป็นชิ้นละ 1 วินาที (24 kHz x 2 ไบต์) ให้หน้าเว็บเริ่มเล่นได้เร็วและข้อความ WebSocket ไม่ใหญ่เกิน
export function pcmChunks(buf, size = 48000) {
  const out = [];
  for (let i = 0; i < buf.length; i += size) out.push(buf.subarray(i, i + size).toString("base64"));
  return out;
}

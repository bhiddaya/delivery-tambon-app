// LINE OA บวรไทย (n8n "บวรไทย LINE – ธรรมะ 3 ปุ่ม") ใช้สมองกลางนี้: ค้นคลัง + Haiku เรียบเรียง ที่เดียวกับเว็บและ NOVA
// ย้ายมาจากโหนด n8n "รวมแหล่งอ้างอิงและ prompt" 2026-11-24: โควตา ข้อความกำกับ และรูปแบบ <sources> เหมือนเดิมทุกตัวอักษร
// พรอมต์มาจาก n8n (dhamma_begin อ่านจากฐานข้อมูลทุกครั้ง) แก้พรอมต์ในฐานข้อมูลแล้ว LINE เห็นทันทีเหมือนเดิม
// ส่วนจัดรูปสำหรับ LINE (เลขอ้างอิงยก ¹²³ รายการอ้างอิง เลขไทย แบ่งข้อความ) ยังอยู่ใน n8n "ตรวจอ้างอิงและจัดรูป"

import { foreignNote } from "./compose.mjs";

export const LINE_LENGTHS = [500, 1000, 3000, 6000, 12000];
export const LINE_PIECE_CHARS = 1500;
// จำนวนชิ้น [หนังสือ, คำเทศน์, พระไตรปิฎก] ตามความยาวที่เลือก (ทดสอบ 25 ต.ค.: 22 ชิ้น -> คำตอบ ~6,000 ตัวอักษรใน ~24 วินาที)
const QUOTA_BY_LENGTH = { 500: [3, 2, 1], 1000: [3, 3, 2], 3000: [6, 5, 3], 6000: [10, 8, 4], 12000: [12, 10, 5] };

// { mode, define, voice, length } -> { plain, length (ตัวอักษรที่สั่ง), quota }
export function linePlan({ mode, define, voice, length }) {
  const plain = mode === "counsel" && !define; // ปรึกษา: คำแนะนำแบบเพื่อน หลัก P1-P6 พรอมต์ counsel แทน common
  const chosen = LINE_LENGTHS.includes(Number(length)) ? Number(length) : 3000;
  return {
    plain,
    length: voice ? Math.min(chosen, 1500) : chosen, // ตอบเสียงให้สั้น
    quota: define ? [8, 6, 6] : plain ? [6, 6, 2] : QUOTA_BY_LENGTH[chosen],
  };
}

// sources ต้องมี tag S1, S2, ... แล้ว -> messages สำหรับ Haiku
export function lineMessages({ question, mode, define, voice, history, lesson, prompts }, plan, sources) {
  const p = prompts || {};
  const { plain, length } = plan;
  const n = length.toLocaleString("en-US");
  const srcText = sources.map((s) => `[${s.tag}] (${s.type}) ${s.cite}\n${s.text}`).join("\n\n");
  const lessonLine = mode === "learn" && lesson && !define ? `<lesson>บทที่ ${lesson.seq}: ${lesson.title}</lesson>\n` : "";
  const system = plain
    ? p.mode
    : [
        p.common,
        define ? p.define : p.mode,
        'รูปแบบ: ไม่ต้องเขียนหัวข้อ "อ้างอิง" ท้ายคำตอบ ระบบจะสร้างรายการอ้างอิงจากรหัส [S#] ที่คุณใช้ให้เอง ห้ามใช้ markdown ตัวหนา (**) เพราะ LINE ไม่แสดงผล',
      ].join("\n\n");
  // ไม่ส่งคำตอบเก่า (Haiku ลอกรูปแบบเก่า) ส่งเฉพาะคำถามก่อนหน้าไว้เข้าใจบริบท
  const prevQ = (Array.isArray(history) ? history : []).map(String).filter(Boolean).slice(-3);
  const context = prevQ.length ? `คำถามก่อนหน้าของผู้ใช้ (ใช้เข้าใจบริบทเท่านั้น):\n${prevQ.map((q) => `- ${q}`).join("\n")}\n\n` : "";
  const reminder = define
    ? "(ตอบตามแบบฟอร์มนิยาม ๑๔ หัวข้อ ใช้ทุกชิ้นที่เกี่ยวข้อง หัวข้อที่ไม่มีข้อมูลให้เขียนว่า ไม่พบในเอกสารที่มี)"
    : plain
      ? "(ใช้หลัก P1-P6 และ <sources> เป็นฐานคิดหลัก ทุกประโยคที่ให้แนวคิดหรือคำแนะนำต้องมีรหัส [P#] และ/หรือ [S#] ระบบจะลบรหัสออกเอง " +
        `ตอบเป็นภาษาเดียวกับผู้ใช้ เป็นกันเองแบบเพื่อน ภาษาสากล ไม่มีศัพท์ศาสนา ความยาวประมาณ ${n} ตัวอักษร ห้ามเกิน` +
        (length <= 500
          ? " คำตอบนี้ให้ย่อแบบฟอร์มเหลือไม่เกิน 4 ประโยคใน 2 ย่อหน้า: ประโยคเข้าใจความรู้สึก 1 ประโยค และคำแนะนำที่สำคัญที่สุด 2-3 ประโยค ไม่ถามกลับ ไม่ต้องครบทุกหัวข้อ"
          : "") +
        (voice ? " ผู้ใช้พูดด้วยเสียง ตอบเป็นภาษาพูด ประโยคสั้น" : "") +
        ")"
      : `(ตอบตามแบบฟอร์มของโหมดนี้ เขียนเฉพาะเนื้อหา ไม่บอกชื่อแหล่งในเนื้อความ ใช้ชิ้นที่เกี่ยวข้อง ความยาวประมาณ ${n} ตัวอักษร ห้ามเกิน)`;
  return [
    { role: "system", content: system },
    {
      role: "user",
      // ใหม่จากสมองกลาง: คำถามภาษาอื่นได้คำกำกับชื่อภาษา (foreignNote) เหมือนเว็บและ NOVA
      content: `${context}<sources>\n${srcText}\n</sources>\n${lessonLine}คำถาม: ${question}\n\n${reminder}${foreignNote(question)}`,
    },
  ];
}

// Haiku บางครั้งต่อรหัสทุกชิ้นที่ใช้ไปแล้วไว้ท้ายย่อหน้า ([S13][S1][S2]…[S14]) -> LINE แสดง "¹⁰ ¹ ² ³ …" (เห็นครั้งแรก 24 พ.ย. 2569)
// กลุ่มที่มีตั้งแต่ 4 รหัส: ตัดรหัสที่อ้างไปแล้วก่อนหน้า เก็บเฉพาะรหัสใหม่ กลุ่มปกติ 1-3 รหัสไม่แตะ (รูปแบบกลุ่มเดียวกับ n8n "ตรวจอ้างอิงและจัดรูป")
export function trimTagDumps(text) {
  const seen = new Set();
  return String(text).replace(/(?:\[S\d+\]\s*)+/g, (group) => {
    const tags = [...group.matchAll(/\[S(\d+)\]/g)].map((m) => m[1]);
    const keep = tags.length >= 4 ? tags.filter((t) => !seen.has(t)) : tags;
    tags.forEach((t) => seen.add(t));
    const tail = group.match(/\s*$/)[0];
    return keep.map((t) => `[S${t}]`).join("") + tail;
  });
}

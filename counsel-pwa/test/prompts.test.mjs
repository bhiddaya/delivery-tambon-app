import { test } from "node:test";
import assert from "node:assert/strict";
import { voiceCounselPrompt, READERS, COUNSEL_RULES } from "../src/prompts.mjs";
import { finishAnswer } from "../src/compose.mjs";
import { splitForSpeech } from "../src/paxa.mjs";

// ส่วนของพรอมต์ counsel จริงในฐานข้อมูล (รูปแบบเดียวกัน)
const COUNSEL = `คุณคือเพื่อนที่คอยรับฟัง
หลักที่ใช้ตอบ (ฐานคิดหลัก ทุกคำแนะนำต้องมาจากหลักเหล่านี้):
[P1] ไม่ทำร้ายชีวิตและไม่เบียดเบียน: เมตตาต่อตัวเองและคนอื่น
[P2] ไม่เอาของที่ไม่ใช่ของเรา: ซื่อตรงเรื่องเงิน
แหล่งความรู้เพิ่มเติม:
- <sources> คือคำสอนจากหนังสือ ใช้ขยายหลัก P1-P6 ให้ตรงกับปัญหาของผู้ใช้
- ทุกประโยคที่ให้แนวคิดหรือคำแนะนำ ต้องจบด้วยรหัสหลักที่ใช้ [P#] และ/หรือรหัสแหล่ง [S#] (ระบบจะลบรหัสออกก่อนส่ง ผู้ใช้ไม่เห็น)
- ความรู้จากศาสตร์อื่น ใช้ได้เฉพาะเพื่อช่วยให้ทำตามหลัก P1-P6 ได้จริง ห้ามใช้แทนหลัก
วิธีพูด:
- ไม่อ้างคัมภีร์

แบบคำตอบ:
[รับฟัง สะท้อนความรู้สึกแบบเพื่อน 1-2 ประโยค]
[มุมมอง จากหลัก P1-P6 ที่เกี่ยวข้อง ทุกประโยคมีรหัส]`;

test("พรอมต์ปรึกษาสำหรับเสียง Gemini ไม่มีรหัสหรือคำสั่งใส่รหัสเหลือเลย", () => {
  const cleaned = voiceCounselPrompt(COUNSEL);
  assert.doesNotMatch(cleaned, /รหัส|แบบคำตอบ/); // คำสั่งให้ใส่รหัสถูกตัดออกทั้งบรรทัด
  const out = cleaned + COUNSEL_RULES; // กติกาเสียงมีแค่ "ห้ามพูดรหัส" ไม่มีตัวรหัสให้เลียนแบบ
  assert.doesNotMatch(out, /\[P|\[S|P#|S#|P1-P6/);
  assert.match(out, /^ไม่ทำร้ายชีวิตและไม่เบียดเบียน/m); // เนื้อหาหลักยังอยู่ครบ
  assert.match(out, /ตามหลักทั้ง 6 ข้อ/);
  for (const r of Object.values(READERS)) assert.match(r, /search_teachings/);
});

test("ลบรหัสทุกรูปจากคำตอบ Haiku และเก็บที่มาจาก [S#] ในกลุ่ม", () => {
  const sources = [{ type: "book", cite: 'หนังสือ "ก"', text: "x" }, { type: "sermon", cite: '"ข"', text: "y" }];
  const out = finishAnswer("ลองหายใจช้า ๆ [P1, S2] แล้วค่อยคุย [S1][P5] นะ", sources);
  assert.equal(out.text, "ลองหายใจช้า ๆ แล้วค่อยคุย นะ");
  assert.deepEqual(out.cites, ['หนังสือ: หนังสือ "ก"', 'คำเทศน์: "ข"']);
});

test("แบ่งคำตอบเป็นช่วงอ่าน ต่อกลับได้ข้อความเดิม ช่วงแรกสั้น", () => {
  const text = "ฟังแล้วเข้าใจเลยว่าเหนื่อยมาก ลองพักสักครู่ หายใจช้า ๆ แล้วค่อยคิดเรื่องงานทีละเรื่อง นะครับ\nพรุ่งนี้ค่อยว่ากันใหม่";
  const parts = splitForSpeech(text, 20, 40);
  assert.equal(parts.join(""), text);
  assert.ok(parts.length >= 3);
  assert.ok(parts[0].trim().length >= 20 && parts[0].trim().length < 40);
});

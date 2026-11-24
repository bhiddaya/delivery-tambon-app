import { test } from "node:test";
import assert from "node:assert/strict";
import { lineMessages, linePlan, trimTagDumps } from "../src/line.mjs";

const prompts = { common: "COMMON", mode: "MODE", define: "DEFINE" };
const src = [{ tag: "S1", type: "book", cite: "หนังสือ ก", text: "เนื้อหา" }];

test("LINE: โควตาและความยาวเหมือน n8n เดิม", () => {
  assert.deepEqual(linePlan({ mode: "buddhayana", length: 6000 }), { plain: false, length: 6000, quota: [10, 8, 4] });
  assert.deepEqual(linePlan({ mode: "counsel", length: 12000, voice: true }), { plain: true, length: 1500, quota: [6, 6, 2] });
  assert.deepEqual(linePlan({ mode: "learn", define: true, length: 7 }).quota, [8, 6, 6]);
  assert.equal(linePlan({ mode: "learn", length: 7 }).length, 3000);
});

test("LINE: พรอมต์ ข้อความกำกับ บริบท บทเรียน และคำถามภาษาอื่น", () => {
  const [sys, user] = lineMessages(
    { question: "บุญคืออะไร", mode: "learn", history: ["ก่อนหน้า"], lesson: { seq: 2, title: "ศีล" }, prompts },
    linePlan({ mode: "learn", length: 1000 }),
    src,
  );
  assert.match(sys.content, /^COMMON\n\nMODE\n\nรูปแบบ:/);
  assert.match(user.content, /^คำถามก่อนหน้าของผู้ใช้[\s\S]*- ก่อนหน้า\n\n<sources>\n\[S1\] \(book\) หนังสือ ก\nเนื้อหา\n<\/sources>\n<lesson>บทที่ 2: ศีล<\/lesson>\nคำถาม: บุญคืออะไร\n\n\(ตอบตามแบบฟอร์มของโหมดนี้[\s\S]*1,000 ตัวอักษร ห้ามเกิน\)$/);
  const [csys, cuser] = lineMessages({ question: "What is merit?", mode: "counsel", prompts }, linePlan({ mode: "counsel", length: 500 }), src);
  assert.equal(csys.content, "MODE");
  assert.match(cuser.content, /ไม่เกิน 4 ประโยค[\s\S]*ไม่ใช่ภาษาไทย/);
  const [dsys] = lineMessages({ question: "นิยาม บุญ", mode: "buddhayana", define: true, prompts }, linePlan({ mode: "buddhayana", define: true }), src);
  assert.match(dsys.content, /^COMMON\n\nDEFINE/);
});

test("LINE: ตัดรหัสที่ Haiku ต่อทุกตัวไว้ท้ายย่อหน้า เก็บรหัสใหม่และกลุ่มปกติ", () => {
  const raw = "ก [S1][S2] ข [S3] ค [S2][S5]\n\nง [S13] [S1][S2][S3][S5]\n\nจ [S6][S7][S8][S9]";
  assert.equal(trimTagDumps(raw), "ก [S1][S2] ข [S3] ค [S2][S5]\n\nง [S13]\n\nจ [S6][S7][S8][S9]");
});

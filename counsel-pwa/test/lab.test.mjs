import { test } from "node:test";
import assert from "node:assert/strict";
import { countTerms, parseJudge, similarity } from "../src/lab.mjs";

test("ตรวจภาษาอื่น: ความตรงของเสียงไปกลับ คำสำคัญ และคะแนนผู้ตรวจ", () => {
  assert.equal(similarity("Merit, or puñña!", "merit or puñña"), 100);
  assert.ok(similarity("abcdefghij", "abcdexxxxx") <= 60);
  assert.deepEqual(countTerms(["วิปัสสนาญาณ", "ทิพโสตญาณ"], "มี วิปัสสนา ญาณ เท่านั้น"), { hit: 1, total: 2, missing: ["ทิพโสตญาณ"] });
  assert.deepEqual(parseJudge('```json\n{"faithful":4,"language":5,"complete":"3","issues":"ขาดข้อ 8"}\n```'), {
    faithful: 4, language: 5, complete: 3, issues: "ขาดข้อ 8",
  });
  assert.ok(parseJudge("ไม่ใช่ JSON").error);
});

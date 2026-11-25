import { test } from "node:test";
import assert from "node:assert/strict";
import { createKeyPicker } from "../src/gemini-keys.mjs";

test("คีย์ Gemini: ฟรีก่อน โควตาหมดใช้เสียเงิน 1 ชั่วโมง แล้วกลับมาฟรี", () => {
  let t = 0;
  const keys = createKeyPicker("FREE", "PAID", () => t);
  assert.equal(keys.current(), "FREE");
  assert.equal(keys.noteError("network closed"), false);
  assert.equal(keys.noteError("You exceeded your current quota"), true);
  assert.equal(keys.current(), "PAID");
  assert.equal(keys.noteError("RESOURCE_EXHAUSTED"), false); // สลับแล้ว ไม่ต้องสลับซ้ำ
  t += 3_600_001;
  assert.equal(keys.current(), "FREE");
  const freeOnly = createKeyPicker("FREE", "");
  assert.equal(freeOnly.noteError("429 quota"), false);
  assert.equal(freeOnly.current(), "FREE");
});

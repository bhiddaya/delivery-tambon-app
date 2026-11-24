import { test } from "node:test";
import assert from "node:assert/strict";
import { hasCrisisSignal } from "../src/safety.mjs";
import { createDailyLimiter } from "../src/ratelimit.mjs";
import { loadConfig, VOICES } from "../src/config.mjs";

test("พบสัญญาณวิกฤตจากคำที่กำหนด", () => {
  assert.equal(hasCrisisSignal("รู้สึกอยากตายบ่อยมาก"), true);
  assert.equal(hasCrisisSignal("คิดจะทำร้ายตัวเอง"), true);
});

test("ไม่แจ้งเตือนกับข้อความทั่วไป", () => {
  assert.equal(hasCrisisSignal("วันนี้เครียดเรื่องงานนิดหน่อย"), false);
  assert.equal(hasCrisisSignal(""), false);
});

test("จำกัดจำนวนครั้งต่อโทเค็นต่อวัน", () => {
  const limiter = createDailyLimiter(2);
  const now = new Date("2026-11-20T10:00:00Z");
  assert.equal(limiter.allow("a", now), true);
  assert.equal(limiter.allow("a", now), true);
  assert.equal(limiter.allow("a", now), false);
  assert.equal(limiter.allow("b", now), true);
  assert.equal(limiter.allow("a", new Date("2026-11-21T01:00:00Z")), true);
});

test("ค่าเริ่มต้นของเสียงเป็นเสียงผู้หญิง และเลือกเสียงที่ไม่รองรับไม่ได้", () => {
  assert.equal(loadConfig({}).voice, "Kore");
  assert.equal(loadConfig({ LIVE_VOICE: "Puck" }).voice, "Puck");
  assert.equal(loadConfig({ LIVE_VOICE: "ไม่มี" }).voice, "Kore");
  assert.ok(VOICES.female.length >= 2);
});

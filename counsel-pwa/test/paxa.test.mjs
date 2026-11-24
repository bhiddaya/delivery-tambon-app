import { test } from "node:test";
import assert from "node:assert/strict";
import { createChunker, createPaxa, keepSpaces, pcmChunks, thaiNumber, tidyThai } from "../src/paxa.mjs";

test("ข้อความของ Haiku เก็บช่องว่างไว้เป็นจุดเว้นหายใจ และอ่านตัวเลขเป็นคำ", () => {
  assert.equal(keepSpaces("จรณะ ๑๕ คือข้อปฏิบัติ  [S2] วิชชา ๘\nซึ่งเป็น"), "จรณะ สิบห้า คือข้อปฏิบัติ วิชชา แปด ซึ่งเป็น");
  assert.equal(tidyThai("จรณะ ๑๕ คือ"), "จรณะ สิบห้า คือ"); // คำถอดเสียงของ Gemini: ลบช่องว่างกลางคำ แต่เว้นรอบตัวเลข
  assert.equal(keepSpaces("ที่เป็น “ปัญญา” แท้ ๆ (พตฐ. เล่ม ๙ ข้อ ๑๒๗ - ๑๓๘)"), "ที่เป็น ปัญญา แท้ๆ พตฐ. เล่ม เก้า ข้อ หนึ่งร้อยยี่สิบเจ็ด ถึง หนึ่งร้อยสามสิบแปด");
});

test("อ้างอิงที่เขียนติดกันถูกเว้นวรรค ไม่อ่านเป็นพืด", () => {
  assert.equal(keepSpaces("ปรากฏในพระไตรปิฎกเล่ม๙ข้อ๑๒๗"), "ปรากฏในพระไตรปิฎก เล่ม เก้า ข้อ หนึ่งร้อยยี่สิบเจ็ด");
  assert.equal(keepSpaces("หนังสือคนเหนือธรรมดาหน้า 11"), "หนังสือคนเหนือธรรมดา หน้า สิบเอ็ด");
  assert.equal(keepSpaces("ข้อปฏิบัติ ข้างหน้า"), "ข้อปฏิบัติ ข้างหน้า"); // ไม่ใช่อ้างอิง (ไม่มีเลขตาม) ไม่แตะ
});

test("ภาษาอื่นไม่แปลงตัวเลขเป็นคำไทย", () => {
  assert.equal(keepSpaces('The eight "vijja" are listed in chapter 9 (verse 127).'), "The eight vijja are listed in chapter 9 verse 127 .");
  assert.equal(keepSpaces("八种明 第9卷"), "八种明 第9卷");
  assert.equal(keepSpaces("Merit, or *puñña*, is **good**"), "Merit, or puñña, is good");
  assert.equal(keepSpaces("八明是佛教的“วิชชา ๘”（วิปัสสนาญาณ）"), "八明是佛教的 วิชชา ๘ （วิปัสสนาญาณ）"); // จีนปนบาลีไทย: ไม่แปลงเลขเป็นคำไทย
  assert.equal(keepSpaces("วิชชา ๘ (eight knowledges)"), "วิชชา แปด eight knowledges"); // ไทยเป็นหลัก: แปลงตามเดิม
});

test("อ่านตัวเลขเป็นคำไทย", () => {
  const cases = { 0: "ศูนย์", 1: "หนึ่ง", 11: "สิบเอ็ด", 21: "ยี่สิบเอ็ด", 101: "หนึ่งร้อยเอ็ด", 2538: "สองพันห้าร้อยสามสิบแปด", 1000000: "หนึ่งล้าน", 603775: "หกแสนสามพันเจ็ดร้อยเจ็ดสิบห้า" };
  for (const [n, words] of Object.entries(cases)) assert.equal(thaiNumber(n), words);
});

test("แบ่งคำถอดเสียงเป็นช่วง: ช่วงแรกสั้น ตัดที่ช่องว่าง ไม่ตัดกลางคำ ที่เหลือส่งตอนจบเทิร์น", () => {
  const parts = [];
  const c = createChunker((p) => parts.push(p), 10, 20);
  for (const w of ["สวัสดี ", "ครับ ", "วันนี้", " อากาศ", " ดีมาก", " เลย", " นะครับ", " ไปเที่ยว", " กันไหม"]) c.push(w);
  c.end();
  assert.equal(parts.join(""), "สวัสดี ครับ วันนี้ อากาศ ดีมาก เลย นะครับ ไปเที่ยว กันไหม");
  assert.ok(parts.length >= 3);
  assert.ok(parts[0].length < 20);
  assert.ok(parts.slice(1).every((p) => p.startsWith(" "))); // ตัดที่ช่องว่างเสมอ ไม่ตัดกลางคำ
  c.push("ทิ้ง");
  c.reset();
  c.end();
  assert.equal(parts.join(""), "สวัสดี ครับ วันนี้ อากาศ ดีมาก เลย นะครับ ไปเที่ยว กันไหม");
});

test("ขอเสียง pcm 24 kHz ด้วย x-api-key และส่งทีละงาน", async () => {
  const calls = [];
  let running = 0;
  let maxRunning = 0;
  const fetchFn = async (url, init) => {
    running++;
    maxRunning = Math.max(maxRunning, running);
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    await new Promise((r) => setTimeout(r, 20));
    running--;
    return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer };
  };
  const synth = createPaxa("pk", fetchFn);
  const [a, b] = await Promise.all([synth("หนึ่ง", "khanomkrok"), synth("สอง", "foithong")]);
  assert.equal(maxRunning, 1); // แผนฟรีทำได้ทีละงาน
  assert.equal(calls[0].url, "https://api.paxalabs.com/v1/tts");
  assert.equal(calls[0].headers["x-api-key"], "pk");
  assert.deepEqual(calls[0].body, { text: "หนึ่ง", voice: "khanomkrok", model: "paxa-tts-flash-v2", format: "pcm", sample_rate: 24000 });
  assert.equal(a.length, 4);
  assert.equal(b.length, 4);
});

test("งานที่ล้มไม่ทำให้คิวค้าง", async () => {
  let n = 0;
  const fetchFn = async () => (++n === 1 ? { ok: false, status: 429 } : { ok: true, arrayBuffer: async () => new ArrayBuffer(2) });
  const synth = createPaxa("pk", fetchFn);
  await assert.rejects(synth("ก", "foithong"), /HTTP 429/);
  assert.equal((await synth("ข", "foithong")).length, 2);
});

test("ตัดช่องว่างกลางคำไทยจากคำถอดเสียง และแบ่ง pcm ทีละ 1 วินาที", () => {
  assert.equal(tidyThai("เข้าใจ เลย ว่า  การหงุดหงิด กับ คนในบ้าน OK นะ"), "เข้าใจเลยว่าการหงุดหงิดกับคนในบ้าน OK นะ");
  assert.equal(tidyThai("ลองดูนะ [S110, P1] การมีเพื่อน"), "ลองดูนะการมีเพื่อน");
  const parts = [];
  const c = createChunker((p) => parts.push(p), 5, 5);
  for (const w of ["ลอง ดูนะ ", "[S110,", " P1]", " การมี", " เพื่อน"]) c.push(w);
  c.end();
  assert.ok(parts.every((p) => (p.match(/\[/g) || []).length === (p.match(/\]/g) || []).length)); // ไม่ตัดกลางวงเล็บ
  const chunks = pcmChunks(Buffer.alloc(100000));
  assert.deepEqual(chunks.map((c) => Buffer.from(c, "base64").length), [48000, 48000, 4000]);
});

test("ความเร็วพูด: จำกัด 0.7-1.2 ขั้นละ 0.05 ค่าแปลกเป็น 1", async () => {
  const { speedOf } = await import("../src/paxa.mjs");
  assert.deepEqual([0.5, 0.72, 1, 1.13, 2, "x", undefined].map((v) => speedOf(v).toFixed(2)), ["0.70", "0.70", "1.00", "1.15", "1.20", "1.00", "1.00"]);
});

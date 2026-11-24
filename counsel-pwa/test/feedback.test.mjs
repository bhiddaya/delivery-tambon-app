import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAttachment } from "../src/feedback.mjs";

const b64 = (bytes) => Buffer.from(bytes).toString("base64");

test("ไฟล์แนบ: รับ PDF/PNG ที่หัวไฟล์ตรง ปฏิเสธชนิดอื่นและไฟล์ปลอม", () => {
  assert.equal(checkAttachment({ type: "application/pdf", data: b64("%PDF-1.7 x") }).ext, ".pdf");
  assert.equal(checkAttachment({ type: "image/png", data: b64([0x89, 0x50, 0x4e, 0x47, 1, 2]) }).ext, ".png");
  assert.throws(() => checkAttachment({ type: "text/html", data: b64("<html>") }), /เฉพาะภาพ/);
  assert.throws(() => checkAttachment({ type: "application/pdf", data: b64("<script>") }), /ไม่ตรง/);
  assert.throws(() => checkAttachment({ type: "image/png", data: "" }), /ว่าง/);
});

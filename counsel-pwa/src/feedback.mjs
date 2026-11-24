// ไฟล์แนบของรายงาน "ตอบไม่ถูก": ภาพหรือ PDF ที่ผู้ใช้ส่งมาเป็นหลักฐานคำตอบที่ถูก
// รับเฉพาะชนิดในรายการ และเช็กหัวไฟล์จริง (ไม่เชื่อชนิดที่ผู้ส่งบอก)

export const MAX_ATTACH_BYTES = 10 * 1024 * 1024;

const ATTACH = {
  "image/png": [".png", (b) => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))],
  "image/jpeg": [".jpg", (b) => b[0] === 0xff && b[1] === 0xd8],
  "image/webp": [".webp", (b) => b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP"],
  "application/pdf": [".pdf", (b) => b.toString("latin1", 0, 5) === "%PDF-"],
};

// file = { type, data: base64 } -> { buf, ext }  ไฟล์ผิดชนิด/ใหญ่เกิน/หัวไฟล์ไม่ตรง = throw
export function checkAttachment(file) {
  const rule = ATTACH[file?.type];
  if (!rule) throw new Error("แนบได้เฉพาะภาพ (png, jpg, webp) หรือ PDF");
  const buf = Buffer.from(String(file.data || ""), "base64");
  if (!buf.length || buf.length > MAX_ATTACH_BYTES) throw new Error("ไฟล์ว่างหรือใหญ่เกิน 10 MB");
  if (!rule[1](buf)) throw new Error("เนื้อไฟล์ไม่ตรงกับชนิดที่แจ้ง");
  return { buf, ext: rule[0] };
}

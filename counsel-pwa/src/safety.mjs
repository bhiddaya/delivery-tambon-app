// ตรวจสัญญาณวิกฤตจากข้อความที่ผู้ใช้พูดหรือพิมพ์ ก่อนส่งให้โมเดล
// เป็นตัวคัดกรองเบื้องต้นเท่านั้น ไม่แทนการดูแลของคนจริง

const PATTERNS = [
  /ฆ่าตัวตาย/,
  /ทำร้ายตัวเอง/,
  /กรีดข้อมือ/,
  /อยากตาย/,
  /ไม่อยากอยู่(ต่อ|แล้ว)/,
  /อยากหายไป/,
  /kill myself/i,
  /suicide/i,
];

export function hasCrisisSignal(text) {
  const s = String(text || "");
  return PATTERNS.some((p) => p.test(s));
}

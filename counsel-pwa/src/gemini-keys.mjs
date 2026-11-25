// คีย์ Gemini: ใช้แผนฟรีก่อน โควตาฟรีหมดแล้วใช้แผนเสียเงิน (เจ้าของสั่ง 25 พ.ย. 2569)
// เห็น error โควตา (429 / RESOURCE_EXHAUSTED / "exceeded your current quota") -> ใช้คีย์เสียเงิน PAID_HOURS ชั่วโมง
// แล้วกลับไปลองคีย์ฟรีใหม่ (โควตาฟรีรีเซ็ตรายวันและรายนาที) ไม่มีคีย์เสียเงิน = ใช้คีย์ฟรีอย่างเดียวเหมือนเดิม
// ponytail: จำสถานะในหน่วยความจำของเซิร์ฟเวอร์ รีสตาร์ตแล้วเริ่มที่คีย์ฟรีใหม่
export const PAID_HOURS = 1;
export const isQuotaError = (message) => /quota|RESOURCE_EXHAUSTED|\b429\b/i.test(String(message || ""));

export function createKeyPicker(freeKey, paidKey, now = () => Date.now()) {
  let paidUntil = 0;
  return {
    current: () => (paidKey && now() < paidUntil ? paidKey : freeKey),
    // true = เพิ่งสลับไปคีย์เสียเงิน (ควรต่อใหม่)
    noteError(message) {
      if (!paidKey || !isQuotaError(message) || now() < paidUntil) return false;
      paidUntil = now() + PAID_HOURS * 3_600_000;
      console.log(`gemini: free quota hit (${String(message).slice(0, 80)}), paid key for ${PAID_HOURS} h`);
      return true;
    },
  };
}

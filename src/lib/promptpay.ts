import generatePayload from "promptpay-qr";

/**
 * แปลงเลขพร้อมเพย์ (เบอร์โทร/เลขบัตรประชาชน) + จำนวนเงิน ให้เป็น payload มาตรฐาน EMVCo
 * สำหรับสร้าง QR โค้ดที่แอปธนาคารสแกนจ่ายได้จริง
 *
 * คืนค่า null ถ้าไม่มีเลขพร้อมเพย์ หรือจำนวนเงินไม่ถูกต้อง (ไม่ throw เพื่อให้ UI ซ่อน QR ได้เงียบๆ)
 */
export function promptpayPayload(promptpayId: string | null | undefined, amount: number): string | null {
  if (!promptpayId) return null;
  const digits = promptpayId.replace(/[\s-]/g, "");
  if (!/^\d{10}$|^\d{13}$|^\d{15}$/.test(digits)) return null;
  if (!(amount > 0)) return null;
  try {
    return generatePayload(digits, { amount: Math.round(amount * 100) / 100 });
  } catch {
    return null;
  }
}

/**
 * ส่งข้อความเข้าแชตผ่าน LIFF ไม่สำเร็จ
 * reason: not_in_client = เปิดนอกแอป LINE · scope_unavailable = LIFF ยังไม่เปิดสิทธิ์ chat_message.write ที่คอนโซล LINE · failed = LINE ปฏิเสธหรือส่งไม่ได้
 * code: รหัสจาก LINE (ถ้ามี) ไว้ให้ผู้ดูแลอ่านแล้วตามหาสาเหตุได้
 */
export class LiffSendError extends Error {
  reason: "not_in_client" | "scope_unavailable" | "failed";
  code?: string;

  constructor(reason: "not_in_client" | "scope_unavailable" | "failed", code?: string) {
    super(code ? `${reason}:${code}` : reason);
    this.name = "LiffSendError";
    this.reason = reason;
    this.code = code;
  }
}

/** รหัสข้อผิดพลาดจาก LiffError (สตริงหรือตัวเลข) ตัดให้สั้นก่อนแสดงบนหน้าจอ */
export function errorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return typeof code === "string" || typeof code === "number" ? String(code).slice(0, 40) : undefined;
}

const MANUAL = "กดเปิด LINE ด้านล่างเพื่อส่งเอง";

/** ข้อความบนหน้าจอเมื่อส่งเข้าแชตอัตโนมัติไม่ได้ (มีปุ่มสำรองเปิด LINE พร้อมข้อความเสมอ) */
export function sendFailureText(error: unknown): string {
  if (error instanceof LiffSendError) {
    if (error.reason === "scope_unavailable") return `ส่งเข้าแชตอัตโนมัติไม่ได้ เพราะ LIFF ยังไม่เปิดสิทธิ์ส่งข้อความ ${MANUAL}`;
    if (error.reason === "not_in_client") return `เปิดหน้านี้นอกแอป LINE จึงส่งเข้าแชตอัตโนมัติไม่ได้ ${MANUAL}`;
    return `ส่งเข้าแชตไม่สำเร็จ${error.code ? ` (${error.code})` : ""} ลองกดสั่งเลยอีกครั้ง หรือ${MANUAL}`;
  }
  return `ส่งเข้าแชตไม่สำเร็จ ลองกดสั่งเลยอีกครั้ง หรือ${MANUAL}`;
}

/**
 * รองรับการล็อกอิน/สมัครด้วย "เบอร์โทร หรือ อีเมล"
 *
 * ผู้ใช้กลุ่มเป้าหมายจำนวนมากไม่มีอีเมล เบอร์โทรจึงต้องใช้เป็นชื่อบัญชีได้
 *
 * Supabase ของโปรเจกต์นี้เปิดเฉพาะ email provider (phone provider ปิดอยู่
 * เพราะต้องต่อผู้ให้บริการ SMS ซึ่งมีค่าใช้จ่ายต่อข้อความ) เราจึงเก็บเบอร์
 * เป็น "อีเมลแฝง" ที่คำนวณจากเบอร์แบบตายตัว ผู้ใช้พิมพ์แค่เบอร์ ระบบแปลงให้เอง
 *
 * โดเมน .invalid สงวนไว้ตาม RFC 2606 ว่าจะไม่มีวันมีอยู่จริง
 * จึงไม่มีทางชนกับอีเมลของใคร และไม่มีทางส่งเมลออกไปหาใครโดยไม่ตั้งใจ
 *
 * ตัวยืนยันตัวตนจริงของระบบนี้คือการที่ตัวแทนตำบลกดอนุมัติ (profiles.approved)
 * ซึ่ง /driver และ /merchant บังคับใช้อยู่ ไม่ใช่การยืนยันอีเมล
 */

const PHONE_ALIAS_DOMAIN = "phone.invalid";

/**
 * แปลงเบอร์ไทยให้เป็นรูปแบบเดียว (E.164 ไม่มีเครื่องหมาย +) เช่น 66812345678
 *
 * รับได้ทุกแบบที่คนไทยพิมพ์จริง:
 *   0812345678 · 081-234-5678 · 081 234 5678 · +66812345678 · 66812345678
 *
 * คืน null ถ้าไม่ใช่เบอร์ที่ใช้ได้ — ผู้เรียกต้องเช็คเสมอ
 */
export function normalizePhone(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  // เหลือแต่ตัวเลข (ตัด +, -, เว้นวรรค, วงเล็บ ออก)
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;

  // +66812345678 / 66812345678 -> 66812345678
  if (digits.startsWith("66")) {
    const rest = digits.slice(2);
    // เบอร์ไทยหลังรหัสประเทศมี 8-9 หลัก และห้ามขึ้นต้นด้วย 0
    if (rest.length >= 8 && rest.length <= 9 && !rest.startsWith("0")) {
      return "66" + rest;
    }
    return null;
  }

  // 0812345678 (มือถือ 10 หลัก) / 045123456 (บ้าน 9 หลัก) -> ตัด 0 แล้วเติม 66
  if (digits.startsWith("0")) {
    const rest = digits.slice(1);
    if (rest.length >= 8 && rest.length <= 9) {
      return "66" + rest;
    }
    return null;
  }

  return null;
}

/** คืนเบอร์ในรูปแบบที่คนไทยอ่านคุ้น: 66812345678 -> 0812345678 */
export function formatPhoneLocal(normalized: string): string {
  if (normalized.startsWith("66")) return "0" + normalized.slice(2);
  return normalized;
}

/** อีเมลแฝงที่ใช้แทนเบอร์ในระบบ auth — คำนวณจากเบอร์แบบตายตัว */
export function phoneToAuthEmail(normalizedPhone: string): string {
  return `${normalizedPhone}@${PHONE_ALIAS_DOMAIN}`;
}

/** เป็นอีเมลแฝงของเบอร์หรือไม่ (ใช้ตอนแสดงผล จะได้ไม่โชว์อีเมลปลอมให้ผู้ใช้เห็น) */
export function isPhoneAuthEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.endsWith(`@${PHONE_ALIAS_DOMAIN}`));
}

/** ดึงเบอร์กลับจากอีเมลแฝง คืน null ถ้าไม่ใช่อีเมลแฝง */
export function phoneFromAuthEmail(email: string | null | undefined): string | null {
  if (!isPhoneAuthEmail(email)) return null;
  return email!.slice(0, -`@${PHONE_ALIAS_DOMAIN}`.length);
}

export type Identifier =
  | { kind: "email"; authEmail: string }
  | { kind: "phone"; authEmail: string; phone: string }
  | { kind: "invalid" };

/**
 * ดูว่าผู้ใช้พิมพ์อีเมลหรือเบอร์มา แล้วคืนอีเมลที่ต้องส่งให้ Supabase
 *
 * ตัดสินจากเครื่องหมาย @ ก่อน เพราะชัดเจนที่สุด — อีเมลทุกอันมี @
 * และไม่มีเบอร์โทรอันไหนมี
 */
export function resolveIdentifier(input: string): Identifier {
  const value = input.trim();
  if (!value) return { kind: "invalid" };

  if (value.includes("@")) {
    // ตรวจหยาบ ๆ พอให้จับพิมพ์ผิดชัด ๆ ที่เหลือให้ Supabase ตัดสิน
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      ? { kind: "email", authEmail: value.toLowerCase() }
      : { kind: "invalid" };
  }

  const phone = normalizePhone(value);
  if (!phone) return { kind: "invalid" };

  return { kind: "phone", authEmail: phoneToAuthEmail(phone), phone };
}

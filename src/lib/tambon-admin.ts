import type { Tables } from "@/lib/types";
import type { OrderRow } from "@/lib/domain";

/**
 * หลังบ้านตัวแทนตำบล (ระยะ 1: ดูอย่างเดียว) — ตัวช่วยคำนวณที่หน้า วันนี้ / ออเดอร์ / ร้านและไรเดอร์ ใช้ร่วมกัน
 * ข้อมูลทั้งหมดมาจาก RLS ของผู้ใช้ที่ล็อกอินอยู่ ตัวแทนจึงเห็นเฉพาะตำบลที่ได้รับแต่งตั้ง
 */

/** ออเดอร์ที่รอคนรับนานเกินนี้ถือว่าค้าง (นาที) */
export const STALE_PENDING_MINUTES = 10;

export function minutesSince(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}

export function ageLabel(iso: string, now: number): string {
  const m = minutesSince(iso, now);
  if (m < 60) return `${m} นาที`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ชม.`;
  return `${Math.floor(h / 24)} วัน`;
}

/** เริ่มวันนี้ตามเวลาไทย (UTC+7 ไม่มีเวลาออมแสง) */
export function bangkokDayStart(now: number): number {
  const offset = 7 * 3600 * 1000;
  return Math.floor((now + offset) / 86400000) * 86400000 - offset;
}

export type MerchantInfo = { merchant: Tables<"merchants">; profile: Tables<"profiles"> | undefined; menuCount: number };
export type DriverInfo = { driver: Tables<"drivers"> | undefined; profile: Tables<"profiles"> };

/** สิ่งที่ร้านยังขาดก่อนรับออเดอร์จริงได้ */
export function merchantGaps(m: MerchantInfo): string[] {
  if (m.profile?.suspended_at) return [`ถูกระงับ: ${m.profile.suspended_reason ?? "-"}`];
  return [
    m.profile && !m.profile.approved ? "รออนุมัติ" : null,
    !m.profile?.line_user_id ? "ยังไม่ผูก LINE (ไม่ได้รับแจ้งออเดอร์)" : null,
    m.merchant.lat == null || m.merchant.lng == null ? "ยังไม่ปักหมุด" : null,
    m.menuCount === 0 ? "ยังไม่มีเมนู" : null,
    !m.profile?.promptpay_id ? "ยังไม่ใส่พร้อมเพย์รับเงิน" : null,
  ].filter((x): x is string => Boolean(x));
}

/** สิ่งที่ไรเดอร์ยังขาดก่อนรับงานได้ */
export function driverGaps(d: DriverInfo): string[] {
  if (d.profile.suspended_at) return [`ถูกระงับ: ${d.profile.suspended_reason ?? "-"}`];
  return [
    !d.profile.approved ? "รออนุมัติ" : null,
    !d.profile.line_user_id ? "ยังไม่ผูก LINE (ไม่ได้รับแจ้งงานใหม่)" : null,
    !d.profile.promptpay_id ? "ยังไม่ใส่พร้อมเพย์รับเงิน" : null,
  ].filter((x): x is string => Boolean(x));
}

export type TodoItem = { key: string; text: string; href: string; urgent: boolean };

/** รายการ "ต้องทำตอนนี้" เรียงเรื่องด่วนก่อน — ว่างเมื่อไม่มีอะไรค้าง */
export function todoItems(input: {
  tambon: Tables<"tambons"> | null;
  orders: OrderRow[];
  settlements: Tables<"settlements">[];
  merchants: MerchantInfo[];
  drivers: DriverInfo[];
  now: number;
  q: string;
}): TodoItem[] {
  const { tambon, orders, settlements, merchants, drivers, now, q } = input;
  const out: TodoItem[] = [];
  if (tambon?.intake_blocked) {
    out.push({
      key: "blocked",
      text: `หยุดรับออเดอร์ใหม่อยู่: ${tambon.intake_blocked_reason ?? "ยอดค้างโอนเกินกำหนด"}`,
      href: `/admin/accounts${q}`,
      urgent: true,
    });
  }
  const pending = orders.filter((o) => o.status === "pending");
  const stale = pending.filter((o) => minutesSince(o.created_at, now) >= STALE_PENDING_MINUTES);
  if (pending.length) {
    out.push({
      key: "pending",
      text: `ออเดอร์รอคนรับ ${pending.length} รายการ${stale.length ? ` · ค้างเกิน ${STALE_PENDING_MINUTES} นาที ${stale.length}` : ""}`,
      href: `/admin/orders${q}`,
      urgent: stale.length > 0,
    });
  }
  const slips = orders.filter((o) => o.slip_submitted_at && !o.customer_paid_at && !o.payment_rejected_at);
  if (slips.length) {
    out.push({ key: "slips", text: `สลิปรอตรวจ ${slips.length} ใบ`, href: `/admin/accounts${q}`, urgent: true });
  }
  const owed = settlements.filter((s) => !s.paid_out_at);
  if (owed.length) {
    const overdue = owed.filter((s) => new Date(s.due_at).getTime() < now).length;
    const sum = owed.reduce((a, s) => a + Number(s.amount), 0);
    out.push({
      key: "owed",
      text: `ต้องโอนให้ร้าน/ไรเดอร์ ${owed.length} รายการ · ${sum.toLocaleString("th-TH")} บาท${overdue ? ` · เลยกำหนด ${overdue}` : ""}`,
      href: `/admin/accounts${q}`,
      urgent: overdue > 0,
    });
  }
  const waiting = countWaitingApproval(merchants, drivers);
  if (waiting) {
    out.push({ key: "approve", text: `รออนุมัติ ${waiting} ราย`, href: `/admin/approvals${q}`, urgent: false });
  }
  if (tambon && !tambon.settlement_promptpay_id) {
    out.push({
      key: "promptpay",
      text: "ยังไม่ได้ตั้งพร้อมเพย์รับเงินของตำบล — ลูกค้ายังโอนเข้าตำบลไม่ได้",
      href: `/admin/settings${q}`,
      urgent: false,
    });
  }
  const shopsNotReady = merchants.filter((m) => m.profile?.approved && merchantGaps(m).length > 0).length;
  if (shopsNotReady) {
    out.push({ key: "shops", text: `ร้านที่ยังตั้งค่าไม่ครบ ${shopsNotReady} ร้าน`, href: `/admin/people${q}`, urgent: false });
  }
  return out.sort((a, b) => Number(b.urgent) - Number(a.urgent));
}

/** ผู้สมัครที่รออนุมัติ (ไม่นับคนที่ถูกระงับ ซึ่งต้องคืนสิทธิ์แทน) */
export function countWaitingApproval(merchants: MerchantInfo[], drivers: DriverInfo[]): number {
  return (
    merchants.filter((m) => m.profile && !m.profile.approved && !m.profile.suspended_at).length +
    drivers.filter((d) => !d.profile.approved && !d.profile.suspended_at).length
  );
}

/** ลิงก์โทร: ตัดช่องว่าง/ขีดออก คืน null ถ้าไม่มีเบอร์ */
export function telHref(phone: string | null | undefined): string | null {
  const d = (phone ?? "").replace(/[^\d+]/g, "");
  return d.length >= 9 ? `tel:${d}` : null;
}

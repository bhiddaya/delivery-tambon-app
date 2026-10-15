import { homePathFor, type UserRole } from "@/lib/domain";

export type LineEntryRole = "auto" | "admin" | "merchant" | "driver" | "customer";

export function lineEntryRole(value: unknown): LineEntryRole {
  if (value === "agent" || value === "superadmin" || value === "admin") return "admin";
  return value === "merchant" || value === "driver" || value === "customer" ? value : "auto";
}

export type MissingRole = "merchant" | "driver" | "admin";

/**
 * ปุ่มที่กดเป็นบทบาทที่บัญชีนี้ไม่มี → ให้บอกตรงๆ แทนการพาไปหน้าอื่นเงียบๆ (ลูกค้ากดปุ่มร้านค้าแล้วเห็นหน้าลูกค้า ทำให้งง)
 * ส่วนกลางไม่ถือว่าขาดบทบาท (ปุ่มร้านค้า/ไรเดอร์ของส่วนกลางเปิดหน้าบัญชีทดสอบ) · ตัวแทนที่ได้รับแต่งตั้ง (admin_scopes) ถือว่ามีบทบาทตัวแทน
 */
export function lineEntryMissingRole(role: UserRole, requested: LineEntryRole, hasAdminScope = false): MissingRole | null {
  if (role === "superadmin") return null;
  if (requested === "merchant" && role !== "merchant") return "merchant";
  if (requested === "driver" && role !== "driver") return "driver";
  if (requested === "admin" && role !== "admin" && !hasAdminScope) return "admin";
  return null;
}

/** Requested menu items choose a destination, never grant a role or area. */
export function lineEntryPath(role: UserRole, requested: LineEntryRole, hasAdminScope = false): string {
  // เจ้าของไม่มีหน้าร้านหรือหน้าไรเดอร์ของตัวเอง: ปุ่มร้านค้า/ไรเดอร์ เปิดหน้าของบัญชีทดสอบ (is_test) แบบอ่านอย่างเดียว
  // เห็นแบบที่ผู้ใช้บทบาทนั้นเห็น ไม่ใช่ข้อมูลของทุกคน (ดู /view-as?demo=)
  if (role === "superadmin" && (requested === "merchant" || requested === "driver")) return `/view-as?demo=${requested}`;
  if (requested === "admin" && (role === "admin" || role === "superadmin" || hasAdminScope)) return "/admin/workspace";
  if (role === "admin" || role === "superadmin") return "/admin/workspace";
  return homePathFor(role);
}

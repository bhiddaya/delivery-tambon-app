import { homePathFor, type UserRole } from "@/lib/domain";

export type LineEntryRole = "auto" | "admin" | "merchant" | "driver" | "customer";

export function lineEntryRole(value: unknown): LineEntryRole {
  if (value === "agent" || value === "superadmin" || value === "admin") return "admin";
  return value === "merchant" || value === "driver" || value === "customer" ? value : "auto";
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

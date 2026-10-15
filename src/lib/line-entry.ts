import { homePathFor, type UserRole } from "@/lib/domain";

export type LineEntryRole = "auto" | "admin" | "merchant" | "driver" | "customer";

export function lineEntryRole(value: unknown): LineEntryRole {
  if (value === "agent" || value === "superadmin" || value === "admin") return "admin";
  return value === "merchant" || value === "driver" || value === "customer" ? value : "auto";
}

/** Requested menu items choose a destination, never grant a role or area. */
export function lineEntryPath(role: UserRole, requested: LineEntryRole, hasAdminScope = false): string {
  // เจ้าของไม่มีหน้าร้านหรือหน้าไรเดอร์ของตัวเอง: ปุ่มร้านค้า/ไรเดอร์ พาไปเลือกคนที่จะ "ดูแทน" (อ่านอย่างเดียว) ไม่ให้เข้าหน้าตัวแทนเหมือนกันหมด
  if (role === "superadmin" && requested === "merchant") return "/admin/people";
  if (role === "superadmin" && requested === "driver") return "/admin/people?tab=riders";
  if (requested === "admin" && (role === "admin" || role === "superadmin" || hasAdminScope)) return "/admin/workspace";
  if (role === "admin" || role === "superadmin") return "/admin/workspace";
  return homePathFor(role);
}

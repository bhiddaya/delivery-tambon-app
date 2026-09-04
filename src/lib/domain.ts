import type { Enums, Tables } from "@/lib/types";

export type OrderRow = Tables<"orders">;
export type OrderStatus = Enums<"order_status">;
export type OrderType = Enums<"order_type">;
export type VehicleType = Enums<"vehicle_type">;
export type UserRole = Enums<"user_role">;

export const STATUS_FLOW: OrderStatus[] = ["pending", "accepted", "in_progress", "delivered"];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "รอคนขับรับงาน",
  accepted: "คนขับรับงานแล้ว",
  in_progress: "กำลังดำเนินการ",
  delivered: "ส่งสำเร็จ",
  cancelled: "ยกเลิกแล้ว",
};

export const DRIVER_ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  accepted: "ไปถึงจุดรับแล้ว",
  in_progress: "ส่งสำเร็จแล้ว",
};

export const TYPE_LABEL: Record<OrderType, string> = {
  food: "ส่งอาหาร",
  parcel: "ส่งของ/พัสดุ",
  ride: "เรียกรถ",
};

export const VEHICLE_LABEL: Record<VehicleType, string> = {
  motorcycle: "มอเตอร์ไซค์",
  pickup: "รถกระบะ",
  trike: "สามล้อพ่วง",
  tractor: "รถอีแต๋น",
  bicycle: "จักรยาน",
  other: "อื่นๆ",
};

export const ROLE_LABEL: Record<UserRole, string> = {
  customer: "ลูกค้า",
  driver: "ไรเดอร์",
  merchant: "ร้านค้า",
  admin: "ตัวแทนตำบล",
  superadmin: "ส่วนกลาง",
};

/**
 * หน้าแรกของแต่ละบทบาท
 *
 * ทุกบทบาทมีหน้าเป็นชื่อเดียวกับบทบาท ยกเว้น superadmin ที่ยังไม่มีหน้าจอของตัวเอง
 * ถ้าปล่อยให้ต่อ path ตรง ๆ จะได้ /superadmin ซึ่งไม่มีอยู่จริง แล้วส่วนกลาง
 * จะล็อกอินเข้ามาเจอ 404 ทันที — ส่งไปหน้าตัวแทนตำบลไว้ก่อนจนกว่าจะมีหน้าของตัวเอง
 */
export function homePathFor(role: UserRole): string {
  return role === "superadmin" ? "/admin" : `/${role}`;
}

export function money(n: number): string {
  return Number(n ?? 0).toLocaleString("th-TH") + " บาท";
}

export function timeStr(iso: string): string {
  return new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

export function dateStr(iso: string): string {
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

/** คำนวณส่วนแบ่งรายได้ไรเดอร์ vs รายได้แพลตฟอร์ม (ค่าคอมมิชชัน) จากออเดอร์หนึ่งรายการ */
export function econ(order: Pick<OrderRow, "type" | "price" | "delivery_fee" | "items_subtotal">) {
  if (order.type === "ride") {
    const total = order.price;
    const driverEarn = Math.round(total * 0.85);
    return { driverEarn, platform: total - driverEarn };
  }
  const fee = order.delivery_fee || 0;
  const sub = order.items_subtotal || 0;
  const driverEarn = Math.round(fee * 0.85);
  const platform = fee - driverEarn + Math.round(sub * 0.1);
  return { driverEarn, platform };
}

export function mapsLink(address: string | null | undefined): string | null {
  if (!address) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

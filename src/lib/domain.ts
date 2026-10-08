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
  agri_service: "บริการการเกษตร",
};

export const VEHICLE_LABEL: Record<VehicleType, string> = {
  motorcycle: "มอเตอร์ไซค์",
  pickup: "รถกระบะ",
  trike: "สามล้อพ่วง",
  tractor: "รถอีแต๋น",
  bicycle: "จักรยาน",
  car: "รถยนต์",
  harvester: "รถเกี่ยวข้าว",
  rice_transplanter: "รถดำนา",
  drone: "โดรนเกษตร",
  other: "อื่นๆ",
};

/** ยานพาหนะที่ใช้รับงานส่งของ/รับส่งคน */
export const DELIVERY_VEHICLES: VehicleType[] = [
  "motorcycle",
  "pickup",
  "trike",
  "car",
  "bicycle",
];

/** เครื่องจักรที่ใช้รับงานบริการการเกษตร */
export const AGRI_VEHICLES: VehicleType[] = [
  "tractor",
  "harvester",
  "rice_transplanter",
  "drone",
];

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
 * ร้านค้าเปิดที่ออเดอร์เข้าร้าน เพื่อเห็นงานที่ต้องเตรียมก่อนจัดการเมนู
 * ส่วนกลางใช้หน้าตัวแทนตำบลร่วมกัน โดยขอบเขตข้อมูลยังคุมด้วย RLS
 * ถ้าปล่อยให้ต่อ path ตรง ๆ จะได้ /superadmin ซึ่งไม่มีอยู่จริง แล้วส่วนกลาง
 * จะล็อกอินเข้ามาเจอ 404 ทันที — ส่งไปหน้าตัวแทนตำบลไว้ก่อนจนกว่าจะมีหน้าของตัวเอง
 */
export function homePathFor(role: UserRole): string {
  if (role === "merchant") return "/merchant/orders";
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

/**
 * คำนวณส่วนแบ่งผู้ให้บริการ vs รายได้แพลตฟอร์ม (ค่าคอมมิชชัน) จากออเดอร์หนึ่งรายการ
 *
 * เรียกรถ: ผู้ขับได้ 85% ของค่าโดยสาร
 * ส่งอาหาร/ส่งของ: ผู้ส่งได้ 85% ของค่าส่ง แพลตฟอร์มได้ส่วนที่เหลือ + 10% ของค่าสินค้า
 *
 * ⚠️ บริการการเกษตร (agri_service) ยังไม่มีอัตราค่าคอมของตัวเอง
 * ตอนนี้จึงตกไปใช้สูตรเดียวกับงานส่งของ ซึ่งอาจไม่ตรงกับที่ตกลงกันจริง
 * ตัวเลข "ส่วนแบ่งของฉัน" ของงานเกษตรจึงถือเป็นค่าประมาณจนกว่าจะกำหนดอัตราจริง
 */
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

/**
 * ยอดที่ลูกค้าโอนเข้าบัญชีตำบล = ค่าสินค้า (ส่วนของร้าน) + ส่วนของไรเดอร์
 * ต้องตรงกับ public.order_customer_total และยอด settlements ที่ verify_customer_payment สร้าง
 */
export function customerTotal(order: Pick<OrderRow, "type" | "price" | "delivery_fee" | "items_subtotal">): number {
  const rider = order.type === "ride" ? Number(order.price || 0) : Number(order.delivery_fee || 0);
  return Number(order.items_subtotal || 0) + rider;
}

/** สถานะการโอนเข้าตำบลของออเดอร์ (D41 ขั้น 2: ตัวแทนตำบลตรวจสลิปเอง) */
export type SlipState = "none" | "submitted" | "rejected" | "verified";
export function slipState(
  order: Pick<OrderRow, "customer_paid_at" | "slip_submitted_at" | "payment_rejected_at">
): SlipState {
  if (order.customer_paid_at) return "verified";
  if (order.payment_rejected_at) return "rejected";
  if (order.slip_submitted_at) return "submitted";
  return "none";
}

export function mapsLink(address: string | null | undefined): string | null {
  if (!address) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

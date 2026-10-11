import type { MenuItem } from "./order-logic";
import { money } from "@/lib/domain";

/** ตำแหน่งจุดส่งที่ลูกค้าปักด้วย GPS */
export type Pin = { lat: number; lng: number; accuracy: number | null };

export function mapLink(pin: Pin): string {
  return `https://www.google.com/maps/search/?api=1&query=${pin.lat.toFixed(6)},${pin.lng.toFixed(6)}`;
}

export type OrderDraft = {
  tambonName: string;
  tambonSlug: string;
  shopId: string;
  shopName: string;
  lines: { item: MenuItem; quantity: number }[];
  subtotal: number;
  address: string;
  note: string;
  pin: Pin | null;
  /** ค่าส่งประมาณจากฐานข้อมูล (มีเมื่อปักตำแหน่งและคำนวณได้) ใส่เป็นบรรทัดให้คนอ่านในแชต บอทคำนวณและยืนยันค่าส่งจริงเอง */
  estimate?: { fee: number; km: number | null } | null;
};

// ห้ามมี # เพราะบอทอ่าน "#slug" เป็นคำสั่งตั้งตำบล และต้องเป็นบรรทัดเดียวต่อช่องเพื่อให้บอทอ่านง่าย
const safeLine = (text: string) => text.replace(/\s+/g, " ").trim().replace(/#/g, "＃");

/**
 * ข้อความสั่งซื้อที่ส่งเข้าแชต LINE
 * ทั้งเว็บและ LIFF ใช้รูปแบบเดียวกัน: ส่วนบนอ่านง่ายสำหรับคน บรรทัดสุดท้ายเป็นรหัสให้บอทอ่าน
 *     [order:v1 shop=<uuid> area=<slug> items=<uuid>x<จำนวน>,... lat=<ละติจูด> lng=<ลองจิจูด>]
 *   lat/lng มีเมื่อลูกค้าปักตำแหน่ง ขึ้นต้นด้วย 🛒 รายการสั่งซื้อ เพื่อให้บอทแยกออกจากคำสั่งอื่น
 *
 * ไฟล์นี้แยกจาก order-logic.ts เพราะ order-logic ถูกเทสต์โดยโหลดตรง ๆ ใน Node ซึ่งไม่รู้จักทางลัด "@/lib/..."
 */
export function buildOrderMessage(d: OrderDraft): string {
  const itemLines = d.lines.map(line => `${safeLine(line.item.name)} × ${line.quantity} = ${money(Number(line.item.price) * line.quantity)}`);
  const pin = d.pin ? [`พิกัด: ${d.pin.lat.toFixed(6)}, ${d.pin.lng.toFixed(6)}`, mapLink(d.pin)] : [];
  const note = safeLine(d.note);
  const code = [
    "order:v1",
    `shop=${d.shopId}`,
    `area=${d.tambonSlug}`,
    `items=${d.lines.map(line => `${line.item.id}x${line.quantity}`).join(",")}`,
    ...(d.pin ? [`lat=${d.pin.lat.toFixed(6)}`, `lng=${d.pin.lng.toFixed(6)}`] : []),
  ].join(" ");
  return [
    "🛒 รายการสั่งซื้อ",
    `ร้าน: ${safeLine(d.shopName)}`,
    `ตำบล: ${safeLine(d.tambonName)}`,
    ...itemLines,
    `รวมสินค้า ${money(d.subtotal)}`,
    ...(d.estimate
      ? [
          `ค่าส่งประมาณ ${money(d.estimate.fee)}${d.estimate.km !== null ? ` (≈ ${d.estimate.km.toFixed(1)} กม.)` : ""}`,
          `รวมประมาณ ${money(d.subtotal + d.estimate.fee)}`,
        ]
      : []),
    `จุดส่ง: ${safeLine(d.address)}`,
    ...pin,
    note ? `หมายเหตุ: ${note}` : "",
    `[${code}]`,
  ].filter(Boolean).join("\n");
}

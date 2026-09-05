import { econ, type OrderRow, type OrderType } from "@/lib/domain";

/**
 * สรุปรายรับจากรายการออเดอร์
 *
 * ตั้งใจคำนวณจาก "ออเดอร์ที่ส่งสำเร็จแล้ว" เท่านั้น (status = delivered)
 * เพราะงานที่ยังไม่จบยังไม่ใช่รายได้จริง — ถ้านับรวมจะได้ตัวเลขที่สูงเกินจริง
 * แล้วผู้ใช้จะไม่เชื่อถือหน้านี้อีกเลยเมื่อเจอว่ายอดลดลงเองทีหลัง
 */

export type Period = "today" | "7d" | "30d" | "all";

export const PERIOD_LABEL: Record<Period, string> = {
  today: "วันนี้",
  "7d": "7 วัน",
  "30d": "30 วัน",
  all: "ทั้งหมด",
};

/** จุดเริ่มของช่วงเวลา — "วันนี้" นับตามเที่ยงคืนของเครื่องผู้ใช้ ไม่ใช่ UTC */
export function periodStart(period: Period): Date | null {
  if (period === "all") return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (period === "7d") d.setDate(d.getDate() - 6);
  if (period === "30d") d.setDate(d.getDate() - 29);
  return d;
}

export function inPeriod(order: OrderRow, period: Period): boolean {
  const start = periodStart(period);
  if (!start) return true;
  return new Date(order.created_at) >= start;
}

export type EarningsSummary = {
  jobs: number;
  /** ยอดที่ลูกค้าจ่ายรวมทั้งหมด */
  gross: number;
  /** ส่วนที่ตกเป็นของผู้ให้บริการ */
  net: number;
  /** ส่วนที่เป็นค่าคอมของแพลตฟอร์ม */
  platform: number;
  byType: { type: OrderType; jobs: number; net: number }[];
};

/** สรุปรายรับฝั่ง "ผู้ให้บริการ" — ไรเดอร์ ผู้ขับ และผู้ให้บริการเกษตร */
export function summariseProvider(orders: OrderRow[]): EarningsSummary {
  const done = orders.filter((o) => o.status === "delivered");

  let gross = 0;
  let net = 0;
  let platform = 0;
  const perType = new Map<OrderType, { jobs: number; net: number }>();

  for (const o of done) {
    const e = econ(o);
    gross += Number(o.price) || 0;
    net += e.driverEarn;
    platform += e.platform;

    const cur = perType.get(o.type) ?? { jobs: 0, net: 0 };
    cur.jobs += 1;
    cur.net += e.driverEarn;
    perType.set(o.type, cur);
  }

  return {
    jobs: done.length,
    gross,
    net,
    platform,
    byType: [...perType.entries()]
      .map(([type, v]) => ({ type, ...v }))
      .sort((a, b) => b.net - a.net),
  };
}

/**
 * สรุปรายรับฝั่ง "ร้านค้า"
 *
 * ร้านได้ค่าสินค้าหักค่าคอมแพลตฟอร์ม 10% ส่วนค่าส่งเป็นของผู้ส่ง ไม่ใช่ของร้าน
 * จึงไม่นับรวมในรายรับร้าน มิฉะนั้นร้านจะเข้าใจผิดว่าได้เงินมากกว่าความจริง
 */
export type MerchantSummary = {
  orders: number;
  itemsTotal: number;
  commission: number;
  net: number;
};

export function summariseMerchant(orders: OrderRow[]): MerchantSummary {
  const done = orders.filter((o) => o.status === "delivered");
  const itemsTotal = done.reduce((s, o) => s + (Number(o.items_subtotal) || 0), 0);
  const commission = done.reduce(
    (s, o) => s + Math.round((Number(o.items_subtotal) || 0) * 0.1),
    0
  );
  return { orders: done.length, itemsTotal, commission, net: itemsTotal - commission };
}

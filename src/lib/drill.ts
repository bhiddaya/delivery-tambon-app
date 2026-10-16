import type { createClient } from "@/lib/supabase/client";

/**
 * ออเดอร์ซ้อม (is_drill): ออเดอร์ทดสอบที่ร้าน/ไรเดอร์/ตัวแทนจริงมองเห็น ไว้ทดสอบเสียงใน PWA
 * ไรเดอร์จริงเห็น: ออเดอร์จริง (อาหารต้องจ่ายแล้ว) + ออเดอร์ซ้อมทุกใบ · ไรเดอร์ทดสอบเห็นเฉพาะออเดอร์ทดสอบ
 * ส่งเป็นเงื่อนไขเดียวของ .or() เพราะ PostgREST รวมหลาย or() เป็น AND ซึ่งไม่ใช่ที่ต้องการตรงนี้
 */
export function riderOrderFilter(isTest: boolean): string {
  const ready = "or(type.neq.food,customer_paid_at.not.is.null)";
  return isTest ? `and(is_test.eq.true,${ready})` : `and(is_test.eq.false,${ready}),is_drill.eq.true`;
}

export type DrillArgs = { p_kind: "food"; p_merchant_id: string } | { p_kind: "ride"; p_tambon_id: string };

/** ส่งออเดอร์ซ้อม (เฉพาะเจ้าของ) คืนข้อความบอกผลสั้น ๆ */
export async function sendDrill(db: Pick<ReturnType<typeof createClient>, "rpc">, args: DrillArgs): Promise<string> {
  const { data, error } = await db.rpc("admin_send_drill_order", args);
  if (error) return error.message.includes("ร้านปิด") ? "ร้านนี้ปิดอยู่ ส่งไม่ได้ เลือกร้านที่เปิดอยู่" : "ส่งไม่สำเร็จ ลองอีกครั้ง";
  return `ส่งแล้ว ออเดอร์ซ้อม #${(data as { order_id: number }).order_id} · รอฟังเสียงได้เลย`;
}

/** ออเดอร์ซ้อมที่ยังเปิดอยู่ ใช้เป็นตัวส่งสัญญาณเสียงในหน้าส่งออเดอร์ซ้อม (ใบใหม่โผล่ = ดัง) */
export function activeDrillIds(orders: { id: number; status: string; is_drill?: boolean }[]): number[] {
  return orders.filter((o) => o.is_drill && ["pending", "accepted", "in_progress"].includes(o.status)).map((o) => o.id);
}

export type PushGroup = "merchant" | "driver" | "agent";
export type PushStatusRow = { group: PushGroup; label: string; devices: number };
const GROUP_TH: Record<PushGroup, string> = { agent: "ตัวแทน", driver: "ไรเดอร์", merchant: "ร้านค้า" };

/** รายชื่อคนจริง + จำนวนเครื่องที่เปิดแจ้งเตือน (เจ้าของดูว่าใครยังไม่เปิด) */
export async function loadPushStatus(db: Pick<ReturnType<typeof createClient>, "rpc">): Promise<PushStatusRow[] | null> {
  const { data, error } = await db.rpc("admin_push_status");
  return error ? null : (data as unknown as PushStatusRow[]);
}

/** สรุปต่อกลุ่ม: กี่คน เปิดแล้วกี่คน และใครยังไม่เปิด */
export function summarizePushStatus(rows: PushStatusRow[]) {
  return (["agent", "driver", "merchant"] as PushGroup[]).map((group) => {
    const list = rows.filter((r) => r.group === group);
    return { group, title: GROUP_TH[group], people: list.length, enabled: list.filter((r) => r.devices > 0).length, missing: list.filter((r) => r.devices === 0).map((r) => r.label) };
  });
}

/** ส่งสัญญาณทดสอบเสียงถึงทุกเครื่องที่เปิดแจ้งเตือน (เจ้าของเท่านั้น) คืนข้อความบอกผลสั้น ๆ */
export async function sendSoundTest(db: Pick<ReturnType<typeof createClient>, "rpc">): Promise<string> {
  const { data, error } = await db.rpc("admin_send_sound_test");
  if (error) return error.code === "54000" ? "ส่งสัญญาณได้ทุก 1 นาที รอสักครู่แล้วกดใหม่" : "ส่งไม่สำเร็จ ลองอีกครั้ง";
  const devices = ((data as { devices?: Record<string, number> } | null)?.devices ?? {}) as Record<string, number>;
  const total = Object.values(devices).reduce((sum, n) => sum + n, 0);
  if (!total) return "ยังไม่มีใครเปิดแจ้งเตือน จึงยังไม่มีเครื่องรับสัญญาณ";
  const parts = (["agent", "driver", "merchant"] as PushGroup[]).filter((g) => devices[g]).map((g) => `${GROUP_TH[g]} ${devices[g]}`);
  return `ส่งสัญญาณแล้วถึง ${total} เครื่อง (${parts.join(" · ")}) ให้ฟังที่มือถือ`;
}

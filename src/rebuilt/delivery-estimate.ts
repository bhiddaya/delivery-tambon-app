import type { createClient } from "@/lib/supabase/client";
import type { Pin } from "./order-message";

type Db = ReturnType<typeof createClient>;

/** ค่าส่งประมาณจากฐานข้อมูล: สูตรของตำบล × ระยะเส้นตรงจากร้านถึงจุดส่ง (ตัวแทนยืนยันค่าส่งจริงในแชต) */
export type DeliveryEstimate = { fee: number; km: number | null };

/** ไกลกว่านี้ (กม.) เตือนให้ตรวจตำแหน่ง ไม่ได้ห้ามสั่ง */
export const FAR_KM = 15;

/** คีย์ของจุดที่ใช้คำนวณ ไว้เช็กว่าผลที่ถืออยู่ยังตรงกับตำแหน่งปัจจุบัน */
export function estimateKey(shopId: string, pin: Pin): string {
  return `${shopId}:${pin.lat.toFixed(6)},${pin.lng.toFixed(6)}`;
}

/** คืน null ถ้าคำนวณไม่ได้ (ร้านปิด ตำแหน่งผิด หรือเรียกฐานข้อมูลไม่สำเร็จ) หน้าจอจะกลับไปแสดงสูตรของตำบลแทน */
export async function loadDeliveryEstimate(db: Db, shopId: string, pin: Pin): Promise<DeliveryEstimate | null> {
  const { data, error } = await db.rpc("estimate_delivery_fee", { p_shop_id: shopId, p_lat: pin.lat, p_lng: pin.lng });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
  const row = data as { ok?: unknown; fee?: unknown; distance_km?: unknown };
  if (row.ok !== true || row.fee === null || row.fee === undefined) return null;
  const fee = Number(row.fee);
  if (!Number.isFinite(fee)) return null;
  const km = row.distance_km === null || row.distance_km === undefined ? null : Number(row.distance_km);
  return { fee, km: km !== null && Number.isFinite(km) ? km : null };
}

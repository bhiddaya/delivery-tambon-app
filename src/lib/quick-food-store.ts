import type { Basket } from "@/rebuilt/order-logic";

/** ตะกร้าของแต่ละร้านเก็บใน sessionStorage ของหน้าต่าง LIFF — หน้าแรกและหน้าร้านใช้กุญแจเดียวกัน */
export const quickFoodKey = (shopId: string) => `quick-food:${shopId}`;

export function readBasket(shopId: string): Basket {
  try {
    const v = JSON.parse(sessionStorage.getItem(quickFoodKey(shopId)) ?? "{}");
    return v && typeof v.basket === "object" && !Array.isArray(v.basket) ? v.basket : {};
  } catch { return {}; }
}

/** เปลี่ยนตะกร้าจากหน้าแรก: เก็บหมายเหตุ/ออเดอร์เดิมไว้ แต่ทิ้งใบสรุปยอดเก่าเพราะรายการเปลี่ยนแล้ว */
export function writeBasket(shopId: string, basket: Basket) {
  try {
    const old = JSON.parse(sessionStorage.getItem(quickFoodKey(shopId)) ?? "{}") ?? {};
    delete old.quote;
    sessionStorage.setItem(quickFoodKey(shopId), JSON.stringify({ ...old, basket }));
  } catch { /* optional storage */ }
}

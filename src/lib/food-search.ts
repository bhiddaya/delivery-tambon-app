/**
 * ค้นหาสินค้า/เมนูจากข้อความที่คนพิมพ์เข้ามาในแชท LINE
 *
 * เจตนา: คนไม่ได้คิดว่า "ร้านไหนมี" เขาคิดว่า "อยากกินอะไร"
 * ประโยคที่พิมพ์เข้ามาจึงเป็นภาษาพูด ไม่ใช่คำค้น — "อยากกินข้าวมันไก่"
 * หน้าที่ของไฟล์นี้คือถอดคำนำหน้า/ท้ายทิ้ง ให้เหลือแต่ชื่อของ
 *
 * ตั้งใจ **ไม่ใช้ AI** ในขั้นนี้ เพราะ:
 * - เสียเงินทุกครั้งที่มีคนทัก และช้าขึ้น 2-3 วินาทีต่อข้อความ
 * - ที่จำนวนสินค้าระดับตำบล การตัดคำด้วยรายการคำสั้น ๆ แม่นพอ ๆ กัน
 * - เมื่อผิด มันผิดแบบที่อ่านโค้ดแล้วรู้ว่าทำไม ต่างจากโมเดลที่เดาไม่ถูก
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

/**
 * คำที่คนพูดติดปากแต่ไม่ใช่ชื่อของ — ตัดออกก่อนค้น
 * เรียงจากยาวไปสั้น เพราะตัดตัวยาวก่อนจะไม่ถูกตัวสั้นกินไปครึ่งคำ
 * (เช่นถ้าตัด "อยาก" ก่อน "อยากกิน" จะเหลือ "กิน" ค้างอยู่)
 */
const FILLER_WORDS = [
  "อยากรับประทาน",
  "อยากกิน",
  "อยากทาน",
  "อยากดื่ม",
  "อยากได้",
  "อยากซื้อ",
  "ขอซื้อ",
  "ขอถาม",
  "มีร้านไหนขาย",
  "ร้านไหนมี",
  "ร้านไหนขาย",
  "มีขายไหม",
  "มีไหม",
  "มีมั้ย",
  "ใกล้ที่สุด",
  "ที่ไหนมี",
  "ใกล้ฉัน",
  "ใกล้ๆ",
  "ใกล้ ๆ",
  "แถวนี้",
  "ตรงไหน",
  "เท่าไร",
  "เท่าไหร่",
  "ราคา",
  "สั่งซื้อ",
  "อยาก",
  "ช่วยหา",
  "ค้นหา",
  "อยู่ไหน",
  "หน่อย",
  "ครับ",
  "ค่ะ",
  "คะ",
  "จ้า",
  "บ้าง",
  "ไหม",
  "มั้ย",
  "ขาย",
  "สั่ง",
  "ซื้อ",
  "หา",
  "มี",
];

/**
 * ถอดประโยคพูดให้เหลือคำค้น
 * คืน null ถ้าเหลือสั้นเกินกว่าจะค้นได้อย่างมีความหมาย
 */
export function extractSearchTerm(raw: string): string | null {
  let text = raw.trim();

  // เครื่องหมายวรรคตอนและอิโมจิที่ไม่ช่วยในการค้น
  text = text.replace(/[?!.,"'`~@#$%^&*()_+=[\]{}<>/\\|]/g, " ");

  for (const word of FILLER_WORDS) {
    text = text.split(word).join(" ");
  }

  // ยุบช่องว่างซ้ำ แล้วต่อกลับเป็นคำเดียว เพราะภาษาไทยไม่มีช่องว่างระหว่างคำ
  // การเว้นวรรคที่เหลือมักเกิดจากคำที่เราเพิ่งตัดออกไป ไม่ใช่ขอบเขตคำจริง
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;

  // เอาชิ้นที่ยาวที่สุด — ปกติคือชื่อของ ส่วนชิ้นสั้น ๆ ที่เหลือมักเป็นเศษคำ
  const term = parts.reduce((a, b) => (b.length > a.length ? b : a));

  return term.length >= 2 ? term : null;
}

export type MenuHit = {
  merchantId: string;
  merchantName: string;
  merchantCategory: string | null;
  itemName: string;
  price: number;
};

export type ShopResult = {
  merchantId: string;
  merchantName: string;
  merchantCategory: string | null;
  items: { name: string; price: number }[];
  cheapest: number;
};

/**
 * ค้นแล้วจัดกลุ่มตามร้าน
 *
 * เรียงร้านตาม "ของถูกที่สุดในร้าน" ไม่ใช่ระยะทาง —
 * เพราะตอนนี้มีร้านไม่กี่ร้านในตำบลเดียว การจัดอันดับตามระยะจึงไม่มีความหมาย
 * (และร้านส่วนใหญ่ยังไม่ได้ปักพิกัดด้วย) เมื่อร้านเยอะขึ้นค่อยเปลี่ยนเกณฑ์
 */
export async function searchMenu(
  supabase: SupabaseClient<Database>,
  term: string,
  tambonId?: string | null
): Promise<ShopResult[]> {
  const { data, error } = await supabase.rpc("search_menu", {
    p_query: term,
    p_tambon: tambonId ?? null,
  });

  if (error) {
    console.error("[food-search] ค้นหาไม่สำเร็จ", error.message);
    return [];
  }

  const byShop = new Map<string, ShopResult>();

  for (const row of data ?? []) {
    const existing = byShop.get(row.merchant_id);
    const item = { name: row.item_name, price: Number(row.price) };

    if (existing) {
      existing.items.push(item);
      existing.cheapest = Math.min(existing.cheapest, item.price);
    } else {
      byShop.set(row.merchant_id, {
        merchantId: row.merchant_id,
        merchantName: row.merchant_name,
        merchantCategory: row.merchant_category,
        items: [item],
        cheapest: item.price,
      });
    }
  }

  return [...byShop.values()].sort((a, b) => a.cheapest - b.cheapest);
}

export type ShopKind = "food" | "goods";

// ponytail: ประเภทร้านเดาจากข้อความ category ที่ร้านพิมพ์เอง ถ้าต้องแม่นกว่านี้ค่อยเพิ่มคอลัมน์ประเภทร้านในฐานข้อมูล
const GOODS = /ของแห้ง|ของใช้|อุปโภค|ของชำ|มินิมาร์ท|มินิมาร์ต|ร้านค้า|โชห่วย|ของกินของใช้|ซูเปอร์/;

/** ร้านขายของแห้ง/ของใช้ = goods · อื่น ๆ (ร้านอาหาร เครื่องดื่ม หรือไม่ระบุ) = food */
export function shopKind(category: string | null | undefined): ShopKind {
  return GOODS.test(category ?? "") ? "goods" : "food";
}

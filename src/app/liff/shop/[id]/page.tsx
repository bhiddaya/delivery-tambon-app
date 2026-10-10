import type { Metadata } from "next";
import ShopOrdering from "@/rebuilt/ShopOrdering";

export const metadata: Metadata = {
  title: "เมนูร้าน — บวรไทย",
  description: "เลือกเมนู ใส่ตะกร้า ปักตำแหน่งจุดส่ง แล้วกดสั่งเลย",
};

/** หน้าร้านของ LIFF: ในแอป LINE ปุ่ม "สั่งเลย" ส่งรายการเข้าแชตให้ นอกแอป LINE ใช้ทางเดิมของหน้าเว็บ */
export default function LiffShopPage() {
  return <ShopOrdering mode="liff" />;
}

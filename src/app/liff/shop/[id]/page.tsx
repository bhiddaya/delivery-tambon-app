import type { Metadata } from "next";
import QuickFoodOrder from "@/components/QuickFoodOrder";

export const metadata: Metadata = {
  title: "เมนูร้าน — บวรไทย",
  description: "เพิ่มลดอาหารได้ต่อเนื่อง เลือกครบแล้วสรุปอาหารและค่าส่ง ยืนยันก่อนแสดง QR",
};

/** Remount the basket when the shop changes; never carry another shop's quantities into this one. */
export default async function LiffShopPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <QuickFoodOrder key={id} />;
}

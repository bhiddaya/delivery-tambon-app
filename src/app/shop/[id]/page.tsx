import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import ShopOrdering from "@/rebuilt/ShopOrdering";

export const metadata: Metadata = {
  title: "เมนูร้าน — บวรไทย Delivery",
  description: "ดูเมนู รูป และราคาของร้านในตำบล เลือกรายการ แล้วยืนยันผ่าน LINE บวรไทย",
};

/** หน้าร้านสาธารณะ — ดูเมนู รูป ราคา และใส่ตะกร้าได้โดยไม่ต้องล็อกอิน (ข้อมูลเมนูมาจากสิทธิ์อ่านของ anon ที่ฐานข้อมูล) */
export default function PublicShopPage() {
  return (
    <div className="min-h-screen bg-[#fbfaf6] text-[#1c2333]">
      <header className="border-b border-[#e7e9e1] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/delivery" aria-label="บวรไทย Delivery หน้าหลัก" className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#2e3e68] text-white"><ShoppingBag size={24} aria-hidden="true" /></span>
            <span><span className="block font-display text-xl text-[#2e3e68]">บวรไทย</span><span className="text-[11px] tracking-widest text-[#5b6478]">DELIVERY • ชุมชนของเรา</span></span>
          </Link>
          <Link href="/login" className="text-sm font-semibold text-[#2e3e68]">เข้าสู่ระบบ</Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-6 sm:px-8"><ShopOrdering /></main>
    </div>
  );
}

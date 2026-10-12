"use client";
import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Search, Store } from "lucide-react";
import { money } from "@/lib/domain";
import { ProductPhoto } from "@/rebuilt/primitives";

export type BrowserShop = { id: string; name: string; category: string | null; isOpen: boolean };
export type BrowserGroup = { id: string; label: string; shops: BrowserShop[] };
export type BrowserItem = { id: string; name: string; price: number; photo: string | null; description: string | null; shopId: string; shopName: string; shopOpen: boolean };

const norm = (s: string | null | undefined) => (s ?? "").toLocaleLowerCase("th-TH");

/** หน้าแรก LIFF แบบแอปสั่งอาหาร: ค้นหาร้านหรืออาหาร · การ์ดอาหาร 2 คอลัมน์ · รายชื่อร้านตามตำบล กดแล้วไปหน้าติ๊กเลือกของร้าน */
export default function LiffFoodBrowser({ groups, items }: { groups: BrowserGroup[]; items: BrowserItem[] }) {
  const [query, setQuery] = useState("");
  const q = norm(query.trim());
  const hit = (...fields: (string | null)[]) => !q || fields.some(f => norm(f).includes(q));
  // ponytail: กรองในเครื่องทั้งหมด พอสำหรับร้อยกว่าเมนู ถ้าเมนูเป็นพัน ๆ ค่อยย้ายไปค้นในฐานข้อมูล (search_menu)
  // ร้านเปิดขึ้นก่อน ร้านปิดตามท้าย (sort ของ JS คงลำดับเดิมเมื่อเท่ากัน)
  const foods = items.filter(i => hit(i.name, i.description, i.shopName)).sort((a, b) => Number(b.shopOpen) - Number(a.shopOpen));
  const foodShops = new Set(foods.map(i => i.shopId));
  const shopGroups = groups.map(g => ({ ...g, shops: g.shops.filter(s => hit(s.name, s.category) || (q && foodShops.has(s.id))) })).filter(g => g.shops.length);

  return <div className="mt-4">
    <label className="sticky top-0 z-10 -mx-4 block bg-[#fbfaf6] px-4 py-2">
      <span className="sr-only">ค้นหาร้านหรืออาหาร</span>
      <span className="flex min-h-12 items-center gap-2 rounded-full border border-[#dbdfd5] bg-white px-4">
        <Search size={18} aria-hidden="true" className="flex-none text-[#5b6478]" />
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหาร้านหรืออาหาร" className="min-w-0 flex-1 bg-transparent py-3 text-base outline-none" />
      </span>
    </label>

    {foods.length > 0 && <section className="mt-4">
      <h2 className="mb-3 text-lg font-semibold">{q ? `อาหารที่พบ (${foods.length})` : "เมนูน่าสั่ง"}</h2>
      <div className="grid grid-cols-2 gap-x-3 gap-y-5">
        {foods.map(item => <Link key={item.id} href={`/liff/shop/${encodeURIComponent(item.shopId)}`} className={`min-w-0 active:opacity-80 ${item.shopOpen ? "" : "opacity-60"}`}>
          <div className="relative">
            <ProductPhoto src={item.photo} name={item.name} className={`aspect-square rounded-2xl ${item.shopOpen ? "" : "grayscale"}`} />
            {!item.shopOpen && <span className="absolute left-2 top-2 rounded-full bg-[#1c2333]/80 px-2.5 py-1 text-xs font-semibold text-white">ร้านปิดอยู่</span>}
          </div>
          <p className="mt-2 truncate text-base font-semibold">{item.name}</p>
          <p className="truncate text-sm text-[#5b6478]">{item.shopName}</p>
          <p className="mt-1 text-lg font-bold text-[#c2410c]">{money(item.price)}</p>
        </Link>)}
      </div>
    </section>}

    {shopGroups.map(g => <section key={g.id} className="mt-6">
      <h2 className="mb-2 text-sm font-semibold text-[#5b6478]">ร้านใน{g.label}</h2>
      <div className="divide-y divide-[#e7e9e1] overflow-hidden rounded-2xl border border-[#dbdfd5] bg-white">
        {g.shops.map(shop => <Link key={shop.id} href={`/liff/shop/${encodeURIComponent(shop.id)}`} className="flex items-center gap-3 px-4 py-4 active:bg-[#f3f4f8]">
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-[#e4e7f0] text-[#2e3e68]"><Store size={22} aria-hidden="true" /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{shop.name}</span>
            {shop.category && <span className="block text-xs text-[#5b6478]">{shop.category}</span>}
            {!shop.isOpen && <span className="mt-1 inline-block rounded-full bg-[#eff1ec] px-2 py-0.5 text-xs text-[#5b6478]">ปิดอยู่ · ดูเมนูได้ ยังสั่งไม่ได้</span>}
          </span>
          <span className="flex flex-none items-center text-sm font-semibold text-[#2e3e68]">ดูเมนู<ChevronRight size={18} aria-hidden="true" /></span>
        </Link>)}
      </div>
    </section>)}

    {q && !foods.length && !shopGroups.length && <p role="status" className="mt-6 rounded-2xl bg-[#eff1ec] p-5 text-sm leading-7 text-[#5b6478]">ไม่พบร้านหรืออาหาร &quot;{query.trim()}&quot; ลองคำอื่น เช่น ส้มตำ ข้าว ก๋วยเตี๋ยว</p>}
  </div>;
}

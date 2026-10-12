"use client";
import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Search, Store } from "lucide-react";
import { money } from "@/lib/domain";
import { ProductPhoto } from "@/rebuilt/primitives";
import { shopKind, type ShopKind } from "@/lib/shop-kind";

export type BrowserShop = { id: string; name: string; category: string | null; isOpen: boolean };
export type BrowserGroup = { id: string; label: string; shops: BrowserShop[] };
export type BrowserItem = { id: string; name: string; price: number; photo: string | null; description: string | null; shopId: string; shopName: string; shopOpen: boolean };

type Filter = "all" | ShopKind | "open";
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "ทั้งหมด" },
  { id: "food", label: "อาหาร" },
  { id: "goods", label: "ของแห้ง ของใช้" },
  { id: "open", label: "เปิดอยู่" },
];

const norm = (s: string | null | undefined) => (s ?? "").toLocaleLowerCase("th-TH");
const shopHref = (id: string) => `/liff/shop/${encodeURIComponent(id)}`;

function ItemCard({ item, wide }: { item: BrowserItem; wide?: boolean }) {
  return <Link href={shopHref(item.shopId)} className={`min-w-0 active:opacity-80 ${wide ? "w-36 flex-none snap-start" : ""} ${item.shopOpen ? "" : "opacity-60"}`}>
    <div className="relative">
      <ProductPhoto src={item.photo} name={item.name} className={`aspect-square rounded-2xl border border-[#e7e9e1] ${item.shopOpen ? "" : "grayscale"}`} />
      {!item.shopOpen && <span className="absolute left-2 top-2 rounded-full bg-[#1c2333]/80 px-2.5 py-1 text-xs font-semibold text-white">ร้านปิดอยู่</span>}
    </div>
    <p className="mt-2 text-lg font-bold">{money(item.price)}</p>
    <p className="line-clamp-2 text-sm leading-5">{item.name}</p>
    {!wide && <p className="truncate text-xs text-[#5b6478]">{item.shopName}</p>}
  </Link>;
}

/**
 * หน้าแรก LIFF แบบ LINE MAN: ค้นหา · ตัวกรอง (อาหาร / ของแห้ง ของใช้ / เปิดอยู่)
 * ไม่ค้นหา = แยกเป็นร้าน แต่ละร้านมีแถบสินค้าเลื่อนข้าง · ค้นหา = การ์ด 2 คอลัมน์
 * กดสินค้าหรือร้านแล้วไปหน้าร้าน (ตะกร้าอยู่ที่หน้าร้าน หนึ่งออเดอร์ต่อหนึ่งร้าน)
 */
export default function LiffFoodBrowser({ groups, items }: { groups: BrowserGroup[]; items: BrowserItem[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const q = norm(query.trim());
  const hit = (...fields: (string | null)[]) => !q || fields.some(f => norm(f).includes(q));
  const allShops = groups.flatMap(g => g.shops);
  const shopOk = (s: BrowserShop) => filter === "all" || (filter === "open" ? s.isOpen : shopKind(s.category) === filter);
  const okShopIds = new Set(allShops.filter(shopOk).map(s => s.id));
  // ponytail: กรองในเครื่องทั้งหมด พอสำหรับร้อยกว่าเมนู ถ้าเมนูเป็นพัน ๆ ค่อยย้ายไปค้นในฐานข้อมูล (search_menu)
  // ร้านเปิดขึ้นก่อน ร้านปิดตามท้าย (sort ของ JS คงลำดับเดิมเมื่อเท่ากัน)
  const foods = items.filter(i => okShopIds.has(i.shopId) && hit(i.name, i.description, i.shopName)).sort((a, b) => Number(b.shopOpen) - Number(a.shopOpen));
  const foodShops = new Set(foods.map(i => i.shopId));
  const shopGroups = groups
    .map(g => ({ ...g, shops: g.shops.filter(s => okShopIds.has(s.id) && (hit(s.name, s.category) || (q && foodShops.has(s.id)))).sort((a, b) => Number(b.isOpen) - Number(a.isOpen)) }))
    .filter(g => g.shops.length);

  return <div className="mt-2">
    <div className="sticky top-0 z-10 -mx-4 bg-[#fbfaf6] px-4 pb-2 pt-2">
      <label className="flex min-h-12 items-center gap-2 rounded-full border border-[#dbdfd5] bg-white px-4">
        <span className="sr-only">ค้นหาร้านหรืออาหาร</span>
        <Search size={18} aria-hidden="true" className="flex-none text-[#5b6478]" />
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหาร้าน อาหาร หรือของใช้" className="min-w-0 flex-1 bg-transparent py-3 text-base outline-none" />
      </label>
      <div role="group" aria-label="ตัวกรอง" className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {FILTERS.map(f => <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)} className={`min-h-10 flex-none rounded-full border px-4 text-sm font-semibold ${filter === f.id ? "border-[#06c755] bg-[#06c755] text-white" : "border-[#dbdfd5] bg-white text-[#1c2333]"}`}>{f.label}</button>)}
      </div>
    </div>

    {q ? foods.length > 0 && <section className="mt-3">
      <h2 className="mb-3 text-lg font-semibold">สินค้าที่พบ ({foods.length})</h2>
      <div className="grid grid-cols-2 gap-x-3 gap-y-5">{foods.map(item => <ItemCard key={item.id} item={item} />)}</div>
    </section> : shopGroups.flatMap(g => g.shops).map(shop => {
      const list = foods.filter(i => i.shopId === shop.id);
      return <section key={shop.id} className="mt-5 border-b border-[#e7e9e1] pb-5">
        <Link href={shopHref(shop.id)} className="flex items-center gap-3 active:opacity-80">
          <span className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl bg-[#e4e7f0] text-[#2e3e68]"><Store size={26} aria-hidden="true" /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-lg font-semibold">{shop.name}</span>
            <span className="block truncate text-sm text-[#5b6478]">{shop.isOpen ? <span className="font-semibold text-[#06a14a]">เปิดอยู่</span> : <span>ปิดอยู่ · ดูได้ ยังสั่งไม่ได้</span>}{shop.category ? ` · ${shop.category}` : ""}</span>
          </span>
          <span className="flex flex-none items-center text-sm text-[#5b6478]">ดูร้าน<ChevronRight size={18} aria-hidden="true" /></span>
        </Link>
        {list.length > 0 && <div className="-mx-4 mt-3 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">{list.map(item => <ItemCard key={item.id} item={item} wide />)}</div>}
      </section>;
    })}

    {groups.length > 0 && !shopGroups.length && <p role="status" className="mt-6 rounded-2xl bg-[#eff1ec] p-5 text-sm leading-7 text-[#5b6478]">{q ? <>ไม่พบ &quot;{query.trim()}&quot; ลองคำอื่น เช่น ส้มตำ ข้าว น้ำดื่ม</> : "ยังไม่มีร้านในหมวดนี้"}</p>}
  </div>;
}

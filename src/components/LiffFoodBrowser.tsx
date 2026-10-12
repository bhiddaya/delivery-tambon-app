"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Minus, Plus, Search, ShoppingBasket, Store } from "lucide-react";
import { money } from "@/lib/domain";
import { ProductPhoto } from "@/rebuilt/primitives";
import { shopKind, type ShopKind } from "@/lib/shop-kind";
import { readBasket, writeBasket } from "@/lib/quick-food-store";
import type { Basket } from "@/rebuilt/order-logic";

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

const round = "flex h-9 w-9 items-center justify-center rounded-full";

/** การ์ดสินค้า: กดรูป/ชื่อ = เข้าหน้าร้าน · ปุ่ม + มุมรูป = ใส่ตะกร้าของร้านนั้นเลย (ปุ่มอยู่นอกลิงก์ ไม่ซ้อน a กับ button) */
function ItemCard({ item, wide, qty, onAdjust }: { item: BrowserItem; wide?: boolean; qty: number; onAdjust: (delta: number) => void }) {
  return <div className={`relative min-w-0 ${wide ? "w-36 flex-none snap-start" : ""}`}>
    <Link href={shopHref(item.shopId)} className={`block active:opacity-80 ${item.shopOpen ? "" : "opacity-60"}`}>
      <ProductPhoto src={item.photo} name={item.name} className={`aspect-square rounded-2xl border border-[#e7e9e1] ${item.shopOpen ? "" : "grayscale"}`} />
      {!item.shopOpen && <span className="absolute left-2 top-2 rounded-full bg-[#1c2333]/80 px-2.5 py-1 text-xs font-semibold text-white">ร้านปิดอยู่</span>}
      <p className="mt-2 text-lg font-bold">{money(item.price)}</p>
      <p className="line-clamp-2 text-sm leading-5">{item.name}</p>
      {!wide && <p className="truncate text-xs text-[#5b6478]">{item.shopName}</p>}
    </Link>
    {/* วางมุมขวาล่างของรูป: ความสูงรูป = ความกว้างการ์ด (aspect-square) */}
    <div className="absolute right-1.5 top-0 flex aspect-square w-full items-end justify-end p-1.5 pointer-events-none">
      {qty > 0 ? <div className="pointer-events-auto flex items-center rounded-full bg-white shadow-md">
        <button type="button" aria-label={`ลด ${item.name}`} className={`${round} text-[#06a14a]`} onClick={() => onAdjust(-1)}><Minus size={16} aria-hidden="true" /></button>
        <output aria-label={`จำนวน ${item.name}`} className="min-w-5 text-center text-sm font-bold tabular-nums">{qty}</output>
        <button type="button" disabled={qty >= 99} aria-label={`เพิ่ม ${item.name}`} className={`${round} text-[#06a14a] disabled:opacity-40`} onClick={() => onAdjust(1)}><Plus size={16} aria-hidden="true" /></button>
      </div> : <button type="button" aria-label={`ใส่ ${item.name} ลงตะกร้า`} className={`${round} pointer-events-auto bg-[#06c755] text-white shadow-md`} onClick={() => onAdjust(1)}><Plus size={20} aria-hidden="true" /></button>}
    </div>
  </div>;
}

/**
 * หน้าแรก LIFF แบบ LINE MAN: ค้นหา · ตัวกรอง (อาหาร / ของแห้ง ของใช้ / เปิดอยู่)
 * ไม่ค้นหา = แยกเป็นร้าน แต่ละร้านมีแถบสินค้าเลื่อนข้าง · ค้นหา = การ์ด 2 คอลัมน์
 * กดสินค้าหรือร้านแล้วไปหน้าร้าน (ตะกร้าอยู่ที่หน้าร้าน หนึ่งออเดอร์ต่อหนึ่งร้าน)
 */
export default function LiffFoodBrowser({ groups, items }: { groups: BrowserGroup[]; items: BrowserItem[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [baskets, setBaskets] = useState<Record<string, Basket>>({});
  const shopIds = groups.flatMap(g => g.shops.map(s => s.id)).join(",");
  // อ่านตะกร้าที่ค้างอยู่หลังโหลดหน้า (sessionStorage มีเฉพาะฝั่งเครื่อง) — กลับมาจากหน้าร้านก็เห็นจำนวนเดิม
  useEffect(() => {
    const load = () => setBaskets(Object.fromEntries(shopIds.split(",").filter(Boolean).map(id => [id, readBasket(id)])));
    queueMicrotask(load);
    window.addEventListener("pageshow", load); // กดย้อนกลับจากหน้าร้าน (หน้าแคชของเบราว์เซอร์) ก็อ่านใหม่
    return () => window.removeEventListener("pageshow", load);
  }, [shopIds]);
  function adjust(item: BrowserItem, delta: number) {
    setBaskets(all => {
      const old = all[item.shopId] ?? {};
      const next = { ...old, [item.id]: Math.min(99, Math.max(0, (old[item.id] ?? 0) + delta)) };
      writeBasket(item.shopId, next);
      return { ...all, [item.shopId]: next };
    });
  }
  const qtyOf = (item: BrowserItem) => baskets[item.shopId]?.[item.id] ?? 0;
  // ponytail: แถบตะกร้าแสดงร้านแรกที่มีของ (สั่งได้ทีละร้านอยู่แล้ว) ถ้าต้องสลับหลายร้านค่อยทำรายการตะกร้า
  const cartShop = allShopsFirstWithItems();
  function allShopsFirstWithItems() {
    for (const shop of groups.flatMap(g => g.shops)) {
      const lines = items.filter(i => i.shopId === shop.id && (baskets[shop.id]?.[i.id] ?? 0) > 0);
      if (lines.length) return { shop, count: lines.reduce((n, i) => n + qtyOf(i), 0), total: lines.reduce((n, i) => n + i.price * qtyOf(i), 0) };
    }
    return null;
  }
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

  return <div className="mt-2 pb-24">
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
      <div className="grid grid-cols-2 gap-x-3 gap-y-5">{foods.map(item => <ItemCard key={item.id} item={item} qty={qtyOf(item)} onAdjust={d => adjust(item, d)} />)}</div>
    </section> : shopGroups.flatMap(g => g.shops).map(shop => {
      const list = foods.filter(i => i.shopId === shop.id);
      return <section key={shop.id} className="mt-5 border-b border-[#e7e9e1] pb-5">
        <Link href={shopHref(shop.id)} className="flex items-center gap-3 active:opacity-80">
          <span className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl bg-[#e4e7f0] text-[#2e3e68]"><Store size={26} aria-hidden="true" /></span>
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 text-lg font-semibold leading-6">{shop.name}</span>
            <span className="block truncate text-sm text-[#5b6478]">{shop.isOpen ? <span className="font-semibold text-[#06a14a]">เปิดอยู่</span> : <span>ปิดอยู่ · ดูได้ ยังสั่งไม่ได้</span>}{shop.category ? ` · ${shop.category}` : ""}</span>
          </span>
          <span className="flex flex-none items-center text-sm text-[#5b6478]">ดูร้าน<ChevronRight size={18} aria-hidden="true" /></span>
        </Link>
        {list.length > 0 && <div className="-mx-4 mt-3 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">{list.map(item => <ItemCard key={item.id} item={item} wide qty={qtyOf(item)} onAdjust={d => adjust(item, d)} />)}</div>}
      </section>;
    })}

    {groups.length > 0 && !shopGroups.length && <p role="status" className="mt-6 rounded-2xl bg-[#eff1ec] p-5 text-sm leading-7 text-[#5b6478]">{q ? <>ไม่พบ &quot;{query.trim()}&quot; ลองคำอื่น เช่น ส้มตำ ข้าว น้ำดื่ม</> : "ยังไม่มีร้านในหมวดนี้"}</p>}
    {cartShop && <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[#fbfaf6] via-[#fbfaf6] to-transparent px-4 pb-4 pt-6">
      <Link href={`${shopHref(cartShop.shop.id)}?cart=1`} className="mx-auto flex min-h-14 w-full max-w-xl items-center gap-3 rounded-2xl bg-[#06c755] px-5 text-white shadow-lg active:opacity-90">
        <ShoppingBasket size={22} aria-hidden="true" />
        <span className="min-w-0 flex-1"><span className="block text-base font-semibold">ดูตะกร้า · {cartShop.count} ชิ้น</span><span className="block truncate text-xs opacity-90">{cartShop.shop.name}</span></span>
        <span className="text-base font-bold">{money(cartShop.total)}</span>
      </Link>
    </div>}
  </div>;
}

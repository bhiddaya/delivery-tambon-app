"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import QuickActions from "@/components/QuickActions";
import { ArrowRight, MapPin, Search, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session-context";
import { money, TYPE_LABEL } from "@/lib/domain";
import { tambonDisplayName } from "@/lib/tambon-choice";
import { StatusChip } from "@/components/ui";
import { useLiveData } from "./use-live-data";
import { DataState, EmptyPanel, PageIntro, Panel, ProductPhoto, inputClass, secondaryButton } from "./primitives";

export default function CustomerCatalog() {
  const { profile } = useSession();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const loader = useCallback(async () => {
    const db = createClient();
    const [shops, orders, area] = await Promise.all([
      db.from("merchants").select("*").eq("tambon_id", profile.tambon_id ?? "00000000-0000-0000-0000-000000000000").eq("is_open", true).eq("is_test", profile.is_test).order("name"),
      db.from("orders").select("*").eq("customer_id", profile.id).in("status", ["pending", "accepted", "in_progress"]).order("created_at", { ascending: false }),
      db.from("tambons").select("id,name,slug,is_active,announcement").eq("id", profile.tambon_id ?? "00000000-0000-0000-0000-000000000000").maybeSingle(),
    ]);
    if (shops.error || orders.error || area.error) throw new Error("catalog unavailable");
    const ids = (shops.data ?? []).map(s => s.id);
    const menu = ids.length ? await db.from("menu_items").select("*").in("merchant_id", ids).eq("is_hidden", false).eq("is_available", true).order("name") : { data: [], error: null };
    if (menu.error) throw new Error("menu unavailable");
    return { shops: shops.data ?? [], orders: orders.data ?? [], area: area.data, menu: menu.data ?? [] };
  }, [profile.id, profile.tambon_id, profile.is_test]);
  const { data, loading, error, refresh } = useLiveData(loader, "merchants,menu_items,orders");
  const search = query.trim().toLocaleLowerCase("th-TH");
  const categories = [...new Set(data?.shops.map(s => s.category).filter((x): x is string => Boolean(x)))];
  const visible = data?.shops.filter(s => (!category || s.category === category) &&
    (!search || [s.name, s.category, ...data.menu.filter(m => m.merchant_id === s.id).map(m => m.name)].some(t => t?.toLocaleLowerCase("th-TH").includes(search)))) ?? [];

  return <div>
    <PageIntro eyebrow="ใกล้บ้าน ส่งถึงมือ" title="วันนี้ อยากทานอะไร?" description="เลือกร้านในตำบลของคุณ ดูเมนูและราคาล่าสุด แล้วจัดรายการที่อยากสั่ง" action={<button className={secondaryButton} onClick={refresh}><RefreshCw size={16} aria-hidden="true" />อัปเดต</button>} />
    <QuickActions role="customer" />
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-indigo-tint px-4 py-3 text-sm">
      <p className="flex items-center gap-2"><MapPin size={18} aria-hidden="true" />{data?.area ? tambonDisplayName(data.area.name) : "ตำบลของบัญชีนี้"}</p>
      {data?.area?.slug && <Link className="inline-flex min-h-11 items-center gap-2 font-semibold text-indigo" href={`/t/${data.area.slug}`}>ติดต่อ / ดูชุมชน<ArrowRight size={16} aria-hidden="true" /></Link>}
      {data?.area?.announcement && <p className="w-full leading-7 text-ink-soft">{data.area.announcement}</p>}
    </div>
    {data?.area && !data.area.is_active && <p role="status" className="mb-5 rounded-xl bg-marigold-tint p-4 text-sm leading-7">ตำบลนี้กำลังเตรียมเปิดบริการ ดูเมนูได้ แต่ยังส่งรายการสั่งซื้อไม่ได้ {data.area.slug && <Link href={`/t/${data.area.slug}`} className="font-semibold text-indigo underline">ติดต่อผ่านหน้าชุมชน</Link>}</p>}
    <DataState loading={loading} error={error} retry={refresh} />
    {data && !error && <>
      {!profile.tambon_id && <EmptyPanel title="เลือกตำบลก่อนเริ่มใช้งาน" text="ไปที่บัญชีของคุณเพื่อกำหนดพื้นที่ ร้านค้าและบริการจะแสดงตามตำบลนี้" action={<Link className={secondaryButton} href="/account">ไปหน้าบัญชี</Link>} />}
      {data.orders.length > 0 && <Panel className="mb-7"><div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">กำลังดำเนินการ · {data.orders.length}</h2><Link href="/customer/orders" className="text-sm font-semibold text-indigo">ติดตามทั้งหมด</Link></div><div className="grid gap-3 lg:grid-cols-2">{data.orders.slice(0, 4).map(o => <Link key={o.id} href="/customer/orders" className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 p-4"><div><p className="font-semibold">{TYPE_LABEL[o.type]} #{o.id}</p><p className="mt-1 line-clamp-1 text-xs text-ink-soft">{o.dropoff || "ดูรายละเอียดการจัดส่ง"}</p></div><StatusChip status={o.status} /></Link>)}</div></Panel>}
      <section id="shops" className="scroll-mt-24"><div className="mb-5 flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-2xl font-semibold">ร้านที่เปิดในพื้นที่</h2><p className="mt-2 text-sm text-ink-soft">{data.shops.length} ร้าน · แสดงร้านที่เปิดขายตามข้อมูลล่าสุด</p></div><label className="relative w-full sm:w-80"><span className="sr-only">ค้นหาร้านหรือเมนู</span><Search className="absolute left-4 top-4 text-ink-soft" size={18} aria-hidden="true" /><input type="search" className={`${inputClass} pl-11`} placeholder="ค้นหาร้าน เมนู หรือของใช้" value={query} onChange={e => setQuery(e.target.value)} /></label></div>
      {categories.length > 0 && <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="หมวดร้านค้า">{["", ...categories].map(c => <button key={c} aria-pressed={category === c} onClick={() => setCategory(c)} className={`min-h-11 rounded-full border px-4 text-sm ${category === c ? "border-indigo bg-[#2e3e68] text-white" : "border-border bg-surface text-ink-soft"}`}>{c || "ทั้งหมด"}</button>)}</div>}
      {visible.length ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{visible.map(shop => {
        const menu = data.menu.filter(m => m.merchant_id === shop.id);
        const price = menu.length ? Math.min(...menu.map(m => Number(m.price))) : null;
        return <Link key={shop.id} href={`/customer/merchants/${shop.id}`} className="group overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition hover:-translate-y-1 hover:shadow-md"><ProductPhoto src={menu.find(m => m.photo_url)?.photo_url ?? null} name={shop.name} className="aspect-[16/9]" /><div className="p-5"><div className="mb-3 flex items-center justify-between gap-2"><span className="rounded-full bg-jade-tint px-3 py-1 text-xs text-jade">เปิดขาย</span><span className="text-xs text-ink-soft">{menu.length} เมนูพร้อมขาย</span></div><h3 className="text-lg font-semibold">{shop.name}</h3><p className="mt-2 line-clamp-2 text-sm leading-6 text-ink-soft">{shop.category || "ร้านค้าในชุมชน"}</p><div className="mt-5 flex items-center justify-between border-t border-border pt-4 text-sm"><span>{price !== null ? `เริ่ม ${money(price)}` : "ดูข้อมูลร้าน"}</span><span className="inline-flex items-center gap-2 font-semibold text-indigo">ดูเมนู<ArrowRight size={16} aria-hidden="true" /></span></div></div></Link>;
      })}</div> : <EmptyPanel title={query || category ? "ยังไม่พบร้านหรือเมนูที่ค้นหา" : "ยังไม่มีร้านเปิดขายในพื้นที่นี้"} text="ลองเปลี่ยนคำค้น หรือดูช่องทางตัวแทนในหน้าชุมชนเพื่อสอบถามเวลาบริการ" action={query || category ? <button className={secondaryButton} onClick={() => { setQuery(""); setCategory(""); }}>ล้างตัวกรอง</button> : null} />}
      </section>
    </>}
  </div>;
}

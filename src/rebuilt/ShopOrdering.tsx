"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Minus, Plus, Search, ShoppingBag, MessageCircle, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session-context";
import { money } from "@/lib/domain";
import { lineOaTextLink } from "@/lib/tambon-links";
import { tambonDisplayName } from "@/lib/tambon-choice";
import { basketLines, basketSubtotal, configuredBaseFee, type Basket } from "./order-logic";
import { useLiveData } from "./use-live-data";
import { DataState, EmptyPanel, PageIntro, Panel, ProductPhoto, inputClass, primaryButton, secondaryButton } from "./primitives";

export default function ShopOrdering() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useSession();
  const [basket, setBasket] = useState<Basket>({});
  const [query, setQuery] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [review, setReview] = useState("");
  const loader = useCallback(async () => {
    const db = createClient();
    const shop = await db.from("merchants").select("*").eq("id", id).eq("tambon_id", profile.tambon_id ?? "00000000-0000-0000-0000-000000000000").eq("is_test", profile.is_test).maybeSingle();
    if (shop.error) throw new Error("shop unavailable");
    if (!shop.data) return { shop: null, menu: [], area: null };
    const [menu, area] = await Promise.all([
      db.from("menu_items").select("*").eq("merchant_id", id).eq("is_hidden", false).order("name"),
      db.from("tambons").select("id,name,slug,is_active,intake_blocked,delivery_fee_base,delivery_fee_per_km").eq("id", shop.data.tambon_id).maybeSingle(),
    ]);
    if (menu.error || area.error) throw new Error("shop details unavailable");
    return { shop: shop.data, menu: menu.data ?? [], area: area.data };
  }, [id, profile.tambon_id, profile.is_test]);
  const { data, loading, error, refresh } = useLiveData(loader, "merchants,menu_items,tambons");
  const lines = basketLines(data?.menu ?? [], basket);
  const subtotal = basketSubtotal(data?.menu ?? [], basket);
  const count = lines.reduce((n, line) => n + line.quantity, 0);
  const selectedCount = Object.values(basket).reduce((n, qty) => n + qty, 0);
  const staleBasket = selectedCount !== count;
  const fee = configuredBaseFee(data?.area?.delivery_fee_base);
  const perKm = configuredBaseFee(data?.area?.delivery_fee_per_km);
  const unavailable = !data?.shop?.is_open || !data?.area?.is_active || Boolean(data?.area?.intake_blocked);
  const ready = count > 0 && !staleBasket && !unavailable && address.trim().length >= 5 && !loading && !error;
  const menu = data?.menu.filter(m => m.name.toLocaleLowerCase("th-TH").includes(query.trim().toLocaleLowerCase("th-TH"))) ?? [];
  function quantity(itemId: string, delta: number) {
    setBasket(old => ({ ...old, [itemId]: Math.min(99, Math.max(0, (old[itemId] ?? 0) + delta)) }));
    setReview("");
  }
  const message = data?.shop ? [
    `${tambonDisplayName(data.area?.name ?? "")} #${data.area?.slug ?? ""}`,
    `ขอสั่งจากร้าน ${data.shop.name}`,
    ...lines.map(line => `${line.item.name} × ${line.quantity} = ${money(Number(line.item.price) * line.quantity)}`),
    `รวมสินค้า ${money(subtotal)}`,
    `จุดส่ง: ${address.trim()}`,
    note.trim() ? `หมายเหตุ: ${note.trim()}` : "",
    "กรุณายืนยันร้านพร้อมรับ ค่าส่ง ยอดรวม และวิธีชำระก่อนสร้างออเดอร์",
  ].filter(Boolean).join("\n") : "";

  return <div>
    <Link href="/customer" className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-indigo"><ArrowLeft size={18} aria-hidden="true" />กลับไปเลือกร้าน</Link>
    <DataState loading={loading} error={error} retry={refresh} />
    {data && !error && (data.shop ? <>
      <PageIntro eyebrow={data.shop.category || "ร้านค้าในชุมชน"} title={data.shop.name} description={data.shop.address || "เลือกรายการที่ต้องการ แล้วตรวจสอบก่อนส่งให้ตัวแทนตำบล"} />
      {unavailable && <Panel className="mb-5 border-marigold bg-marigold-tint"><p role="status" className="text-sm leading-7">{data.area?.intake_blocked ? "พื้นที่นี้พักรับออเดอร์ใหม่อยู่ โปรดติดต่อตัวแทนก่อนสั่ง" : !data.area?.is_active ? "พื้นที่นี้ยังเตรียมเปิดบริการ จึงยังส่งรายการสั่งซื้อไม่ได้" : "ร้านปิดรับรายการอยู่ ดูเมนูไว้แล้วกลับมาเมื่อร้านเปิดได้"}</p></Panel>}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section><div className="mb-5 flex flex-wrap items-center justify-between gap-4"><h2 className="text-xl font-semibold">เมนูของร้าน · {data.menu.length}</h2><label className="relative w-full sm:w-64"><span className="sr-only">ค้นหาเมนู</span><Search size={18} className="absolute left-4 top-4 text-ink-soft" aria-hidden="true" /><input type="search" className={`${inputClass} pl-11`} value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหาเมนู" /></label></div>
          {menu.length ? <div className="grid gap-4 sm:grid-cols-2">{menu.map(item => <article key={item.id} className={`overflow-hidden rounded-2xl border border-border bg-surface ${!item.is_available ? "opacity-65" : ""}`}><ProductPhoto src={item.photo_url} name={item.name} className="aspect-[4/3]" /><div className="p-5"><h3 className="font-semibold leading-7">{item.name}</h3><div className="mt-4 flex items-center justify-between gap-2"><p className="text-lg font-semibold text-indigo">{money(Number(item.price))}</p>{item.is_available ? (basket[item.id] ?? 0) > 0 ? <div className="flex items-center rounded-xl border border-border"><button className="flex h-11 w-11 items-center justify-center" aria-label={`ลด ${item.name}`} onClick={() => quantity(item.id, -1)}><Minus size={17} /></button><span className="min-w-6 text-center tabular-nums" aria-live="polite">{basket[item.id]}</span><button className="flex h-11 w-11 items-center justify-center disabled:opacity-40" aria-label={`เพิ่ม ${item.name}`} disabled={basket[item.id] >= 99 || unavailable} onClick={() => quantity(item.id, 1)}><Plus size={17} /></button></div> : <button className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#2e3e68] text-white disabled:opacity-40" disabled={unavailable} onClick={() => quantity(item.id, 1)} aria-label={`เพิ่ม ${item.name} ลงรายการ`}><Plus size={19} /></button> : <span className="rounded-full bg-surface-2 px-3 py-2 text-xs text-ink-soft">หมดชั่วคราว</span>}</div></div></article>)}</div> : <EmptyPanel title={query ? "ไม่พบเมนูที่ค้นหา" : "ร้านยังไม่ได้เพิ่มเมนู"} text="ลองเปลี่ยนคำค้น หรือสอบถามตัวแทนตำบลเกี่ยวกับรายการที่มีจำหน่าย" />}
        </section>
        <aside className="xl:sticky xl:top-24"><Panel><h2 className="flex items-center gap-3 text-xl font-semibold"><ShoppingBag className="text-indigo" size={23} aria-hidden="true" />รายการของคุณ <span className="ml-auto text-sm text-ink-soft">{count} ชิ้น</span></h2>
          {!count ? <p className="py-8 text-sm leading-7 text-ink-soft">กด + ที่เมนูเพื่อเพิ่มรายการ รายการนี้จะอยู่ในหน้านี้จนกว่าจะรีเฟรชหรือออกจากร้าน</p> : <ul className="mt-5 divide-y divide-border">{lines.map(line => <li key={line.item.id} className="flex items-start justify-between gap-3 py-3 text-sm"><span className="leading-6">{line.item.name}<span className="ml-2 text-ink-soft">× {line.quantity}</span></span><span className="shrink-0 tabular-nums">{money(Number(line.item.price) * line.quantity)}</span></li>)}</ul>}
          {staleBasket && <p role="alert" className="my-3 rounded-xl bg-marigold-tint p-3 text-sm leading-6">บางเมนูเปลี่ยนเป็นหมดหรือเลิกขายแล้ว <button className="font-semibold underline" onClick={() => { setBasket(Object.fromEntries(lines.map(l => [l.item.id, l.quantity]))); setReview(""); }}>ปรับรายการตามเมนูล่าสุด</button></p>}
          <div className="space-y-3 border-t border-border pt-4 text-sm"><div className="flex justify-between gap-3"><span>รวมสินค้า</span><strong>{money(subtotal)}</strong></div><div className="flex justify-between gap-3"><span>ค่าส่ง</span><span className="text-right text-ink-soft">{fee === null ? "ยังไม่ตั้งค่า · รอยืนยัน" : `เริ่ม ${money(fee)}${perKm ? ` + ${money(perKm)}/กม.` : " · รอยืนยัน"}`}</span></div><p className="rounded-xl bg-surface-2 p-3 text-xs leading-6 text-ink-soft">ยอดนี้เป็นค่าสินค้า ต้องยืนยันค่าส่งและยอดรวมกับตัวแทนก่อนชำระเงิน</p></div>
          <label className="mt-5 block"><span className="mb-2 flex items-center gap-2 text-sm font-semibold"><MapPin size={16} aria-hidden="true" />จุดส่งและรายละเอียดที่อยู่</span><textarea className={`${inputClass} min-h-24 py-3`} maxLength={500} value={address} onChange={e => { setAddress(e.target.value); setReview(""); }} placeholder="บ้านเลขที่ หมู่ ซอย และจุดสังเกต" /></label><label className="mt-4 block"><span className="mb-2 block text-sm">หมายเหตุ (ถ้ามี)</span><input className={inputClass} maxLength={300} value={note} onChange={e => { setNote(e.target.value); setReview(""); }} placeholder="เช่น ไม่ใส่พริก" /></label>
          {review === message && ready ? <div className="mt-5 rounded-xl border border-jade bg-jade-tint p-4"><p className="text-sm font-semibold">ตรวจรายการแล้ว · {count} ชิ้น</p><p className="mt-2 text-xs leading-6">LINE จะเปิดพร้อมข้อความให้คุณตรวจและกดส่งเอง ยังไม่มีออเดอร์ใหม่จนกว่าระบบยืนยัน</p><a className={`${primaryButton} mt-4 w-full`} href={lineOaTextLink(message)}><MessageCircle size={18} aria-hidden="true" />เปิด LINE เพื่อยืนยัน</a><button className="mt-2 min-h-11 w-full text-sm text-indigo" onClick={() => setReview("")}>กลับไปแก้รายการ</button></div> : <><button className={`${primaryButton} mt-5 w-full`} disabled={!ready} onClick={() => setReview(message)}>ตรวจรายการ {count > 0 && `· ${money(subtotal)}`}</button>{count > 0 && address.trim().length < 5 && <p className="mt-2 text-xs text-ink-soft">ใส่จุดส่งอย่างน้อย 5 ตัวอักษรก่อนตรวจรายการ</p>}</>}
          {count > 0 && <button className={`${secondaryButton} mt-3 w-full`} onClick={() => { setBasket({}); setReview(""); }}>ล้างรายการ</button>}
        </Panel></aside>
      </div>
    </> : <EmptyPanel title="ไม่พบร้านในพื้นที่ของบัญชีนี้" text="ร้านอาจหยุดเปิดหรือไม่ได้อยู่ในตำบลที่คุณเลือก กลับไปดูร้านที่พร้อมให้บริการได้" action={<Link href="/customer" className={secondaryButton}>เลือกร้านอื่น</Link>} />)}
  </div>;
}

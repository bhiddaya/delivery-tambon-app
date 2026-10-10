"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, LocateFixed, Minus, Plus, Search, ShoppingBag, MessageCircle, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useOptionalSession } from "@/lib/session-context";
import { useLiff } from "@/components/LiffProvider";
import { money } from "@/lib/domain";
import { lineOaTextLink } from "@/lib/tambon-links";
import { tambonDisplayName } from "@/lib/tambon-choice";
import { basketLines, basketSubtotal, configuredBaseFee, type Basket } from "./order-logic";
import { buildOrderMessage, mapLink, type Pin } from "./order-message";
import { useLiveData } from "./use-live-data";
import { loadShopPage } from "./shop-data";
import { DataState, EmptyPanel, PageIntro, Panel, ProductPhoto, inputClass, primaryButton, secondaryButton } from "./primitives";

/**
 * mode "liff" = หน้าที่เปิดจากเมนู LINE (/liff/...) ถ้าเปิดในแอป LINE จริง ปุ่ม "สั่งเลย" จะส่งรายการเข้าแชตให้เลย
 * นอกแอป LINE (หรือ mode "web") ใช้ทางเดิม: ตรวจรายการ แล้วเปิด LINE พร้อมข้อความ
 */
export default function ShopOrdering({ mode = "web" }: { mode?: "web" | "liff" }) {
  const { id } = useParams<{ id: string }>();
  // เปิดได้ทั้งตอนล็อกอิน (/customer/merchants/[id]) และตอนยังไม่ล็อกอิน (/shop/[id], /liff/shop/[id])
  const session = useOptionalSession();
  const liff = useLiff();
  const signedIn = Boolean(session);
  const inLiff = mode === "liff" && liff.status === "ready" && liff.isInClient;
  const tambonId = session?.profile.tambon_id ?? null;
  const isTest = session?.profile.is_test ?? false;
  const [basket, setBasket] = useState<Basket>({});
  const [query, setQuery] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [review, setReview] = useState("");
  const [copied, setCopied] = useState("");
  const [pin, setPin] = useState<Pin | null>(null);
  const [gps, setGps] = useState<"idle" | "loading" | "denied" | "failed">("idle");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState("");
  const [cartInView, setCartInView] = useState(false);
  const loader = useCallback(() => loadShopPage(createClient(), id, signedIn ? { tambonId, isTest } : null), [id, signedIn, tambonId, isTest]);
  const { data, loading, error, refresh } = useLiveData(loader, "merchants,menu_items,tambons");
  const shopId = data?.shop?.id;
  // แถบ "ดูตะกร้า" ติดล่างบนมือถือ ซ่อนเองเมื่อเลื่อนมาถึงตะกร้าแล้ว ไม่ให้บังปุ่มสั่ง
  useEffect(() => {
    const cart = document.getElementById("cart");
    if (!cart) return;
    const observer = new IntersectionObserver(([entry]) => setCartInView(entry.isIntersecting), { threshold: 0.15 });
    observer.observe(cart);
    return () => observer.disconnect();
  }, [shopId]);
  const backHref = mode === "liff" ? "/liff" : signedIn ? "/customer" : data?.area?.slug ? `/t/${encodeURIComponent(data.area.slug)}` : "/delivery";
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
    setSendError("");
  }
  const message = data?.shop ? buildOrderMessage({
    tambonName: tambonDisplayName(data.area?.name ?? ""),
    tambonSlug: data.area?.slug ?? "",
    shopId: data.shop.id,
    shopName: data.shop.name,
    lines,
    subtotal,
    address,
    note,
    pin,
  }, inLiff ? "liff" : "web") : "";
  // ลิงก์ LINE เปิดแชตได้เฉพาะบนมือถือที่มีแอป LINE — บนคอมพิวเตอร์ให้คัดลอกข้อความไปวางเอง
  async function copyMessage() {
    try { await navigator.clipboard.writeText(message); setCopied(message); } catch { setCopied(""); }
  }
  // ปักจุดส่งด้วย GPS ของมือถือ (ในแอป LINE ต้องอนุญาตสิทธิ์ตำแหน่งให้ LINE)
  function locate() {
    if (typeof navigator === "undefined" || !navigator.geolocation) { setGps("failed"); return; }
    setGps("loading");
    navigator.geolocation.getCurrentPosition(
      position => {
        const accuracy = position.coords.accuracy;
        setPin({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy: Number.isFinite(accuracy) ? accuracy : null });
        setGps("idle");
        setReview("");
        setSendError("");
      },
      failure => setGps(failure.code === failure.PERMISSION_DENIED ? "denied" : "failed"),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }
  async function sendToChat() {
    if (!ready || sending) return;
    setSending(true);
    setSendError("");
    try {
      await liff.sendText(message);
      setSent(true);
      liff.closeWindow();
    } catch {
      setSendError("ส่งเข้าแชตไม่สำเร็จ ลองกดสั่งเลยอีกครั้ง หรือกดเปิด LINE ด้านล่างเพื่อส่งเอง");
    } finally {
      setSending(false);
    }
  }

  return <div className={count > 0 ? "pb-24 xl:pb-0" : ""}>
    <Link href={backHref} className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-indigo"><ArrowLeft size={18} aria-hidden="true" />{signedIn || mode === "liff" ? "กลับไปเลือกร้าน" : "กลับไปดูร้านอื่น"}</Link>
    <DataState loading={loading} error={error} retry={refresh} />
    {data && !error && (data.shop ? <>
      <PageIntro eyebrow={data.shop.category || "ร้านค้าในชุมชน"} title={data.shop.name} description={data.shop.address || "เลือกรายการที่ต้องการ แล้วตรวจสอบก่อนส่งให้ตัวแทนตำบล"} />
      {unavailable && <Panel className="mb-5 border-marigold bg-marigold-tint"><p role="status" className="text-sm leading-7">{data.area?.intake_blocked ? "พื้นที่นี้พักรับออเดอร์ใหม่อยู่ โปรดติดต่อตัวแทนก่อนสั่ง" : !data.area?.is_active ? "พื้นที่นี้ยังเตรียมเปิดบริการ จึงยังส่งรายการสั่งซื้อไม่ได้" : "ร้านปิดรับรายการอยู่ ดูเมนูไว้แล้วกลับมาเมื่อร้านเปิดได้"}</p></Panel>}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section><div className="mb-5 flex flex-wrap items-center justify-between gap-4"><h2 className="text-xl font-semibold">เมนูของร้าน · {data.menu.length}</h2><label className="relative w-full sm:w-64"><span className="sr-only">ค้นหาเมนู</span><Search size={18} className="absolute left-4 top-4 text-ink-soft" aria-hidden="true" /><input type="search" className={`${inputClass} pl-11`} value={query} onChange={e => setQuery(e.target.value)} placeholder="ค้นหาเมนู" /></label></div>
          {menu.length ? <div className="grid gap-4 sm:grid-cols-2">{menu.map(item => <article key={item.id} className={`overflow-hidden rounded-2xl border border-border bg-surface ${!item.is_available ? "opacity-65" : ""}`}><ProductPhoto src={item.photo_url} name={item.name} className="aspect-[4/3]" /><div className="p-5"><h3 className="font-semibold leading-7">{item.name}</h3><div className="mt-4 flex items-center justify-between gap-2"><p className="text-lg font-semibold text-indigo">{money(Number(item.price))}</p>{item.is_available ? (basket[item.id] ?? 0) > 0 ? <div className="flex items-center rounded-xl border border-border"><button className="flex h-11 w-11 items-center justify-center" aria-label={`ลด ${item.name}`} onClick={() => quantity(item.id, -1)}><Minus size={17} /></button><span className="min-w-6 text-center tabular-nums" aria-live="polite">{basket[item.id]}</span><button className="flex h-11 w-11 items-center justify-center disabled:opacity-40" aria-label={`เพิ่ม ${item.name}`} disabled={basket[item.id] >= 99 || unavailable} onClick={() => quantity(item.id, 1)}><Plus size={17} /></button></div> : <button className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#2e3e68] text-white disabled:opacity-40" disabled={unavailable} onClick={() => quantity(item.id, 1)} aria-label={`เพิ่ม ${item.name} ลงรายการ`}><Plus size={19} /></button> : <span className="rounded-full bg-surface-2 px-3 py-2 text-xs text-ink-soft">หมดชั่วคราว</span>}</div></div></article>)}</div> : <EmptyPanel title={query ? "ไม่พบเมนูที่ค้นหา" : "ร้านยังไม่ได้เพิ่มเมนู"} text={!signedIn && !query ? "ร้านยังไม่ได้เพิ่มเมนู หรือเมนูยังต้องเข้าสู่ระบบก่อนจึงจะเห็น" : "ลองเปลี่ยนคำค้น หรือสอบถามตัวแทนตำบลเกี่ยวกับรายการที่มีจำหน่าย"} action={!signedIn && !query ? <Link href={`/login?next=${encodeURIComponent(`/customer/merchants/${id}`)}`} className={secondaryButton}>เข้าสู่ระบบเพื่อดูเมนู</Link> : undefined} />}
        </section>
        <aside id="cart" className="scroll-mt-4 xl:sticky xl:top-24"><Panel><h2 className="flex items-center gap-3 text-xl font-semibold"><ShoppingBag className="text-indigo" size={23} aria-hidden="true" />รายการของคุณ <span className="ml-auto text-sm text-ink-soft">{count} ชิ้น</span></h2>
          {!count ? <p className="py-8 text-sm leading-7 text-ink-soft">กด + ที่เมนูเพื่อเพิ่มรายการ รายการนี้จะอยู่ในหน้านี้จนกว่าจะรีเฟรชหรือออกจากร้าน</p> : <ul className="mt-5 divide-y divide-border">{lines.map(line => <li key={line.item.id} className="flex items-start justify-between gap-3 py-3 text-sm"><span className="leading-6">{line.item.name}<span className="ml-2 text-ink-soft">× {line.quantity}</span></span><span className="shrink-0 tabular-nums">{money(Number(line.item.price) * line.quantity)}</span></li>)}</ul>}
          {staleBasket && <p role="alert" className="my-3 rounded-xl bg-marigold-tint p-3 text-sm leading-6">บางเมนูเปลี่ยนเป็นหมดหรือเลิกขายแล้ว <button className="font-semibold underline" onClick={() => { setBasket(Object.fromEntries(lines.map(l => [l.item.id, l.quantity]))); setReview(""); }}>ปรับรายการตามเมนูล่าสุด</button></p>}
          <div className="space-y-3 border-t border-border pt-4 text-sm"><div className="flex justify-between gap-3"><span>รวมสินค้า</span><strong>{money(subtotal)}</strong></div><div className="flex justify-between gap-3"><span>ค่าส่ง</span><span className="text-right text-ink-soft">{fee === null ? "ยังไม่ตั้งค่า · รอยืนยัน" : `เริ่ม ${money(fee)}${perKm ? ` + ${money(perKm)}/กม.` : " · รอยืนยัน"}`}</span></div><p className="rounded-xl bg-surface-2 p-3 text-xs leading-6 text-ink-soft">ยอดนี้เป็นค่าสินค้า ต้องยืนยันค่าส่งและยอดรวมกับตัวแทนก่อนชำระเงิน</p></div>
          <div className="mt-5">
            <span className="mb-2 flex items-center gap-2 text-sm font-semibold"><MapPin size={16} aria-hidden="true" />จุดส่ง</span>
            <button type="button" className={`${secondaryButton} w-full`} disabled={gps === "loading"} onClick={locate}><LocateFixed size={18} aria-hidden="true" />{gps === "loading" ? "กำลังหาตำแหน่ง..." : pin ? "ปักตำแหน่งใหม่" : "ใช้ตำแหน่งปัจจุบันของฉัน"}</button>
            {pin && <p className="mt-2 text-xs leading-6 text-ink-soft">ปักตำแหน่งแล้ว{pin.accuracy ? ` (คลาดเคลื่อนประมาณ ${Math.round(pin.accuracy)} ม.)` : ""} · <a className="font-semibold text-indigo underline" href={mapLink(pin)} target="_blank" rel="noopener noreferrer">ดูบนแผนที่</a></p>}
            {!pin && gps === "idle" && count > 0 && <p className="mt-2 text-xs leading-6 text-ink-soft">ปักตำแหน่งเพื่อให้ไรเดอร์หาเจอและคิดค่าส่งตามระยะทางได้ถูกต้อง</p>}
            {gps === "denied" && <p role="status" className="mt-2 text-xs leading-6 text-ink-soft">ยังไม่ได้อนุญาตให้ใช้ตำแหน่ง เปิดสิทธิ์ตำแหน่งให้ LINE ในตั้งค่ามือถือแล้วกดอีกครั้ง หรือสั่งต่อโดยไม่ปัก (ค่าส่งจะคิดได้หลังแชร์ตำแหน่งในแชต)</p>}
            {gps === "failed" && <p role="status" className="mt-2 text-xs leading-6 text-ink-soft">หาตำแหน่งไม่สำเร็จ ลองกดอีกครั้ง หรือสั่งต่อโดยไม่ปัก (ค่าส่งจะคิดได้หลังแชร์ตำแหน่งในแชต)</p>}
          </div>
          <label className="mt-4 block"><span className="mb-2 block text-sm font-semibold">รายละเอียดที่อยู่</span><textarea className={`${inputClass} min-h-24 py-3`} maxLength={500} value={address} onChange={e => { setAddress(e.target.value); setReview(""); setSendError(""); }} placeholder="บ้านเลขที่ หมู่ ซอย และจุดสังเกต" /></label><label className="mt-4 block"><span className="mb-2 block text-sm">หมายเหตุ (ถ้ามี)</span><input className={inputClass} maxLength={300} value={note} onChange={e => { setNote(e.target.value); setReview(""); setSendError(""); }} placeholder="เช่น ไม่ใส่พริก" /></label>
          {inLiff ? (sent ? <div className="mt-5 rounded-xl border border-jade bg-jade-tint p-4"><p className="text-sm font-semibold">ส่งรายการเข้าแชตแล้ว</p><p className="mt-2 text-xs leading-6">กลับไปที่แชต LINE บวรไทยเพื่อดูสรุปยอดและค่าส่ง ยังไม่มีออเดอร์จนกว่าคุณยืนยันในแชต</p><button className="mt-2 min-h-11 w-full text-sm text-indigo" onClick={() => setSent(false)}>กลับไปแก้รายการ</button></div> : <>
            <button className={`${primaryButton} mt-5 w-full`} disabled={!ready || sending} onClick={sendToChat}>{sending ? "กำลังส่งเข้าแชต..." : `สั่งเลย${count > 0 ? ` · ${money(subtotal)}` : ""}`}</button>
            {count > 0 && address.trim().length < 5 && <p className="mt-2 text-xs text-ink-soft">ใส่รายละเอียดที่อยู่อย่างน้อย 5 ตัวอักษรก่อนสั่ง</p>}
            {sendError && <div role="alert" className="mt-3 rounded-xl bg-marigold-tint p-3 text-sm leading-6">{sendError}<a className={`${secondaryButton} mt-3 w-full`} href={lineOaTextLink(message)}><MessageCircle size={18} aria-hidden="true" />เปิด LINE เพื่อยืนยัน</a></div>}
          </>) : review === message && ready ? <div className="mt-5 rounded-xl border border-jade bg-jade-tint p-4"><p className="text-sm font-semibold">ตรวจรายการแล้ว · {count} ชิ้น</p><p className="mt-2 text-xs leading-6">LINE จะเปิดพร้อมข้อความให้คุณตรวจและกดส่งเอง ยังไม่มีออเดอร์ใหม่จนกว่าระบบยืนยัน</p><a className={`${primaryButton} mt-4 w-full`} href={lineOaTextLink(message)}><MessageCircle size={18} aria-hidden="true" />เปิด LINE เพื่อยืนยัน</a><button className="mt-2 min-h-11 w-full text-sm text-indigo" onClick={copyMessage}>{copied === message ? "คัดลอกแล้ว วางในแชต LINE บวรไทยได้เลย" : "เปิดจากคอมพิวเตอร์? คัดลอกข้อความไปวางใน LINE"}</button><button className="min-h-11 w-full text-sm text-indigo" onClick={() => setReview("")}>กลับไปแก้รายการ</button></div> : <><button className={`${primaryButton} mt-5 w-full`} disabled={!ready} onClick={() => setReview(message)}>ตรวจรายการ {count > 0 && `· ${money(subtotal)}`}</button>{count > 0 && address.trim().length < 5 && <p className="mt-2 text-xs text-ink-soft">ใส่จุดส่งอย่างน้อย 5 ตัวอักษรก่อนตรวจรายการ</p>}</>}
          {count > 0 && <button className={`${secondaryButton} mt-3 w-full`} onClick={() => { setBasket({}); setReview(""); setSendError(""); }}>ล้างรายการ</button>}
        </Panel></aside>
      </div>
      {count > 0 && !cartInView && <a href="#cart" className="fixed inset-x-4 bottom-4 z-30 flex min-h-14 items-center justify-between rounded-2xl bg-[#2e3e68] px-5 font-head text-sm font-semibold text-white shadow-lg xl:hidden"><span className="flex items-center gap-2"><ShoppingBag size={18} aria-hidden="true" />ดูตะกร้า · {count} ชิ้น</span><span>{money(subtotal)}</span></a>}
    </> : <EmptyPanel title={signedIn ? "ไม่พบร้านในพื้นที่ของบัญชีนี้" : "ไม่พบร้านนี้"} text={signedIn ? "ร้านอาจหยุดเปิดหรือไม่ได้อยู่ในตำบลที่คุณเลือก กลับไปดูร้านที่พร้อมให้บริการได้" : "ร้านอาจปิดอยู่ หรือยังไม่เปิดให้ดูเมนู ลองกลับไปดูร้านอื่นที่เปิดอยู่"} action={<Link href={backHref} className={secondaryButton}>เลือกร้านอื่น</Link>} />)}
  </div>;
}

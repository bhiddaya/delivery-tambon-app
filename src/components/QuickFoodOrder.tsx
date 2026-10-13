"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useLineSession } from "@/lib/use-line-session";
import { money } from "@/lib/domain";
import type { Tables } from "@/lib/types";
import { loadShopPage } from "@/rebuilt/shop-data";
import { useLiveData } from "@/rebuilt/use-live-data";
import { basketLines, type Basket } from "@/rebuilt/order-logic";
import { DataState, Panel, inputClass, primaryButton, secondaryButton } from "@/rebuilt/primitives";
import { CustomerSlipCard } from "@/components/CustomerSlipCard";
import FoodMenuRow from "@/components/FoodMenuRow";
import { quickFoodKey } from "@/lib/quick-food-store";
import { useLiffBase } from "@/lib/liff-base";
import LlpPayCard from "@/components/LlpPayCard";

type Quote = { token: string; expires_at: string; items: { id: string; name: string; qty: number; price: number }[]; items_total: number; delivery_fee: number; grand_total: number; point: { lat: number; lng: number; label: string } };
type Result = { ok: boolean; error?: string; notice?: string; view?: string; quote?: Quote; order_id?: number };
const errors: Record<string, string> = { need_location: "เลือกจุดส่งครั้งแรกเพื่อคำนวณค่าส่ง", shop_closed: "ร้านปิดแล้ว กรุณาเลือกร้านอื่น", item_unavailable: "บางเมนูหมดแล้ว ตรวจรายการใหม่", intake_blocked: "ตำบลนี้พักรับออเดอร์ชั่วคราว", too_far: "จุดส่งไกลเกินระยะบริการ 30 กม.", shop_no_pin: "ร้านยังไม่ได้ตั้งจุดรับอาหาร กรุณาติดต่อตัวแทน", review_required: "ตรวจยอดอีกครั้งก่อนยืนยัน", account_suspended: "บัญชีถูกพักใช้งาน กรุณาติดต่อตัวแทน", line_login_required: "กรุณาเข้าสู่ระบบ LINE และสมัครลูกค้าก่อน", cart_changed: "รายการเปลี่ยน กรุณาตรวจใหม่" };
function stored(key: string): { basket?: Basket; note?: string; orderId?: number; quote?: Quote } {
  try {
    const v = JSON.parse(sessionStorage.getItem(key) ?? "{}");
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    if (v.quote && (typeof v.quote.token !== "string" || !Array.isArray(v.quote.items) || !v.quote.point)) delete v.quote;
    return v;
  } catch { return {}; }
}
export default function QuickFoodOrder() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const session = useLineSession();
  const base = useLiffBase();
  // LLP จ่ายผ่าน Opn ระบบยืนยันเอง ไม่มีสลิป — ข้อความต้องไม่พูดถึงสลิป/ตัวแทนตรวจเงิน
  const llp = base === "/llp";
  const key = quickFoodKey(id);
  // ?cart=1 มาจากแถบ "ดูตะกร้า" หน้าแรก — เปิดหน้าตะกร้าทันที
  const openCart = useSearchParams().get("cart") === "1";
  const [basket, setBasket] = useState<Basket>(() => stored(key).basket ?? {});
  const [note, setNote] = useState(() => stored(key).note ?? "");
  const [orderId, setOrderId] = useState<number | null>(() => stored(key).orderId ?? null);
  const [query, setQuery] = useState("");
  const [cartOpen, setCartOpen] = useState(openCart);
  const [quote, setQuote] = useState<Quote | null>(() => stored(key).quote ?? null);
  const [point, setPoint] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [address, setAddress] = useState("");
  const [needPoint, setNeedPoint] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const loader = useCallback(() => loadShopPage(createClient(), id, null), [id]);
  const { data, loading, error, refresh } = useLiveData(loader, "merchants,menu_items,tambons");
  const orderLoader = useCallback(async () => {
    if (!orderId || !session.ready) return null;
    const db = createClient();
    const order = await db.from("orders").select("*").eq("id", orderId).eq("customer_id", session.profile?.id ?? "").maybeSingle();
    if (order.error || !order.data) throw new Error("โหลดออเดอร์ไม่ได้");
    const area = await db.from("tambons").select("*").eq("id", order.data.tambon_id).single();
    if (area.error) throw new Error("โหลดบัญชีรับเงินไม่ได้");
    return { order: order.data, area: area.data as Tables<"tambons"> };
  }, [orderId, session.ready, session.profile?.id]);
  const receipt = useLiveData(orderLoader, "orders,tambons");
  useEffect(() => {
    // Keep the confirmation token across reloads so a lost response is retried, not ordered again.
    try { sessionStorage.setItem(key, JSON.stringify({ basket, note, orderId, quote })); } catch { /* optional storage */ }
  }, [key, basket, note, orderId, quote]);
  const lines = basketLines(data?.menu ?? [], basket);
  const count = lines.reduce((n, x) => n + x.quantity, 0);
  const subtotal = lines.reduce((n, x) => n + Number(x.item.price) * x.quantity, 0);
  function quantity(item: string, delta: number) { setBasket(v => ({ ...v, [item]: Math.max(0, Math.min(99, (v[item] ?? 0) + delta)) })); setQuote(null); setMessage(""); }
  async function review() {
    setMessage("");
    if (!session.ready) { if (session.liff.status === "ready" && !session.liff.isLoggedIn) session.liff.login(); else setMessage(session.error || "รอการตรวจบัญชี LINE สักครู่"); return; }
    if (!session.profile?.phone || !session.profile.full_name || !session.profile.tambon_id) { router.push(`${base}/register?next=${encodeURIComponent(`${base}/shop/${id}`)}${data?.area?.slug ? `&t=${encodeURIComponent(data.area.slug)}` : ""}`); return; }
    setBusy(true); setQuote(null);
    try {
      const r = await createClient().rpc("customer_food_review", { p_merchant_id: id, p_items: lines.map(x => ({ id: x.item.id, qty: x.quantity })), p_point: point ? { ...point, label: address.trim() || point.label } : null, p_note: note });
      const v = r.data as unknown as Result;
      if (r.error) throw new Error("สรุปยอดไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่");
      if (v.view === "need_location") { setNeedPoint(true); setMessage(errors.need_location); }
      else if (!v.ok || !v.quote) setMessage(errors[v.error ?? ""] || "ตรวจรายการอีกครั้งแล้วลองใหม่");
      else { setQuote(v.quote); setNeedPoint(false); }
    } catch (e) { setMessage(e instanceof Error ? e.message : "สรุปยอดไม่สำเร็จ"); } finally { setBusy(false); }
  }
  async function confirm() {
    if (!quote) return;
    setBusy(true); setMessage("");
    try {
      const r = await createClient().rpc("customer_food_confirm", { p_token: quote.token });
      const v = r.data as unknown as Result;
      if (r.error) throw new Error("ยังยืนยันไม่ได้ กดซ้ำได้โดยไม่สร้างออเดอร์ซ้ำ");
      if (v.view === "review" && v.quote) { setQuote(v.quote); setMessage(v.notice || "ยอดเปลี่ยน ตรวจยอดล่าสุดก่อนยืนยันอีกครั้ง"); }
      else if (v.ok && v.order_id) { setOrderId(v.order_id); setBasket({}); setQuote(null); }
      else { setQuote(null); setMessage(errors[v.error ?? ""] || "ออเดอร์ยังไม่สำเร็จ กรุณาสรุปยอดใหม่"); }
    } catch (e) { setMessage(e instanceof Error ? e.message : "ยืนยันไม่สำเร็จ"); } finally { setBusy(false); }
  }
  function locate() {
    if (!navigator.geolocation) { setMessage("เครื่องนี้ใช้ตำแหน่งไม่ได้ เปิดผ่าน LINE บนมือถือแล้วลองใหม่"); return; }
    setBusy(true); setQuote(null); setMessage("");
    navigator.geolocation.getCurrentPosition(p => { setPoint({ lat: p.coords.latitude, lng: p.coords.longitude, label: "ตำแหน่งจัดส่งที่เลือก" }); setNeedPoint(true); setBusy(false); }, () => { setMessage("ยังอ่านตำแหน่งไม่ได้ อนุญาตตำแหน่งให้ LINE แล้วลองใหม่"); setBusy(false); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  }
  const stepper = (itemId: string, name: string, qty: number) => <div className="flex items-center gap-1 rounded-full border border-[#06c755]">
    <button type="button" disabled={busy} aria-label={`ลด ${name}`} className="flex h-10 w-10 items-center justify-center text-lg font-semibold text-[#06a14a] disabled:opacity-40" onClick={() => quantity(itemId, -1)}>−</button>
    <output aria-label={`จำนวน ${name}`} className="min-w-6 text-center font-semibold tabular-nums">{qty}</output>
    <button type="button" disabled={busy || qty >= 99} aria-label={`เพิ่ม ${name}`} className="flex h-10 w-10 items-center justify-center text-lg font-semibold text-[#06a14a] disabled:opacity-40" onClick={() => quantity(itemId, 1)}>+</button>
  </div>;
  const closed = Boolean(data?.shop && !data.shop.is_open);
  return <div className="pb-28"><DataState loading={loading} error={error} retry={refresh} />{data?.shop && <>
    {orderId ? <><Link href={base} className="mb-4 inline-flex min-h-11 items-center text-sm text-indigo">← ร้านทั้งหมด</Link><Panel><h2 className="text-lg font-semibold">ออเดอร์ #{orderId}</h2><DataState loading={receipt.loading} error={receipt.error} retry={receipt.refresh} />{receipt.data && <><p className="my-3 text-sm">{receipt.data.order.status === "cancelled" ? (llp ? "ออเดอร์ถูกยกเลิก (ไม่ได้ชำระเงินภายใน 15 นาที สั่งใหม่ได้เลย)" : "ออเดอร์ถูกยกเลิก (ถ้าไม่ได้ส่งสลิปภายใน 15 นาที ระบบยกเลิกอัตโนมัติ สั่งใหม่ได้เลย)") : (llp ? "ยืนยันรายการแล้ว · สแกนจ่ายภายใน 15 นาที ไม่ต้องส่งสลิป ไม่งั้นออเดอร์จะถูกยกเลิกอัตโนมัติ" : "ยืนยันรายการแล้ว · โอนและส่งสลิปภายใน 15 นาที ไม่งั้นออเดอร์จะถูกยกเลิกอัตโนมัติ")}</p>{receipt.data.order.status !== "cancelled" && (base === "/llp" ? <LlpPayCard orderId={receipt.data.order.id} paid={Boolean(receipt.data.order.customer_paid_at)} onPaid={receipt.refresh} /> : <CustomerSlipCard order={receipt.data.order} tambon={receipt.data.area} onChanged={receipt.refresh} />)}</>}<button className={`${secondaryButton} mt-4`} onClick={() => { setOrderId(null); setNote(""); setCartOpen(false); }}>สั่งรายการใหม่</button></Panel></>
    : cartOpen ? <>
      <button type="button" className="mb-2 inline-flex min-h-11 items-center text-sm text-indigo" onClick={() => setCartOpen(false)}>← เลือกสินค้าเพิ่ม</button>
      <h1 className="text-2xl font-semibold">ตะกร้า</h1><p className="mt-1 text-sm text-ink-soft">{data.shop.name}</p>
      {closed && <p role="status" className="mt-3 rounded-xl bg-marigold-tint p-3 text-sm leading-6">ร้านปิดอยู่ ดูตะกร้าได้ แต่ยังสั่งไม่ได้จนกว่าร้านจะเปิด</p>}
      <div className="mt-4 divide-y divide-[#e7e9e1] rounded-2xl border border-border bg-surface px-4">{lines.length ? lines.map(x => <div key={x.item.id} className="flex items-center gap-3 py-3"><span className="min-w-0 flex-1"><span className="block break-words font-semibold">{x.item.name}</span><span className="text-sm text-ink-soft">{money(Number(x.item.price) * x.quantity)}</span></span>{stepper(x.item.id, x.item.name, x.quantity)}</div>) : <p className="py-4 text-sm text-ink-soft">ตะกร้าว่าง กลับไปเลือกสินค้าได้เลย</p>}</div>
      {count > 0 && <p className="mt-3 flex justify-between px-1"><span>รวมค่าสินค้า</span><strong>{money(subtotal)}</strong></p>}
      <Panel className="my-5"><label className="block text-sm">หมายเหตุถึงร้าน (ถ้ามี)<input disabled={busy} className={`${inputClass} mt-2`} maxLength={300} value={note} onChange={e => { setNote(e.target.value); setQuote(null); }} placeholder="เช่น ไม่เผ็ด" /></label>
        {(needPoint || point) && <div className="mt-4"><p className="mb-2 text-sm">{point ? "เลือกตำแหน่งแล้ว" : "เลือกจุดส่งครั้งแรก"}</p><button className={secondaryButton} disabled={busy} onClick={locate}>{point ? "เปลี่ยนตำแหน่ง" : "ใช้ตำแหน่งปัจจุบัน"}</button><label className="mt-3 block text-sm">บ้านเลขที่ / จุดสังเกต<input disabled={busy} maxLength={500} className={`${inputClass} mt-2`} value={address} onChange={e => { setAddress(e.target.value); setQuote(null); }} /></label></div>}
        {quote && <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm"><h3 className="font-semibold">ตรวจรายการก่อนยืนยัน</h3>{quote.items.map(i => <p key={i.id} className="flex justify-between gap-3"><span>{i.name} × {i.qty}</span><span>{money(Number(i.price) * i.qty)}</span></p>)}<p className="flex justify-between"><span>รวมค่าสินค้า</span><strong>{money(Number(quote.items_total))}</strong></p><p className="flex justify-between"><span>ค่าขนส่ง</span><strong>{money(Number(quote.delivery_fee))}</strong></p><p className="flex justify-between text-base"><span>รวมชำระ</span><strong>{money(Number(quote.grand_total))}</strong></p><p className="py-2 leading-7">ส่งที่: {quote.point.label} <a className="text-indigo underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${quote.point.lat},${quote.point.lng}`}>ดูแผนที่</a></p><button className={secondaryButton} disabled={busy} onClick={locate}>เปลี่ยนจุดส่ง</button><p className="text-xs leading-6 text-ink-soft">{llp ? "กดยืนยันเพื่อสร้างออเดอร์และแสดง QR จ่ายเงิน จ่ายแล้วระบบยืนยันให้อัตโนมัติและแจ้งร้านทันที" : "กดยืนยันเพื่อสร้างออเดอร์และแสดง QR จ่ายเงิน ตัวแทนจะตรวจเงินเข้าจริงก่อนเรียกไรเดอร์"}</p><p className="rounded-lg bg-marigold-tint p-2 text-xs font-semibold leading-6">{llp ? "สแกนจ่ายภายใน 15 นาทีหลังยืนยัน ไม่ต้องส่งสลิป ไม่งั้นออเดอร์จะถูกยกเลิกอัตโนมัติ" : "ต้องโอนและส่งสลิปภายใน 15 นาทีหลังยืนยัน ไม่งั้นออเดอร์จะถูกยกเลิกอัตโนมัติ"}</p></div>}
        {message && <p role="status" className="mt-4 rounded-xl bg-marigold-tint p-3 text-sm leading-7">{message}</p>}
        <button className={`${primaryButton} mt-4 w-full`} disabled={!count || busy || closed} onClick={quote ? confirm : review}>{busy ? "กำลังดำเนินการ…" : closed ? "ร้านปิดอยู่ · ยังสั่งไม่ได้" : quote ? "ยืนยันสั่งและแสดง QR" : `สรุปยอดและค่าส่ง · ${count} ชิ้น`}</button><p className="mt-3 text-xs leading-6 text-ink-soft">{session.ready ? "ใช้บัญชี LINE เดิมและจุดส่งเดิมได้" : "ลูกค้าใหม่สมัครชื่อ เบอร์ และตำบลก่อนยืนยันครั้งแรก"}</p>
        {count > 0 && <button type="button" className="mt-1 min-h-11 w-full text-sm text-clay" disabled={busy} onClick={() => { setBasket({}); setQuote(null); setMessage(""); }}>ล้างตะกร้า</button>}
      </Panel>
    </> : <>
      <Link href={base} className="mb-2 inline-flex min-h-11 items-center text-sm text-indigo">← ร้านทั้งหมด</Link>
      <h1 className="text-2xl font-semibold">{data.shop.name}</h1>
      <p className="mt-1 text-sm">{closed ? <span className="text-ink-soft">ปิดอยู่ · ดูสินค้าและลองใส่ตะกร้าได้ ยังสั่งไม่ได้</span> : <span className="font-semibold text-[#06a14a]">เปิดอยู่</span>}{data.shop.category ? <span className="text-ink-soft"> · {data.shop.category}</span> : null}</p>
      <input type="search" aria-label="ค้นหาในร้าน" className={`${inputClass} mt-4`} placeholder="ค้นหาในร้าน" value={query} onChange={e => setQuery(e.target.value)} />
      <div className="mt-2">{data.menu.filter(i => i.name.includes(query.trim())).map(item => <FoodMenuRow key={item.id} name={item.name} description={item.description} photo={item.photo_url} price={Number(item.price)} quantity={basket[item.id] ?? 0} unavailable={!item.is_available} unavailableText="หมดชั่วคราว" busy={busy} onAdjust={delta => quantity(item.id, delta)} />)}</div>
      {count > 0 && <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[#fbfaf6] via-[#fbfaf6] to-transparent px-4 pb-4 pt-6"><button type="button" onClick={() => { setCartOpen(true); window.scrollTo(0, 0); }} className="mx-auto flex min-h-14 w-full max-w-xl items-center gap-3 rounded-2xl bg-[#06c755] px-5 text-white shadow-lg active:opacity-90"><span className="flex h-8 min-w-8 items-center justify-center rounded-full bg-white px-2 text-sm font-bold text-[#06a14a]">{count}</span><span className="flex-1 text-left text-base font-semibold">ดูตะกร้า</span><span className="text-base font-bold">{money(subtotal)}</span></button></div>}
    </>}
  </>}</div>;
}

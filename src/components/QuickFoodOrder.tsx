"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
  const key = `quick-food:${id}`;
  const [basket, setBasket] = useState<Basket>(() => stored(key).basket ?? {});
  const [note, setNote] = useState(() => stored(key).note ?? "");
  const [orderId, setOrderId] = useState<number | null>(() => stored(key).orderId ?? null);
  const [query, setQuery] = useState("");
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
  function quantity(item: string, delta: number) { setBasket(v => ({ ...v, [item]: Math.max(0, Math.min(99, (v[item] ?? 0) + delta)) })); setQuote(null); setMessage(""); }
  function select(item: string, selected: boolean) { setBasket(v => ({ ...v, [item]: selected ? Math.max(1, v[item] ?? 0) : 0 })); setQuote(null); setMessage(""); }
  async function review() {
    setMessage("");
    if (!session.ready) { if (session.liff.status === "ready" && !session.liff.isLoggedIn) session.liff.login(); else setMessage(session.error || "รอการตรวจบัญชี LINE สักครู่"); return; }
    if (!session.profile?.phone || !session.profile.full_name || !session.profile.tambon_id) { router.push(`/liff/register?next=${encodeURIComponent(`/liff/shop/${id}`)}${data?.area?.slug ? `&t=${encodeURIComponent(data.area.slug)}` : ""}`); return; }
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
  return <div><Link href="/liff" className="mb-4 inline-flex min-h-11 items-center text-sm text-indigo">← เปลี่ยนร้าน</Link><DataState loading={loading} error={error} retry={refresh} />{data?.shop && <>
    <h1 className="text-2xl font-semibold">{data.shop.name}</h1><p className="mb-4 mt-2 text-sm leading-6 text-ink-soft">ติ๊กช่องสี่เหลี่ยมเพื่อเลือกอาหาร แล้วกด + / − ปรับจำนวน เอาติ๊กออกเพื่อลบ เลือกครบแล้วค่อยสรุปยอด</p>
    {orderId ? <Panel><h2 className="text-lg font-semibold">ออเดอร์ #{orderId}</h2><DataState loading={receipt.loading} error={receipt.error} retry={receipt.refresh} />{receipt.data && <><p className="my-3 text-sm">{receipt.data.order.status === "cancelled" ? "ออเดอร์ถูกยกเลิก" : "ยืนยันรายการแล้ว"}</p>{receipt.data.order.status !== "cancelled" && <CustomerSlipCard order={receipt.data.order} tambon={receipt.data.area} onChanged={receipt.refresh} />}</>}<button className={`${secondaryButton} mt-4`} onClick={() => { setOrderId(null); setNote(""); }}>สั่งรายการใหม่</button></Panel> : <>
    <input type="search" aria-label="ค้นหาอาหาร" className={`${inputClass} mb-4`} placeholder="ค้นหาอาหาร" value={query} onChange={e => setQuery(e.target.value)} />
    <p role="status" className="mb-3 text-sm font-semibold text-jade">{count ? `เลือกแล้ว ${lines.length} รายการ · ${count} ชิ้น` : "ยังไม่ได้เลือกอาหาร"}</p>
    <div className="grid gap-3 sm:grid-cols-2">{data.menu.filter(i => i.name.includes(query.trim())).map(item => <FoodMenuRow key={item.id} name={item.name} photo={item.photo_url} price={Number(item.price)} quantity={basket[item.id] ?? 0} unavailable={!item.is_available || !data.shop?.is_open} unavailableText={!item.is_available ? "หมดชั่วคราว" : "ร้านปิด"} busy={busy} onSelect={selected => select(item.id, selected)} onAdjust={delta => quantity(item.id, delta)} />)}</div>
    <Panel className="my-5" ><h2 className="mb-3 font-semibold">เลือกแล้ว {count} ชิ้น</h2><label className="block text-sm">หมายเหตุ (ถ้ามี)<input disabled={busy} className={`${inputClass} mt-2`} maxLength={300} value={note} onChange={e => { setNote(e.target.value); setQuote(null); }} placeholder="เช่น ไม่เผ็ด" /></label>
      {(needPoint || point) && <div className="mt-4"><p className="mb-2 text-sm">{point ? "เลือกตำแหน่งแล้ว" : "เลือกจุดส่งครั้งแรก"}</p><button className={secondaryButton} disabled={busy} onClick={locate}>{point ? "เปลี่ยนตำแหน่ง" : "ใช้ตำแหน่งปัจจุบัน"}</button><label className="mt-3 block text-sm">บ้านเลขที่ / จุดสังเกต<input disabled={busy} maxLength={500} className={`${inputClass} mt-2`} value={address} onChange={e => { setAddress(e.target.value); setQuote(null); }} /></label></div>}
      {quote && <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm"><h3 className="font-semibold">ตรวจรายการก่อนยืนยัน</h3>{quote.items.map(i => <p key={i.id} className="flex justify-between gap-3"><span>{i.name} × {i.qty}</span><span>{money(Number(i.price) * i.qty)}</span></p>)}<p className="flex justify-between"><span>รวมอาหาร</span><strong>{money(Number(quote.items_total))}</strong></p><p className="flex justify-between"><span>ค่าขนส่ง</span><strong>{money(Number(quote.delivery_fee))}</strong></p><p className="flex justify-between text-base"><span>รวมชำระ</span><strong>{money(Number(quote.grand_total))}</strong></p><p className="py-2 leading-7">ส่งที่: {quote.point.label} <a className="text-indigo underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${quote.point.lat},${quote.point.lng}`}>ดูแผนที่</a></p><button className={secondaryButton} disabled={busy} onClick={locate}>เปลี่ยนจุดส่ง</button><p className="text-xs leading-6 text-ink-soft">กดยืนยันเพื่อสร้างออเดอร์และแสดง QR จ่ายเงิน ตัวแทนจะตรวจเงินเข้าจริงก่อนเรียกไรเดอร์</p></div>}
      {message && <p role="status" className="mt-4 rounded-xl bg-marigold-tint p-3 text-sm leading-7">{message}</p>}
      <button className={`${primaryButton} mt-4 w-full`} disabled={!count || busy || !data.shop.is_open} onClick={quote ? confirm : review}>{busy ? "กำลังดำเนินการ…" : quote ? "ยืนยันสั่งและแสดง QR" : `สรุปยอด · ${count} ชิ้น`}</button><p className="mt-3 text-xs leading-6 text-ink-soft">{session.ready ? "ใช้บัญชี LINE เดิมและจุดส่งเดิมได้" : "ลูกค้าใหม่สมัครชื่อ เบอร์ และตำบลก่อนยืนยันครั้งแรก"}</p>
    </Panel></>}
  </>}</div>;
}

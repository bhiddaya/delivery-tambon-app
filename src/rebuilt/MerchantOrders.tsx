"use client";

import QuickActions from "@/components/QuickActions";

import { useCallback, useState } from "react";
import { RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session-context";
import { dateStr, timeStr, money, STATUS_LABEL, type OrderStatus } from "@/lib/domain";
import { bangkokDayStart } from "@/lib/tambon-admin";
import { StatusChip } from "@/components/ui";
import { useLiveData } from "./use-live-data";
import { DataState, EmptyPanel, PageIntro, Panel, inputClass, secondaryButton } from "./primitives";

export default function MerchantOrders() {
  const { profile } = useSession();
  const [status, setStatus] = useState("active");
  const [days, setDays] = useState("7");
  const loader = useCallback(async () => {
    const db = createClient();
    const shop = await db.from("merchants").select("id,name").eq("profile_id", profile.id).maybeSingle();
    if (shop.error) throw new Error("shop unavailable");
    if (!shop.data) return { shop: null, orders: [], items: [] };
    let query = db.from("orders").select("*").eq("merchant_id", shop.data.id).gte("created_at", new Date(bangkokDayStart(Date.now()) - (Number(days) - 1) * 86400000).toISOString()).order("created_at", { ascending: false });
    if (status === "active") query = query.in("status", ["pending", "accepted", "in_progress"]);
    else if (status !== "all") query = query.eq("status", status as OrderStatus);
    const orders = await query.limit(100);
    if (orders.error) throw new Error("orders unavailable");
    const ids = (orders.data ?? []).map(o => o.id);
    const items = ids.length ? await db.from("order_items").select("*").in("order_id", ids) : { data: [], error: null };
    if (items.error) throw new Error("items unavailable");
    return { shop: shop.data, orders: orders.data ?? [], items: items.data ?? [] };
  }, [profile.id, status, days]);
  const { data, loading, error, refresh } = useLiveData(loader, "orders,order_items");
  return <div><PageIntro eyebrow={data?.shop?.name || "รายการของร้านคุณ"} title="ออเดอร์เข้าร้าน" description="ตรวจรายการสินค้าและหมายเหตุสำหรับเตรียมของ สถานะการจัดส่งอัปเดตโดยไรเดอร์และตัวแทนตำบล" action={<button className={secondaryButton} onClick={refresh}><RefreshCw size={16} aria-hidden="true" />อัปเดต</button>} />
    <QuickActions role="merchant" /><Panel className="mb-6"><div className="grid gap-4 sm:grid-cols-2"><label><span className="mb-2 block text-sm">สถานะ</span><select className={inputClass} value={status} onChange={e => setStatus(e.target.value)}><option value="active">กำลังดำเนินการ</option><option value="all">ทุกสถานะ</option>{Object.entries(STATUS_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label><span className="mb-2 block text-sm">ช่วงเวลา</span><select className={inputClass} value={days} onChange={e => setDays(e.target.value)}><option value="1">วันนี้</option><option value="7">7 วันล่าสุด</option><option value="30">30 วันล่าสุด</option></select></label></div></Panel><DataState loading={loading} error={error} retry={refresh} />{data && !error && (data.orders.length ? <div className="grid items-start gap-5 xl:grid-cols-2">{data.orders.map(order => <Panel key={order.id}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs text-ink-soft">{dateStr(order.created_at)} · {timeStr(order.created_at)}</p><h2 className="mt-2 text-lg font-semibold">ออเดอร์ #{order.id}</h2></div><StatusChip status={order.status} /></div><ul className="mt-5 divide-y divide-border">{data.items.filter(item => item.order_id === order.id).map(item => <li key={item.id} className="flex justify-between gap-4 py-3 text-sm"><span>{item.name} <strong className="ml-2">× {item.qty}</strong></span><span className="shrink-0">{money(Number(item.price) * item.qty)}</span></li>)}</ul>{order.note && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-marigold-tint p-4 text-sm leading-7">หมายเหตุ: {order.note}</p>}<div className="mt-4 flex justify-between gap-3 border-t border-border pt-4 text-sm"><span className="text-ink-soft">ยอดสินค้าในออเดอร์</span><strong>{money(Number(order.items_subtotal))}</strong></div><details className="mt-3"><summary className="cursor-pointer py-3 text-sm font-semibold text-indigo">รายละเอียดการส่ง</summary><p className="text-sm leading-7">จุดรับ: {order.pickup || "ยังไม่ระบุ"}<br />จุดส่ง: {order.dropoff || "ยังไม่ระบุ"}<br />วิธีชำระ: {order.payment_method || "ตรวจสอบกับตัวแทน"}</p></details></Panel>)}</div> : <EmptyPanel title={data.shop ? "ไม่มีออเดอร์ในช่วงที่เลือก" : "ยังไม่พบร้านของบัญชีนี้"} text="เปลี่ยนสถานะหรือช่วงเวลาเพื่อดูประวัติของร้าน เมื่อมีรายการใหม่จะโหลดข้อมูลให้อัตโนมัติ" />)}{data?.orders.length === 100 && <p className="mt-5 text-xs text-ink-soft">แสดง 100 ออเดอร์ล่าสุด เลือกช่วงเวลาที่สั้นลงเพื่อดูรายการเพิ่มเติม</p>}</div>;
}

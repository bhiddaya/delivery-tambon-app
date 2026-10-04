"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ArrowRight, MapPin, Phone, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session-context";
import { customerTotal, dateStr, timeStr, money, STATUS_FLOW, STATUS_LABEL, TYPE_LABEL, type OrderStatus } from "@/lib/domain";
import { bangkokDayStart, telHref } from "@/lib/tambon-admin";
import { CustomerSlipCard } from "@/components/CustomerSlipCard";
import { StatusChip } from "@/components/ui";
import { useLiveData } from "./use-live-data";
import { DataState, EmptyPanel, PageIntro, Panel, inputClass, secondaryButton } from "./primitives";

export default function CustomerOrders() {
  const { profile } = useSession();
  const [status, setStatus] = useState("active");
  const [days, setDays] = useState("30");
  const loader = useCallback(async () => {
    const db = createClient();
    let request = db.from("orders").select("*").eq("customer_id", profile.id).order("created_at", { ascending: false });
    if (days !== "all") request = request.gte("created_at", new Date(bangkokDayStart(Date.now()) - (Number(days) - 1) * 86400000).toISOString());
    if (status === "active") request = request.in("status", ["pending", "accepted", "in_progress"]);
    else if (status !== "all") request = request.eq("status", status as OrderStatus);
    const orders = await request.limit(100);
    if (orders.error) throw new Error("orders unavailable");
    const rows = orders.data ?? [];
    const ids = rows.map(o => o.id);
    const areaIds = [...new Set(rows.map(o => o.tambon_id))];
    const driverIds = [...new Set(rows.map(o => o.driver_id).filter((x): x is string => Boolean(x)))];
    const [items, areas, drivers] = await Promise.all([
      ids.length ? db.from("order_items").select("*").in("order_id", ids) : Promise.resolve({ data: [], error: null }),
      areaIds.length ? db.from("tambons").select("*").in("id", areaIds) : Promise.resolve({ data: [], error: null }),
      driverIds.length ? db.from("profiles").select("id,full_name,phone").in("id", driverIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (items.error || areas.error || drivers.error) throw new Error("order details unavailable");
    return { orders: rows, items: items.data ?? [], areas: areas.data ?? [], drivers: drivers.data ?? [] };
  }, [profile.id, days, status]);
  const { data, loading, error, refresh, updated } = useLiveData(loader, "orders,order_items");
  return <div>
    <PageIntro eyebrow="ทุกขั้นตอน ติดตามได้" title="ออเดอร์ของฉัน" description="ดูสถานะ จุดรับ จุดส่ง รายการสินค้า และการชำระเงินของออเดอร์คุณ" action={<button className={secondaryButton} onClick={refresh}><RefreshCw size={16} aria-hidden="true" />อัปเดต</button>} />
    <Panel className="mb-6"><div className="grid items-end gap-4 sm:grid-cols-[1fr_1fr_auto]"><label><span className="mb-2 block text-sm">สถานะออเดอร์</span><select className={inputClass} value={status} onChange={e => setStatus(e.target.value)}><option value="active">กำลังดำเนินการ</option><option value="all">ทุกสถานะ</option>{Object.entries(STATUS_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label><span className="mb-2 block text-sm">ช่วงเวลา</span><select className={inputClass} value={days} onChange={e => setDays(e.target.value)}><option value="1">วันนี้</option><option value="7">7 วันล่าสุด</option><option value="30">30 วันล่าสุด</option><option value="all">ทุกช่วงเวลา</option></select></label>{updated && <p className="pb-3 text-xs text-ink-soft">โหลดล่าสุด {timeStr(updated.toISOString())}</p>}</div></Panel>
    <DataState loading={loading} error={error} retry={refresh} />
    {data && !error && <>{data.orders.length ? <div className="space-y-4">{data.orders.map(o => {
      const driver = data.drivers.find(d => d.id === o.driver_id);
      const phone = telHref(driver?.phone);
      const area = data.areas.find(t => t.id === o.tambon_id);
      const items = data.items.filter(i => i.order_id === o.id);
      return <Panel key={o.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-ink-soft">{dateStr(o.created_at)} · {timeStr(o.created_at)}</p><h2 className="mt-2 text-lg font-semibold">{TYPE_LABEL[o.type]} #{o.id}</h2></div><StatusChip status={o.status} /></div>
        {o.status !== "cancelled" && <ol aria-label="ความคืบหน้า" className="mt-5 grid gap-2 sm:grid-cols-4">{STATUS_FLOW.map((s, index) => <li key={s} className={`rounded-xl px-3 py-3 text-xs leading-6 ${index <= STATUS_FLOW.indexOf(o.status) ? "bg-indigo-tint text-indigo" : "bg-surface-2 text-ink-soft"}`}><span className="mr-2 font-semibold">{index + 1}.</span>{STATUS_LABEL[s]}</li>)}</ol>}
        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto]"><p className="flex items-start gap-3 text-sm leading-7"><MapPin size={18} className="mt-1 shrink-0 text-indigo" aria-hidden="true" /><span><span className="text-ink-soft">จุดส่ง</span><br />{o.dropoff || "ยังไม่ระบุ"}</span></p><div className="text-sm"><p className="text-ink-soft">ยอดสินค้าและบริการ</p><p className="mt-1 text-xl font-semibold">{money(customerTotal(o))}</p></div></div>
        <details className="mt-5 border-t border-border pt-3"><summary className="cursor-pointer py-2 text-sm font-semibold text-indigo">รายละเอียดออเดอร์และการชำระเงิน</summary><div className="mt-3 grid gap-5 sm:grid-cols-2"><div><p className="text-sm leading-7"><span className="text-ink-soft">จุดรับ:</span> {o.pickup || "ยังไม่ระบุ"}</p>{o.note && <p className="mt-2 whitespace-pre-wrap text-sm leading-7"><span className="text-ink-soft">หมายเหตุ:</span> {o.note}</p>}<ul className="mt-3 space-y-2">{items.map(item => <li key={item.id} className="flex justify-between gap-3 text-sm"><span>{item.name} × {item.qty}</span><span className="shrink-0">{money(Number(item.price) * item.qty)}</span></li>)}</ul></div><div className="rounded-xl bg-surface-2 p-4 text-sm"><p>ค่าสินค้า {money(Number(o.items_subtotal))}</p><p className="mt-2">{o.type === "ride" ? "ค่าเรียกรถ" : "ค่าส่ง/บริการ"} {money(Number(o.type === "ride" ? o.price : o.delivery_fee))}</p><p className="mt-3 text-ink-soft">วิธีชำระ: {o.payment_method || "ตรวจสอบกับตัวแทน"}</p>{o.payment_ref && <p className="mt-2 break-all text-xs">เลขอ้างอิง {o.payment_ref}</p>}{driver && <p className="mt-3">ไรเดอร์: {driver.full_name}</p>}{phone && <a href={phone} className="mt-2 inline-flex min-h-11 items-center gap-2 text-indigo"><Phone size={16} aria-hidden="true" />โทรหาไรเดอร์</a>}</div></div></details>
        {o.status === "delivered" && (o.payment_method === "พร้อมเพย์" || o.slip_submitted_at) && <><CustomerSlipCard order={o} tambon={area} onChanged={refresh} />{!area?.settlement_promptpay_id && <p className="mt-4 rounded-xl bg-marigold-tint p-4 text-sm leading-7">ยังไม่มีบัญชีรับเงินของตำบลในระบบ โปรดตรวจช่องทางและยอดชำระกับตัวแทนก่อนโอน</p>}</>}
      </Panel>;
    })}{data.orders.length === 100 && <p className="text-sm text-ink-soft">แสดง 100 รายการล่าสุดในช่วงที่เลือก เลือกช่วงเวลาสั้นลงเพื่อดูรายการอื่น</p>}</div> : <EmptyPanel title="ไม่มีออเดอร์ในตัวกรองนี้" text="เปลี่ยนสถานะหรือช่วงเวลาเพื่อดูประวัติ หรือลองเลือกร้านใกล้บ้านเพื่อเริ่มรายการใหม่" action={<Link href="/customer" className={secondaryButton}>เลือกร้าน<ArrowRight size={16} aria-hidden="true" /></Link>} />}</>}
  </div>;
}

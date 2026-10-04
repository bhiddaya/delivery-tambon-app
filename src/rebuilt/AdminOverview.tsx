"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session-context";
import { customerTotal, money, STATUS_LABEL, timeStr } from "@/lib/domain";
import { bangkokDayStart, todoItems } from "@/lib/tambon-admin";
import { tambonDisplayName } from "@/lib/tambon-choice";
import { useLiveData } from "./use-live-data";
import { DataState, PageIntro, Panel, StatCard, inputClass, secondaryButton } from "./primitives";

const ZERO_ID = "00000000-0000-0000-0000-000000000000";
export default function AdminOverview() {
  const { profile } = useSession();
  const [selectedId, setSelectedId] = useState("");
  const [days, setDays] = useState("1");
  const loader = useCallback(async () => {
    const db = createClient();
    let scope: string[] | null = null;
    if (profile.role !== "superadmin") {
      const result = await db.from("admin_scopes").select("tambon_id").eq("profile_id", profile.id);
      if (result.error) throw new Error("scope unavailable");
      scope = [...new Set([...(result.data ?? []).map(s => s.tambon_id), ...(profile.role === "admin" && profile.tambon_id ? [profile.tambon_id] : [])].filter((x): x is string => Boolean(x)))];
    }
    let areasRequest = db.from("tambons").select("*").order("name");
    if (scope) areasRequest = areasRequest.in("id", scope.length ? scope : [ZERO_ID]);
    const areas = await areasRequest;
    if (areas.error) throw new Error("areas unavailable");
    const tambons = areas.data ?? [];
    if (selectedId && !tambons.some(t => t.id === selectedId)) throw new Error("unknown area");
    const current = tambons.find(t => t.id === selectedId) ?? (tambons.length === 1 ? tambons[0] : null);
    const ids = current ? [current.id] : tambons.map(t => t.id);
    const inIds = ids.length ? ids : [ZERO_ID];
    const loaded = Date.now();
    const since = new Date(bangkokDayStart(loaded) - (Number(days) - 1) * 86400000).toISOString();
    const results = await Promise.all([
      db.from("orders").select("*").in("tambon_id", inIds).eq("is_test", false).gte("created_at", since).order("created_at", { ascending: false }).limit(1000),
      db.from("orders").select("*").in("tambon_id", inIds).eq("is_test", false).in("status", ["pending", "accepted", "in_progress"]).order("created_at").limit(1000),
      db.from("settlements").select("*").in("tambon_id", inIds).is("paid_out_at", null).order("due_at").limit(1000),
      db.from("merchants").select("*").in("tambon_id", inIds).eq("is_test", false).order("name"),
      db.from("profiles").select("*").in("tambon_id", inIds).eq("is_test", false),
      db.from("tambon_board_posts").select("id", { count: "exact", head: true }).in("tambon_id", inIds).eq("status", "pending"),
    ]);
    if (results.some(r => r.error)) throw new Error("overview unavailable");
    const [orders, active, settlements, shops, members, board] = results;
    const profiles = members.data ?? [];
    const driverIds = profiles.filter(p => p.role === "driver").map(p => p.id);
    const shopIds = (shops.data ?? []).map(s => s.id);
    const [drivers, menu] = await Promise.all([
      driverIds.length ? db.from("drivers").select("*").in("profile_id", driverIds) : Promise.resolve({ data: [], error: null }),
      shopIds.length ? db.from("menu_items").select("merchant_id").in("merchant_id", shopIds).eq("is_hidden", false) : Promise.resolve({ data: [], error: null }),
    ]);
    if (drivers.error || menu.error) throw new Error("members unavailable");
    return { tambons, current, loaded, orders: orders.data ?? [], active: active.data ?? [], settlements: settlements.data ?? [], board: board.count ?? 0,
      merchants: (shops.data ?? []).map(merchant => ({ merchant, profile: profiles.find(p => p.id === merchant.profile_id), menuCount: (menu.data ?? []).filter(m => m.merchant_id === merchant.id).length })),
      drivers: profiles.filter(p => p.role === "driver").map(profile => ({ profile, driver: (drivers.data ?? []).find(d => d.profile_id === profile.id) })),
    };
  }, [profile.id, profile.role, profile.tambon_id, selectedId, days]);
  const { data, loading, error, refresh, updated } = useLiveData(loader, "orders,settlements,drivers,merchants,profiles,tambon_board_posts");
  const q = data?.current?.slug ? `?t=${encodeURIComponent(data.current.slug)}` : "";
  const todo = data ? todoItems({ tambon: data.current, orders: [...data.active, ...data.orders.filter(o => !data.active.some(a => a.id === o.id))], settlements: data.settlements, merchants: data.merchants, drivers: data.drivers, now: data.loaded, q }) : [];
  if (data?.board) todo.push({ key: "board", text: `ประกาศรอตรวจ ${data.board} รายการ`, href: `/admin/board${q}`, urgent: false });
  const missingFees = data?.tambons.filter(t => (!data.current || t.id === data.current.id) && t.delivery_fee_base == null) ?? [];
  if (missingFees.length) todo.push({ key: "fees", text: `ยังไม่ตั้งค่าส่ง ${missingFees.length} ตำบล · ต้องตรวจสอบก่อนรับรายการจริง`, href: `/admin/tambon-page${q}`, urgent: false });
  const done = data?.orders.filter(o => o.status === "delivered") ?? [];
  return <div>
    <PageIntro eyebrow="รู้สถานการณ์ แล้วลงมือได้" title="ภาพรวมตำบล" description="ดูออเดอร์ เรื่องที่ต้องจัดการ และความพร้อมของร้านกับไรเดอร์ในพื้นที่ที่คุณดูแล" action={<button className={secondaryButton} onClick={refresh}><RefreshCw size={16} aria-hidden="true" />อัปเดต</button>} />
    <Panel className="mb-6"><div className="grid gap-4 sm:grid-cols-[1fr_220px_auto]"><label><span className="mb-2 block text-sm">ตำบลที่ดูแล</span><select className={inputClass} value={selectedId} onChange={e => setSelectedId(e.target.value)}><option value="">{data?.tambons.length === 1 ? tambonDisplayName(data.tambons[0].name) : "ทุกตำบลที่มีสิทธิ์ดูแล"}</option>{data?.tambons.map(t => <option key={t.id} value={t.id}>{tambonDisplayName(t.name)}</option>)}</select></label><label><span className="mb-2 block text-sm">ช่วงเวลาออเดอร์</span><select className={inputClass} value={days} onChange={e => setDays(e.target.value)}><option value="1">วันนี้</option><option value="7">7 วันล่าสุด</option><option value="30">30 วันล่าสุด</option></select></label>{updated && <p className="self-end pb-3 text-xs text-ink-soft">โหลดล่าสุด {timeStr(updated.toISOString())}</p>}</div></Panel>
    <DataState loading={loading} error={error} retry={refresh} />
    {data && !error && <>
      <div className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label={days === "1" ? "ออเดอร์วันนี้" : `ออเดอร์ ${days} วัน`} value={data.orders.length} note={`ส่งสำเร็จ ${done.length} · ไม่นับออเดอร์ทดสอบ`} /><StatCard label="ยอดออเดอร์ที่ส่งสำเร็จ" value={money(done.reduce((n, o) => n + customerTotal(o), 0))} note="ยอดลูกค้าชำระตามออเดอร์ ไม่ใช่กำไร" /><StatCard label="ไรเดอร์ออนไลน์" value={`${data.drivers.filter(d => d.driver?.is_online && d.profile.approved && !d.profile.suspended_at).length}/${data.drivers.filter(d => d.profile.approved && !d.profile.suspended_at).length}`} note="เฉพาะบัญชีที่อนุมัติแล้ว" /><StatCard label="ร้านเปิดขาย" value={`${data.merchants.filter(m => m.merchant.is_open).length}/${data.merchants.length}`} note="สถานะร้านตามข้อมูลล่าสุด" /></div>
      <div className="grid items-start gap-6 xl:grid-cols-[1.3fr_1fr]"><section><h2 className="mb-4 text-xl font-semibold">เรื่องที่ต้องทำตอนนี้</h2>{todo.length ? <div className="space-y-3">{todo.map(item => <Link href={item.href} key={item.key} className={`flex items-center justify-between gap-4 rounded-2xl border bg-surface p-5 ${item.urgent ? "border-clay" : "border-border"}`}><div><p className={`mb-1 text-xs font-semibold ${item.urgent ? "text-clay" : "text-ink-soft"}`}>{item.urgent ? "ควรจัดการก่อน" : "ตรวจความพร้อม"}</p><p className="text-sm leading-7">{item.text}</p></div><ArrowRight size={19} className="shrink-0 text-indigo" aria-hidden="true" /></Link>)}</div> : <Panel><CheckCircle2 size={30} className="text-jade" aria-hidden="true" /><p className="mt-4 text-lg font-semibold">ไม่มีรายการค้างในข้อมูลที่โหลด</p><p className="mt-2 text-sm leading-7 text-ink-soft">ตรวจความพร้อมของพื้นที่และเวลาบริการได้จากเมนูด้านข้าง</p></Panel>}</section>
      <div className="space-y-5"><Panel><h2 className="mb-5 text-xl font-semibold">สถานะออเดอร์ในช่วงที่เลือก</h2><div className="space-y-4">{Object.entries(STATUS_LABEL).map(([key, label]) => { const count = data.orders.filter(o => o.status === key).length; return <div key={key}><div className="mb-2 flex justify-between gap-3 text-sm"><span>{label}</span><strong className="tabular-nums">{count}</strong></div><div className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true"><div className="h-full rounded-full bg-[#2e3e68]" style={{ width: `${data.orders.length ? count / data.orders.length * 100 : 0}%` }} /></div></div>; })}</div><Link className={`${secondaryButton} mt-5 w-full`} href={`/admin/orders${q}`}>ดูรายละเอียดออเดอร์<ArrowRight size={16} aria-hidden="true" /></Link></Panel><Panel><p className="text-sm text-ink-soft">ยอดรอโอนให้ร้านและไรเดอร์</p><p className="mt-3 text-3xl font-semibold">{money(data.settlements.reduce((n, s) => n + Number(s.amount), 0))}</p><p className="mt-3 text-xs leading-6 text-ink-soft">{data.settlements.length} รายการ · จากรายการบัญชีจริงที่ยังไม่จ่ายออก</p><Link className={`${secondaryButton} mt-5 w-full`} href={`/admin/accounts${q}`}>ตรวจรายการบัญชี</Link></Panel></div></div>
      <p className="mt-6 text-xs leading-6 text-ink-soft">ช่วงเวลานับตามเวลาไทย · ออเดอร์และยอดรอโอนแสดงสูงสุดชุดละ 1,000 รายการ · เรื่องค้างตรวจจากงานที่ยังดำเนินการทั้งหมดในขอบเขตที่ดูแล</p>
    </>}
  </div>;
}

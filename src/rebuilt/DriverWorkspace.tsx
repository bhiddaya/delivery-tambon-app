"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { MapPin, Navigation, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session-context";
import { DRIVER_ACTION_LABEL, TYPE_LABEL, VEHICLE_LABEL, mapsLink, money, type OrderRow } from "@/lib/domain";
import { bangkokDayStart } from "@/lib/tambon-admin";
import { StatusChip } from "@/components/ui";
import { nextDriverStatus } from "./order-logic";
import { useLiveData } from "./use-live-data";
import { DataState, EmptyPanel, PageIntro, Panel, StatCard, primaryButton, secondaryButton } from "./primitives";

export default function DriverWorkspace() {
  const { profile } = useSession();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState<number | null>(null);
  const loader = useCallback(async () => {
    const db = createClient();
    const [driver, ownProfile, activeOrders, doneOrders, settlements] = await Promise.all([
      db.from("drivers").select("*").eq("profile_id", profile.id).maybeSingle(),
      db.from("profiles").select("approved,suspended_at").eq("id", profile.id).single(),
      db.from("orders").select("*").eq("driver_id", profile.id).in("status", ["accepted", "in_progress"]).order("created_at"),
      db.from("orders").select("*").eq("driver_id", profile.id).eq("status", "delivered").gte("updated_at", new Date(bangkokDayStart(Date.now())).toISOString()).order("updated_at", { ascending: false }).limit(1000),
      db.from("settlements").select("amount").eq("payee_profile_id", profile.id).eq("payee_role", "driver").is("paid_out_at", null),
    ]);
    if (driver.error || ownProfile.error || activeOrders.error || doneOrders.error || settlements.error) throw new Error("driver unavailable");
    const eligible = ownProfile.data.approved && !ownProfile.data.suspended_at;
    const pending = eligible && driver.data?.is_online ? await db.from("orders").select("*").eq("tambon_id", profile.tambon_id ?? "00000000-0000-0000-0000-000000000000").eq("is_test", profile.is_test).eq("status", "pending").is("driver_id", null).order("created_at").limit(50) : { data: [], error: null };
    if (pending.error) throw new Error("pending unavailable");
    return { driver: driver.data, eligible, mine: [...(activeOrders.data ?? []), ...(doneOrders.data ?? [])], pending: (pending.data ?? []).filter(o => !o.required_vehicle_type || o.required_vehicle_type === driver.data?.vehicle_type), settlements: settlements.data ?? [], loaded: Date.now() };
  }, [profile.id, profile.tambon_id, profile.is_test]);
  const { data, loading, error, refresh } = useLiveData(loader, "orders,drivers,profiles,settlements");
  const active = data?.mine.filter(o => o.status === "accepted" || o.status === "in_progress") ?? [];
  const today = data?.mine.filter(o => o.status === "delivered" && new Date(o.delivered_at ?? o.updated_at).getTime() >= bangkokDayStart(data.loaded)) ?? [];
  async function run(action: () => Promise<void>) {
    setBusy(true); setMessage("");
    try { await action(); setConfirmation(null); refresh(); }
    catch { setMessage("อัปเดตไม่สำเร็จ งานอาจเปลี่ยนสถานะหรือมีคนรับไปแล้ว กดอัปเดตและตรวจอีกครั้ง"); refresh(); }
    finally { setBusy(false); }
  }
  async function accept(order: OrderRow) {
    if (!data?.eligible || !data.driver?.is_online || active.length) return;
    await run(async () => {
      const result = await createClient().from("orders").update({ driver_id: profile.id, status: "accepted" }).eq("id", order.id).eq("tambon_id", profile.tambon_id!).eq("is_test", profile.is_test).eq("status", "pending").is("driver_id", null).select("id");
      if (result.error || result.data?.length !== 1) throw new Error("not accepted");
    });
  }
  async function advance(order: OrderRow) {
    const next = nextDriverStatus(order.status);
    if (!next || !data?.eligible) return;
    await run(async () => {
      const result = await createClient().from("orders").update({ status: next }).eq("id", order.id).eq("driver_id", profile.id).eq("status", order.status).select("id");
      if (result.error || result.data?.length !== 1) throw new Error("not updated");
    });
  }
  async function locate() {
    if (!navigator.geolocation || !data?.driver) { setMessage("เบราว์เซอร์นี้ยังใช้ตำแหน่งไม่ได้ กรุณาเปิดผ่าน Chrome หรือ Safari"); return; }
    await run(async () => {
      const point = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }));
      const result = await createClient().from("drivers").update({ lat: point.coords.latitude, lng: point.coords.longitude, location_updated_at: new Date().toISOString() }).eq("profile_id", profile.id).select("profile_id");
      if (result.error || result.data?.length !== 1) throw new Error("location not saved");
    });
  }
  function jobDetails(order: OrderRow) {
    return <><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-semibold">{TYPE_LABEL[order.type]} #{order.id}</h3><StatusChip status={order.status} /></div><div className="mt-4 grid gap-4 sm:grid-cols-2">{[{ label: "จุดรับ", address: order.pickup }, { label: "จุดส่ง", address: order.dropoff }].map(p => <div key={p.label}><p className="text-xs text-ink-soft">{p.label}</p><p className="mt-2 text-sm leading-7">{p.address || "ดูรายละเอียดกับตัวแทน"}</p>{mapsLink(p.address) && <a href={mapsLink(p.address)!} target="_blank" rel="noreferrer" className="mt-1 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-indigo"><Navigation size={16} aria-hidden="true" />เปิดแผนที่</a>}</div>)}</div>{order.note && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-surface-2 p-3 text-sm leading-7">{order.note}</p>}<p className="mt-4 text-sm text-ink-soft">{order.type === "ride" ? "ค่าเรียกรถ" : "ค่าส่ง/บริการ"}ที่ลูกค้าชำระ <strong className="ml-2 text-ink">{money(Number(order.type === "ride" ? order.price : order.delivery_fee))}</strong></p></>;
  }
  return <div>
    <PageIntro eyebrow="งานใกล้บ้าน รายได้ในชุมชน" title="งานจัดส่งของคุณ" description="เปิดสถานะพร้อมรับ ตรวจจุดรับจุดส่ง แล้วอัปเดตงานตามการจัดส่งจริง" action={<button className={secondaryButton} onClick={refresh}><RefreshCw size={16} aria-hidden="true" />อัปเดต</button>} />
    <DataState loading={loading} error={error} retry={refresh} />
    {message && <p role="alert" className="mb-5 rounded-xl bg-marigold-tint p-4 text-sm leading-7">{message}</p>}
    {data && !error && <>
      {!data.eligible && <Panel className="mb-5 border-marigold"><h2 className="text-lg font-semibold">{profile.suspended_at ? "บัญชีถูกพักการใช้งาน" : "กำลังรอตัวแทนอนุมัติ"}</h2><p className="mt-3 text-sm leading-7 text-ink-soft">ยังรับงานใหม่ไม่ได้ ตรวจข้อมูลสมัครและสอบถามตัวแทนตำบลผ่านหน้าบัญชี</p></Panel>}
      {!profile.line_user_id && <p className="mb-5 text-sm text-ink-soft">ผูก LINE เพื่อรับแจ้งงานใหม่ <Link href="/account" className="font-semibold text-indigo underline">ไปหน้าบัญชี</Link></p>}
      {data.driver ? <Panel className="mb-6"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-lg font-semibold">{VEHICLE_LABEL[data.driver.vehicle_type]}</h2><p className="mt-2 text-sm text-ink-soft">{data.driver.is_online ? "พร้อมรับงานในตำบล" : "พักรับงานอยู่"}</p></div><button aria-pressed={data.driver.is_online} className={data.driver.is_online ? primaryButton : secondaryButton} disabled={busy || !data.eligible} onClick={() => run(async () => { const result = await createClient().from("drivers").update({ is_online: !data.driver!.is_online }).eq("profile_id", profile.id).select("profile_id"); if (result.error || result.data?.length !== 1) throw new Error("not saved"); })}>{data.driver.is_online ? "ออนไลน์ · กดพักงาน" : "เปิดพร้อมรับงาน"}</button></div><div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border pt-4"><button className={secondaryButton} disabled={busy || !data.eligible} onClick={locate}><MapPin size={17} aria-hidden="true" />ส่งตำแหน่งปัจจุบัน</button><p className="text-xs leading-6 text-ink-soft">{data.driver.location_updated_at ? `ตำแหน่งล่าสุด ${new Date(data.driver.location_updated_at).toLocaleString("th-TH")}` : "ยังไม่มีตำแหน่ง · กดปุ่มเพื่ออนุญาตและส่งตำแหน่งครั้งนี้"}</p></div></Panel> : <EmptyPanel title="ยังไม่พบข้อมูลยานพาหนะ" text="ตรวจข้อมูลสมัครไรเดอร์ในหน้าบัญชีหรือติดต่อตัวแทนตำบล" />}
      <div className="mb-7 grid gap-4 sm:grid-cols-3"><StatCard label="กำลังจัดส่ง" value={active.length} note="งานของบัญชีนี้" /><StatCard label="ส่งสำเร็จวันนี้" value={today.length} note="นับตามเวลาไทย · สูงสุด 1,000 งานวันนี้" /><StatCard label="ยอดรอโอนจากตำบล" value={money(data.settlements.reduce((n, s) => n + Number(s.amount), 0))} note="จากรายการโอนจริงที่ยังไม่จ่ายออก" /></div>
      <section className="mb-7"><h2 className="mb-4 text-xl font-semibold">งานที่กำลังทำ</h2>{active.length ? <div className="space-y-4">{active.map(order => <Panel key={order.id} className="border-indigo">{jobDetails(order)}{confirmation === order.id ? <div className="mt-5 rounded-xl bg-jade-tint p-4"><p className="mb-3 text-sm leading-7">ส่งของถึงลูกค้าและตรวจความเรียบร้อยแล้วใช่ไหม?</p><div className="flex flex-wrap gap-3"><button className={primaryButton} disabled={busy} onClick={() => advance(order)}>ยืนยันส่งสำเร็จ</button><button className={secondaryButton} disabled={busy} onClick={() => setConfirmation(null)}>กลับไปตรวจงาน</button></div></div> : <button className={`${primaryButton} mt-5 w-full sm:w-auto`} disabled={busy || !data.eligible} onClick={() => order.status === "in_progress" ? setConfirmation(order.id) : advance(order)}>{busy ? "กำลังอัปเดต…" : DRIVER_ACTION_LABEL[order.status]}</button>}</Panel>)}</div> : <EmptyPanel title="ยังไม่มีงานที่กำลังทำ" text="เมื่อพร้อมรับงาน เปิดสถานะออนไลน์ แล้วเลือกงานที่รอรับด้านล่าง" />}</section>
      <section><h2 className="mb-4 text-xl font-semibold">งานที่รอรับ · {data.pending.length}</h2>{!data.driver?.is_online ? <EmptyPanel title="เปิดพร้อมรับงานเพื่อดูรายการ" text="พักงานได้เมื่อไม่สะดวก ระบบแสดงรายการที่ตรงกับยานพาหนะและตำบลของคุณ" /> : data.pending.length ? <div className="grid gap-4 xl:grid-cols-2">{data.pending.map(order => <Panel key={order.id}>{jobDetails(order)}<button className={`${primaryButton} mt-5 w-full`} disabled={busy || active.length > 0 || !data.eligible} onClick={() => accept(order)}>{active.length ? "ทำงานปัจจุบันให้เสร็จก่อน" : "รับงานนี้"}</button></Panel>)}</div> : <EmptyPanel title="ยังไม่มีงานรอรับตอนนี้" text="กดอัปเดตได้ และระบบจะโหลดข้อมูลใหม่เมื่อสถานะงานเปลี่ยน" />}</section>
    </>}
  </div>;
}

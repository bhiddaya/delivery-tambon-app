"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ClipboardList, Store, Bike, Wallet, UsersRound, RefreshCw, Plus, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { loadAgentDashboard, syncAgentMemory, WORK_CATEGORIES, WORK_STATES, type WorkCategory, type WorkStatus } from "@/lib/agent-dashboard";
import { tambonDisplayName } from "@/lib/tambon-choice";
import { money, TYPE_LABEL, STATUS_LABEL, type OrderType, type OrderStatus } from "@/lib/domain";
import { useLiveData } from "@/rebuilt/use-live-data";
import { DataState, PageIntro, Panel, StatCard, inputClass, primaryButton, secondaryButton } from "@/rebuilt/primitives";
import AgentWorkCard from "./AgentWorkCard";

export default function AgentDashboard({ initialArea = "" }: { initialArea?: string }) {
  const [selected, setSelected] = useState(initialArea); const [filter, setFilter] = useState<WorkStatus | "all">("all"); const [page, setPage] = useState(0);
  const loader = useCallback(() => loadAgentDashboard(selected, filter === "all" ? "open" : filter, page * 100), [selected, filter, page]);
  // messages is not in the Realtime publication; the 30s refresh still updates its count.
  const live = useLiveData(loader, "agent_work_items,agent_work_events,orders,settlements,merchants,drivers,profiles,admin_scopes,tambons");
  const { refresh } = live;
  const data = live.data?.dashboard; const areaId = data?.area.id;
  const [memory, setMemory] = useState<{ area: string; state: "saving" | "saved" | "waiting"; at?: string }>({ area: "", state: "waiting" });
  const [retryTick, setRetryTick] = useState(0);
  const fingerprint = data ? JSON.stringify([areaId, data.counts, data.task_counts, data.tasks.map(t => [t.id, t.version])]) : "";
  const savedFingerprint = useRef("");
  useEffect(() => {
    if (!areaId || !fingerprint || savedFingerprint.current === fingerprint) return;
    let ignore = false;
    const timer = window.setTimeout(async () => {
      setMemory({ area: areaId, state: "saving" });
      try { const result = await syncAgentMemory(areaId); if (!ignore) { savedFingerprint.current = fingerprint; setMemory({ area: areaId, state: "saved", at: result.checked_at }); } }
      catch { if (!ignore) setMemory({ area: areaId, state: "waiting" }); }
    }, 1500);
    return () => { ignore = true; window.clearTimeout(timer); };
  }, [areaId, fingerprint, retryTick]);
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState !== "hidden") refresh(); }, 30_000);
    const retryTimer = window.setInterval(() => { if (document.visibilityState !== "hidden" && navigator.onLine) setRetryTick(v => v + 1); }, 60_000);
    const resume = () => { if (document.visibilityState !== "hidden") { refresh(); setRetryTick(v => v + 1); } };
    window.addEventListener("online", resume); document.addEventListener("visibilitychange", resume);
    return () => { window.clearInterval(timer); window.clearInterval(retryTimer); window.removeEventListener("online", resume); document.removeEventListener("visibilitychange", resume); };
  }, [refresh]);
  const [formOpen, setFormOpen] = useState(false); const [title, setTitle] = useState(""); const [detail, setDetail] = useState(""); const [category, setCategory] = useState<WorkCategory>("coordination"); const [due, setDue] = useState(""); const [orderId, setOrderId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false); const [formError, setFormError] = useState(""); const [retrySave, setRetrySave] = useState(false);
  const pending = useRef<{ p_tambon_id: string; p_request_id: string; p_title: string; p_detail: string; p_category: string; p_due_on: string | null; p_order_id: number | null } | null>(null);
  function resetForm() { setTitle(""); setDetail(""); setCategory("coordination"); setDue(""); setOrderId(null); setFormError(""); }
  async function save() {
    if (!areaId || busy) return;
    if (!pending.current) pending.current = { p_tambon_id: areaId, p_request_id: crypto.randomUUID(), p_title: title.trim(), p_detail: detail.trim(), p_category: category, p_due_on: due || null, p_order_id: orderId };
    setBusy(true); setFormError("");
    try {
      const result = await createClient().rpc("agent_work_save", pending.current);
      if (result.error) { if (["42501", "22023", "23514"].includes(result.error.code)) { pending.current = null; setRetrySave(false); } else setRetrySave(true); throw new Error("ยังบันทึกไม่ได้ ตรวจข้อมูลและการเชื่อมต่อ แล้วลองอีกครั้ง"); }
      pending.current = null; setRetrySave(false); setTitle(""); setDetail(""); setDue(""); setOrderId(null); setFormOpen(false); live.refresh();
    } catch (e) { if (pending.current) setRetrySave(true); setFormError(e instanceof Error ? e.message : "ยังบันทึกไม่ได้"); }
    finally { setBusy(false); }
  }
  const q = data ? `?t=${encodeURIComponent(data.area.slug)}` : "";
  const taskTotal = data ? (filter === "all" ? data.task_counts.todo + data.task_counts.doing + data.task_counts.waiting : data.task_counts[filter]) : 0;
  const tasks = data?.tasks.filter(t => filter === "all" ? t.status !== "done" : t.status === filter) ?? [];
  const links = [
    { label: "ดูและจัดการออเดอร์", href: `/admin/orders${q}`, icon: ClipboardList },
    { label: "ร้านค้าและไรเดอร์", href: `/admin/people${q}`, icon: Store },
    { label: "ตรวจเงินและยอดจ่าย", href: `/finance${q}`, icon: Wallet },
    { label: "สมาชิกที่รออนุมัติ", href: `/admin/approvals${q}`, icon: UsersRound },
  ];
  return <div>
    <PageIntro eyebrow="บวรไทย · ดิลิเวอรี่" title={data ? `งานตำบล${tambonDisplayName(data.area.name)}` : "งานตัวแทนตำบล"} description="ดูงานที่ต้องทำ ประสานร้านกับไรเดอร์ และบันทึกความคืบหน้าในพื้นที่ของคุณ" action={<button className={secondaryButton} disabled={live.loading} onClick={live.refresh}><RefreshCw size={16} aria-hidden="true" />อัปเดตข้อมูล</button>} />
    <Panel className="mb-5"><div className="flex flex-wrap items-end justify-between gap-4"><label className="min-w-48"><span className="mb-2 block text-sm">พื้นที่ที่ดูแล</span><select className={inputClass} value={areaId || ""} disabled={busy || retrySave} onChange={e => { setSelected(e.target.value); setPage(0); setFormOpen(false); resetForm(); }}><option value="" disabled>เลือกตำบล</option>{live.data?.areas.map(a => <option value={a.id} key={a.id}>{tambonDisplayName(a.name)}</option>)}</select></label><div className="text-xs leading-6 text-ink-soft" role="status"><p>ข้อมูลเปลี่ยนแล้วอัปเดตอัตโนมัติ · {live.updated ? `ล่าสุด ${live.updated.toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok" })}` : "กำลังโหลด"}</p><p>{memory.area === areaId && memory.state === "saved" ? "✓ เชื่อมสรุปความคืบหน้ากับส่วนกลางแล้ว" : memory.area === areaId && memory.state === "saving" ? "กำลังเชื่อมสรุปความคืบหน้ากับส่วนกลาง…" : "รอเชื่อมสรุปส่วนกลาง · บันทึกงานในตำบลยังอยู่"}</p></div></div></Panel>
    <DataState loading={live.loading} error={live.error} retry={live.refresh} />
    {live.data && !data && <Panel><p>ยังไม่มีพื้นที่ที่ได้รับสิทธิ์ กรุณาเข้าสู่ระบบด้วยรหัสผ่าน หรือติดต่อส่วนกลางเพื่อตรวจการแต่งตั้งตัวแทน</p></Panel>}
    {data && !live.error && <>
      {data.area.intake_blocked && <p role="status" className="mb-5 rounded-xl bg-marigold-tint p-4 text-sm">พื้นที่นี้พักรับออเดอร์อยู่ ติดต่อส่วนกลางเมื่อต้องการเปิดรับ</p>}
      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4"><StatCard label="ออเดอร์วันนี้" value={data.counts.today_orders} note={`ส่งแล้ว ${data.counts.delivered_today} รายการ`} /><StatCard label="งานกำลังจัดส่ง / รอจัดการ" value={data.counts.active_orders} note={`รอยืนยันเงิน ${data.counts.awaiting_payment} รายการ`} /><StatCard label="ร้านเปิด · ไรเดอร์ออนไลน์" value={`${data.counts.open_shops} · ${data.counts.online_drivers}`} note={`ร้านในพื้นที่ ${data.counts.shops} ร้าน`} /><StatCard label="ยอดรอจ่ายร้านและไรเดอร์" value={money(data.counts.payout_amount)} note={`${data.counts.pending_payouts} รายการ · ตรวจในหน้าการเงิน`} /></div>
      <div className="mb-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{links.map(l => <Link className={`${secondaryButton} justify-start`} key={l.href} href={l.href}><l.icon size={18} aria-hidden="true" />{l.label}</Link>)}</div>
      <div className="grid items-start gap-6 xl:grid-cols-[1.5fr_1fr]"><section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">งานและความคืบหน้าของตำบล</h2><button className={primaryButton} onClick={() => { resetForm(); setFormOpen(v => !v); }} disabled={busy || retrySave}><Plus size={16} aria-hidden="true" />บันทึกงานใหม่</button></div>
        {formOpen && <Panel className="mb-4"><h3 className="mb-4 font-semibold">บันทึกเรื่องที่ต้องติดตาม</h3><fieldset disabled={busy || retrySave} className="space-y-3">{orderId !== null && <p className="text-sm">ติดตามออเดอร์ #{orderId} <button type="button" className="ml-2 text-indigo underline" onClick={() => setOrderId(null)}>แยกเป็นงานทั่วไป</button></p>}<label className="block"><span className="mb-2 block text-sm">เรื่องที่ต้องทำ</span><input className={inputClass} value={title} maxLength={160} onChange={e => setTitle(e.target.value)} placeholder="เช่น ประสานร้านเรื่องเวลาพร้อมรับอาหาร" /></label><div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-2 block text-sm">เกี่ยวกับ</span><select className={inputClass} value={category} onChange={e => setCategory(e.target.value as WorkCategory)}>{Object.entries(WORK_CATEGORIES).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label><label><span className="mb-2 block text-sm">กำหนดเสร็จ (ถ้ามี)</span><input className={inputClass} type="date" value={due} onChange={e => setDue(e.target.value)} /></label></div><label className="block"><span className="mb-2 block text-sm">รายละเอียด</span><textarea className={inputClass} value={detail} maxLength={2000} rows={3} onChange={e => setDetail(e.target.value)} /></label></fieldset><p className="my-3 text-xs leading-6 text-ink-soft">รายละเอียดเก็บเฉพาะพื้นที่ สรุปจำนวนและสถานะงานเชื่อมส่วนกลางอัตโนมัติ ไม่ต้องใส่รหัสผ่านหรือข้อมูลบัญชีในบันทึก</p><button className={primaryButton} disabled={busy || (!retrySave && title.trim().length < 3)} onClick={save}>{busy ? "กำลังบันทึก…" : retrySave ? "ลองบันทึกเดิมอีกครั้ง" : "บันทึกงาน"}</button>{formError && <p className="mt-3 text-sm text-clay" role="alert">{formError}</p>}</Panel>}
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="กรองสถานะงาน"><button className={secondaryButton} aria-pressed={filter === "all"} onClick={() => { setFilter("all"); setPage(0); }}>งานที่ยังค้าง</button>{Object.entries(WORK_STATES).map(([s, label]) => <button key={s} className={secondaryButton} aria-pressed={filter === s} onClick={() => { setFilter(s as WorkStatus); setPage(0); }}>{label} {data.task_counts[s as WorkStatus]}</button>)}</div>
        <div className="space-y-4">{tasks.map(t => <AgentWorkCard key={`${data.area.id}:${t.id}`} task={t} events={data.events.filter(e => e.task_id === t.id)} onSaved={live.refresh} />)}{!tasks.length && <Panel><CheckCircle2 size={26} className="text-jade" aria-hidden="true" /><p className="mt-3">ยังไม่มีงานในสถานะที่เลือก</p><p className="mt-2 text-sm text-ink-soft">กดบันทึกงานใหม่เมื่อต้องติดตามเรื่องในตำบล</p></Panel>}</div>
        <div className="mt-4 flex items-center gap-3"><button className={secondaryButton} disabled={live.loading || page === 0} onClick={() => setPage(v => v - 1)}>ก่อนหน้า</button><span className="text-xs text-ink-soft">หน้า {page + 1} · {taskTotal} งาน</span><button className={secondaryButton} disabled={live.loading || (page + 1) * 100 >= taskTotal} onClick={() => setPage(v => v + 1)}>ถัดไป</button></div>
        <p className="mt-4 text-xs leading-6 text-ink-soft">แสดงหน้าละ 100 รายการ · ประวัติล่าสุด 50 รายการ · การกดงานเสร็จเป็นการปิดเรื่องติดตาม ไม่ยืนยันรับเงินหรือเปลี่ยนสถานะจัดส่ง</p>
      </section><section className="space-y-4"><Panel><h2 className="mb-4 text-lg font-semibold">ออเดอร์ที่ต้องติดตาม</h2>{data.orders.length ? <ol className="space-y-3">{data.orders.map(o => <li key={o.id} className="rounded-xl bg-surface-2 p-3"><Link className="font-semibold text-indigo" href={`/admin/orders${q}`}>#{o.id} · {TYPE_LABEL[o.type as OrderType]}</Link><p className="mt-2 text-sm">{o.type === "food" && o.needs_payment && !o.paid ? "รอตรวจรับเงิน" : o.type === "food" && !o.shop_accepted ? "รอร้านรับออเดอร์" : o.type === "food" && !o.food_ready ? "ร้านกำลังเตรียม / รอยืนยันพร้อมรับ" : STATUS_LABEL[o.status as OrderStatus]}</p><p className="mt-1 text-xs text-ink-soft">{o.driver_assigned ? "มีไรเดอร์รับผิดชอบแล้ว" : "ยังไม่มีไรเดอร์"}</p><button className={`${secondaryButton} mt-3`} disabled={busy || retrySave} onClick={() => { resetForm(); setOrderId(o.id); setTitle(`ติดตามออเดอร์ #${o.id}`); setCategory("orders"); setFormOpen(true); }}>บันทึกติดตามออเดอร์นี้</button></li>)}</ol> : <p className="text-sm text-ink-soft">ไม่มีออเดอร์ที่ยังดำเนินการ</p>}<p className="mt-4 text-xs text-ink-soft">แสดงงานค้างเก่าสุด 20 รายการ</p></Panel><Panel><h2 className="mb-3 text-lg font-semibold">ประสานงานต่อ</h2><p className="text-sm leading-7">สมาชิกที่รออนุมัติ {data.counts.pending_members} คน · เรื่องสื่อสารที่ยังไม่ปิด {data.counts.open_messages} เรื่อง</p><Link className={`${secondaryButton} mt-4 w-full`} href={`/admin/board${q}`}>ประกาศและเรื่องร้องเรียน</Link><Link className={`${secondaryButton} mt-3 w-full`} href={`/t/${encodeURIComponent(data.area.slug)}`}>ดูหน้าประชาสัมพันธ์ตำบล</Link><Link className={`${secondaryButton} mt-3 w-full`} href={`/admin/people${q}`}><Bike size={16} aria-hidden="true" />ตรวจความพร้อมไรเดอร์</Link></Panel></section></div>
    </>}
  </div>;
}

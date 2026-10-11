"use client";
import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, EmptyState, PageHeading } from "@/components/ui";
import { PromptPayQR } from "@/components/PromptPayQR";
import { SavedPaymentQr } from "@/components/PaymentQrCard";
import { PendingSlips } from "@/components/PendingSlips";
import { AdminTambonPicker, tambonName, useAdminTambon } from "@/components/AdminTambonPicker";
import { ROLE_LABEL, dateStr, money, timeStr } from "@/lib/domain";
import type { Tables } from "@/lib/types";
import { useLiveData } from "@/rebuilt/use-live-data";
import { DataState } from "@/rebuilt/primitives";

type Settlement = Tables<"settlements">;
export default function FinanceWorkspace() {
  const { tambons, slug, setSlug, selected } = useAdminTambon();
  const areaId = selected?.id ?? null;
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const loader = useCallback(async () => {
    if (!areaId) return { rows: [], profiles: {} as Record<string, Tables<"profiles">>, now: Date.now() };
    const db = createClient();
    const since = new Date(Date.now() - 30 * 86400000).toISOString();
    const r = await db.from("settlements").select("*").eq("tambon_id", areaId).or(`paid_out_at.is.null,paid_out_at.gte.${since}`).order("due_at");
    if (r.error) throw new Error("โหลดบัญชีไม่ได้");
    const ids = [...new Set((r.data ?? []).map(x => x.payee_profile_id))];
    const p = ids.length ? await db.from("profiles").select("*").in("id", ids) : { data: [], error: null };
    if (p.error) throw new Error("โหลดผู้รับเงินไม่ได้");
    return { rows: r.data ?? [], profiles: Object.fromEntries((p.data ?? []).map(x => [x.id, x])), now: Date.now() };
  }, [areaId]);
  const { data, loading, error, refresh } = useLiveData(loader, "settlements,profiles");
  const rows = error ? [] : data?.rows ?? [];
  const toPay = rows.filter(s => !s.paid_out_at);
  const waiting = rows.filter(s => s.paid_out_at && !s.confirmed_at);
  const done = rows.filter(s => s.confirmed_at);
  function reload() { refresh(); setRevision(v => v + 1); }
  async function sent(s: Settlement) {
    if (!navigator.onLine) { setMessage("ต่ออินเทอร์เน็ตก่อนบันทึกการโอน"); return; }
    setBusy(true); setMessage("");
    const r = await createClient().rpc("mark_payout_sent", { p_settlement_id: s.id });
    setBusy(false); setConfirmId(null);
    setMessage(r.error ? `บันทึกไม่สำเร็จ: ${r.error.message}` : `บันทึกโอน ${money(Number(s.amount))} แล้ว รอผู้รับตรวจบัญชีและยืนยัน`);
    reload();
  }
  return <div><PageHeading title="การเงินตำบล" subtitle="ตรวจเงินเข้า → โอนให้ร้านและไรเดอร์ → ผู้รับยืนยัน" /><AdminTambonPicker tambons={tambons} slug={slug} onChange={v => { setSlug(v); setConfirmId(null); setMessage(""); }} />
    {!selected ? <p className="my-5 text-sm text-ink-soft">เลือกตำบลที่คุณดูแลเพื่อเปิดบัญชีการเงิน</p> : <>
      <Card className="my-4"><h2 className="font-semibold">{tambonName(selected)}</h2><p className="mt-2 text-xs leading-6 text-ink-soft">บัญชีรับเงิน: {selected.settlement_account_name || "ยังไม่ตั้งชื่อบัญชี"} · {selected.settlement_promptpay_id ? "พร้อมเพย์พร้อมใช้งาน" : "ยังไม่ตั้งพร้อมเพย์รับเงิน"}<br />รอบตัดยอด {String(selected.payout_cutoff_time ?? "21:00").slice(0, 5)} น.</p>{selected.intake_blocked && <p className="mt-2 text-sm text-clay">พักรับออเดอร์: {selected.intake_blocked_reason}</p>}<Button variant="ghost" className="mt-3" onClick={reload}>อัปเดตยอดและสลิป</Button></Card>
      {message && <p role="status" className="mb-4 text-sm">{message}</p>}
      <PendingSlips key={`${areaId}:${revision}`} tambonId={areaId} onVerified={refresh} />
      <DataState loading={loading} error={error} retry={reload} />
      {data && !error && <>
      <div className="mb-4 grid grid-cols-2 gap-3"><Card><p className="text-xs text-ink-soft">ต้องโอนออก {toPay.length} รายการ</p><strong className="text-xl">{money(toPay.reduce((sum, s) => sum + Number(s.amount), 0))}</strong></Card><Card><p className="text-xs text-ink-soft">เลยกำหนดโอน</p><strong className="text-xl">{toPay.filter(s => new Date(s.due_at).getTime() < data.now).length} รายการ</strong></Card></div>
      <h2 className="mb-3 font-semibold">ต้องโอนให้ร้านและไรเดอร์</h2>{toPay.length ? toPay.map(s => { const p = data.profiles[s.payee_profile_id]; return <Card key={s.id} className="mb-4"><h3 className="font-semibold">{p?.full_name || "ผู้รับเงิน"} · {s.payee_role === "merchant" ? ROLE_LABEL.merchant : s.payee_role === "driver" ? ROLE_LABEL.driver : s.payee_role}</h3><p className="my-2 text-sm">ออเดอร์ #{s.order_id} · {money(Number(s.amount))}</p><p className="text-xs text-ink-soft">ภายใน {dateStr(s.due_at)} {timeStr(s.due_at)}</p>{p?.payment_qr_path ? <SavedPaymentQr path={p.payment_qr_path} account={p.payment_account_name} bank={p.payment_bank_name} /> : p?.promptpay_id ? <PromptPayQR promptpayId={p.promptpay_id} amount={Number(s.amount)} label={p.full_name || "ผู้รับ"} /> : <p className="my-3 text-sm text-clay">ผู้รับยังไม่บันทึกพร้อมเพย์หรือ QR ติดต่อผู้รับก่อนโอน</p>}
        {confirmId === s.id ? <div className="mt-3 rounded-xl border border-border p-3"><p className="mb-3 text-sm leading-7">ตรวจชื่อผู้รับและโอน {money(Number(s.amount))} จากแอปธนาคารเรียบร้อยแล้วใช่ไหม?</p><Button disabled={busy} onClick={() => sent(s)}>ยืนยันโอนแล้ว</Button><Button variant="ghost" disabled={busy} onClick={() => setConfirmId(null)}>กลับไปตรวจ</Button></div> : <Button className="mt-3" disabled={busy || (!p?.payment_qr_path && !p?.promptpay_id)} onClick={() => setConfirmId(s.id)}>โอนแล้ว</Button>}</Card>; }) : <EmptyState>ไม่มียอดค้างโอน</EmptyState>}
      <h2 className="mb-3 mt-6 font-semibold">โอนแล้ว รอผู้รับยืนยัน ({waiting.length})</h2>{waiting.map(s => <Card className="mb-3" key={s.id}><p className="text-sm">{data.profiles[s.payee_profile_id]?.full_name || "ผู้รับ"} · #{s.order_id} · {money(Number(s.amount))}</p><p className="mt-2 text-xs text-ink-soft">โอนเมื่อ {dateStr(s.paid_out_at!)} {timeStr(s.paid_out_at!)}</p></Card>)}
      <details className="mt-6"><summary className="min-h-11 cursor-pointer font-semibold">ประวัติผู้รับยืนยันแล้ว ({done.length})</summary>{done.map(s => <Card className="mb-3" key={s.id}><p className="text-sm">{data.profiles[s.payee_profile_id]?.full_name || "ผู้รับ"} · #{s.order_id} · {money(Number(s.amount))}</p><p className="mt-2 text-xs">ยืนยันเมื่อ {dateStr(s.confirmed_at!)} {timeStr(s.confirmed_at!)}</p></Card>)}<p className="mt-3 text-xs text-ink-soft">ประวัติย้อนหลัง 30 วัน และรายการค้างทั้งหมด</p></details>
      </>}
    </>}
  </div>;
}

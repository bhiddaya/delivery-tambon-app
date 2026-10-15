"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { money, timeStr } from "@/lib/domain";
import { telHref } from "@/lib/tambon-admin";
import { Panel, primaryButton } from "@/rebuilt/primitives";

type Refund = {
  order_id: number; amount: number | string; payment_method: string | null; reason: string;
  status: "pending" | "done"; created_at: string; refunded_at: string | null; customer: string | null; phone: string | null;
};

/** ออเดอร์อาหารที่จ่ายเงินแล้วแต่ไม่มีไรเดอร์รับใน 15 นาที ระบบยกเลิกให้แล้ว ตัวแทนต้องโอนเงินคืนลูกค้า แล้วกด "โอนคืนแล้ว" */
export default function AgentRefunds({ tambonId }: { tambonId: string }) {
  const [list, setList] = useState<Refund[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const result = await createClient().rpc("agent_refunds", { p_tambon_id: tambonId });
    if (!result.error) setList((result.data as unknown as Refund[]) ?? []);
  }, [tambonId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load once after mount, then poll while the page is visible
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);
  async function markDone(id: number) {
    setBusy(id); setError("");
    const result = await createClient().rpc("agent_refund_done", { p_order_id: id });
    setBusy(null);
    if (result.error) { setError("บันทึกไม่สำเร็จ ลองอีกครั้ง"); return; }
    await load();
  }
  if (!list.length) return null;
  const pending = list.filter(r => r.status === "pending");
  return <Panel className={`mb-5 ${pending.length ? "border-marigold" : ""}`}>
    <h2 className="text-lg font-semibold">{pending.length ? `ต้องคืนเงินลูกค้า · ค้าง ${pending.length} ราย` : "คืนเงินลูกค้าครบแล้ว"}</h2>
    <ul className="mt-3 divide-y divide-border">{list.map(r => <li key={r.order_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0 text-sm leading-7">
        <p className="font-semibold">ออเดอร์ #{r.order_id} · {money(Number(r.amount))}{r.payment_method ? ` (${r.payment_method})` : ""}</p>
        <p className="text-ink-soft">{r.customer || "ลูกค้า"}{telHref(r.phone) ? <> · <a className="text-indigo underline" href={telHref(r.phone)!}>โทร {r.phone}</a></> : null} · {timeStr(r.created_at)}</p>
        <p className="text-xs text-ink-soft">{r.reason}</p>
      </div>
      {r.status === "pending"
        ? <button className={primaryButton} disabled={busy === r.order_id} onClick={() => markDone(r.order_id)}>{busy === r.order_id ? "กำลังบันทึก…" : "โอนคืนแล้ว"}</button>
        : <span className="rounded-full bg-jade-tint px-3 py-1 text-xs text-jade">คืนแล้ว</span>}
    </li>)}</ul>
    {error && <p role="alert" className="mt-3 text-sm text-clay">{error}</p>}
  </Panel>;
}

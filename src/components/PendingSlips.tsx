"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, EmptyState, Input } from "@/components/ui";
import { TYPE_LABEL, customerTotal, dateStr, money, timeStr, type OrderRow } from "@/lib/domain";

/**
 * สลิปรอตรวจ — ตัวแทนตำบลเปิดแอปธนาคารดูว่าเงินเข้าบัญชีตำบลตรงยอดจริงก่อนกดยืนยัน
 * ยืนยันแล้วระบบจึงตั้งยอดที่ต้องโอนต่อให้ร้านและไรเดอร์ (verify_customer_payment)
 * ไม่พบยอด → แจ้งเหตุผล ลูกค้าส่งสลิปใหม่ได้ (reject_customer_payment)
 */
export function PendingSlips({ tambonId, onVerified }: { tambonId: string | null; onVerified: () => void }) {
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [waitingSlip, setWaitingSlip] = useState(0);
  const [urls, setUrls] = useState<Record<number, string>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    let pending = supabase
      .from("orders")
      .select("*")
      .not("slip_submitted_at", "is", null)
      .is("customer_paid_at", null)
      .is("payment_rejected_at", null)
      .order("slip_submitted_at", { ascending: true });
    let waiting = supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "delivered")
      .eq("payment_method", "พร้อมเพย์")
      .is("customer_paid_at", null)
      .is("slip_submitted_at", null);
    if (tambonId) {
      pending = pending.eq("tambon_id", tambonId);
      waiting = waiting.eq("tambon_id", tambonId);
    }
    const [{ data }, { count }] = await Promise.all([pending, waiting]);
    const list = data ?? [];
    setRows(list);
    setWaitingSlip(count ?? 0);
    setLoading(false);

    const paths = list.map((o) => o.customer_slip_url).filter(Boolean) as string[];
    if (paths.length) {
      const { data: signed } = await supabase.storage.from("payment-slips").createSignedUrls(paths, 600);
      const map: Record<number, string> = {};
      list.forEach((o) => {
        const s = (signed ?? []).find((x) => x.path === o.customer_slip_url);
        if (s?.signedUrl) map[o.id] = s.signedUrl;
      });
      setUrls(map);
    }
    const ids = [...new Set(list.map((o) => o.customer_id))];
    if (ids.length) {
      const { data: p } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      const map: Record<string, string> = {};
      (p ?? []).forEach((x) => (map[x.id] = x.full_name ?? ""));
      setNames(map);
    }
  }, [tambonId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
  }, [load]);

  async function verify(o: OrderRow) {
    setBusyId(o.id);
    setMessage(null);
    const { error } = await createClient().rpc("verify_customer_payment", { p_order_id: o.id });
    setBusyId(null);
    setConfirmId(null);
    if (error) {
      setMessage(`ยืนยันไม่สำเร็จ: ${error.message}`);
      return;
    }
    setMessage(`ยืนยันรับเงินออเดอร์ #${o.id} แล้ว · ระบบตั้งยอดโอนต่อให้ร้านและไรเดอร์แล้ว`);
    load();
    onVerified();
  }

  async function reject(o: OrderRow) {
    setBusyId(o.id);
    setMessage(null);
    const { error } = await createClient().rpc("reject_customer_payment", { p_order_id: o.id, p_reason: reason });
    setBusyId(null);
    if (error) {
      setMessage(`บันทึกไม่สำเร็จ: ${error.message}`);
      return;
    }
    setRejectId(null);
    setReason("");
    setMessage(`แจ้งลูกค้าออเดอร์ #${o.id} ว่ายังไม่พบยอดแล้ว`);
    load();
  }

  return (
    <div className="mb-6">
      <h2 className="font-head font-semibold text-sm mb-1">สลิปรอตรวจ ({rows.length})</h2>
      <p className="text-ink-soft text-xs mb-2">
        เปิดแอปธนาคารของบัญชีตำบล ดูว่าเงินเข้าตรงยอดก่อนกดยืนยัน · รอลูกค้าส่งสลิปอีก {waitingSlip} ออเดอร์
      </p>
      {message && <p className="text-sm text-ink mb-2">{message}</p>}
      {loading ? (
        <p className="text-ink-soft text-sm">กำลังโหลด…</p>
      ) : rows.length === 0 ? (
        <EmptyState>ไม่มีสลิปรอตรวจ</EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((o) => {
            const total = customerTotal(o);
            return (
              <Card key={o.id}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div>
                    <div className="font-head font-semibold text-sm">
                      {TYPE_LABEL[o.type]} #{o.id} · {names[o.customer_id] || "ลูกค้า"}
                    </div>
                    <div className="text-ink-soft text-xs">
                      ส่งสลิป {dateStr(o.slip_submitted_at!)} {timeStr(o.slip_submitted_at!)}
                    </div>
                  </div>
                  <div className="font-head font-semibold">{money(total)}</div>
                </div>
                {urls[o.id] ? (
                  <a href={urls[o.id]} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed URL ของ bucket ส่วนตัว หมดอายุ 10 นาที */}
                    <img
                      src={urls[o.id]}
                      alt={`สลิปออเดอร์ #${o.id}`}
                      className="max-h-80 rounded-lg border border-border mx-auto"
                    />
                  </a>
                ) : (
                  <p className="text-ink-soft text-xs">เปิดรูปสลิปไม่ได้ — ลองโหลดหน้าใหม่</p>
                )}

                {confirmId === o.id ? (
                  <div className="rounded-xl border border-indigo p-3 mt-2">
                    <p className="text-sm text-ink mb-2">
                      ยืนยันว่าเงิน {money(total)} เข้าบัญชีตำบลแล้ว (ดูในแอปธนาคารแล้ว)?
                    </p>
                    <div className="flex gap-2">
                      <Button onClick={() => verify(o)} disabled={busyId === o.id}>
                        {busyId === o.id ? "กำลังบันทึก..." : "ยืนยันรับเงิน"}
                      </Button>
                      <Button variant="ghost" onClick={() => setConfirmId(null)} disabled={busyId === o.id}>
                        ยกเลิก
                      </Button>
                    </div>
                  </div>
                ) : rejectId === o.id ? (
                  <div className="rounded-xl border border-border p-3 mt-2">
                    <Input
                      placeholder="เหตุผลที่แจ้งลูกค้า เช่น ยอดไม่ตรง / ยังไม่พบเงินเข้า"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                    <div className="flex gap-2 mt-2">
                      <Button variant="secondary" onClick={() => reject(o)} disabled={busyId === o.id}>
                        แจ้งลูกค้า
                      </Button>
                      <Button variant="ghost" onClick={() => setRejectId(null)} disabled={busyId === o.id}>
                        ยกเลิก
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 mt-2">
                    <Button onClick={() => setConfirmId(o.id)}>เงินเข้าแล้ว</Button>
                    <Button variant="ghost" onClick={() => setRejectId(o.id)}>
                      ไม่พบยอด
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/types";
import { Button } from "@/components/ui";
export default function PartnerOrderActions({ order, onChanged }: { order: Tables<"orders">; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [reject, setReject] = useState(false);
  const [message, setMessage] = useState("");
  if (!["pending", "accepted"].includes(order.status)) return null;
  async function act(action: string) {
    setBusy(true); setMessage("");
    const r = await createClient().rpc("partner_order_action", { p_order_id: order.id, p_action: action, p_action_id: crypto.randomUUID() });
    const v = r.data as { ok?: boolean; text?: string } | null;
    setBusy(false); setReject(false);
    setMessage(r.error || !v?.ok ? v?.text || "บันทึกไม่ได้ งานอาจเปลี่ยนแล้ว กรุณาอัปเดต" : "บันทึกสถานะแล้ว"); onChanged();
  }
  return <div className="mt-4 border-t border-border pt-4"><p className="mb-3 text-xs text-ink-soft">{order.customer_paid_at ? "ตัวแทนยืนยันเงินแล้ว" : "รอตัวแทนตรวจเงิน กรุณาตรวจรายการก่อนเตรียมอาหาร"}</p><div className="flex flex-wrap gap-2">{!order.merchant_accepted_at && <Button disabled={busy} onClick={() => act("accept_shop")}>รับออเดอร์</Button>}{!order.food_ready_at && <Button disabled={busy || !order.customer_paid_at} onClick={() => act("ready")}>อาหารพร้อมรับ</Button>}{!order.customer_paid_at && !order.slip_submitted_at && !order.driver_id && <Button variant="ghost" disabled={busy} onClick={() => setReject(true)}>รับไม่ได้</Button>}</div>{order.food_ready_at && <p className="mt-2 text-sm text-jade">อาหารพร้อมรับแล้ว</p>}{reject && <div className="mt-3"><p className="mb-2 text-sm">ยืนยันว่าร้านรับออเดอร์นี้ไม่ได้และต้องการยกเลิก?</p><Button disabled={busy} onClick={() => act("reject_shop")}>ยืนยันรับไม่ได้</Button><Button variant="ghost" onClick={() => setReject(false)}>กลับ</Button></div>}{message && <p role="status" className="mt-2 text-sm">{message}</p>}</div>;
}

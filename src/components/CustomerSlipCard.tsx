"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PromptPayQR } from "@/components/PromptPayQR";
import { customerTotal, dateStr, money, slipState, timeStr, type OrderRow } from "@/lib/domain";
import type { Tables } from "@/lib/types";

const MAX_BYTES = 5 * 1024 * 1024;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/**
 * ลูกค้าโอนเข้าพร้อมเพย์ของตำบลหลังได้รับของ แล้วแนบสลิป — ตัวแทนตำบลตรวจยอดเข้าบัญชีเอง
 * (D41 ขั้น 2) ระบบไม่ถือว่าจ่ายแล้วจนกว่าตัวแทนกดยืนยัน
 */
export function CustomerSlipCard({
  order,
  tambon,
  onChanged,
}: {
  order: OrderRow;
  tambon: Tables<"tambons"> | undefined;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = slipState(order);
  const total = customerTotal(order);

  if (state === "verified") {
    return (
      <p className="text-jade text-xs mt-2">
        ✓ ตัวแทนตำบลยืนยันรับเงิน {money(total)} แล้ว ({dateStr(order.customer_paid_at!)})
      </p>
    );
  }
  if (!tambon?.settlement_promptpay_id || !(total > 0)) return null;

  async function upload(file: File) {
    setError(null);
    const ext = EXT[file.type];
    if (!ext) {
      setError("รองรับเฉพาะรูป JPG, PNG หรือ WEBP");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("รูปใหญ่เกิน 5 MB — ลองแคปหน้าจอสลิปแทน");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const path = `${order.tambon_id}/${order.id}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("payment-slips")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) {
      setBusy(false);
      setError(`อัปโหลดสลิปไม่สำเร็จ: ${upErr.message}`);
      return;
    }
    const { error: rpcErr } = await supabase.rpc("submit_payment_slip", { p_order_id: order.id, p_slip_path: path });
    setBusy(false);
    if (rpcErr) {
      setError(`ส่งสลิปไม่สำเร็จ: ${rpcErr.message}`);
      return;
    }
    onChanged();
  }

  return (
    <div className="mt-3 pt-3 border-t border-border">
      {state === "submitted" ? (
        <p className="text-sm text-ink">
          ส่งสลิปแล้วเมื่อ {timeStr(order.slip_submitted_at!)} · รอตัวแทนตำบลตรวจยอดเงิน
        </p>
      ) : (
        <>
          {state === "rejected" && (
            <p className="text-clay text-sm mb-2">
              ตัวแทนตำบลยังไม่พบยอดเงิน: {order.payment_reject_reason} — ตรวจการโอนแล้วส่งสลิปใหม่ได้
            </p>
          )}
          <PromptPayQR
            promptpayId={tambon.settlement_promptpay_id}
            amount={total}
            label={`เข้าบัญชีตำบล ${tambon.settlement_account_name ?? ""}`.trim()}
          />
          <label className="block">
            <span className="block text-xs text-ink-soft mb-1">โอนแล้ว แนบรูปสลิป</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) upload(f);
              }}
              className="block w-full text-sm"
            />
          </label>
          {busy && <p className="text-ink-soft text-xs mt-1">กำลังส่งสลิป…</p>}
        </>
      )}
      {error && <p className="text-clay text-sm mt-2">{error}</p>}
    </div>
  );
}

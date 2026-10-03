"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Input } from "@/components/ui";
import type { OrderRow } from "@/lib/domain";
import type { DriverInfo } from "@/lib/tambon-admin";

/**
 * ปุ่มจัดการของตัวแทนตำบล (ระยะ 2) — ทุกปุ่มเรียกฟังก์ชันในฐานข้อมูลที่ตรวจสิทธิ์รายตำบลและบันทึก admin_actions
 * ยืนยันในหน้าเว็บ ไม่ใช้ window.confirm เพราะเบราว์เซอร์ใน LINE บล็อก
 */

function useAction(onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setError(null);
    const { error: e } = await fn();
    setBusy(false);
    if (e) {
      setError(e.message);
      return false;
    }
    onDone();
    return true;
  }
  return { busy, error, run };
}

/** มอบงาน (ออเดอร์รอคนรับ) และยกเลิกพร้อมเหตุผล (ออเดอร์ที่ยังไม่จบและยังไม่ยืนยันรับเงิน) */
export function OrderActions({ order, drivers, onDone }: { order: OrderRow; drivers: DriverInfo[]; onDone: () => void }) {
  const { busy, error, run } = useAction(onDone);
  const [mode, setMode] = useState<"none" | "assign" | "cancel">("none");
  const [driverId, setDriverId] = useState("");
  const [reason, setReason] = useState("");
  const canAssign = order.status === "pending" && !order.driver_id;
  const canCancel = order.status !== "cancelled" && order.status !== "delivered" && !order.customer_paid_at;
  const candidates = drivers.filter((d) => d.profile.approved && !d.profile.suspended_at && d.profile.tambon_id === order.tambon_id);
  if (!canAssign && !canCancel) return null;

  return (
    <div className="mt-2 pt-2 border-t border-border">
      {mode === "none" && (
        <div className="flex gap-2 flex-wrap">
          {canAssign && (
            <Button variant="secondary" onClick={() => setMode("assign")} disabled={candidates.length === 0}>
              {candidates.length ? "มอบงานให้ไรเดอร์" : "ไม่มีไรเดอร์ที่อนุมัติแล้ว"}
            </Button>
          )}
          {canCancel && (
            <Button variant="ghost" onClick={() => setMode("cancel")}>
              ยกเลิกออเดอร์
            </Button>
          )}
        </div>
      )}
      {mode === "assign" && (
        <div className="rounded-xl border border-indigo p-3">
          <select
            value={driverId}
            onChange={(e) => setDriverId(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-ink mb-2"
          >
            <option value="">เลือกไรเดอร์</option>
            {candidates.map((d) => (
              <option key={d.profile.id} value={d.profile.id}>
                {d.profile.full_name} {d.driver?.is_online ? "· ออนไลน์" : "· ออฟไลน์"}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <Button
              disabled={busy || !driverId}
              onClick={async () => {
                if (await run(() => createClient().rpc("admin_assign_order", { p_order_id: order.id, p_driver_id: driverId })))
                  setMode("none");
              }}
            >
              {busy ? "กำลังบันทึก..." : "ยืนยันมอบงาน"}
            </Button>
            <Button variant="ghost" onClick={() => setMode("none")} disabled={busy}>
              ยกเลิก
            </Button>
          </div>
          <p className="text-ink-soft text-[11px] mt-2">โทรบอกไรเดอร์ด้วย ระบบยังไม่ส่ง LINE แจ้งงานที่มอบให้</p>
        </div>
      )}
      {mode === "cancel" && (
        <div className="rounded-xl border border-clay p-3">
          <Input placeholder="เหตุผลที่ยกเลิก (แจ้งลูกค้าแล้ว)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-2 mt-2">
            <Button
              variant="secondary"
              disabled={busy || reason.trim().length < 5}
              onClick={async () => {
                if (await run(() => createClient().rpc("admin_cancel_order", { p_order_id: order.id, p_reason: reason }))) {
                  setMode("none");
                  setReason("");
                }
              }}
            >
              {busy ? "กำลังบันทึก..." : "ยืนยันยกเลิก"}
            </Button>
            <Button variant="ghost" onClick={() => setMode("none")} disabled={busy}>
              ไม่ยกเลิก
            </Button>
          </div>
        </div>
      )}
      {error && <p className="text-clay text-sm mt-2">{error}</p>}
    </div>
  );
}

/** ระงับ/คืนสิทธิ์ร้านหรือไรเดอร์ และเปิด/ปิดร้านชั่วคราว */
export function PersonActions({
  profileId,
  suspended,
  merchant,
  onDone,
}: {
  profileId: string;
  suspended: boolean;
  merchant?: { id: string; is_open: boolean };
  onDone: () => void;
}) {
  const { busy, error, run } = useAction(onDone);
  const [mode, setMode] = useState<"none" | "suspend">("none");
  const [reason, setReason] = useState("");

  return (
    <div className="mt-2">
      {mode === "none" ? (
        <div className="flex gap-2 flex-wrap">
          {merchant && !suspended && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => run(() => createClient().rpc("admin_set_shop_open", { p_merchant_id: merchant.id, p_open: !merchant.is_open }))}
            >
              {merchant.is_open ? "ปิดร้านชั่วคราว" : "เปิดร้าน"}
            </Button>
          )}
          {suspended ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => run(() => createClient().rpc("admin_set_suspended", { p_profile_id: profileId, p_suspend: false, p_reason: "" }))}
            >
              {busy ? "กำลังบันทึก..." : "คืนสิทธิ์"}
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setMode("suspend")} disabled={busy}>
              ระงับ
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-clay p-3">
          <p className="text-xs text-ink mb-2">
            ระงับแล้วจะรับงาน/ขายของไม่ได้ทันที{merchant ? " และร้านจะถูกปิด" : " และถูกตั้งเป็นออฟไลน์"} จนกว่าจะกดคืนสิทธิ์
          </p>
          <Input placeholder="เหตุผลที่ระงับ" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-2 mt-2">
            <Button
              variant="secondary"
              disabled={busy || reason.trim().length < 5}
              onClick={async () => {
                if (await run(() => createClient().rpc("admin_set_suspended", { p_profile_id: profileId, p_suspend: true, p_reason: reason }))) {
                  setMode("none");
                  setReason("");
                }
              }}
            >
              {busy ? "กำลังบันทึก..." : "ยืนยันระงับ"}
            </Button>
            <Button variant="ghost" onClick={() => setMode("none")} disabled={busy}>
              ยกเลิก
            </Button>
          </div>
        </div>
      )}
      {error && <p className="text-clay text-sm mt-2">{error}</p>}
    </div>
  );
}

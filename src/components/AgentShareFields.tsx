"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input } from "@/components/ui";
import type { Tables } from "@/lib/types";

/**
 * ส่วนแบ่งตัวแทนตำบล (D47) — ส่วนกลางกรอกตามข้อตกลงของแต่ละตำบล ค่าเริ่มต้น 0%
 * ตัวแทนเห็นอัตราของตำบลตัวเองแต่แก้ไม่ได้ (ฐานข้อมูลกันด้วย tambons_central_fields_guard)
 * ระยะนี้เก็บอัตราไว้ ยังไม่หักจากยอดโอนให้ร้าน/ไรเดอร์
 */
export function AgentShareFields({
  tambon,
  isSuperadmin,
  onSaved,
}: {
  tambon: Tables<"tambons">;
  isSuperadmin: boolean;
  onSaved: () => void;
}) {
  const [commission, setCommission] = useState(String(tambon.agent_share_commission_pct ?? 0));
  const [delivery, setDelivery] = useState(String(tambon.agent_share_delivery_pct ?? 0));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    const c = Number(commission);
    const d = Number(delivery);
    if (!(c >= 0 && c <= 100) || !(d >= 0 && d <= 100)) {
      setMessage("อัตราต้องอยู่ระหว่าง 0 ถึง 100");
      return;
    }
    setBusy(true);
    setMessage(null);
    const { error } = await createClient().rpc("admin_set_agent_share", {
      p_tambon_id: tambon.id,
      p_commission_pct: c,
      p_delivery_pct: d,
    });
    setBusy(false);
    if (error) {
      setMessage(`บันทึกไม่สำเร็จ: ${error.message}`);
      return;
    }
    setMessage("บันทึกส่วนแบ่งตัวแทนแล้ว");
    onSaved();
  }

  return (
    <div className="rounded-xl border border-border p-3 mb-3">
      <div className="font-head font-semibold text-sm mb-1">ส่วนแบ่งตัวแทนตำบล (ส่วนกลางกำหนด)</div>
      <p className="text-ink-soft text-xs mb-3">
        ตามข้อตกลงของตำบลนี้ · ยังไม่หักจากยอดโอนให้ร้าน/ไรเดอร์อัตโนมัติ
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="% ของค่าคอม">
          <Input
            type="number"
            min={0}
            max={100}
            step="0.5"
            disabled={!isSuperadmin}
            value={commission}
            onChange={(e) => setCommission(e.target.value)}
          />
        </Field>
        <Field label="% ของค่าขนส่ง">
          <Input
            type="number"
            min={0}
            max={100}
            step="0.5"
            disabled={!isSuperadmin}
            value={delivery}
            onChange={(e) => setDelivery(e.target.value)}
          />
        </Field>
      </div>
      {isSuperadmin && (
        <Button variant="ghost" onClick={save} disabled={busy}>
          {busy ? "กำลังบันทึก..." : "บันทึกส่วนแบ่งตัวแทน"}
        </Button>
      )}
      {message && <p className="text-sm text-ink mt-2">{message}</p>}
    </div>
  );
}

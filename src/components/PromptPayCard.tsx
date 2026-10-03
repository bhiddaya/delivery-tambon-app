"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Field, Input } from "@/components/ui";

/**
 * เลขพร้อมเพย์ของร้าน/ไรเดอร์ — ตัวแทนตำบลใช้สร้าง QR โอนเงินให้หลังจบงาน
 * แก้ได้เฉพาะแถวของตัวเอง (RLS profiles_update_scoped)
 */
export function PromptPayCard({ profileId, initial }: { profileId: string; initial: string | null }) {
  const [value, setValue] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    const digits = value.replace(/[\s-]/g, "");
    if (digits && !/^\d{10}$|^\d{13}$/.test(digits)) {
      setMsg("ใส่เบอร์โทร 10 หลัก หรือเลขบัตรประชาชน 13 หลัก");
      return;
    }
    setBusy(true);
    setMsg(null);
    const { data, error } = await createClient()
      .from("profiles")
      .update({ promptpay_id: digits || null })
      .eq("id", profileId)
      .select("id");
    setBusy(false);
    setMsg(error || !data?.length ? `บันทึกไม่สำเร็จ${error ? `: ${error.message}` : ""}` : "บันทึกแล้ว");
  }

  return (
    <Card className="mb-4">
      <div className="font-head font-semibold text-sm mb-1">พร้อมเพย์สำหรับรับเงิน</div>
      <p className="text-ink-soft text-xs mb-3">ตัวแทนตำบลจะโอนค่าสินค้า/ค่าส่งเข้าเลขนี้หลังจบงาน</p>
      <Field label="เบอร์โทรหรือเลขบัตรประชาชนที่ผูกพร้อมเพย์">
        <Input inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} />
      </Field>
      {msg && <p className="text-sm text-ink mb-2">{msg}</p>}
      <Button onClick={save} disabled={busy}>
        {busy ? "กำลังบันทึก..." : "บันทึกพร้อมเพย์"}
      </Button>
    </Card>
  );
}

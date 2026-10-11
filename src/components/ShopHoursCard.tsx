"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DAY_NAMES, defaultHours, validHours, type ShopHours } from "@/lib/shop-hours";
import type { Tables, Json } from "@/lib/types";
import { Button, Card } from "@/components/ui";
export default function ShopHoursCard({ shop, onChanged }: { shop: Tables<"merchants">; onChanged: () => void }) {
  const [enabled, setEnabled] = useState(shop.hours_enabled);
  const [hours, setHours] = useState<ShopHours>(validHours(shop.opening_hours) ? shop.opening_hours : defaultHours());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save() {
    if (!validHours(hours)) { setMessage("ใส่เวลาเปิดและปิดให้ถูกต้อง เวลาเดียวกันใช้ไม่ได้ ให้ปิดวันนั้นแทน"); return; }
    setBusy(true); setMessage("");
    const r = await createClient().from("merchants").update({ hours_enabled: enabled, opening_hours: hours as unknown as Json }).eq("id", shop.id).select("id");
    setBusy(false); setMessage(r.error || r.data?.length !== 1 ? "บันทึกเวลาไม่สำเร็จ กรุณาลองใหม่" : "บันทึกเวลาเปิด–ปิดแล้ว");
    if (!r.error) onChanged();
  }
  return <Card className="mb-5"><details><summary className="min-h-11 cursor-pointer font-semibold">เวลาเปิด–ปิดร้าน {shop.hours_enabled ? "· ใช้ตารางเวลา" : "· เปิด/ปิดด้วยตนเอง"}</summary><label className="my-3 flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />ใช้เวลาเปิด–ปิดอัตโนมัติ (เวลาไทย)</label><p className="mb-3 text-xs leading-6 text-ink-soft">ปุ่มปิดร้านยังพักรับงานได้ทันที เวลาเปิดมากกว่าเวลาปิดหมายถึงปิดในวันถัดไป เช่น 18:00–02:00</p>{hours.map((d, i) => <div key={i} className="mb-2 flex flex-wrap items-center gap-2 text-sm"><label className="flex min-h-11 w-28 items-center gap-2"><input type="checkbox" checked={d.enabled} disabled={!enabled} onChange={e => setHours(v => v.map((x, n) => n === i ? { ...x, enabled: e.target.checked } : x))} />{DAY_NAMES[i]}</label>{(["open", "close"] as const).map(field => <input key={field} aria-label={`${DAY_NAMES[i]} ${field === "open" ? "เปิด" : "ปิด"}`} className="min-h-11 rounded-lg border border-border px-2" type="time" value={d[field]} disabled={!enabled || !d.enabled} onChange={e => setHours(v => v.map((x, n) => n === i ? { ...x, [field]: e.target.value } : x))} />)}</div>)}<Button disabled={busy} onClick={save}>{busy ? "กำลังบันทึก…" : "บันทึกเวลาร้าน"}</Button>{message && <p role="status" className="mt-3 text-sm">{message}</p>}</details></Card>;
}

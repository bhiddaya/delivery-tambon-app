"use client";

import { useState } from "react";
import { AdminTambonPicker, useAdminTambon } from "@/components/AdminTambonPicker";
import { useTambonAdminData } from "@/components/useTambonAdminData";
import { Button, Card, EmptyState, PageHeading } from "@/components/ui";
import { sendDrill, type DrillArgs } from "@/lib/drill";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session-context";
import { realShops } from "@/lib/tambon-admin";

/** เจ้าของส่ง "ออเดอร์ซ้อม" ให้ร้าน/ไรเดอร์/ตัวแทนจริงได้ยินเสียงใน PWA (ไม่นับเป็นออเดอร์จริง ไม่มีเงิน ไม่ส่ง LINE) */
export default function AdminDrillPage() {
  const { tambons, slug, setSlug, selected } = useAdminTambon();
  const data = useTambonAdminData(selected?.id ?? null);
  const isSuper = useSession().profile.role === "superadmin";
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const shops = realShops(data.merchants);

  async function send(key: string, args: DrillArgs) {
    setBusy(key); setMessage("");
    setMessage(await sendDrill(createClient(), args));
    setBusy("");
  }

  if (!isSuper) return <EmptyState>หน้านี้สำหรับส่วนกลางเท่านั้น</EmptyState>;
  return (
    <div>
      <PageHeading title="ออเดอร์ซ้อม" subtitle="ทดสอบเสียงแจ้งเตือนในหน้า PWA" />
      <Card className="mb-3 text-sm leading-7">
        <p>เจ้าของกดแค่ปุ่มด้านล่าง ระบบส่งงานซ้อมถึงร้าน ไรเดอร์ และตัวแทนตำบลให้เอง</p>
        <p className="text-ink-soft">เสียงดังเฉพาะมือถือของคนที่เปิดหน้างานค้างไว้ และเคยกด &quot;แตะเพื่อเปิดเสียง&quot; ในมือถือตัวเองแล้ว 1 ครั้ง (ข้อบังคับของมือถือ ทำแทนไม่ได้)</p>
        <p className="text-ink-soft">ไม่นับเป็นออเดอร์จริง ไม่มีเงิน ไม่ส่ง LINE ถ้าไม่มีไรเดอร์รับ ระบบยกเลิกเองใน 15 นาที</p>
      </Card>
      <AdminTambonPicker tambons={tambons} slug={slug} onChange={setSlug} />
      {message && <p role="status" className="mb-3 text-sm font-semibold">{message}</p>}
      {selected && (
        <Card className="mb-3">
          <p className="mb-2 text-sm font-semibold">ไรเดอร์และตัวแทน ({selected.name})</p>
          <Button disabled={!!busy} onClick={() => send("ride", { p_kind: "ride", p_tambon_id: selected.id })}>{busy === "ride" ? "กำลังส่ง…" : "ส่งงานเรียกรถซ้อม"}</Button>
        </Card>
      )}
      <h2 className="mb-2 text-sm font-semibold">ร้านค้า (ได้ยินพร้อมตัวแทน · ไรเดอร์ได้ยินด้วย)</h2>
      {data.loading ? <p className="text-sm text-ink-soft">กำลังโหลด…</p> : shops.length === 0 ? <EmptyState>ยังไม่มีร้านจริงในตำบลนี้</EmptyState> : (
        <ul className="space-y-2">
          {shops.map(({ merchant }) => (
            <li key={merchant.id}><Card className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm">{merchant.name}{merchant.is_open ? "" : " · ปิดอยู่"}</span>
              <Button variant="accent" disabled={!!busy || !merchant.is_open} onClick={() => send(merchant.id, { p_kind: "food", p_merchant_id: merchant.id })}>{busy === merchant.id ? "กำลังส่ง…" : "ส่งออเดอร์ซ้อมให้ร้านนี้"}</Button>
            </Card></li>
          ))}
        </ul>
      )}
    </div>
  );
}

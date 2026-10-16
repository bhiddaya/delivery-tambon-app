"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminTambonPicker, useAdminTambon } from "@/components/AdminTambonPicker";
import JobSound from "@/components/JobSound";
import { useTambonAdminData } from "@/components/useTambonAdminData";
import { Button, Card, EmptyState, PageHeading } from "@/components/ui";
import { activeDrillIds, loadPushStatus, sendDrill, sendSoundTest, summarizePushStatus, type DrillArgs, type PushStatusRow } from "@/lib/drill";
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
  const [people, setPeople] = useState<PushStatusRow[] | null>(null);
  const refreshPeople = useCallback(async () => { setPeople(await loadPushStatus(createClient())); }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load the notification status once after mount
    if (isSuper) void refreshPeople();
  }, [isSuper, refreshPeople]);
  const groups = people ? summarizePushStatus(people) : [];
  async function broadcast() {
    setBusy("all"); setMessage("");
    setMessage(await sendSoundTest(createClient()));
    setBusy("");
  }
  // เจ้าของได้ยินเสียงบนเครื่องนี้ด้วย: ออเดอร์ซ้อมใหม่ของตำบลที่เลือกโผล่ในรายการ → ดัง (เปิดหน้านี้ค้างไว้และกดเปิดเสียงก่อน)
  const drillIds = data.loading || !selected ? null : activeDrillIds(data.orders);

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
        <p>เจ้าของกดแค่ปุ่มด้านล่าง ระบบส่งงานซ้อมถึงร้าน ไรเดอร์ และตัวแทนตำบลให้เอง · อยากได้ยินเสียงบนมือถือเครื่องนี้ เลือกตำบล แล้วกด &quot;แตะเพื่อเปิดเสียง&quot; ก่อนกดส่ง และเปิดหน้านี้ค้างไว้</p>
        <p className="text-ink-soft">เสียงดังเฉพาะมือถือของคนที่เปิดหน้างานค้างไว้ และเคยกด &quot;แตะเพื่อเปิดเสียง&quot; ในมือถือตัวเองแล้ว 1 ครั้ง (ข้อบังคับของมือถือ ทำแทนไม่ได้)</p>
        <p className="text-ink-soft">ไม่นับเป็นออเดอร์จริง ไม่มีเงิน ไม่ส่ง LINE ถ้าไม่มีไรเดอร์รับ ระบบยกเลิกเองใน 15 นาที</p>
      </Card>
      <Card className="mb-3">
        <p className="mb-1 text-sm font-semibold">ส่งสัญญาณเสียงถึงทุกคน</p>
        <p className="mb-2 text-xs leading-6 text-ink-soft">ส่งถึงมือถือของตัวแทน ไรเดอร์ และร้านค้าที่กดเปิดแจ้งเตือนแล้ว ไม่ต้องเปิดเว็บค้างไว้ ผู้รับไม่ต้องทำอะไร</p>
        {groups.length > 0 && <ul className="mb-3 space-y-1 text-sm">{groups.map(g => <li key={g.group}>{g.title}: เปิดแล้ว {g.enabled} จาก {g.people} คน{g.missing.length > 0 && <span className="block text-xs text-ink-soft">ยังไม่เปิด: {g.missing.join(", ")}</span>}</li>)}</ul>}
        <Button variant="accent" disabled={!!busy} onClick={async () => { await broadcast(); await refreshPeople(); }}>{busy === "all" ? "กำลังส่ง…" : "ส่งสัญญาณเสียงถึงทุกคน"}</Button>
      </Card>
      <AdminTambonPicker tambons={tambons} slug={slug} onChange={setSlug} />
      {message && <p role="status" className="mb-3 text-sm font-semibold">{message}</p>}
      {!selected && <p className="mb-3 text-sm font-semibold text-clay">เลือกตำบลด้านบนก่อน แล้วปุ่มส่งจะขึ้น</p>}
      {selected && <JobSound key={selected.id} kind="agent" scope={`drill:${selected.id}`} ids={drillIds} />}
      {selected && (
        <Card className="mb-3">
          <p className="mb-2 text-sm font-semibold">ส่งให้ไรเดอร์และตัวแทนตำบล ({selected.name})</p>
          <Button disabled={!!busy} onClick={() => send("ride", { p_kind: "ride", p_tambon_id: selected.id })}>{busy === "ride" ? "กำลังส่ง…" : "ส่งงานเรียกรถซ้อม"}</Button>
        </Card>
      )}
      <h2 className="mb-2 text-sm font-semibold">ส่งให้ร้านค้า ตัวแทนตำบล และไรเดอร์ (เลือกร้าน)</h2>
      {data.loading ? <p className="text-sm text-ink-soft">กำลังโหลด…</p> : shops.length === 0 ? <EmptyState>ยังไม่มีร้านจริงในตำบลนี้</EmptyState> : (
        <ul className="space-y-2">
          {shops.map(({ merchant }) => (
            <li key={merchant.id}><Card className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm">{merchant.name}{merchant.is_open ? "" : " · ปิดอยู่"}</span>
              <Button variant="accent" disabled={!!busy || !merchant.is_open} onClick={() => send(merchant.id, { p_kind: "food", p_merchant_id: merchant.id })}>{busy === merchant.id ? "กำลังส่ง…" : "ส่งออเดอร์ซ้อม"}</Button>
            </Card></li>
          ))}
        </ul>
      )}
    </div>
  );
}

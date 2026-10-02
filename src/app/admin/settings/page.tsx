"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Field, Input, PageHeading } from "@/components/ui";
import type { Tables } from "@/lib/types";
import MemberPasswordReset from "@/components/MemberPasswordReset";
import { useSession } from "@/lib/session-context";
import { tambonName } from "@/components/AdminTambonPicker";

export default function AdminSettingsPage() {
  const { profile } = useSession();
  const isSuperadmin = profile.role === "superadmin";
  const [tambons, setTambons] = useState<Tables<"tambons">[]>([]);
  const [busy, setBusy] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  // ยืนยันในหน้าเว็บ (เบราว์เซอร์ใน LINE บล็อก window.confirm)
  const [confirmToggle, setConfirmToggle] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});

  async function load() {
    const supabase = createClient();
    const { data } = await supabase.from("tambons").select("*").order("created_at");
    setTambons(data ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
  }, []);

  function updateField(id: string, field: "name" | "district" | "province", value: string) {
    setTambons((prev) => prev.map((t) => (t.id === id ? { ...t, [field]: value } : t)));
  }

  async function saveTambon(t: Tables<"tambons">) {
    setBusy(true);
    setSavedId(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("tambons")
      .update({ name: t.name, district: t.district, province: t.province })
      .eq("id", t.id);
    setBusy(false);
    if (error) {
      setMessages((m) => ({ ...m, [t.id]: `บันทึกไม่สำเร็จ: ${error.message}` }));
      return;
    }
    setMessages((m) => ({ ...m, [t.id]: "" }));
    setSavedId(t.id);
    setTimeout(() => setSavedId(null), 2000);
  }

  // เปิด/ปิดบริการ — ลูกค้าในตำบลสั่งได้ทันทีเมื่อเปิด จึงให้เฉพาะส่วนกลาง (superadmin) และต้องยืนยัน
  async function toggleActive(t: Tables<"tambons">) {
    setBusy(true);
    const supabase = createClient();
    const next = !t.is_active;
    const { data, error } = await supabase
      .from("tambons")
      .update({ is_active: next, ...(next && !t.opened_at ? { opened_at: new Date().toISOString() } : {}) })
      .eq("id", t.id)
      .select("id");
    setBusy(false);
    setConfirmToggle(null);
    if (error || !data || data.length === 0) {
      setMessages((m) => ({ ...m, [t.id]: `เปลี่ยนสถานะไม่สำเร็จ${error ? `: ${error.message}` : " (ไม่มีสิทธิ์)"}` }));
      return;
    }
    setMessages((m) => ({ ...m, [t.id]: next ? "เปิดบริการแล้ว" : "ปิดบริการแล้ว" }));
    load();
  }

  return (
    <div>
      <PageHeading title="ตั้งค่าตำบล" subtitle="ชื่อตำบลที่แสดงในระบบ ลิงก์ของแต่ละตำบล และการเปิดบริการ" />

      <MemberPasswordReset />

      <h2 className="font-head font-semibold text-sm mb-2 mt-6">ข้อมูลตำบล ({tambons.length})</h2>
      {tambons.map((t) => (
        <Card key={t.id} className="mb-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="font-head font-semibold text-sm">{tambonName(t)}</div>
            <span
              className={`text-[11px] font-head font-semibold rounded-full px-2.5 py-1 ${
                t.is_active ? "bg-indigo text-white" : "bg-surface-2 text-ink-soft"
              }`}
            >
              {t.is_active ? "เปิดบริการ" : "ยังไม่เปิดบริการ"}
            </span>
          </div>

          {t.slug && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm mb-3">
              <Link href={`/admin?t=${t.slug}`} className="text-indigo font-semibold">
                ดูงานตำบลนี้
              </Link>
              <Link href={`/admin/approvals?t=${t.slug}`} className="text-indigo font-semibold">
                อนุมัติของตำบลนี้
              </Link>
              <Link href={`/t/${t.slug}`} className="text-indigo font-semibold">
                หน้าสาธารณะ /t/{t.slug}
              </Link>
            </div>
          )}

          <Field label="ชื่อตำบล (ภาษาไทย)">
            <Input value={t.name} onChange={(e) => updateField(t.id, "name", e.target.value)} />
          </Field>
          <Field label="อำเภอ / เขต">
            <Input value={t.district ?? ""} onChange={(e) => updateField(t.id, "district", e.target.value)} />
          </Field>
          <Field label="จังหวัด">
            <Input value={t.province ?? ""} onChange={(e) => updateField(t.id, "province", e.target.value)} />
          </Field>

          {messages[t.id] && <p className="text-sm text-ink mb-2">{messages[t.id]}</p>}

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => saveTambon(t)} disabled={busy}>
              {savedId === t.id ? "บันทึกแล้ว ✓" : "บันทึกชื่อ"}
            </Button>
            {isSuperadmin && confirmToggle !== t.id && (
              <Button variant="ghost" onClick={() => setConfirmToggle(t.id)} disabled={busy}>
                {t.is_active ? "ปิดบริการ" : "เปิดบริการ"}
              </Button>
            )}
          </div>

          {isSuperadmin && confirmToggle === t.id && (
            <div className="rounded-xl border border-indigo p-3 mt-3">
              <p className="text-sm text-ink mb-2">
                {t.is_active
                  ? `ปิดบริการ${tambonName(t)}? ลูกค้าจะสั่งใหม่ไม่ได้ (ออเดอร์ที่ค้างอยู่ไม่ถูกยกเลิก)`
                  : `เปิดบริการ${tambonName(t)}? ลูกค้าในตำบลจะเริ่มเห็นร้านและสั่งได้ทันที — ควรมีร้านที่ผูก LINE และไรเดอร์ที่อนุมัติแล้วก่อน`}
              </p>
              <div className="flex gap-2">
                <Button onClick={() => toggleActive(t)} disabled={busy}>
                  {busy ? "กำลังบันทึก..." : t.is_active ? "ยืนยันปิดบริการ" : "ยืนยันเปิดบริการ"}
                </Button>
                <Button variant="ghost" onClick={() => setConfirmToggle(null)} disabled={busy}>
                  ยกเลิก
                </Button>
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Field, Input, PageHeading } from "@/components/ui";
import type { Tables } from "@/lib/types";
import MemberPasswordReset from "@/components/MemberPasswordReset";
import { useSession } from "@/lib/session-context";
import { tambonName, useManagedTambons } from "@/components/AdminTambonPicker";
import { TambonShareCard } from "@/components/TambonShareCard";
import { TambonAgentsCard } from "@/components/TambonAgentsCard";
import { AgentShareFields } from "@/components/AgentShareFields";

export default function AdminSettingsPage() {
  const { profile } = useSession();
  const isSuperadmin = profile.role === "superadmin";
  const [tambons, setTambons] = useState<Tables<"tambons">[]>([]);
  const [busy, setBusy] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  // ยืนยันในหน้าเว็บ (เบราว์เซอร์ใน LINE บล็อก window.confirm)
  const [confirmToggle, setConfirmToggle] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});

  // ตัวแทนเห็นเฉพาะตำบลที่ดูแล (ตาราง tambons อ่านได้ทุกคน และทั้งประเทศมีกว่า 7,000 ตำบล)
  const managed = useManagedTambons();
  const managedIds = managed?.map((t) => t.id).join(",") ?? null;

  async function load() {
    if (managedIds === null) return;
    const supabase = createClient();
    let query = supabase.from("tambons").select("*").order("created_at");
    if (!isSuperadmin) query = query.in("id", managedIds ? managedIds.split(",") : ["00000000-0000-0000-0000-000000000000"]);
    const { data } = await query;
    // ?t=<slug> (มาจากหน้า บัญชีตำบล) — แสดงตำบลนั้นก่อน จะได้ไม่กรอกผิดตำบล
    const focus = new URLSearchParams(window.location.search).get("t");
    const list = data ?? [];
    setTambons(focus ? [...list.filter((t) => t.slug === focus), ...list.filter((t) => t.slug !== focus)] : list);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load once the managed tambons are known
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load reads managedIds/isSuperadmin only
  }, [managedIds, isSuperadmin]);

  function updateField(
    id: string,
    field:
      | "name"
      | "district"
      | "province"
      | "settlement_promptpay_id"
      | "settlement_account_name"
      | "delivery_fee_base"
      | "delivery_fee_per_km"
      | "payout_cutoff_time"
      | "deposit_amount",
    value: string | number | null
  ) {
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

  // การเงินตำบล — ตัวแทนตำบลตั้งเอง (RLS tambons_write_scoped: เฉพาะตัวแทนของตำบลนั้นหรือส่วนกลาง)
  // เงินค้ำประกันให้ส่วนกลางตั้ง เพราะเป็นเพดานยอดค้างโอนก่อนระบบหยุดรับออเดอร์
  async function saveFinance(t: Tables<"tambons">) {
    const pp = (t.settlement_promptpay_id ?? "").replace(/[\s-]/g, "");
    if (pp && !/^\d{10}$|^\d{13}$|^\d{15}$/.test(pp)) {
      setMessages((m) => ({ ...m, [t.id]: "เลขพร้อมเพย์ต้องเป็นเบอร์โทร 10 หลัก หรือเลขบัตร/นิติบุคคล 13 หลัก" }));
      return;
    }
    const base = t.delivery_fee_base === null ? null : Number(t.delivery_fee_base);
    const perKm = t.delivery_fee_per_km === null ? null : Number(t.delivery_fee_per_km);
    if ((base !== null && !(base >= 0)) || (perKm !== null && !(perKm >= 0))) {
      setMessages((m) => ({ ...m, [t.id]: "ค่าส่งต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป" }));
      return;
    }
    setBusy(true);
    setSavedId(null);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("tambons")
      .update({
        settlement_promptpay_id: pp || null,
        settlement_account_name: t.settlement_account_name?.trim() || null,
        delivery_fee_base: base,
        delivery_fee_per_km: perKm,
        payout_cutoff_time: t.payout_cutoff_time || "21:00",
        ...(isSuperadmin ? { deposit_amount: Number(t.deposit_amount ?? 0) } : {}),
      })
      .eq("id", t.id)
      .select("id");
    setBusy(false);
    if (error || !data || data.length === 0) {
      setMessages((m) => ({ ...m, [t.id]: `บันทึกการเงินไม่สำเร็จ${error ? `: ${error.message}` : " (ไม่ใช่ตัวแทนของตำบลนี้)"}` }));
      return;
    }
    setMessages((m) => ({ ...m, [t.id]: "บันทึกการเงินตำบลแล้ว" }));
    load();
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
            <div className="font-head font-semibold text-base">{tambonName(t)}</div>
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

          {t.slug && <TambonShareCard name={t.name} slug={t.slug} active={t.is_active} />}

          {isSuperadmin && <TambonAgentsCard tambonId={t.id} tambonLabel={tambonName(t)} />}

          <Field label="ชื่อตำบล (ภาษาไทย)">
            <Input value={t.name} onChange={(e) => updateField(t.id, "name", e.target.value)} />
          </Field>
          <Field label="อำเภอ / เขต">
            <Input value={t.district ?? ""} onChange={(e) => updateField(t.id, "district", e.target.value)} />
          </Field>
          <Field label="จังหวัด">
            <Input value={t.province ?? ""} onChange={(e) => updateField(t.id, "province", e.target.value)} />
          </Field>

          <div className="rounded-xl border border-border p-3 mb-3">
            <div className="font-head font-semibold text-sm mb-1">การเงินของ{tambonName(t)} (ตัวแทนตำบลตั้งเอง)</div>
            <p className="text-ink-soft text-xs mb-3">
              ลูกค้าโอนเข้าพร้อมเพย์ของตำบล แล้วตัวแทนโอนต่อให้ร้านและไรเดอร์ในหน้า{" "}
              <Link href={t.slug ? `/admin/accounts?t=${t.slug}` : "/admin/accounts"} className="text-indigo font-semibold">
                บัญชีตำบล
              </Link>
            </p>
            <Field label="พร้อมเพย์รับเงินของตำบล (เบอร์โทร/เลขบัตร)">
              <Input
                inputMode="numeric"
                value={t.settlement_promptpay_id ?? ""}
                onChange={(e) => updateField(t.id, "settlement_promptpay_id", e.target.value)}
              />
            </Field>
            <Field label="ชื่อบัญชี (แสดงให้ลูกค้าเห็นก่อนโอน)">
              <Input
                value={t.settlement_account_name ?? ""}
                onChange={(e) => updateField(t.id, "settlement_account_name", e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="ค่าส่งเริ่มต้น (บาท)">
                <Input
                  type="number"
                  min={0}
                  value={t.delivery_fee_base ?? ""}
                  onChange={(e) => updateField(t.id, "delivery_fee_base", e.target.value === "" ? null : Number(e.target.value))}
                />
              </Field>
              <Field label="เพิ่มกิโลละ (บาท)">
                <Input
                  type="number"
                  min={0}
                  value={t.delivery_fee_per_km ?? ""}
                  onChange={(e) => updateField(t.id, "delivery_fee_per_km", e.target.value === "" ? null : Number(e.target.value))}
                />
              </Field>
              <Field label="โอนให้ร้าน/ไรเดอร์ก่อนเวลา">
                <Input
                  type="time"
                  value={String(t.payout_cutoff_time ?? "21:00").slice(0, 5)}
                  onChange={(e) => updateField(t.id, "payout_cutoff_time", e.target.value)}
                />
              </Field>
              <Field label="เงินค้ำประกัน (ส่วนกลางตั้ง)">
                <Input
                  type="number"
                  min={0}
                  disabled={!isSuperadmin}
                  value={t.deposit_amount ?? 0}
                  onChange={(e) => updateField(t.id, "deposit_amount", Number(e.target.value))}
                />
              </Field>
            </div>
            <Button variant="ghost" onClick={() => saveFinance(t)} disabled={busy}>
              บันทึกการเงินตำบล
            </Button>
          </div>

          <AgentShareFields
            key={`${t.id}-${t.agent_share_commission_pct}-${t.agent_share_delivery_pct}`}
            tambon={t}
            isSuperadmin={isSuperadmin}
            onSaved={load}
          />

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

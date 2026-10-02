"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, EmptyState, Input } from "@/components/ui";
import type { Tables } from "@/lib/types";

type Application = Tables<"tambon_applications">;

const SITE = "delivery-tambon-app-v3.vercel.app";
const hasThai = (text: string) => /[฀-๿]/.test(text);

/**
 * ใบขอเปิดตำบลใหม่ (จากหน้า /apply-tambon)
 *
 * RLS: อ่าน/อนุมัติได้เฉพาะส่วนกลาง (is_superadmin) — ตัวแทนตำบลจะเห็นรายการว่างเสมอ
 * จึงซ่อนทั้งส่วนเมื่อไม่มีใบให้เห็น
 * อนุมัติด้วย approve_tambon_application() ซึ่งสร้างตำบลแบบ "ยังไม่เปิดบริการ" (is_active=false)
 */
export function TambonApplications() {
  const [apps, setApps] = useState<Application[]>([]);
  const [slugs, setSlugs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from("tambon_applications")
      .select("*")
      .eq("status", "pending")
      .order("created_at");
    setApps(data ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
  }, []);

  async function approve(app: Application) {
    const slug = (slugs[app.id] ?? "").trim().toLowerCase();
    if (!/^[a-z0-9-]{2,40}$/.test(slug)) {
      setMessage(
        "ชื่อลิงก์หน้าเว็บต้องเป็นภาษาอังกฤษตัวเล็ก ตัวเลข หรือขีด (-) ยาว 2–40 ตัว เช่น khlong-kum — ชื่อตำบลภาษาไทยไม่ต้องแก้"
      );
      return;
    }
    if (!window.confirm(`อนุมัติเปิดตำบล${app.tambon_name}?\nตำบลจะถูกสร้างแบบ "ยังไม่เปิดบริการ"`)) return;
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("approve_tambon_application", { app_id: app.id, tambon_slug: slug });
    setBusy(false);
    setMessage(error ? `อนุมัติไม่สำเร็จ: ${error.message}` : `อนุมัติแล้ว: ตำบล${app.tambon_name} (ยังไม่เปิดบริการ)`);
    load();
  }

  async function reject(app: Application) {
    const note = window.prompt(`เหตุผลที่ไม่อนุมัติตำบล${app.tambon_name}`);
    if (note === null) return;
    setBusy(true);
    setMessage(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("tambon_applications")
      .update({ status: "rejected", review_note: note || null, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() })
      .eq("id", app.id)
      .eq("status", "pending");
    setBusy(false);
    setMessage(error ? `บันทึกไม่สำเร็จ: ${error.message}` : `ไม่อนุมัติตำบล${app.tambon_name}`);
    load();
  }

  if (apps.length === 0 && !message) return null;

  return (
    <section className="mt-6">
      <h2 className="font-head font-semibold text-sm mb-1">ใบขอเปิดตำบลใหม่ ({apps.length})</h2>
      <p className="text-ink-soft text-xs mb-2">
        ขั้นตอน: ตั้งชื่อลิงก์ภาษาอังกฤษ → กด “อนุมัติ” → กด “ตกลง” ในกล่องยืนยัน. ตำบลที่อนุมัติจะยังไม่เปิดบริการจนกว่าจะเปิดเอง
      </p>
      {message && <p className="text-sm text-ink mb-2">{message}</p>}
      {apps.length === 0 ? (
        <EmptyState>ไม่มีใบขอเปิดตำบลที่รอพิจารณา</EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {apps.map((app) => (
            <Card key={app.id}>
              <div className="font-head font-semibold text-sm">
                ตำบล{app.tambon_name} อ.{app.district} จ.{app.province}
              </div>
              <div className="text-ink-soft text-xs mb-2">
                ผู้ยื่น: {app.applicant_name} · {app.applicant_phone}
                {app.applicant_line ? ` · LINE ${app.applicant_line}` : ""} · ร้าน {app.merchant_count ?? "-"} · ไรเดอร์{" "}
                {app.driver_count ?? "-"}
              </div>
              {!hasThai(app.tambon_name) && (
                <p className="text-clay text-xs mb-2">
                  ชื่อตำบลในใบนี้ไม่ใช่ภาษาไทย — ลูกค้าจะเห็นชื่อนี้ ถ้าต้องการชื่อไทย ให้กด “ไม่อนุมัติ” แล้วให้ยื่นใหม่
                  หรือแก้ชื่อที่หน้าตั้งค่าหลังอนุมัติ
                </p>
              )}
              <label className="block text-xs text-ink mb-1">
                ชื่อลิงก์หน้าเว็บตำบล <span className="text-ink-soft">(ภาษาอังกฤษตัวเล็ก ใช้ทำที่อยู่เว็บเท่านั้น)</span>
              </label>
              <Input
                placeholder="เช่น khlong-kum"
                value={slugs[app.id] ?? ""}
                onChange={(e) => setSlugs((s) => ({ ...s, [app.id]: e.target.value }))}
              />
              <p className="text-ink-soft text-xs mt-1 mb-2">
                หน้าเว็บตำบลจะเป็น {SITE}/t/{(slugs[app.id] ?? "").trim().toLowerCase() || "…"} · ชื่อที่ลูกค้าเห็นยังเป็น
                “ตำบล{app.tambon_name}”
              </p>
              <div className="flex gap-2">
                <Button onClick={() => approve(app)} disabled={busy}>
                  อนุมัติ
                </Button>
                <Button variant="ghost" onClick={() => reject(app)} disabled={busy}>
                  ไม่อนุมัติ
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

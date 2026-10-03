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
 *
 * ยืนยันในหน้าเว็บเอง ไม่ใช้ window.confirm/prompt: เบราว์เซอร์ในแอป LINE บล็อกกล่องเหล่านี้
 * ทำให้กดปุ่มแล้วเหมือนไม่มีอะไรเกิดขึ้น
 */
export function TambonApplications() {
  const [apps, setApps] = useState<Application[]>([]);
  const [slugs, setSlugs] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<{ id: string; kind: "approve" | "reject" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);
  // ตั้งผู้สมัครเป็นตัวแทนตำบลพร้อมอนุมัติ (ค่าเริ่มต้น: ตั้ง ถ้าผู้สมัครมีบัญชีในระบบ)
  const [makeAgent, setMakeAgent] = useState<Record<string, boolean>>({});

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

  const slugOf = (app: Application) => (slugs[app.id] ?? "").trim().toLowerCase();
  const say = (id: string, text: string) => setMessages((m) => ({ ...m, [id]: text }));

  function askApprove(app: Application) {
    if (!/^[a-z0-9-]{2,40}$/.test(slugOf(app))) {
      say(app.id, "ชื่อลิงก์ต้องเป็นภาษาอังกฤษตัวเล็ก ตัวเลข หรือขีด (-) ยาว 2–40 ตัว เช่น khlong-kum");
      return;
    }
    say(app.id, "");
    setPending({ id: app.id, kind: "approve" });
  }

  async function approve(app: Application) {
    setBusy(true);
    const supabase = createClient();
    const asAgent = Boolean(app.applicant_profile_id) && (makeAgent[app.id] ?? true);
    const { error } = await supabase.rpc("approve_tambon_application", {
      app_id: app.id,
      tambon_slug: slugOf(app),
      p_make_applicant_admin: asAgent,
    });
    setBusy(false);
    setPending(null);
    if (error) {
      say(app.id, `อนุมัติไม่สำเร็จ: ${error.message}`);
      return;
    }
    setDone(
      `อนุมัติแล้ว: ตำบล${app.tambon_name} (ยังไม่เปิดบริการ) · หน้าเว็บ ${SITE}/t/${slugOf(app)}` +
        (asAgent ? ` · ตั้ง ${app.applicant_name} เป็นตัวแทนตำบลแล้ว` : "")
    );
    load();
  }

  async function reject(app: Application) {
    const note = (notes[app.id] ?? "").trim();
    if (note.length < 3) {
      say(app.id, "กรุณาใส่เหตุผลที่ไม่อนุมัติ");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("tambon_applications")
      .update({ status: "rejected", review_note: note, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() })
      .eq("id", app.id)
      .eq("status", "pending");
    setBusy(false);
    setPending(null);
    if (error) {
      say(app.id, `บันทึกไม่สำเร็จ: ${error.message}`);
      return;
    }
    setDone(`ไม่อนุมัติตำบล${app.tambon_name} แล้ว`);
    load();
  }

  if (apps.length === 0 && !done) return null;

  return (
    <section className="mt-6">
      <h2 className="font-head font-semibold text-sm mb-1">ใบขอเปิดตำบลใหม่ ({apps.length})</h2>
      <p className="text-ink-soft text-xs mb-2">
        ขั้นตอน: ตั้งชื่อลิงก์ภาษาอังกฤษ → กด “อนุมัติ” → กด “ยืนยันอนุมัติ”. ตำบลที่อนุมัติจะยังไม่เปิดบริการจนกว่าจะเปิดเอง
      </p>
      {done && <p className="text-sm text-indigo font-semibold mb-2">{done}</p>}
      {apps.length === 0 ? (
        <EmptyState>ไม่มีใบขอเปิดตำบลที่รอพิจารณา</EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {apps.map((app) => {
            const confirming = pending?.id === app.id ? pending.kind : null;
            return (
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
                  onChange={(e) => {
                    setSlugs((s) => ({ ...s, [app.id]: e.target.value }));
                    if (confirming === "approve") setPending(null);
                  }}
                />
                <p className="text-ink-soft text-xs mt-1 mb-2">
                  หน้าเว็บตำบลจะเป็น {SITE}/t/{slugOf(app) || "…"} · ชื่อที่ลูกค้าเห็นยังเป็น “ตำบล{app.tambon_name}”
                </p>

                {messages[app.id] && <p className="text-clay text-sm mb-2">{messages[app.id]}</p>}

                {confirming === "approve" ? (
                  <div className="rounded-xl border border-indigo p-3 mb-1">
                    <p className="text-sm text-ink mb-2">
                      ยืนยันอนุมัติเปิด <b>ตำบล{app.tambon_name}</b> ที่อยู่ {SITE}/t/{slugOf(app)} ?
                      <br />
                      <span className="text-ink-soft text-xs">ตำบลจะถูกสร้างแบบ “ยังไม่เปิดบริการ”</span>
                    </p>
                    {app.applicant_profile_id ? (
                      <label className="flex items-center gap-2 text-sm text-ink mb-2">
                        <input
                          type="checkbox"
                          checked={makeAgent[app.id] ?? true}
                          onChange={(e) => setMakeAgent((m) => ({ ...m, [app.id]: e.target.checked }))}
                        />
                        ตั้ง {app.applicant_name} เป็นตัวแทนตำบลนี้ด้วย
                      </label>
                    ) : (
                      <p className="text-ink-soft text-xs mb-2">
                        ผู้สมัครยังไม่มีบัญชีในระบบ — แต่งตั้งตัวแทนภายหลังได้ที่หน้า ตั้งค่า ของตำบลนี้
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Button onClick={() => approve(app)} disabled={busy}>
                        {busy ? "กำลังอนุมัติ..." : "ยืนยันอนุมัติ"}
                      </Button>
                      <Button variant="ghost" onClick={() => setPending(null)} disabled={busy}>
                        ยกเลิก
                      </Button>
                    </div>
                  </div>
                ) : confirming === "reject" ? (
                  <div className="rounded-xl border border-border p-3 mb-1">
                    <label className="block text-xs text-ink mb-1">เหตุผลที่ไม่อนุมัติ (ผู้ยื่นจะเห็น)</label>
                    <Input
                      value={notes[app.id] ?? ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [app.id]: e.target.value }))}
                      placeholder="เช่น ชื่อตำบลไม่ถูกต้อง กรุณายื่นใหม่"
                    />
                    <div className="flex gap-2 mt-2">
                      <Button variant="accent" onClick={() => reject(app)} disabled={busy}>
                        {busy ? "กำลังบันทึก..." : "ยืนยันไม่อนุมัติ"}
                      </Button>
                      <Button variant="ghost" onClick={() => setPending(null)} disabled={busy}>
                        ยกเลิก
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button onClick={() => askApprove(app)} disabled={busy}>
                      อนุมัติ
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        say(app.id, "");
                        setPending({ id: app.id, kind: "reject" });
                      }}
                      disabled={busy}
                    >
                      ไม่อนุมัติ
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}

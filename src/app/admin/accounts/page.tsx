"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, EmptyState, PageHeading } from "@/components/ui";
import { PromptPayQR } from "@/components/PromptPayQR";
import { PendingSlips } from "@/components/PendingSlips";
import { AdminTambonPicker, tambonName, useAdminTambon } from "@/components/AdminTambonPicker";
import { dateStr, money, timeStr } from "@/lib/domain";
import type { Tables } from "@/lib/types";

type Settlement = Tables<"settlements">;
type Profile = Tables<"profiles">;

const ROLE_LABEL: Record<string, string> = { merchant: "ร้านค้า", driver: "ไรเดอร์" };

/**
 * บัญชีตำบล — หลังบ้านของตัวแทนตำบล
 *
 * ลูกค้าโอนเข้าบัญชีพร้อมเพย์ของตำบลแล้วส่งสลิป ตัวแทนตรวจยอดเข้าบัญชีจริงแล้วกด "เงินเข้าแล้ว"
 * ระบบจึงตั้งยอดที่ต้องจ่ายต่อ (settlements): ร้านได้ค่าสินค้า ไรเดอร์ได้ค่าส่ง ตัวแทนโอนให้ด้วย QR ของผู้รับในหน้านี้ แล้วกด "โอนแล้ว"
 * ผู้รับกดยืนยันว่าได้เงินในหน้ารายรับของตัวเอง ถ้าเลยกำหนดโอน ระบบหยุดรับออเดอร์ใหม่ของตำบลเอง
 */
export default function AdminAccountsPage() {
  const { tambons, slug, setSlug, selected } = useAdminTambon();
  const [rows, setRows] = useState<Settlement[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // เวลาอ้างอิงสำหรับ "เลยกำหนด" อัปเดตทุกครั้งที่โหลดข้อมูล (ห้ามเรียก Date.now() ระหว่าง render)
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    const supabase = createClient();
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const { data } = await supabase
      .from("settlements")
      .select("*")
      .or(`paid_out_at.is.null,paid_out_at.gte.${since.toISOString()}`)
      .order("due_at", { ascending: true });
    const list = data ?? [];
    setNow(Date.now());
    setRows(list);
    const ids = [...new Set(list.map((s) => s.payee_profile_id))];
    if (ids.length) {
      const { data: p } = await supabase.from("profiles").select("*").in("id", ids);
      const map: Record<string, Profile> = {};
      (p ?? []).forEach((x) => (map[x.id] = x));
      setProfiles(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
  }, [load]);

  const inTambon = useMemo(
    () => rows.filter((s) => !selected || s.tambon_id === selected.id),
    [rows, selected]
  );
  const toPay = inTambon.filter((s) => !s.paid_out_at);
  const waitConfirm = inTambon.filter((s) => s.paid_out_at && !s.confirmed_at);
  const confirmed = inTambon.filter((s) => s.paid_out_at && s.confirmed_at);
  const owed = toPay.reduce((sum, s) => sum + Number(s.amount), 0);
  const overdue = toPay.filter((s) => new Date(s.due_at).getTime() < now);

  async function markSent(s: Settlement) {
    setBusy(true);
    setMessage(null);
    const { error } = await createClient().rpc("mark_payout_sent", { p_settlement_id: s.id });
    setBusy(false);
    setConfirmId(null);
    if (error) {
      setMessage(`บันทึกไม่สำเร็จ: ${error.message}`);
      return;
    }
    setMessage(`บันทึกแล้ว: โอน ${money(Number(s.amount))} ให้${profiles[s.payee_profile_id]?.full_name ?? "ผู้รับ"}`);
    load();
  }

  return (
    <div>
      <PageHeading
        title="บัญชีตำบล"
        subtitle="ยอดที่ต้องโอนให้ร้านและไรเดอร์หลังจบงาน · สแกน QR ของผู้รับแล้วกด โอนแล้ว"
      />
      <AdminTambonPicker tambons={tambons} slug={slug} onChange={setSlug} />

      {!selected && tambons.length > 1 && (
        <p className="text-ink-soft text-sm mb-4">เลือกตำบลด้านบนเพื่อดูบัญชีรับเงินและตั้งค่าการเงินของตำบลนั้น</p>
      )}

      {selected && (
        <Card className="mb-4">
          <div className="font-head font-semibold text-sm mb-1">กำลังดู: {tambonName(selected)}</div>
          <p className="text-ink-soft text-xs">
            บัญชีรับเงินของตำบล:{" "}
            {selected.settlement_promptpay_id
              ? `พร้อมเพย์ ${selected.settlement_account_name ?? ""}`
              : "ยังไม่ได้ตั้ง — ลูกค้าโอนเข้าตำบลไม่ได้จนกว่าจะตั้ง"}{" "}
            · ตัดยอดโอนออก {String(selected.payout_cutoff_time ?? "21:00").slice(0, 5)} น.
            · เงินค้ำประกัน {money(Number(selected.deposit_amount ?? 0))}
            · ส่วนแบ่งตัวแทน ค่าคอม {Number(selected.agent_share_commission_pct ?? 0)}% ค่าขนส่ง{" "}
            {Number(selected.agent_share_delivery_pct ?? 0)}% (ส่วนกลางกำหนด ยังไม่หักอัตโนมัติ)
          </p>
          {selected.intake_blocked && (
            <p className="text-sm text-ink mt-2">⛔ หยุดรับออเดอร์ใหม่อยู่: {selected.intake_blocked_reason}</p>
          )}
          <Link
            href={selected.slug ? `/admin/settings?t=${selected.slug}` : "/admin/settings"}
            className="text-indigo font-semibold text-sm"
          >
            ตั้งค่าการเงินของ{tambonName(selected)}
          </Link>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-2 mb-4">
        <Card>
          <div className="text-ink-soft text-xs">ต้องโอนออก</div>
          <div className="font-head font-semibold text-lg">{money(owed)}</div>
          <div className="text-ink-soft text-xs">{toPay.length} รายการ</div>
        </Card>
        <Card>
          <div className="text-ink-soft text-xs">เลยกำหนดโอน</div>
          <div className="font-head font-semibold text-lg">{overdue.length}</div>
          <div className="text-ink-soft text-xs">ถ้ามี ระบบหยุดรับออเดอร์ใหม่</div>
        </Card>
      </div>

      {message && <p className="text-sm text-ink mb-3">{message}</p>}

      <PendingSlips tambonId={selected?.id ?? null} onVerified={load} />

      <h2 className="font-head font-semibold text-sm mb-2">ต้องโอนให้ ({toPay.length})</h2>
      {loading ? (
        <p className="text-ink-soft text-sm">กำลังโหลด…</p>
      ) : toPay.length === 0 ? (
        <EmptyState>ไม่มียอดค้างโอน</EmptyState>
      ) : (
        <div className="flex flex-col gap-3 mb-6">
          {toPay.map((s) => {
            const p = profiles[s.payee_profile_id];
            const late = new Date(s.due_at).getTime() < now;
            return (
              <Card key={s.id}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-head font-semibold text-sm">
                      {p?.full_name ?? "ไม่ทราบชื่อ"} · {ROLE_LABEL[s.payee_role] ?? s.payee_role}
                    </div>
                    <div className="text-ink-soft text-xs">
                      ออเดอร์ #{s.order_id} · โอนภายใน {dateStr(s.due_at)} {timeStr(s.due_at)}
                      {late ? " · เลยกำหนดแล้ว" : ""}
                    </div>
                  </div>
                  <div className="font-head font-semibold">{money(Number(s.amount))}</div>
                </div>
                {p?.promptpay_id ? (
                  <PromptPayQR promptpayId={p.promptpay_id} amount={Number(s.amount)} label={`ให้${p.full_name ?? "ผู้รับ"}`} />
                ) : (
                  <p className="text-ink-soft text-xs mt-2">ผู้รับยังไม่ได้ใส่เลขพร้อมเพย์ในหน้าบัญชี — ติดต่อให้ใส่ก่อนโอน</p>
                )}
                {confirmId === s.id ? (
                  <div className="rounded-xl border border-indigo p-3 mt-2">
                    <p className="text-sm text-ink mb-2">
                      ยืนยันว่าโอน {money(Number(s.amount))} ให้{p?.full_name ?? "ผู้รับ"} แล้ว?
                    </p>
                    <div className="flex gap-2">
                      <Button onClick={() => markSent(s)} disabled={busy}>
                        {busy ? "กำลังบันทึก..." : "ยืนยันโอนแล้ว"}
                      </Button>
                      <Button variant="ghost" onClick={() => setConfirmId(null)} disabled={busy}>
                        ยกเลิก
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button className="mt-2" onClick={() => setConfirmId(s.id)}>
                    โอนแล้ว
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <h2 className="font-head font-semibold text-sm mb-2">โอนแล้ว รอผู้รับยืนยัน ({waitConfirm.length})</h2>
      {waitConfirm.length === 0 ? (
        <EmptyState>ไม่มีรายการรอยืนยัน</EmptyState>
      ) : (
        <div className="flex flex-col gap-2 mb-6">
          {waitConfirm.map((s) => (
            <Card key={s.id} className="flex items-center justify-between">
              <div className="text-sm">
                {profiles[s.payee_profile_id]?.full_name ?? "-"} · #{s.order_id}
                <div className="text-ink-soft text-xs">โอนเมื่อ {dateStr(s.paid_out_at!)} {timeStr(s.paid_out_at!)}</div>
              </div>
              <div className="font-head font-semibold">{money(Number(s.amount))}</div>
            </Card>
          ))}
        </div>
      )}

      <h2 className="font-head font-semibold text-sm mb-2">ผู้รับยืนยันแล้ว 30 วัน ({confirmed.length})</h2>
      {confirmed.length === 0 ? (
        <EmptyState>ยังไม่มี</EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {confirmed.map((s) => (
            <Card key={s.id} className="flex items-center justify-between">
              <div className="text-sm">
                {profiles[s.payee_profile_id]?.full_name ?? "-"} · #{s.order_id}
                <div className="text-ink-soft text-xs">ยืนยันเมื่อ {dateStr(s.confirmed_at!)}</div>
              </div>
              <div className="font-head font-semibold">{money(Number(s.amount))}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

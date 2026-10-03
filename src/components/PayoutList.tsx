"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button, Card } from "@/components/ui";
import { dateStr, money, timeStr } from "@/lib/domain";
import type { Tables } from "@/lib/types";

type Settlement = Tables<"settlements">;

/**
 * เงินที่ตัวแทนตำบลต้องโอนให้ฉัน (ร้านหรือไรเดอร์) — ตั้งยอดเมื่อลูกค้าโอนเข้าตำบลแล้ว
 * เมื่อตัวแทนกด "โอนแล้ว" ผู้รับตรวจบัญชีแล้วกด "ได้รับเงินแล้ว" (confirm_payout_received)
 */
export function PayoutList({ profileId, promptpayId }: { profileId: string; promptpayId: string | null }) {
  const [rows, setRows] = useState<Settlement[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await createClient()
      .from("settlements")
      .select("*")
      .eq("payee_profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(30);
    setRows(data ?? []);
  }, [profileId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
  }, [load]);

  async function confirm(id: number) {
    setBusyId(id);
    setError(null);
    const { error: e } = await createClient().rpc("confirm_payout_received", { p_settlement_id: id });
    setBusyId(null);
    if (e) {
      setError(`ยืนยันไม่สำเร็จ: ${e.message}`);
      return;
    }
    load();
  }

  const waiting = rows.filter((s) => !s.paid_out_at).reduce((sum, s) => sum + Number(s.amount), 0);

  return (
    <Card className="mb-4">
      <div className="font-head font-semibold text-sm mb-1">เงินโอนจากตัวแทนตำบล</div>
      <p className="text-ink-soft text-xs mb-2">
        ลูกค้าโอนเข้าตำบลแล้ว ตัวแทนตำบลจะโอนต่อเข้าพร้อมเพย์ของท่าน · รอโอน {money(waiting)}
      </p>
      {!promptpayId && (
        <p className="text-sm text-ink mb-2">
          ยังไม่ได้ใส่เลขพร้อมเพย์ — ใส่ที่{" "}
          <Link href="/account" className="text-indigo font-semibold">
            หน้าบัญชี
          </Link>{" "}
          เพื่อรับเงิน
        </p>
      )}
      {error && <p className="text-sm text-ink mb-2">{error}</p>}
      {rows.length === 0 ? (
        <p className="text-ink-soft text-xs">ยังไม่มีรายการ</p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {rows.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 py-2">
              <div className="text-sm">
                ออเดอร์ #{s.order_id} · {money(Number(s.amount))}
                <div className="text-ink-soft text-xs">
                  {s.confirmed_at
                    ? `ได้รับแล้ว ${dateStr(s.confirmed_at)}`
                    : s.paid_out_at
                    ? `ตัวแทนโอนแล้ว ${dateStr(s.paid_out_at)} ${timeStr(s.paid_out_at)} — ตรวจบัญชีแล้วกดยืนยัน`
                    : `รอตัวแทนโอน ภายใน ${dateStr(s.due_at)} ${timeStr(s.due_at)}`}
                </div>
              </div>
              {s.paid_out_at && !s.confirmed_at && (
                <Button onClick={() => confirm(s.id)} disabled={busyId === s.id}>
                  {busyId === s.id ? "กำลังบันทึก..." : "ได้รับเงินแล้ว"}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

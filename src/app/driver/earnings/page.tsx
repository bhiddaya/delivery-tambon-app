"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session-context";
import { Card, EmptyState, PageHeading } from "@/components/ui";
import { TYPE_LABEL, VEHICLE_LABEL, dateStr, money, type OrderRow } from "@/lib/domain";
import {
  PERIOD_LABEL,
  inPeriod,
  summariseProvider,
  type Period,
} from "@/lib/earnings";
import type { Tables } from "@/lib/types";

const PERIODS: Period[] = ["today", "7d", "30d", "all"];

/**
 * รายรับของผู้ให้บริการ — ใช้ร่วมกันทั้งไรเดอร์ ผู้ขับรถ และผู้ให้บริการเกษตร
 * เพราะทุกกลุ่มคือ role `driver` ต่างกันแค่ประเภทยานพาหนะที่ลงทะเบียนไว้
 */
export default function DriverEarningsPage() {
  const { profile } = useSession();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [driver, setDriver] = useState<Tables<"drivers"> | null>(null);
  const [period, setPeriod] = useState<Period>("7d");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const [{ data: o }, { data: d }] = await Promise.all([
        supabase
          .from("orders")
          .select("*")
          .eq("driver_id", profile.id)
          .order("created_at", { ascending: false }),
        supabase.from("drivers").select("*").eq("profile_id", profile.id).maybeSingle(),
      ]);
      if (cancelled) return;
      setOrders(o ?? []);
      setDriver(d ?? null);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [profile.id]);

  const scoped = useMemo(() => orders.filter((o) => inPeriod(o, period)), [orders, period]);
  const sum = useMemo(() => summariseProvider(scoped), [scoped]);
  const recent = scoped.filter((o) => o.status === "delivered").slice(0, 20);

  return (
    <div>
      <PageHeading
        title="รายรับของฉัน"
        subtitle={driver ? VEHICLE_LABEL[driver.vehicle_type] : undefined}
      />

      <div className="flex gap-1.5 mb-4">
        {PERIODS.map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`flex-1 text-xs font-head font-semibold rounded-full px-2 py-1.5 border ${
              period === p ? "bg-indigo text-white border-indigo" : "border-border text-ink-soft"
            }`}
          >
            {PERIOD_LABEL[p]}
          </button>
        ))}
      </div>

      <Card className="mb-3">
        <div className="text-ink-soft text-xs font-head font-semibold mb-1">รายรับของฉัน</div>
        <div className="font-head text-3xl font-bold tabular-nums text-indigo">
          {money(sum.net)}
        </div>
        <p className="text-ink-soft text-xs mt-1">
          จาก {sum.jobs} งานที่ส่งสำเร็จ · ลูกค้าจ่ายรวม {money(sum.gross)}
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <Card>
          <div className="text-ink-soft text-xs font-head font-semibold mb-1">งานที่สำเร็จ</div>
          <div className="font-head text-2xl font-bold tabular-nums">{sum.jobs}</div>
        </Card>
        <Card>
          <div className="text-ink-soft text-xs font-head font-semibold mb-1">ค่าบริการระบบ</div>
          <div className="font-head text-2xl font-bold tabular-nums">
            {sum.platform.toLocaleString("th-TH")}
          </div>
        </Card>
      </div>

      {sum.byType.length > 0 && (
        <>
          <h2 className="font-head font-semibold text-sm mb-2">แยกตามประเภทงาน</h2>
          <Card className="mb-5 !p-0">
            {sum.byType.map((row, i) => (
              <div
                key={row.type}
                className={`flex items-center justify-between px-4 py-3 ${
                  i > 0 ? "border-t border-border" : ""
                }`}
              >
                <div>
                  <div className="font-head font-semibold text-sm">{TYPE_LABEL[row.type]}</div>
                  <div className="text-ink-soft text-xs">{row.jobs} งาน</div>
                </div>
                <div className="font-head font-semibold tabular-nums">{money(row.net)}</div>
              </div>
            ))}
          </Card>
        </>
      )}

      <h2 className="font-head font-semibold text-sm mb-2">งานล่าสุด</h2>
      {loading ? (
        <p className="text-ink-soft text-sm">กำลังโหลด...</p>
      ) : recent.length === 0 ? (
        <EmptyState>ยังไม่มีงานที่ส่งสำเร็จในช่วงนี้</EmptyState>
      ) : (
        <Card className="!p-0">
          {recent.map((o, i) => (
            <div
              key={o.id}
              className={`flex items-center justify-between px-4 py-3 ${
                i > 0 ? "border-t border-border" : ""
              }`}
            >
              <div className="min-w-0">
                <div className="font-head font-semibold text-sm truncate">
                  {TYPE_LABEL[o.type]} · #{o.id}
                </div>
                <div className="text-ink-soft text-xs">{dateStr(o.created_at)}</div>
              </div>
              <div className="font-head font-semibold tabular-nums text-sm">
                {money(Math.round(Number(o.price)))}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session-context";
import { Card, EmptyState, PageHeading, StatusChip } from "@/components/ui";
import { PromptPayQR } from "@/components/PromptPayQR";
import {
  STATUS_FLOW,
  STATUS_LABEL,
  TYPE_LABEL,
  VEHICLE_LABEL,
  money,
  timeStr,
  type OrderRow,
} from "@/lib/domain";
import type { Tables } from "@/lib/types";

type DriverInfo = { profile: Tables<"profiles">; driver: Tables<"drivers"> };
type MerchantInfo = { merchant: Tables<"merchants">; profile: Tables<"profiles"> };

export default function CustomerOrdersPage() {
  const { profile } = useSession();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [drivers, setDrivers] = useState<Record<string, DriverInfo>>({});
  const [merchants, setMerchants] = useState<Record<string, MerchantInfo>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      const { data: o } = await supabase
        .from("orders")
        .select("*")
        .eq("customer_id", profile.id)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      setOrders(o ?? []);
      setLoading(false);

      const driverIds = Array.from(new Set((o ?? []).map((x) => x.driver_id).filter(Boolean))) as string[];
      if (driverIds.length) {
        const [{ data: profiles }, { data: driverRows }] = await Promise.all([
          supabase.from("profiles").select("*").in("id", driverIds),
          supabase.from("drivers").select("*").in("profile_id", driverIds),
        ]);
        const map: Record<string, DriverInfo> = {};
        (profiles ?? []).forEach((p) => {
          const d = (driverRows ?? []).find((x) => x.profile_id === p.id);
          if (d) map[p.id] = { profile: p, driver: d };
        });
        if (!cancelled) setDrivers(map);
      }

      const merchantIds = Array.from(new Set((o ?? []).map((x) => x.merchant_id).filter(Boolean))) as string[];
      if (merchantIds.length) {
        const { data: merchantRows } = await supabase.from("merchants").select("*").in("id", merchantIds);
        const profileIds = Array.from(new Set((merchantRows ?? []).map((m) => m.profile_id)));
        const { data: merchantProfiles } = profileIds.length
          ? await supabase.from("profiles").select("*").in("id", profileIds)
          : { data: [] as Tables<"profiles">[] };
        const map: Record<string, MerchantInfo> = {};
        (merchantRows ?? []).forEach((m) => {
          const p = (merchantProfiles ?? []).find((x) => x.id === m.profile_id);
          if (p) map[m.id] = { merchant: m, profile: p };
        });
        if (!cancelled) setMerchants(map);
      }
    }
    load();

    const channel = supabase
      .channel("customer-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `customer_id=eq.${profile.id}` },
        load
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [profile.id]);

  const active = orders.filter((o) => o.status !== "delivered" && o.status !== "cancelled");
  const done = orders.filter((o) => o.status === "delivered" || o.status === "cancelled");

  if (loading) return <p className="text-ink-soft text-sm">กำลังโหลด...</p>;

  return (
    <div>
      <PageHeading title="ออเดอร์ของฉัน" />

      {active.length === 0 && done.length === 0 && <EmptyState>ยังไม่มีออเดอร์</EmptyState>}

      {active.length > 0 && (
        <div className="flex flex-col gap-3 mb-8">
          {active.map((o) => {
            const idx = STATUS_FLOW.indexOf(o.status);
            const drv = o.driver_id ? drivers[o.driver_id] : undefined;
            return (
              <Card key={o.id}>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-head font-semibold text-sm">
                    {TYPE_LABEL[o.type]} #{o.id}
                  </span>
                  <StatusChip status={o.status} />
                </div>
                <div className="flex gap-1">
                  {STATUS_FLOW.map((s, i) => (
                    <div key={s} className="flex-1 text-center">
                      <div
                        className={`w-5 h-5 mx-auto rounded-full text-[10px] font-bold flex items-center justify-center mb-1 ${
                          i < idx
                            ? "bg-jade text-white"
                            : i === idx
                            ? "bg-indigo text-white"
                            : "bg-surface-2 text-ink-soft border border-border"
                        }`}
                      >
                        {i < idx ? "✓" : i + 1}
                      </div>
                      <div className="text-[10px] text-ink-soft leading-tight">{STATUS_LABEL[s]}</div>
                    </div>
                  ))}
                </div>
                <p className="text-ink-soft text-xs mt-3">
                  จุดรับ: {o.pickup || "-"}
                  <br />
                  จุดส่ง: {o.dropoff || "-"}
                </p>
                {drv ? (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                    <div className="w-9 h-9 rounded-lg bg-indigo-tint text-indigo flex items-center justify-center">
                      🛵
                    </div>
                    <div>
                      <div className="font-head font-semibold text-xs">{drv.profile.full_name}</div>
                      <div className="text-ink-soft text-[11px]">
                        {VEHICLE_LABEL[drv.driver.vehicle_type]} · ★ {drv.profile.rating}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-ink-soft text-xs mt-3">กำลังหาคนขับในตำบลให้คุณ…</p>
                )}

                {o.payment_method === "พร้อมเพย์" && (
                  <div className="mt-1 pt-1 border-t border-border divide-y divide-border">
                    {o.merchant_id && Number(o.items_subtotal) > 0 && (
                      <PromptPayQR
                        promptpayId={merchants[o.merchant_id]?.profile.promptpay_id}
                        amount={Number(o.items_subtotal)}
                        label={`ให้ร้าน ${merchants[o.merchant_id]?.merchant.name ?? ""}`}
                      />
                    )}
                    {drv && (
                      <PromptPayQR
                        promptpayId={drv.profile.promptpay_id}
                        amount={o.type === "ride" ? Number(o.price) : Number(o.delivery_fee)}
                        label={o.type === "ride" ? "ค่าเรียกรถให้ไรเดอร์" : "ค่าส่งให้ไรเดอร์"}
                      />
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {done.length > 0 && (
        <>
          <h2 className="font-head font-semibold text-sm mb-2">ประวัติ</h2>
          <div className="flex flex-col gap-2">
            {done.map((o) => (
              <Card key={o.id} className="flex items-center justify-between">
                <div>
                  <div className="font-head font-semibold text-sm">
                    {TYPE_LABEL[o.type]} #{o.id}
                  </div>
                  <div className="text-ink-soft text-xs">
                    {timeStr(o.created_at)} · {money(Number(o.price))}
                  </div>
                </div>
                <StatusChip status={o.status} />
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

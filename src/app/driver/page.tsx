"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session-context";
import { Button, Card, EmptyState } from "@/components/ui";
import { DRIVER_ACTION_LABEL, STATUS_FLOW, TYPE_LABEL, VEHICLE_LABEL, econ, mapsLink, money } from "@/lib/domain";
import type { OrderRow } from "@/lib/domain";
import type { Tables } from "@/lib/types";

export default function DriverHomePage() {
  const { profile } = useSession();
  const [driver, setDriver] = useState<Tables<"drivers"> | null>(null);
  const [pending, setPending] = useState<OrderRow[]>([]);
  const [active, setActive] = useState<OrderRow | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      const [{ data: d }, { data: myActive }, { data: pendingOrders }] = await Promise.all([
        supabase.from("drivers").select("*").eq("profile_id", profile.id).maybeSingle(),
        supabase
          .from("orders")
          .select("*")
          .eq("driver_id", profile.id)
          .in("status", ["accepted", "in_progress"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("orders")
          .select("*")
          .eq("tambon_id", profile.tambon_id ?? "")
          .eq("status", "pending")
          .order("created_at"),
      ]);
      if (cancelled) return;
      setDriver(d ?? null);
      setActive(myActive ?? null);
      setPending(pendingOrders ?? []);
    }
    load();

    const channel = supabase
      .channel("driver-home")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "drivers", filter: `profile_id=eq.${profile.id}` },
        load
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [profile.id, profile.tambon_id]);

  if (!profile.approved) {
    return (
      <Card>
        <p className="font-head font-semibold mb-1">รอการอนุมัติจากแอดมิน</p>
        <p className="text-ink-soft text-sm">
          บัญชีไรเดอร์ของคุณอยู่ระหว่างรอแอดมินตรวจสอบ เมื่ออนุมัติแล้วจะรับงานได้ทันที
        </p>
      </Card>
    );
  }

  async function toggleOnline() {
    if (!driver) return;
    setBusy(true);
    const supabase = createClient();
    await supabase.from("drivers").update({ is_online: !driver.is_online }).eq("profile_id", profile.id);
    setBusy(false);
  }

  async function acceptOrder(orderId: number) {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("orders")
      .update({ driver_id: profile.id, status: "accepted" })
      .eq("id", orderId)
      .eq("status", "pending")
      .is("driver_id", null);
    setBusy(false);
    if (error) alert("รับงานไม่สำเร็จ (อาจมีคนรับไปก่อนแล้ว): " + error.message);
  }

  async function advanceOrder(order: OrderRow) {
    const idx = STATUS_FLOW.indexOf(order.status);
    const next = STATUS_FLOW[idx + 1];
    if (!next) return;
    setBusy(true);
    const supabase = createClient();
    await supabase.from("orders").update({ status: next }).eq("id", order.id);
    if (next === "delivered" && driver) {
      const earn = econ(order).driverEarn;
      await supabase
        .from("drivers")
        .update({ today_jobs: driver.today_jobs + 1, today_earn: Number(driver.today_earn) + earn })
        .eq("profile_id", profile.id);
    }
    setBusy(false);
  }

  return (
    <div>
      <Card className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-indigo-tint text-indigo flex items-center justify-center">🛵</div>
          <div>
            <div className="font-head font-semibold text-sm">{profile.full_name}</div>
            <div className="text-ink-soft text-xs">
              {driver ? VEHICLE_LABEL[driver.vehicle_type] : ""} · ★ {profile.rating}
            </div>
          </div>
        </div>
        <Button
          variant={driver?.is_online ? "primary" : "secondary"}
          onClick={toggleOnline}
          disabled={busy || !driver}
        >
          <span className={`w-2 h-2 rounded-full ${driver?.is_online ? "bg-jade" : "bg-white/50"}`} />
          {driver?.is_online ? "ออนไลน์" : "ออฟไลน์"}
        </Button>
      </Card>

      <Card className="flex items-center justify-between mb-6 bg-indigo-tint border-transparent">
        <span className="font-head text-sm">รายได้วันนี้</span>
        <b className="font-head text-lg">
          {money(Number(driver?.today_earn ?? 0))} · {driver?.today_jobs ?? 0} งาน
        </b>
      </Card>

      {active && (
        <>
          <h2 className="font-head font-semibold text-sm mb-2">งานที่กำลังทำ</h2>
          <Card className="mb-6 border-indigo">
            <div className="flex items-center justify-between mb-2">
              <span className="font-head font-semibold text-sm">
                {TYPE_LABEL[active.type]} #{active.id}
              </span>
            </div>
            <p className="text-ink-soft text-xs mb-3">
              รับที่: {active.pickup || "-"}
              <br />
              ส่งที่: {active.dropoff || "-"}
              {active.note && (
                <>
                  <br />
                  หมายเหตุ: {active.note}
                </>
              )}
            </p>
            <div className="flex gap-2 mb-2">
              {mapsLink(active.pickup) && (
                <a
                  href={mapsLink(active.pickup)!}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-indigo underline"
                >
                  เปิดแผนที่จุดรับ
                </a>
              )}
              {mapsLink(active.dropoff) && (
                <a
                  href={mapsLink(active.dropoff)!}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-indigo underline"
                >
                  เปิดแผนที่จุดส่ง
                </a>
              )}
            </div>
            <Button variant="accent" className="w-full" onClick={() => advanceOrder(active)} disabled={busy}>
              {DRIVER_ACTION_LABEL[active.status] ?? "อัปเดตสถานะ"}
            </Button>
          </Card>
        </>
      )}

      <h2 className="font-head font-semibold text-sm mb-2">งานที่รอรับในตำบล</h2>
      {!driver?.is_online ? (
        <p className="text-ink-soft text-sm">เปิดสถานะออนไลน์เพื่อดูงานที่รอรับ</p>
      ) : pending.length === 0 ? (
        <EmptyState>ยังไม่มีงานรอรับตอนนี้</EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {pending.map((o) => (
            <Card key={o.id}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-head font-semibold text-sm">
                  {TYPE_LABEL[o.type]} #{o.id}
                </span>
                <b className="text-jade font-head">+{money(econ(o).driverEarn)}</b>
              </div>
              <p className="text-ink-soft text-xs mb-3">
                รับที่: {o.pickup || "-"}
                <br />
                ส่งที่: {o.dropoff || "-"}
              </p>
              <Button className="w-full" onClick={() => acceptOrder(o.id)} disabled={busy || !!active}>
                {active ? "มีงานอยู่ระหว่างทำ" : "รับงานนี้"}
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

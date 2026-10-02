"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, PageHeading, StatusChip } from "@/components/ui";
import { TYPE_LABEL, econ, money, timeStr, type OrderRow, type OrderStatus } from "@/lib/domain";
import type { Tables } from "@/lib/types";
import { AdminTambonPicker, tambonName, useAdminTambon } from "@/components/AdminTambonPicker";

const FILTERS: { key: OrderStatus | "all"; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "pending", label: "รอคนขับ" },
  { key: "accepted", label: "รับงานแล้ว" },
  { key: "in_progress", label: "กำลังดำเนินการ" },
  { key: "delivered", label: "สำเร็จ" },
];

export default function AdminDashboardPage() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [drivers, setDrivers] = useState<Tables<"drivers">[]>([]);
  const [merchants, setMerchants] = useState<Tables<"merchants">[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Tables<"profiles">>>({});
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const { tambons, slug, setSlug, selected } = useAdminTambon();

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      const [{ data: o }, { data: d }, { data: m }, { data: p }] = await Promise.all([
        supabase.from("orders").select("*").order("created_at", { ascending: false }),
        supabase.from("drivers").select("*"),
        supabase.from("merchants").select("*"),
        supabase.from("profiles").select("*"),
      ]);
      if (cancelled) return;
      setOrders(o ?? []);
      setDrivers(d ?? []);
      setMerchants(m ?? []);
      const map: Record<string, Tables<"profiles">> = {};
      (p ?? []).forEach((x) => (map[x.id] = x));
      setProfiles(map);
    }
    load();

    const channel = supabase
      .channel("admin-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "merchants" }, load)
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  // กรองตามตำบลที่เลือก (ไม่เลือก = ทุกตำบลที่บัญชีนี้เห็นตาม RLS)
  const inTambon = (tambonId: string | null | undefined) => !selected || tambonId === selected.id;
  const tOrders = orders.filter((o) => inTambon(o.tambon_id));
  const tDrivers = drivers.filter((d) => inTambon(profiles[d.profile_id]?.tambon_id));
  const tMerchants = merchants.filter((m) => inTambon(m.tambon_id));

  const onlineDrivers = tDrivers.filter((d) => d.is_online).length;
  const openMerchants = tMerchants.filter((m) => m.is_open).length;
  const revenue = tOrders
    .filter((o) => o.status === "delivered")
    .reduce((s, o) => s + econ(o).platform, 0);
  const filtered = filter === "all" ? tOrders : tOrders.filter((o) => o.status === filter);
  const subtitle = selected
    ? `${tambonName(selected)}${selected.is_active ? "" : " · ยังไม่เปิดบริการ"}`
    : "ทุกตำบล";

  return (
    <div>
      <PageHeading title="แดชบอร์ด" subtitle={subtitle} />
      <AdminTambonPicker tambons={tambons} slug={slug} onChange={setSlug} />

      <div className="grid grid-cols-2 gap-3 mb-6">
        <Card>
          <div className="text-ink-soft text-xs font-head font-semibold mb-1">ออเดอร์ทั้งหมด</div>
          <div className="font-head text-2xl font-bold tabular-nums">{tOrders.length}</div>
        </Card>
        <Card>
          <div className="text-ink-soft text-xs font-head font-semibold mb-1">ไรเดอร์ออนไลน์</div>
          <div className="font-head text-2xl font-bold tabular-nums">
            {onlineDrivers}/{tDrivers.length}
          </div>
        </Card>
        <Card>
          <div className="text-ink-soft text-xs font-head font-semibold mb-1">ร้านค้าเปิดขาย</div>
          <div className="font-head text-2xl font-bold tabular-nums">
            {openMerchants}/{tMerchants.length}
          </div>
        </Card>
        <Card>
          <div className="text-ink-soft text-xs font-head font-semibold mb-1">รายได้แพลตฟอร์ม</div>
          <div className="font-head text-2xl font-bold tabular-nums">{revenue.toLocaleString("th-TH")}</div>
        </Card>
      </div>

      <div className="flex gap-1.5 flex-wrap mb-3">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`text-xs font-head font-semibold rounded-full px-3 py-1.5 border ${
              filter === f.key ? "bg-indigo text-white border-indigo" : "border-border text-ink-soft"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Card className="!p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-ink-soft text-[11px] uppercase font-head">
              <th className="px-4 py-2">#</th>
              <th className="px-4 py-2">ประเภท</th>
              <th className="px-4 py-2">ลูกค้า</th>
              <th className="px-4 py-2">คนขับ</th>
              <th className="px-4 py-2">สถานะ</th>
              <th className="px-4 py-2">ยอด</th>
              <th className="px-4 py-2">เวลา</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.id} className="border-t border-border">
                <td className="px-4 py-2.5">#{o.id}</td>
                <td className="px-4 py-2.5">{TYPE_LABEL[o.type]}</td>
                <td className="px-4 py-2.5">{profiles[o.customer_id]?.full_name ?? "-"}</td>
                <td className="px-4 py-2.5">{o.driver_id ? profiles[o.driver_id]?.full_name ?? "-" : "—"}</td>
                <td className="px-4 py-2.5">
                  <StatusChip status={o.status} />
                </td>
                <td className="px-4 py-2.5 tabular-nums">{money(Number(o.price))}</td>
                <td className="px-4 py-2.5">{timeStr(o.created_at)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-ink-soft">
                  ไม่มีออเดอร์ในหมวดนี้
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

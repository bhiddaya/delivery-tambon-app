"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session-context";
import { Card, EmptyState, PageHeading, StatusChip } from "@/components/ui";
import { TYPE_LABEL, type OrderRow } from "@/lib/domain";
import type { Tables } from "@/lib/types";

export default function CustomerHomePage() {
  const { profile } = useSession();
  const [merchants, setMerchants] = useState<Tables<"merchants">[]>([]);
  const [activeOrders, setActiveOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      const [{ data: m }, { data: o }] = await Promise.all([
        supabase
          .from("merchants")
          .select("*")
          .eq("tambon_id", profile.tambon_id ?? "")
          .eq("is_open", true)
          .order("created_at"),
        supabase
          .from("orders")
          .select("*")
          .eq("customer_id", profile.id)
          .in("status", ["pending", "accepted", "in_progress"])
          .order("created_at", { ascending: false }),
      ]);
      if (cancelled) return;
      setMerchants(m ?? []);
      setActiveOrders(o ?? []);
      setLoading(false);
    }
    load();

    const channel = supabase
      .channel("customer-home")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "merchants" }, load)
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [profile.id, profile.tambon_id]);

  return (
    <div>
      <PageHeading title="สั่งอะไรดีวันนี้?" />

      <div className="grid grid-cols-3 gap-2 mb-6">
        <Link href="#merchants" className="block">
          <Card className="text-center py-5 hover:border-indigo transition">
            <div className="text-2xl mb-1">🍜</div>
            <div className="font-head font-semibold text-xs">ส่งอาหาร</div>
          </Card>
        </Link>
        <Link href="/customer/parcel" className="block">
          <Card className="text-center py-5 hover:border-indigo transition">
            <div className="text-2xl mb-1">📦</div>
            <div className="font-head font-semibold text-xs">ส่งของ/พัสดุ</div>
          </Card>
        </Link>
        <Link href="/customer/ride" className="block">
          <Card className="text-center py-5 hover:border-indigo transition">
            <div className="text-2xl mb-1">🛵</div>
            <div className="font-head font-semibold text-xs">เรียกรถ</div>
          </Card>
        </Link>
      </div>

      {activeOrders.length > 0 && (
        <div className="mb-6">
          <h2 className="font-head font-semibold text-sm mb-2">กำลังดำเนินการ</h2>
          <div className="flex flex-col gap-2">
            {activeOrders.map((o) => (
              <Link key={o.id} href="/customer/orders">
                <Card className="flex items-center justify-between">
                  <div>
                    <div className="font-head font-semibold text-sm">
                      {TYPE_LABEL[o.type]} #{o.id}
                    </div>
                    <div className="text-ink-soft text-xs mt-0.5">{o.dropoff || o.pickup}</div>
                  </div>
                  <StatusChip status={o.status} />
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      <h2 id="merchants" className="font-head font-semibold text-sm mb-2">
        ร้านค้าในตำบล
      </h2>
      {loading ? (
        <p className="text-ink-soft text-sm">กำลังโหลด...</p>
      ) : merchants.length === 0 ? (
        <EmptyState>ยังไม่มีร้านค้าเปิดให้บริการในตำบลนี้</EmptyState>
      ) : (
        <Card className="!p-0 divide-y divide-border">
          {merchants.map((m) => (
            <Link key={m.id} href={`/customer/merchants/${m.id}`} className="flex items-center gap-3 px-4 py-3">
              <div className="w-11 h-11 rounded-xl bg-indigo-tint text-indigo flex items-center justify-center text-lg flex-none">
                🍽️
              </div>
              <div className="flex-1">
                <div className="font-head font-semibold text-sm">{m.name}</div>
                <div className="text-ink-soft text-xs">{m.category}</div>
              </div>
              <span className="text-ink-soft">›</span>
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}

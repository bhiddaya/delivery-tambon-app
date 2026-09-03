"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session-context";
import { Card, EmptyState, PageHeading, StatusChip } from "@/components/ui";
import { money, timeStr } from "@/lib/domain";
import type { Tables } from "@/lib/types";
import type { OrderRow } from "@/lib/domain";

export default function MerchantOrdersPage() {
  const { profile } = useSession();
  const [merchant, setMerchant] = useState<Tables<"merchants"> | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [itemsByOrder, setItemsByOrder] = useState<Record<number, Tables<"order_items">[]>>({});

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      const { data: m } = await supabase.from("merchants").select("*").eq("profile_id", profile.id).maybeSingle();
      if (cancelled || !m) return;
      setMerchant(m);
      const { data: o } = await supabase
        .from("orders")
        .select("*")
        .eq("merchant_id", m.id)
        .order("created_at", { ascending: false });
      setOrders(o ?? []);
      const orderIds = (o ?? []).map((x) => x.id);
      if (orderIds.length) {
        const { data: items } = await supabase.from("order_items").select("*").in("order_id", orderIds);
        const grouped: Record<number, Tables<"order_items">[]> = {};
        (items ?? []).forEach((it) => {
          grouped[it.order_id] = grouped[it.order_id] ? [...grouped[it.order_id], it] : [it];
        });
        setItemsByOrder(grouped);
      }
    }
    load();

    const channel = supabase
      .channel("merchant-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load)
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [profile.id]);

  if (!merchant) return null;

  return (
    <div>
      <PageHeading title="ออเดอร์เข้าร้าน" subtitle="สถานะจัดส่งอัปเดตโดยไรเดอร์และแอดมิน" />
      {orders.length === 0 ? (
        <EmptyState>ยังไม่มีออเดอร์เข้าร้าน</EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {orders.map((o) => (
            <Card key={o.id}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-head font-semibold text-sm">ออเดอร์ #{o.id}</span>
                <StatusChip status={o.status} />
              </div>
              <ul className="text-sm text-ink-soft mb-2">
                {(itemsByOrder[o.id] ?? []).map((it) => (
                  <li key={it.id}>
                    {it.name} × {it.qty}
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between text-xs text-ink-soft">
                <span>{timeStr(o.created_at)}</span>
                <span>{money(Number(o.items_subtotal))}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

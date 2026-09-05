"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session-context";
import { Card, EmptyState, PageHeading } from "@/components/ui";
import { dateStr, money, type OrderRow } from "@/lib/domain";
import { PERIOD_LABEL, inPeriod, summariseMerchant, type Period } from "@/lib/earnings";

const PERIODS: Period[] = ["today", "7d", "30d", "all"];

export default function MerchantEarningsPage() {
  const { profile } = useSession();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [period, setPeriod] = useState<Period>("7d");
  const [loading, setLoading] = useState(true);
  const [hasShop, setHasShop] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    (async () => {
      const { data: m } = await supabase
        .from("merchants")
        .select("id")
        .eq("profile_id", profile.id)
        .maybeSingle();

      if (cancelled) return;
      if (!m) {
        setHasShop(false);
        setLoading(false);
        return;
      }

      const { data: o } = await supabase
        .from("orders")
        .select("*")
        .eq("merchant_id", m.id)
        .order("created_at", { ascending: false });

      if (cancelled) return;
      setOrders(o ?? []);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [profile.id]);

  const scoped = useMemo(() => orders.filter((o) => inPeriod(o, period)), [orders, period]);
  const sum = useMemo(() => summariseMerchant(scoped), [scoped]);
  const recent = scoped.filter((o) => o.status === "delivered").slice(0, 20);

  if (!hasShop && !loading) {
    return (
      <div>
        <PageHeading title="รายรับร้าน" />
        <EmptyState>ยังไม่ได้ลงทะเบียนร้าน</EmptyState>
      </div>
    );
  }

  return (
    <div>
      <PageHeading title="รายรับร้าน" />

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
        <div className="text-ink-soft text-xs font-head font-semibold mb-1">ยอดเข้าร้านสุทธิ</div>
        <div className="font-head text-3xl font-bold tabular-nums text-indigo">
          {money(sum.net)}
        </div>
        <p className="text-ink-soft text-xs mt-1">
          จาก {sum.orders} ออเดอร์ที่ส่งสำเร็จ
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <Card>
          <div className="text-ink-soft text-xs font-head font-semibold mb-1">ยอดขายสินค้า</div>
          <div className="font-head text-2xl font-bold tabular-nums">
            {sum.itemsTotal.toLocaleString("th-TH")}
          </div>
        </Card>
        <Card>
          <div className="text-ink-soft text-xs font-head font-semibold mb-1">ค่าบริการระบบ</div>
          <div className="font-head text-2xl font-bold tabular-nums">
            {sum.commission.toLocaleString("th-TH")}
          </div>
        </Card>
      </div>

      <p className="text-ink-soft text-xs mb-5">
        ค่าส่งเป็นรายได้ของผู้ส่ง ไม่ได้นับรวมในยอดของร้าน
      </p>

      <h2 className="font-head font-semibold text-sm mb-2">ออเดอร์ล่าสุด</h2>
      {loading ? (
        <p className="text-ink-soft text-sm">กำลังโหลด...</p>
      ) : recent.length === 0 ? (
        <EmptyState>ยังไม่มีออเดอร์ที่ส่งสำเร็จในช่วงนี้</EmptyState>
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
                <div className="font-head font-semibold text-sm truncate">ออเดอร์ #{o.id}</div>
                <div className="text-ink-soft text-xs">{dateStr(o.created_at)}</div>
              </div>
              <div className="font-head font-semibold tabular-nums text-sm">
                {money(Number(o.items_subtotal))}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

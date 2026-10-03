"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, PageHeading } from "@/components/ui";
import { AdminTambonPicker, tambonName, useAdminTambon } from "@/components/AdminTambonPicker";
import { useTambonAdminData } from "@/components/useTambonAdminData";
import { econ, money } from "@/lib/domain";
import { bangkokDayStart, todoItems } from "@/lib/tambon-admin";

/**
 * หลังบ้านตัวแทนตำบล — หน้า วันนี้: เรื่องที่ต้องทำตอนนี้ก่อน แล้วจึงเป็นตัวเลขของวัน
 * ตัวแทนเห็นเฉพาะตำบลที่ได้รับแต่งตั้ง ส่วนกลางเห็นทุกตำบล (เลือกตำบลด้านบนได้)
 */
export default function AdminTodayPage() {
  const { tambons, slug, setSlug, selected } = useAdminTambon();
  const data = useTambonAdminData(selected?.id ?? null);
  const q = selected?.slug ? `?t=${selected.slug}` : "";
  const todo = todoItems({
    tambon: selected,
    orders: data.orders,
    settlements: data.settlements,
    merchants: data.merchants,
    drivers: data.drivers,
    now: data.now,
    q,
  });

  const boardPending = useBoardPending(selected?.id ?? null, data.now);
  if (boardPending > 0) {
    todo.push({ key: "board", text: `ประกาศรออนุมัติ ${boardPending} รายการ`, href: `/admin/board${q}`, urgent: false });
  }

  const dayStart = bangkokDayStart(data.now);
  const today = data.orders.filter((o) => new Date(o.created_at).getTime() >= dayStart && !o.is_test);
  const deliveredToday = today.filter((o) => o.status === "delivered");
  const platformToday = deliveredToday.reduce((s, o) => s + econ(o).platform, 0);
  const online = data.drivers.filter((d) => d.profile.approved && d.driver?.is_online).length;
  const approvedDrivers = data.drivers.filter((d) => d.profile.approved).length;
  const openShops = data.merchants.filter((m) => m.merchant.is_open).length;
  const subtitle = selected
    ? `${tambonName(selected)}${selected.is_active ? "" : " · ยังไม่เปิดบริการ"}`
    : "ทุกตำบลที่ดูแล";

  return (
    <div>
      <PageHeading title="วันนี้" subtitle={subtitle} />
      <AdminTambonPicker tambons={tambons} slug={slug} onChange={setSlug} />

      <h2 className="font-head font-semibold text-sm mb-2">ต้องทำตอนนี้</h2>
      {data.loading ? (
        <p className="text-ink-soft text-sm mb-6">กำลังโหลด…</p>
      ) : todo.length === 0 ? (
        <Card className="mb-6">
          <p className="text-sm text-ink">ไม่มีเรื่องค้าง ✓</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-2 mb-6">
          {todo.map((t) => (
            <Link key={t.key} href={t.href}>
              <Card className={`flex items-center justify-between gap-2 ${t.urgent ? "border-clay" : ""}`}>
                <span className="text-sm text-ink">
                  {t.urgent ? "⚠️ " : ""}
                  {t.text}
                </span>
                <span className="text-indigo text-sm font-semibold">ไปดู ›</span>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <h2 className="font-head font-semibold text-sm mb-2">ตัวเลขวันนี้</h2>
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Stat label="ออเดอร์วันนี้" value={`${today.length}`} sub={`ส่งสำเร็จ ${deliveredToday.length}`} />
        <Stat label="รายได้แพลตฟอร์มวันนี้" value={money(platformToday)} sub="จากออเดอร์ที่ส่งสำเร็จ" />
        <Stat label="ไรเดอร์ออนไลน์" value={`${online}/${approvedDrivers}`} sub="ที่อนุมัติแล้ว" />
        <Stat label="ร้านเปิดขาย" value={`${openShops}/${data.merchants.length}`} sub="ในตำบลที่ดูแล" />
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Link href={`/admin/orders${q}`} className="text-indigo font-semibold">
          ออเดอร์ทั้งหมด
        </Link>
        <Link href={`/admin/people${q}`} className="text-indigo font-semibold">
          ร้านและไรเดอร์
        </Link>
        <Link href={`/admin/approvals${q}`} className="text-indigo font-semibold">
          อนุมัติ
        </Link>
        <Link href={`/admin/tambon-page${q}`} className="text-indigo font-semibold">
          แก้หน้าตำบล
        </Link>
        <Link href={`/admin/board${q}`} className="text-indigo font-semibold">
          ประกาศและเสียงจากตำบล
        </Link>
      </div>
      <p className="text-ink-soft text-xs mt-2">ไม่นับออเดอร์ทดสอบ · อัปเดตเองเมื่อมีออเดอร์ใหม่</p>
    </div>
  );
}

/** ประกาศงาน/ประกาศหน่วยงานที่รอตัวแทนอนุมัติ (D52) — RLS ให้เห็นเฉพาะตำบลที่ดูแล */
function useBoardPending(tambonId: string | null, refreshKey: number) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let q = createClient().from("tambon_board_posts").select("id", { count: "exact", head: true }).eq("status", "pending");
    if (tambonId) q = q.eq("tambon_id", tambonId);
    q.then(({ count: c }) => setCount(c ?? 0));
  }, [tambonId, refreshKey]);
  return count;
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card>
      <div className="text-ink-soft text-xs font-head font-semibold mb-1">{label}</div>
      <div className="font-head text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-ink-soft text-[11px]">{sub}</div>
    </Card>
  );
}

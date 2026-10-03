"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, EmptyState, PageHeading } from "@/components/ui";
import { AdminTambonPicker, useAdminTambon } from "@/components/AdminTambonPicker";
import { useTambonAdminData } from "@/components/useTambonAdminData";
import { VEHICLE_LABEL, money } from "@/lib/domain";
import { driverGaps, merchantGaps, telHref } from "@/lib/tambon-admin";

/**
 * ร้านและไรเดอร์ของตำบล (ระยะ 1 ดูอย่างเดียว) — ใครพร้อม ใครยังขาดอะไร พร้อมปุ่มโทรตาม
 * อนุมัติทำที่หน้า อนุมัติ · ปุ่มระงับ/เปิดปิดร้านมาในระยะ 2
 */
export default function AdminPeoplePage() {
  const { tambons, slug, setSlug, selected } = useAdminTambon();
  const data = useTambonAdminData(selected?.id ?? null);
  const [tab, setTab] = useState<"shops" | "riders">("shops");
  const q = selected?.slug ? `?t=${selected.slug}` : "";
  const waiting =
    data.merchants.filter((m) => m.profile && !m.profile.approved).length +
    data.drivers.filter((d) => !d.profile.approved).length;

  return (
    <div>
      <PageHeading title="ร้านและไรเดอร์" subtitle="ใครพร้อมรับงาน ใครยังขาดอะไร" />
      <AdminTambonPicker tambons={tambons} slug={slug} onChange={setSlug} />

      {waiting > 0 && (
        <Link href={`/admin/approvals${q}`}>
          <Card className="mb-3 flex items-center justify-between">
            <span className="text-sm text-ink">รออนุมัติ {waiting} ราย</span>
            <span className="text-indigo text-sm font-semibold">ไปอนุมัติ ›</span>
          </Card>
        </Link>
      )}

      <div className="flex gap-1.5 mb-3">
        {(
          [
            ["shops", `ร้านค้า (${data.merchants.length})`],
            ["riders", `ไรเดอร์ (${data.drivers.length})`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`text-xs font-head font-semibold rounded-full px-3 py-1.5 border ${
              tab === k ? "bg-indigo text-white border-indigo" : "border-border text-ink-soft"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {data.loading ? (
        <p className="text-ink-soft text-sm">กำลังโหลด…</p>
      ) : tab === "shops" ? (
        data.merchants.length === 0 ? (
          <EmptyState>ยังไม่มีร้านในตำบลนี้</EmptyState>
        ) : (
          <div className="flex flex-col gap-2">
            {data.merchants.map((m) => {
              const gaps = merchantGaps(m);
              const tel = telHref(m.profile?.phone);
              return (
                <Card key={m.merchant.id}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-head font-semibold text-sm">{m.merchant.name}</span>
                    <span className={`text-[11px] font-head font-semibold ${m.merchant.is_open ? "text-jade" : "text-ink-soft"}`}>
                      {m.merchant.is_open ? "เปิดอยู่" : "ปิด"}
                    </span>
                  </div>
                  <p className="text-ink-soft text-xs">
                    {m.profile?.full_name ?? "-"} · เมนู {m.menuCount}
                    {tel && (
                      <a href={tel} className="text-indigo font-semibold ml-2">
                        โทร {m.profile?.phone}
                      </a>
                    )}
                  </p>
                  {gaps.length ? (
                    <p className="text-clay text-xs mt-1">ยังขาด: {gaps.join(" · ")}</p>
                  ) : (
                    <p className="text-jade text-xs mt-1">✓ พร้อมรับออเดอร์</p>
                  )}
                </Card>
              );
            })}
          </div>
        )
      ) : data.drivers.length === 0 ? (
        <EmptyState>ยังไม่มีไรเดอร์ในตำบลนี้</EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {data.drivers.map((d) => {
            const gaps = driverGaps(d);
            const tel = telHref(d.profile.phone);
            return (
              <Card key={d.profile.id}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-head font-semibold text-sm">{d.profile.full_name}</span>
                  <span
                    className={`text-[11px] font-head font-semibold ${d.driver?.is_online ? "text-jade" : "text-ink-soft"}`}
                  >
                    {d.driver?.is_online ? "ออนไลน์" : "ออฟไลน์"}
                  </span>
                </div>
                <p className="text-ink-soft text-xs">
                  {d.driver ? VEHICLE_LABEL[d.driver.vehicle_type] : "-"} · วันนี้ {d.driver?.today_jobs ?? 0} งาน ·{" "}
                  {money(Number(d.driver?.today_earn ?? 0))} · ★ {d.profile.rating}
                  {tel && (
                    <a href={tel} className="text-indigo font-semibold ml-2">
                      โทร {d.profile.phone}
                    </a>
                  )}
                </p>
                {gaps.length ? (
                  <p className="text-clay text-xs mt-1">ยังขาด: {gaps.join(" · ")}</p>
                ) : (
                  <p className="text-jade text-xs mt-1">✓ พร้อมรับงาน</p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

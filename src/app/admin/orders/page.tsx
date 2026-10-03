"use client";

import { useState } from "react";
import { Card, EmptyState, PageHeading, StatusChip } from "@/components/ui";
import { AdminTambonPicker, useAdminTambon } from "@/components/AdminTambonPicker";
import { useTambonAdminData } from "@/components/useTambonAdminData";
import { OrderActions } from "@/components/AgentActions";
import { TYPE_LABEL, customerTotal, dateStr, money, slipState, timeStr, type OrderStatus } from "@/lib/domain";
import { STALE_PENDING_MINUTES, ageLabel, minutesSince, telHref } from "@/lib/tambon-admin";

const FILTERS: { key: OrderStatus | "all" | "active"; label: string }[] = [
  { key: "active", label: "กำลังดำเนินการ" },
  { key: "pending", label: "รอคนรับ" },
  { key: "delivered", label: "สำเร็จ" },
  { key: "cancelled", label: "ยกเลิก" },
  { key: "all", label: "ทั้งหมด 30 วัน" },
];

const SLIP_LABEL = { none: "ยังไม่ส่งสลิป", submitted: "สลิปรอตรวจ", rejected: "แจ้งไม่พบยอดแล้ว", verified: "รับเงินแล้ว" };

/**
 * ออเดอร์ของตำบล — เห็นลูกค้า ร้าน ไรเดอร์ พร้อมปุ่มโทร (อาจารย์อนุญาตให้ตัวแทนเห็นเบอร์ลูกค้า 3 ต.ค. 69)
 * ระยะ 2: มอบงานให้ไรเดอร์ และยกเลิกพร้อมเหตุผล (admin_assign_order / admin_cancel_order)
 */
export default function AdminOrdersPage() {
  const { tambons, slug, setSlug, selected } = useAdminTambon();
  const data = useTambonAdminData(selected?.id ?? null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("active");

  const shown = data.orders.filter((o) =>
    filter === "all"
      ? true
      : filter === "active"
      ? o.status === "pending" || o.status === "accepted" || o.status === "in_progress"
      : o.status === filter
  );

  return (
    <div>
      <PageHeading title="ออเดอร์" subtitle="ออเดอร์ของตำบลที่ดูแล ย้อนหลัง 30 วัน" />
      <AdminTambonPicker tambons={tambons} slug={slug} onChange={setSlug} />

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

      {data.loading ? (
        <p className="text-ink-soft text-sm">กำลังโหลด…</p>
      ) : shown.length === 0 ? (
        <EmptyState>ไม่มีออเดอร์ในหมวดนี้</EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map((o) => {
            const customer = data.profiles[o.customer_id];
            const rider = o.driver_id ? data.profiles[o.driver_id] : undefined;
            const shop = o.merchant_id ? data.merchantById[o.merchant_id] : undefined;
            const stale = o.status === "pending" && minutesSince(o.created_at, data.now) >= STALE_PENDING_MINUTES;
            const custTel = telHref(customer?.phone);
            const riderTel = telHref(rider?.phone);
            return (
              <Card key={o.id} className={stale ? "border-clay" : ""}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="font-head font-semibold text-sm">
                    {TYPE_LABEL[o.type]} #{o.id}
                    {o.is_test ? <span className="text-ink-soft text-xs"> · ทดสอบ</span> : null}
                  </span>
                  <StatusChip status={o.status} />
                </div>
                <p className="text-ink-soft text-xs mb-2">
                  สั่งเมื่อ {dateStr(o.created_at)} {timeStr(o.created_at)} · ผ่านมา {ageLabel(o.created_at, data.now)}
                  {stale ? " · ยังไม่มีคนรับ" : ""}
                </p>
                <div className="text-sm text-ink flex flex-col gap-1">
                  <div>
                    ลูกค้า: {customer?.full_name ?? "-"}
                    {custTel && (
                      <a href={custTel} className="text-indigo font-semibold ml-2">
                        โทร {customer?.phone}
                      </a>
                    )}
                  </div>
                  {shop && <div>ร้าน: {shop.name}</div>}
                  <div>
                    ไรเดอร์: {rider?.full_name ?? "ยังไม่มี"}
                    {riderTel && (
                      <a href={riderTel} className="text-indigo font-semibold ml-2">
                        โทร {rider?.phone}
                      </a>
                    )}
                  </div>
                  <div className="text-ink-soft text-xs">
                    รับที่: {o.pickup || "-"}
                    <br />
                    ส่งที่: {o.dropoff || "-"}
                    {o.note ? (
                      <>
                        <br />
                        หมายเหตุ: {o.note}
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-border text-sm">
                  <span className="text-ink-soft text-xs">
                    {o.payment_method}
                    {o.payment_method === "พร้อมเพย์" && o.status === "delivered" ? ` · ${SLIP_LABEL[slipState(o)]}` : ""}
                  </span>
                  <b className="font-head tabular-nums">{money(customerTotal(o))}</b>
                </div>
                <OrderActions order={o} drivers={data.drivers} onDone={data.reload} />
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

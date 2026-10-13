"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { money } from "@/lib/domain";

type Pay = { status: "pending" | "paid"; qr_image?: string; amount?: number; error?: string };

/**
 * LLP (docs/60): จ่ายพร้อมเพย์ผ่าน Opn — ไม่ต้องส่งสลิป ระบบยืนยันเองจาก webhook
 * QR สร้างที่ Edge Function llp-create-payment (secret key อยู่ฝั่งเซิร์ฟเวอร์เท่านั้น ยอดคิดจากออเดอร์ในฐาน)
 */
export default function LlpPayCard({ orderId, paid, onPaid }: { orderId: number; paid: boolean; onPaid: () => void }) {
  const [pay, setPay] = useState<Pay | null>(null);
  useEffect(() => {
    if (paid) return;
    let alive = true;
    createClient().functions.invoke("llp-create-payment", { body: { order_id: orderId } })
      .then(({ data, error }) => { if (alive) setPay(error ? { status: "pending", error: "สร้าง QR ไม่สำเร็จ ลองเปิดหน้านี้ใหม่" } : data as Pay); });
    // ponytail: poll 5 วิ เป็นตัวสำรองของ realtime ใน useLiveData — ถ้าคนใช้เยอะค่อยเปลี่ยนเป็น subscribe llp_payments อย่างเดียว
    const t = setInterval(onPaid, 5000);
    return () => { alive = false; clearInterval(t); };
  }, [orderId, paid, onPaid]);

  if (paid || pay?.status === "paid") return <p role="status" className="rounded-xl bg-[#e3f6ea] p-4 font-semibold text-[#06a14a]">✅ ชำระเงินสำเร็จ ร้านกำลังรับออเดอร์</p>;
  if (pay?.error) return <p role="alert" className="rounded-xl bg-marigold-tint p-4 text-sm">{pay.error}</p>;
  if (!pay?.qr_image) return <p role="status" className="text-sm text-ink-soft">กำลังสร้าง QR พร้อมเพย์…</p>;
  return <div className="text-center">
    <p className="text-sm">สแกนด้วยแอปธนาคาร ยอด <strong>{money(Number(pay.amount))}</strong></p>
    {/* eslint-disable-next-line @next/next/no-img-element -- รูป QR จาก Opn (โดเมนภายนอก ไม่ผ่าน next/image) */}
    <img src={pay.qr_image} alt="QR พร้อมเพย์สำหรับชำระออเดอร์นี้" className="mx-auto my-3 w-60 max-w-full rounded-xl bg-white p-2" />
    <a href={pay.qr_image} target="_blank" rel="noreferrer" className="text-sm text-indigo underline">เปิดรูป QR เพื่อบันทึก</a>
    <p className="mt-3 text-xs leading-6 text-ink-soft">จ่ายแล้วไม่ต้องส่งสลิป ระบบยืนยันให้อัตโนมัติภายในไม่กี่วินาที</p>
  </div>;
}

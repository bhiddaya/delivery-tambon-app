"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { promptpayPayload } from "@/lib/promptpay";
import { money } from "@/lib/domain";

/**
 * แสดง QR พร้อมเพย์สำหรับจ่ายเงินให้ร้านค้า/ไรเดอร์รายหนึ่งๆ ตามยอดที่ระบุ
 * สร้าง QR ฝั่งไคลเอนต์ทั้งหมด ไม่ผ่านเกตเวย์ภายนอก — ระบบไม่ทราบว่าจ่ายแล้วหรือยัง
 * (เหมือนต้นแบบ Artifact เดิม) ถ้าไม่มีเลขพร้อมเพย์หรือยอดไม่ถูกต้องจะไม่แสดงอะไรเลย
 */
export function PromptPayQR({
  promptpayId,
  amount,
  label,
}: {
  promptpayId: string | null | undefined;
  amount: number;
  label: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const payload = promptpayPayload(promptpayId, amount);

  useEffect(() => {
    let cancelled = false;
    if (!payload) return;
    QRCode.toDataURL(payload, { margin: 1, width: 220 })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [payload]);

  if (!payload) return null;

  return (
    <div className="flex flex-col items-center gap-2 py-3">
      <p className="text-ink-soft text-xs">
        สแกนจ่าย{label} · <b className="text-ink">{money(amount)}</b>
      </p>
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URL, ไม่ใช่รูปจาก remote host
        <img src={dataUrl} alt={`QR พร้อมเพย์ ${label}`} width={180} height={180} className="rounded-lg border border-border" />
      ) : (
        <div className="w-[180px] h-[180px] rounded-lg border border-border bg-surface-2 animate-pulse" />
      )}
      <p className="text-ink-soft text-[10px]">ระบบไม่ยืนยันการจ่ายอัตโนมัติ — โปรดตรวจสอบกับผู้รับเงินเอง</p>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { tambonDisplayName } from "@/lib/tambon-choice";
import { tambonLineLink, tambonWebLink } from "@/lib/tambon-links";

function QrBlock({ url, label, file }: { url: string; label: string; file: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { margin: 2, width: 600 })
      .then((d) => !cancelled && setDataUrl(d))
      .catch(() => !cancelled && setDataUrl(null));
    return () => {
      cancelled = true;
    };
  }, [url]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-border p-3">
      <div className="font-head font-semibold text-xs text-center">{label}</div>
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URL ที่สร้างในเครื่อง
        <img src={dataUrl} alt={`QR ${label}`} width={150} height={150} className="rounded-lg" />
      ) : (
        <div className="w-[150px] h-[150px] rounded-lg bg-surface-2 animate-pulse" />
      )}
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs">
        {dataUrl && (
          <a href={dataUrl} download={file} className="text-indigo font-semibold">
            ดาวน์โหลด QR
          </a>
        )}
        <button type="button" onClick={copy} className="text-indigo font-semibold">
          {copied ? "คัดลอกแล้ว ✓" : "คัดลอกลิงก์"}
        </button>
      </div>
    </div>
  );
}

/** ลิงก์และ QR ของแต่ละตำบลสำหรับพิมพ์แจกในพื้นที่ (ยังใช้ LINE OA เดียวกันทุกตำบล) */
export function TambonShareCard({ name, slug, active }: { name: string; slug: string; active: boolean }) {
  return (
    <div className="rounded-xl border border-border p-3 mb-3">
      <div className="font-head font-semibold text-sm mb-1">ลิงก์และ QR แจกในพื้นที่</div>
      <p className="text-ink-soft text-xs mb-3">
        QR LINE: สแกนแล้วเปิดแชท บวรไทย พร้อมข้อความ &quot;{tambonDisplayName(name)} #{slug}&quot; กดส่งแล้วระบบตั้งตำบลและแสดงร้านในตำบลนี้ ·
        QR เว็บ: เปิดหน้าตำบลบนเว็บ
        {!active && " · ตำบลนี้ยังไม่เปิดบริการ ลูกค้าที่สแกนจะได้รับแจ้งว่ายังไม่เปิด"}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <QrBlock url={tambonLineLink(name, slug)} label="สั่งผ่าน LINE" file={`bavornthai-line-${slug}.png`} />
        <QrBlock url={tambonWebLink(slug)} label="หน้าตำบลบนเว็บ" file={`bavornthai-web-${slug}.png`} />
      </div>
    </div>
  );
}

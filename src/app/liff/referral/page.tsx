"use client";
import { useEffect, useState } from "react";
import { useLineSession } from "@/lib/use-line-session";
import { createClient } from "@/lib/supabase/client";
import { QrBlock } from "@/components/TambonShareCard";
import { Card } from "@/components/ui";

type Month = { month: string; seller: number | null; buyer: number | null; total: number; orders: number };
type Me = { ok: boolean; error?: string; code?: string; banned?: boolean; referred?: number; active?: number; months?: Month[];
  this_month?: number; earned?: number; payable?: number; paid?: number; promptpay?: boolean };

const baht = (n: number | null | undefined) => "฿" + Number(n || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const monthName = (m: string) => new Date(m + "T00:00:00").toLocaleDateString("th-TH", { month: "long", year: "numeric" });

/** ลิงก์/QR แนะนำของฉัน + ยอดส่วนแบ่ง — เปิดจากเมนู LINE บวรไทย (/liff/referral) */
export default function MyReferral() {
  const session = useLineSession();
  const { status, isLoggedIn, login } = session.liff;
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    if (status === "ready" && !isLoggedIn) login();
  }, [status, isLoggedIn, login]);

  useEffect(() => {
    if (!session.ready) return;
    createClient().rpc("referral_me").then(r => setMe(r.error ? { ok: false, error: "failed" } : (r.data as Me)));
  }, [session.ready]);

  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  const link = me?.code && liffId ? `https://liff.line.me/${liffId}/liff/ref?c=${me.code}` : null;
  return <div className="mx-auto max-w-md"><h1 className="mb-2 text-2xl font-semibold">ลิงก์แนะนำของฉัน</h1>
    {!me ? <Card><p role="status">{session.error || "กำลังตรวจบัญชี LINE…"}</p></Card>
      : !me.ok ? <Card><p role="alert">{me.error === "member_required" ? "ขอลิงก์แนะนำได้เมื่อเป็นสมาชิก LINE บวรไทยที่สมัครและได้รับอนุมัติแล้ว" : "โหลดข้อมูลไม่ได้ ลองเปิดใหม่อีกครั้ง"}</p></Card>
      : <>
        {me.banned && <Card className="mb-3"><p role="alert">บัญชีนี้ถูกระงับสิทธิ์รับส่วนแบ่ง ติดต่อส่วนกลาง</p></Card>}
        <Card className="mb-3">
          <p className="mb-3 text-sm leading-7 text-ink-soft">ส่งลิงก์หรือ QR นี้ให้ร้านค้า ผู้ให้บริการ หรือผู้ซื้อที่ยังไม่เคยสมัคร เมื่อเขาสมัครผ่านลิงก์นี้จะผูกกับคุณอัตโนมัติ รหัสของคุณ <b>{me.code}</b></p>
          {link ? <QrBlock url={link} label="ลิงก์แนะนำบวรไทย" file={`bavorn-ref-${me.code}.png`} /> : <p>ยังสร้างลิงก์ไม่ได้ (ระบบยังไม่ได้ตั้งค่า LIFF)</p>}
        </Card>
        <Card className="mb-3"><div className="grid grid-cols-2 gap-2 text-sm">
          <span>คนที่ชวนมา</span><b className="text-right">{me.referred} คน (มีสิทธิ์ {me.active})</b>
          <span>เดือนนี้ (ประมาณ)</span><b className="text-right">{baht(me.this_month)}</b>
          <span>ได้รับรวม (ปิดยอดแล้ว)</span><b className="text-right">{baht(me.earned)}</b>
          <span>ถึงเกณฑ์จ่าย</span><b className="text-right">{baht(me.payable)}</b>
          <span>จ่ายแล้ว</span><b className="text-right">{baht(me.paid)}</b>
        </div>
        <p className="mt-3 text-xs leading-6 text-ink-soft">สรุปยอดทุกสิ้นเดือน จ่ายเมื่อสะสมถึง 100 บาท เข้าพร้อมเพย์ที่ลงทะเบียนไว้{me.promptpay ? "" : " (ยังไม่ได้ลงทะเบียนพร้อมเพย์ ตั้งได้ที่หน้าบัญชีของฉัน)"}</p></Card>
        {!!me.months?.length && <Card><h2 className="mb-2 font-semibold">ยอดรายเดือน</h2>
          {me.months.map(m => <div key={m.month} className="flex justify-between border-t border-border py-2 text-sm"><span>{monthName(m.month)} · {m.orders} ออเดอร์</span><b>{baht(m.total)}</b></div>)}</Card>}
      </>}
  </div>;
}

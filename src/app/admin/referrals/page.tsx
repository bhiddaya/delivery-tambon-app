"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Field, Input, PageHeading } from "@/components/ui";
import { useSession } from "@/lib/session-context";
import { useManagedTambons } from "@/components/AdminTambonPicker";

type TambonRow = { tambon_id: string; name: string; orders: number; gp: number; cost: number; net_gp: number; seller_share: number; buyer_share: number; bavorn: number };
type ReferrerRow = { referrer_id: string; full_name: string | null; code: string; banned: boolean; seller: number | null; buyer: number | null; total: number; orders: number };
type PayoutRow = { referrer_id: string; full_name: string | null; amount: number; promptpay: boolean; paid_at: string | null };
type Rate = { tambon_id: string; name: string; gp_pct: number; admin_pct: number; system_pct: number; agent_pct: number; transfer_tax_pct: number; reserve_pct: number; starts_on: string | null };
type Report = { month: string; closed: boolean; note: string | null; rates: Rate[]; tambons: TambonRow[]; referrers: ReferrerRow[]; payouts: PayoutRow[] | null };

const baht = (n: number | null | undefined) => "฿" + Number(n || 0).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const RATE_FIELDS = [["gp_pct", "ค่า GP % ของค่าสินค้า"], ["admin_pct", "admin ส่วนกลาง/ตำบล %"], ["system_pct", "ระบบ/เซิร์ฟเวอร์ %"],
  ["transfer_tax_pct", "ค่าโอน/ภาษี %"], ["reserve_pct", "สำรองและพัฒนา %"]] as const;

/** ส่วนแบ่งผู้แนะนำรายเดือน: ส่วนกลางเห็นทุกตำบล ตั้งอัตรา ปิดยอด · ตัวแทนเห็นเฉพาะตำบลที่ดูแล */
export default function AdminReferralsPage() {
  const { profile } = useSession();
  const isSuperadmin = profile.role === "superadmin";
  const tambons = useManagedTambons();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [report, setReport] = useState<Report | null>(null);
  const [message, setMessage] = useState("");
  const [rate, setRate] = useState<Record<string, string>>({});

  async function load() {
    const r = await createClient().rpc("referral_month_report", { p_month: `${month}-01` });
    if (r.error) { setMessage(r.error.message); return; }
    setReport(r.data as Report);
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- reload when the month changes
  useEffect(() => { load(); }, [month]);

  async function closeMonth() {
    setMessage("");
    const r = await createClient().rpc("referral_close_month", { p_month: `${month}-01` });
    setMessage(r.error ? r.error.message : "ปิดยอดแล้ว");
    load();
  }

  async function ban(id: string, name: string | null) {
    const reason = prompt(`เหตุผลที่ตัดสิทธิ์ ${name ?? ""}`);
    if (!reason) return;
    const r = await createClient().rpc("referral_ban", { p_profile_id: id, p_reason: reason });
    setMessage(r.error ? r.error.message : "ตัดสิทธิ์แล้ว");
    load();
  }

  async function saveRate(e: FormEvent) {
    e.preventDefault(); setMessage("");
    const n = (k: string) => Number(rate[k] || 0);
    // ตัวแทนตั้งได้เฉพาะอัตรา GP ของตำบลตัวเอง · ส่วนกลางตั้งค่าใช้จ่ายและวันเริ่มคำนวณ
    const r = isSuperadmin
      ? await createClient().rpc("referral_set_rates", { p_tambon_id: rate.tambon_id, p_gp_pct: n("gp_pct"), p_admin_pct: n("admin_pct"),
        p_system_pct: n("system_pct"), p_transfer_tax_pct: n("transfer_tax_pct"), p_reserve_pct: n("reserve_pct"), p_starts_on: rate.starts_on })
      : await createClient().rpc("referral_set_gp", { p_tambon_id: rate.tambon_id, p_gp_pct: n("gp_pct") });
    setMessage(r.error ? r.error.message : "บันทึกอัตราแล้ว");
    load();
  }

  function pickTambon(id: string) {
    const cur = report?.rates.find(x => x.tambon_id === id);
    setRate(cur ? Object.fromEntries(Object.entries(cur).map(([k, v]) => [k, String(v)])) : { tambon_id: id });
  }

  return <div>
    <PageHeading title="ส่วนแบ่งผู้แนะนำ" subtitle="ค่า GP สุทธิแบ่ง 30% ผู้แนะนำผู้ขาย · 40% ผู้แนะนำผู้ซื้อ · ที่เหลือสนับสนุน บวร (ยังไม่จ่ายเงินจริง)" />
    <div className="mb-3 flex flex-wrap items-end gap-3">
      <Field label="เดือน"><Input type="month" value={month} onChange={e => setMonth(e.target.value)} /></Field>
      {isSuperadmin && report && !report.closed && <Button onClick={closeMonth}>ปิดยอดเดือนนี้</Button>}
    </div>
    {message && <p role="status" className="mb-3 text-sm">{message}</p>}
    {report && <>
      <p className="mb-3 text-sm text-ink-soft">{report.closed ? "ปิดยอดแล้ว" : report.note}</p>
      <Card className="mb-3 overflow-x-auto"><h2 className="mb-2 font-semibold">รายตำบล</h2>
        <table className="w-full text-sm"><thead><tr className="text-left"><th>ตำบล</th><th>ออเดอร์</th><th>ค่า GP</th><th>หักค่าใช้จ่าย</th><th>GP สุทธิ</th><th>ผู้แนะนำผู้ขาย</th><th>ผู้แนะนำผู้ซื้อ</th><th>บวร</th></tr></thead>
          <tbody>{report.tambons.map(t => <tr key={t.tambon_id} className="border-t border-border"><td>{t.name}</td><td>{t.orders}</td><td>{baht(t.gp)}</td><td>{baht(t.cost)}</td><td>{baht(t.net_gp)}</td><td>{baht(t.seller_share)}</td><td>{baht(t.buyer_share)}</td><td>{baht(t.bavorn)}</td></tr>)}</tbody></table>
        {!report.tambons.length && <p className="text-sm">ยังไม่มีออเดอร์ที่นับ (ตำบลต้องตั้งอัตราและถึงวันเริ่มคำนวณ)</p>}</Card>
      <Card className="mb-3 overflow-x-auto"><h2 className="mb-2 font-semibold">ผู้แนะนำ</h2>
        <table className="w-full text-sm"><thead><tr className="text-left"><th>ชื่อ</th><th>รหัส</th><th>ออเดอร์</th><th>ผู้ขาย</th><th>ผู้ซื้อ</th><th>รวม</th><th /></tr></thead>
          <tbody>{report.referrers.map(r => <tr key={r.referrer_id} className="border-t border-border"><td>{r.full_name}{r.banned && " (ตัดสิทธิ์)"}</td><td>{r.code}</td><td>{r.orders}</td><td>{baht(r.seller)}</td><td>{baht(r.buyer)}</td><td>{baht(r.total)}</td>
            <td>{isSuperadmin && !r.banned && <button type="button" className="text-clay underline" onClick={() => ban(r.referrer_id, r.full_name)}>ตัดสิทธิ์</button>}</td></tr>)}</tbody></table></Card>
      {report.payouts && <Card className="mb-3"><h2 className="mb-2 font-semibold">ถึงเกณฑ์จ่าย (≥ 100 บาท)</h2>
        {report.payouts.map(p => <div key={p.referrer_id} className="flex justify-between border-t border-border py-2 text-sm"><span>{p.full_name}{p.promptpay ? "" : " · ยังไม่มีพร้อมเพย์"}</span><b>{baht(p.amount)} {p.paid_at ? "จ่ายแล้ว" : "ยังไม่จ่าย"}</b></div>)}
        {!report.payouts.length && <p className="text-sm">ยังไม่มี (ปิดยอดแล้วจึงจะมีรายการ)</p>}</Card>}
      <Card className="mb-3 overflow-x-auto"><h2 className="mb-2 font-semibold">อัตรารายตำบล</h2>
        <table className="w-full text-sm"><thead><tr className="text-left"><th>ตำบล</th><th>GP</th><th>admin</th><th>ระบบ</th><th>ตัวแทน</th><th>โอน/ภาษี</th><th>สำรอง</th><th>เริ่ม</th></tr></thead>
          <tbody>{report.rates.map(r => <tr key={r.tambon_id} className="border-t border-border"><td>{r.name}</td><td>{r.gp_pct}%</td><td>{r.admin_pct}%</td><td>{r.system_pct}%</td><td>{r.agent_pct}%</td><td>{r.transfer_tax_pct}%</td><td>{r.reserve_pct}%</td><td>{r.starts_on ?? "ยังไม่กำหนด"}</td></tr>)}</tbody></table>
        <p className="mt-2 text-xs text-ink-soft">ค่าใช้จ่ายคิดเป็น % ของค่า GP · ส่วนแบ่งตัวแทนใช้อัตราในหน้าตั้งค่าตำบล · อัตรา GP แต่ละตำบลตัดสินใจเอง (ตัวแทนตั้งได้) · ค่าใช้จ่ายและวันเริ่มคำนวณ ส่วนกลางเป็นผู้กรอก</p>
        <form onSubmit={saveRate} className="mt-3 grid gap-2 sm:grid-cols-2">
          <Field label="ตำบล"><select required className="min-h-12 w-full rounded-xl border border-border bg-surface px-3" value={rate.tambon_id ?? ""} onChange={e => pickTambon(e.target.value)}>
            <option value="">เลือกตำบล</option>{tambons?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
          {RATE_FIELDS.filter(([k]) => isSuperadmin || k === "gp_pct").map(([k, label]) => <Field key={k} label={label}><Input type="number" min={0} max={100} step="0.01" required={k === "gp_pct"} value={rate[k] ?? ""} onChange={e => setRate({ ...rate, [k]: e.target.value })} /></Field>)}
          {isSuperadmin && <Field label="วันเริ่มคำนวณ"><Input type="date" required value={rate.starts_on ?? ""} onChange={e => setRate({ ...rate, starts_on: e.target.value })} /></Field>}
          <Button className="sm:col-span-2">บันทึกอัตรา</Button>
        </form></Card>
    </>}
  </div>;
}

"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import type { Tables } from "@/lib/types";
import { Button, Card, Field, Input } from "@/components/ui";
export function SavedPaymentQr({ path, account, bank }: { path: string; account: string | null; bank: string | null }) {
  const [result, setResult] = useState<{ path: string; url: string | null } | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    createClient().storage.from("payment-qr").createSignedUrl(path, 300).then(r => { if (live) setResult({ path, url: r.data?.signedUrl ?? null }); });
    const timer = window.setTimeout(() => setRevision(v => v + 1), 240000);
    return () => { live = false; window.clearTimeout(timer); };
  }, [path, revision]);
  return <div className="my-3"><p className="text-sm font-semibold">{account || "ชื่อบัญชีผู้รับ"} {bank ? `· ${bank}` : ""}</p>{result?.path === path ? result.url ? <a href={result.url} target="_blank" rel="noreferrer"><Image unoptimized width={320} height={320} src={result.url} alt="QR บัญชีธนาคารของผู้รับ" className="mx-auto my-3 max-h-80 w-full max-w-xs object-contain" /></a> : <p className="mt-2 text-xs text-clay">เปิด QR ไม่ได้ กรุณาลองอีกครั้ง</p> : <p className="mt-2 text-xs">กำลังเปิด QR…</p>}<button type="button" className="my-2 min-h-11 text-xs text-indigo underline" onClick={() => { setResult(null); setRevision(v => v + 1); }}>เปิด QR ใหม่</button><p className="text-xs leading-6 text-ink-soft">ตรวจชื่อบัญชีและกรอกยอดในแอปธนาคารตามยอดที่ต้องโอน QR ที่อัปโหลดอาจไม่ได้ระบุจำนวนเงิน</p></div>;
}
export default function PaymentQrCard({ profile }: { profile: Tables<"profiles"> }) {
  const [path, setPath] = useState(profile.payment_qr_path);
  const [account, setAccount] = useState(profile.payment_account_name ?? "");
  const [bank, setBank] = useState(profile.payment_bank_name ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save() {
    const ext = file && ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as Record<string, string>)[file.type];
    if (!account.trim() || (!path && !file)) { setMessage("ใส่ชื่อบัญชีและเลือกรูป QR ของบัญชีคุณ"); return; }
    if (file && (!ext || file.size > 5 * 1024 * 1024)) { setMessage("ใช้รูป JPG, PNG หรือ WEBP ไม่เกิน 5 MB"); return; }
    setBusy(true); setMessage("");
    const db = createClient(); let next = path;
    if (file) {
      next = `${profile.id}/${crypto.randomUUID()}.${ext}`;
      const upload = await db.storage.from("payment-qr").upload(next, file, { contentType: file.type, upsert: false });
      if (upload.error) { setMessage("อัปโหลดไม่สำเร็จ กรุณาลองใหม่"); setBusy(false); return; }
    }
    const r = await db.from("profiles").update({ payment_qr_path: next, payment_account_name: account.trim(), payment_bank_name: bank.trim() || null }).eq("id", profile.id).select("id");
    if (r.error || r.data?.length !== 1) { if (file && next) await db.storage.from("payment-qr").remove([next]); setMessage("บันทึก QR ไม่สำเร็จ กรุณาลองใหม่"); }
    else { setPath(next); setFile(null); setMessage("บันทึก QR รับเงินแล้ว"); }
    setBusy(false);
  }
  return <Card className="mb-4"><h2 className="mb-2 font-semibold">QR บัญชีธนาคารสำหรับรับเงิน</h2><p className="mb-3 text-xs leading-6 text-ink-soft">ใช้แทนพร้อมเพย์ได้ อัปโหลด QR รับเงินจากแอปธนาคารของคุณ ตัวแทนที่ดูแลจึงจะเปิดดูเพื่อโอนให้ได้</p><Field label="ชื่อบัญชีผู้รับ"><Input maxLength={100} value={account} onChange={e => setAccount(e.target.value)} /></Field><Field label="ธนาคาร (ถ้ามี)"><Input maxLength={100} value={bank} onChange={e => setBank(e.target.value)} /></Field><label className="mb-4 block text-sm">รูป QR<input className="mt-2 block w-full" type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setFile(e.target.files?.[0] ?? null)} disabled={busy} /></label>{path && <SavedPaymentQr path={path} account={account} bank={bank} />}<Button onClick={save} disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึก QR รับเงิน"}</Button>{message && <p role="status" className="mt-3 text-sm">{message}</p>}</Card>;
}

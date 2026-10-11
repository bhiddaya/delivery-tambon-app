"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLineSession } from "@/lib/use-line-session";
import { createClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/next-path";
import { formatPhoneLocal, normalizePhone } from "@/lib/identifier";
import { Button, Card, Field, Input } from "@/components/ui";

type Area = { id: string; name: string; slug: string };
export default function RegisterCustomer() {
  const router = useRouter();
  const session = useLineSession();
  const [areas, setAreas] = useState<Area[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [area, setArea] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    createClient().from("tambons").select("id,name,slug").eq("is_active", true).order("name").then(r => {
      if (!live) return;
      if (r.error) { setError("โหลดตำบลไม่ได้ กรุณาเปิดหน้านี้ใหม่"); return; }
      setAreas(r.data ?? []);
      const slug = new URLSearchParams(window.location.search).get("t");
      const chosen = r.data?.find(t => t.slug === slug) ?? (r.data?.length === 1 ? r.data[0] : null);
      if (chosen) setArea(chosen.id);
    });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!session.ready) return;
    const p = session.profile;
    // One hydration from the verified account. Existing complete customers skip signup.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate verified account once
    setName(p?.full_name ?? session.liff.profile?.displayName ?? "");
    setPhone(p?.phone ? formatPhoneLocal(p.phone) : "");
    if (p?.tambon_id) setArea(p.tambon_id);
  }, [session.ready, session.profile, session.liff.profile?.displayName]);
  useEffect(() => {
    const p = session.profile;
    if (session.ready && p?.role === "customer" && p.full_name && p.phone && p.tambon_id) {
      router.replace(safeNextPath(new URLSearchParams(window.location.search).get("next")) ?? "/liff");
    }
  }, [session.ready, session.profile, router]);
  async function submit(e: FormEvent) {
    e.preventDefault(); setError("");
    if (!normalizePhone(phone)) { setError("กรอกเบอร์โทร 10 หลัก เช่น 0812345678"); return; }
    setBusy(true);
    const r = await createClient().rpc("register_line_customer", { p_name: name.trim(), p_phone: phone, p_tambon_id: area });
    setBusy(false);
    const value = r.data as { ok?: boolean; error?: string } | null;
    if (r.error || !value?.ok) {
      setError(value?.error === "use_existing_account" ? "บัญชีนี้เป็นร้านค้า/ไรเดอร์หรือถูกพักใช้งาน กรุณาใช้บัญชีเดิมหรือติดต่อตัวแทน" : "สมัครไม่สำเร็จ ตรวจชื่อ เบอร์ และตำบล แล้วลองใหม่"); return;
    }
    router.replace(safeNextPath(new URLSearchParams(window.location.search).get("next")) ?? "/liff");
    router.refresh();
  }
  return <div className="mx-auto max-w-md"><h1 className="mb-2 text-2xl font-semibold">สมัครลูกค้า บวรไทย</h1><p className="mb-5 text-sm leading-7 text-ink-soft">สมัครครั้งเดียว ใช้บัญชี LINE เดิมสั่งครั้งต่อไปได้ ชื่อและเบอร์ใช้ติดต่อจัดส่งในตำบลที่คุณเลือก</p>
    {!session.ready ? <Card><p role="status">{session.error || (session.liff.status === "loading" || session.liff.isLoggedIn ? "กำลังตรวจบัญชี LINE…" : "เข้าสู่ระบบด้วย LINE ก่อนสมัคร")}</p><Button className="mt-3" onClick={session.liff.login} disabled={session.liff.status !== "ready"}>เข้าสู่ระบบ LINE</Button>{session.liff.isLoggedIn && !session.liff.getIdToken() && <Button onClick={session.liff.relogin}>อนุญาตบัญชี LINE ใหม่</Button>}<Link className="mt-3 block text-sm underline" href="/login">เข้าสู่ระบบด้วยเบอร์โทร</Link></Card> : <Card><form onSubmit={submit}><Field label="ชื่อสำหรับจัดส่ง"><Input required minLength={2} maxLength={100} autoComplete="name" value={name} onChange={e => setName(e.target.value)} /></Field><Field label="เบอร์โทรติดต่อ"><Input required type="tel" inputMode="tel" autoComplete="tel" maxLength={20} value={phone} onChange={e => setPhone(e.target.value)} /></Field><Field label="ตำบลที่รับอาหาร"><select required className="min-h-12 w-full rounded-xl border border-border bg-surface px-3" value={area} onChange={e => setArea(e.target.value)}><option value="">เลือกตำบล</option>{areas.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field><p className="mb-4 text-xs leading-6 text-ink-soft">ระบบจำข้อมูลบัญชีและจุดส่งที่คุณเลือกไว้ เบอร์นี้ใช้ติดต่อจัดส่ง ไม่ใช่การยืนยันด้วย SMS</p>{error && <p role="alert" className="mb-3 text-sm text-clay">{error}</p>}<Button className="w-full" disabled={busy || !area}>{busy ? "กำลังบันทึก…" : "สมัครและเลือกอาหาร"}</Button></form></Card>}</div>;
}

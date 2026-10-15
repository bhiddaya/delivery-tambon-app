"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLineSession } from "@/lib/use-line-session";
import { createClient } from "@/lib/supabase/client";
import { lineEntryMissingRole, lineEntryPath, type LineEntryRole, type MissingRole } from "@/lib/line-entry";

// ลิงก์เปิดแชท LINE OA พร้อมข้อความสมัครให้ (ผู้ใช้กดส่งเอง)
const OA_APPLY = (text: string) => `https://line.me/R/oaMessage/@227eostj/?${encodeURIComponent(text)}`;
const MISSING: Record<MissingRole, { title: string; text: string; apply: { label: string; href: string } }> = {
  merchant: { title: "บัญชีนี้ยังไม่ได้เป็นร้านค้า", text: "ถ้าต้องการขายของกับบวรไทย สมัครร้านค้าได้ทางแชท LINE", apply: { label: "สมัครร้านค้า", href: OA_APPLY("สมัครร้านค้า") } },
  driver: { title: "บัญชีนี้ยังไม่ได้เป็นไรเดอร์", text: "ถ้าต้องการรับงานส่งของ สมัครไรเดอร์ได้ทางแชท LINE", apply: { label: "สมัครไรเดอร์", href: OA_APPLY("สมัครไรเดอร์") } },
  admin: { title: "บัญชีนี้ยังไม่ได้เป็นตัวแทนตำบล", text: "ตัวแทนตำบลต้องได้รับการแต่งตั้งจากส่วนกลาง ถ้าสนใจเปิดตำบลของคุณ ส่งคำขอได้ที่นี่", apply: { label: "ขอเปิดตำบล / สมัครเป็นตัวแทน", href: "/apply-tambon" } },
};

export default function LineRoleEntry({ requested }: { requested: LineEntryRole }) {
  const { ready, profile, error: sessionError, liff } = useLineSession();
  const [routeError, setRouteError] = useState("");
  const [missing, setMissing] = useState<{ role: MissingRole; home: string } | null>(null);
  const { status, isLoggedIn, login } = liff;

  useEffect(() => {
    if (status === "ready" && !isLoggedIn) login();
  }, [status, isLoggedIn, login]);

  useEffect(() => {
    if (!ready) return;
    let live = true;
    (async () => {
      if (!profile) { window.location.replace("/onboarding"); return; }
      if (profile.suspended_at || !profile.approved) { window.location.replace("/account"); return; }
      let hasAdminScope = false;
      if (requested === "admin" && profile.role !== "admin" && profile.role !== "superadmin") {
        const { count, error } = await createClient().from("admin_scopes")
          .select("id", { count: "exact", head: true }).eq("profile_id", profile.id);
        if (error) throw new Error("ตรวจสิทธิ์ไม่สำเร็จ กรุณาลองอีกครั้ง");
        hasAdminScope = (count ?? 0) > 0;
      }
      // A full navigation reads the exchanged LINE account on the server,
      // rather than keeping a previous browser account's Router Cache.
      const lacking = lineEntryMissingRole(profile.role, requested, hasAdminScope);
      if (lacking) { if (live) setMissing({ role: lacking, home: lineEntryPath(profile.role, "auto", hasAdminScope) }); return; }
      if (live) window.location.replace(lineEntryPath(profile.role, requested, hasAdminScope));
    })().catch(() => { if (live) setRouteError("ตรวจสิทธิ์ไม่สำเร็จ กรุณาลองอีกครั้ง"); });
    return () => { live = false; };
  }, [ready, profile, requested]);

  const needConsent = status === "ready" && isLoggedIn && !liff.getIdToken();
  const error = sessionError || routeError || (status === "error" || status === "disabled" ? "เชื่อมต่อ LINE ไม่สำเร็จ" : "");

  if (missing && !error) {
    const info = MISSING[missing.role];
    return <section className="mx-auto max-w-md rounded-2xl border border-[#e3e5df] bg-white p-6 text-center">
      <h1 className="text-xl font-semibold">{info.title}</h1>
      <p className="mt-4 leading-7">{info.text}</p>
      <a className="mt-5 block rounded-xl bg-[#276b4c] px-5 py-3 text-white" href={info.apply.href}>{info.apply.label}</a>
      <a className="mt-3 block rounded-xl border border-[#e3e5df] px-5 py-3" href={missing.home}>ไปหน้าของฉัน</a>
    </section>;
  }

  return <section className="mx-auto max-w-md rounded-2xl border border-[#e3e5df] bg-white p-6 text-center">
    <h1 className="text-xl font-semibold">เปิดหน้าทำงานของคุณ</h1>
    {error ? <>
      <p className="mt-4" role="alert">{error}</p>
      <button className="mt-5 rounded-xl bg-[#276b4c] px-5 py-3 text-white" onClick={() => window.location.reload()}>ลองอีกครั้ง</button>
    </> : needConsent ? <>
      <p className="mt-4">อนุญาตให้ LINE ยืนยันบัญชีของคุณก่อนใช้งานครั้งแรก</p>
      <button className="mt-5 rounded-xl bg-[#276b4c] px-5 py-3 text-white" onClick={liff.relogin}>อนุญาตผ่าน LINE</button>
    </> : <p className="mt-4" role="status">กำลังยืนยันบัญชี LINE และเปิดหน้าตามสิทธิ์…</p>}
    {(error || needConsent) && <p className="mt-5 text-sm"><Link href="/login" className="underline">เข้าด้วยอีเมลหรือเบอร์โทร</Link></p>}
  </section>;
}

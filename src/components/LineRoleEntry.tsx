"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLineSession } from "@/lib/use-line-session";
import { createClient } from "@/lib/supabase/client";
import { lineEntryPath, type LineEntryRole } from "@/lib/line-entry";

export default function LineRoleEntry({ requested }: { requested: LineEntryRole }) {
  const { ready, profile, error: sessionError, liff } = useLineSession();
  const [routeError, setRouteError] = useState("");
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
      if (live) window.location.replace(lineEntryPath(profile.role, requested, hasAdminScope));
    })().catch(() => { if (live) setRouteError("ตรวจสิทธิ์ไม่สำเร็จ กรุณาลองอีกครั้ง"); });
    return () => { live = false; };
  }, [ready, profile, requested]);

  const needConsent = status === "ready" && isLoggedIn && !liff.getIdToken();
  const error = sessionError || routeError || (status === "error" || status === "disabled" ? "เชื่อมต่อ LINE ไม่สำเร็จ" : "");

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

"use client";
import { useEffect, useState } from "react";
import { BaseLink } from "@/lib/liff-base";
import { useLineSession } from "@/lib/use-line-session";
import { createClient } from "@/lib/supabase/client";
import { lineOaTextLink } from "@/lib/tambon-links";
import { Button, Card } from "@/components/ui";

const ERRORS: Record<string, string> = {
  bad_code: "ลิงก์แนะนำนี้ใช้ไม่ได้ กรุณาขอลิงก์ใหม่จากผู้แนะนำ",
  self: "นี่คือลิงก์แนะนำของคุณเอง ส่งให้คนอื่นเปิดนะครับ",
  already_member: "คุณเป็นสมาชิกบวรไทยอยู่แล้ว ลิงก์แนะนำใช้กับสมาชิกใหม่เท่านั้น",
  line_login_required: "เข้าสู่ระบบด้วย LINE ก่อน",
};

/** เปิดจากลิงก์/QR แนะนำ (/liff/ref?c=CODE): ผูกบัญชี LINE นี้กับผู้แนะนำ (คนแรกเท่านั้น) แล้วพาไปสมัคร */
export default function ReferralLanding() {
  const session = useLineSession();
  const { status, isLoggedIn, login } = session.liff;
  const [result, setResult] = useState<{ ok?: boolean; already?: boolean; same?: boolean; error?: string } | null>(null);

  useEffect(() => {
    if (status === "ready" && !isLoggedIn) login();
  }, [status, isLoggedIn, login]);

  useEffect(() => {
    if (!session.ready) return;
    const code = new URLSearchParams(window.location.search).get("c") ?? "";
    createClient().rpc("referral_claim", { p_code: code }).then(r =>
      setResult(r.error ? { error: "failed" } : (r.data as typeof result)));
  }, [session.ready]);

  const linked = result?.ok && (!result.already || result.same);
  return <div className="mx-auto max-w-md"><h1 className="mb-2 text-2xl font-semibold">ยินดีต้อนรับสู่บวรไทย</h1>
    <Card>
      {!result ? <p role="status">{session.error || "กำลังตรวจบัญชี LINE…"}</p>
        : linked ? <p>บันทึกผู้แนะนำของคุณแล้ว สมัครเป็นลูกค้า ร้านค้า หรือไรเดอร์ได้เลย</p>
        : result.ok ? <p>บัญชีนี้มีผู้แนะนำอยู่แล้ว (นับผู้แนะนำคนแรกเท่านั้น) สมัครหรือใช้งานต่อได้ตามปกติ</p>
        : <p role="alert">{ERRORS[result.error ?? ""] ?? "บันทึกผู้แนะนำไม่สำเร็จ ลองเปิดลิงก์ใหม่อีกครั้ง"}</p>}
      {result && <div className="mt-4 grid gap-2">
        <BaseLink href="/register" className="block"><Button className="w-full">สมัครลูกค้า / สั่งอาหาร</Button></BaseLink>
        <a href={lineOaTextLink("สมัครร้านค้า")} className="block text-center text-sm underline">สมัครร้านค้า</a>
        <a href={lineOaTextLink("สมัครไรเดอร์")} className="block text-center text-sm underline">สมัครไรเดอร์</a>
      </div>}
    </Card></div>;
}

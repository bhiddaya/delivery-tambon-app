"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLiff } from "@/components/LiffProvider";
import { linkLineToCurrentAccount, LineSignInError } from "@/lib/line-login";
import { Button, Card } from "@/components/ui";

/**
 * การ์ด "ผูกบัญชี LINE" สำหรับคนที่สมัครด้วยเบอร์/อีเมลไว้ก่อน
 *
 * ผูกแล้วได้สองอย่าง — รับแจ้งเตือนงานเข้าแชท LINE ได้ และครั้งต่อไป
 * กดปุ่ม LINE เข้าบัญชีเดิมได้เลยโดยไม่ต้องจำรหัสผ่าน
 *
 * ซ่อนตัวเองถ้า LIFF ใช้ไม่ได้ ด้วยเหตุผลเดียวกับปุ่มล็อกอิน:
 * โชว์ปุ่มที่กดแล้วไม่มีอะไรเกิดขึ้นสร้างความสับสนมากกว่าไม่โชว์เลย
 */
export default function LinkLineCard({ linked }: { linked: boolean }) {
  const router = useRouter();
  const { status, isLoggedIn, login, getIdToken } = useLiff();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (status === "disabled" || status === "error") return null;

  if (linked && !done) {
    return (
      <Card>
        <p className="font-head font-semibold mb-1">ผูกบัญชี LINE แล้ว</p>
        <p className="text-ink-soft text-sm">
          คุณจะได้รับแจ้งเตือนงานทางแชท LINE และเข้าสู่ระบบด้วยปุ่ม LINE ได้เลยโดยไม่ต้องกรอกรหัสผ่าน
        </p>
      </Card>
    );
  }

  async function handleClick() {
    setError(null);

    if (!isLoggedIn) {
      // ยังไม่ได้ล็อกอิน LINE — พาไปล็อกอินก่อน หน้าจะโหลดใหม่แล้วกลับมาที่เดิม
      login();
      return;
    }

    const idToken = getIdToken();
    if (!idToken) {
      setError("ไม่ได้รับข้อมูลยืนยันจาก LINE กรุณาลองใหม่");
      return;
    }

    setBusy(true);
    try {
      const result = await linkLineToCurrentAccount(idToken);
      setDone(result.displayName ?? "เรียบร้อย");
      router.refresh();
    } catch (err) {
      setError(err instanceof LineSignInError ? err.message : "ผูกบัญชี LINE ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Card>
        <p className="font-head font-semibold mb-1">ผูกบัญชี LINE เรียบร้อย</p>
        <p className="text-ink-soft text-sm">
          ผูกกับบัญชี LINE ชื่อ <span className="text-ink">{done}</span> แล้ว
          ครั้งต่อไปกดปุ่ม LINE ที่หน้าเข้าสู่ระบบได้เลย
        </p>
      </Card>
    );
  }

  const loading = status === "loading" || busy;

  return (
    <Card>
      <p className="font-head font-semibold mb-1">ผูกบัญชี LINE</p>
      <p className="text-ink-soft text-sm mb-3">
        ผูกแล้วจะได้รับแจ้งเตือนงานทางแชท LINE และครั้งต่อไปเข้าสู่ระบบด้วยปุ่ม LINE
        ได้เลย ไม่ต้องจำรหัสผ่าน — รหัสผ่านเดิมยังใช้ได้ตามปกติ
      </p>
      <Button onClick={handleClick} disabled={loading} className="w-full">
        {loading ? "กำลังเชื่อมต่อ LINE..." : "ผูกบัญชี LINE"}
      </Button>
      {error && <p className="mt-2 text-sm text-clay">{error}</p>}
    </Card>
  );
}

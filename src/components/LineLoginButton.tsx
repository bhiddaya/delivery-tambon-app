"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLiff } from "@/components/LiffProvider";
import { signInWithLineIdToken, LineSignInError } from "@/lib/line-login";

/**
 * ปุ่ม "เข้าสู่ระบบด้วย LINE"
 *
 * ตั้งใจให้ **หายไปเงียบ ๆ** ถ้าใช้ไม่ได้ (ยังไม่ได้ตั้ง LIFF ID หรือ LIFF init พัง)
 * แทนที่จะโชว์ปุ่มที่กดแล้วไม่มีอะไรเกิดขึ้น — คนใช้จริงจะสับสนกว่า
 *
 * เปิดในเบราว์เซอร์ธรรมดาก็กดได้ LIFF จะพาไปหน้าล็อกอินของ LINE
 * แล้วเด้งกลับมาที่หน้าเดิม จากนั้น useEffect ของ LiffProvider จะเห็นว่า
 * ล็อกอินแล้ว ผู้ใช้กดปุ่มอีกครั้งก็เข้าได้เลย
 */
export default function LineLoginButton() {
  const router = useRouter();
  const { status, isInClient, isLoggedIn, login, relogin, getIdToken } = useLiff();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ยังไม่ได้ตั้ง LIFF ID หรือ init ไม่ผ่าน — ไม่ต้องโชว์ปุ่มที่ใช้ไม่ได้
  if (status === "disabled" || status === "error") return null;

  async function handleClick() {
    setError(null);

    if (!isLoggedIn) {
      // พาไปล็อกอิน LINE ก่อน — หน้าจะโหลดใหม่แล้วกลับมาที่เดิม
      login();
      return;
    }

    const idToken = getIdToken();
    if (!idToken) {
      // ดูคำอธิบายเดียวกันใน LinkLineCard — ยังไม่ได้อนุญาต scope `openid`
      if (isInClient) {
        setError(
          "ต้องกดอนุญาตให้ LINE แชร์ชื่อโปรไฟล์ก่อน — ปิดหน้านี้แล้วเปิดใหม่จากลิงก์ของแอป LINE ระบบจะขึ้นหน้าขออนุญาตให้กด"
        );
      } else {
        relogin();
      }
      return;
    }

    setBusy(true);
    try {
      const result = await signInWithLineIdToken(idToken);
      // ยังไม่มีโปรไฟล์ = เข้าครั้งแรก ต้องบอกก่อนว่าจะใช้งานแบบไหน
      router.push(result.hasProfile ? "/" : "/onboarding");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof LineSignInError ? err.message : "เข้าสู่ระบบด้วย LINE ไม่สำเร็จ"
      );
    } finally {
      setBusy(false);
    }
  }

  const loading = status === "loading" || busy;

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#06C755] px-4 py-3 font-head font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
      >
        <LineGlyph className="h-5 w-5" />
        {loading ? "กำลังเชื่อมต่อ LINE..." : "เข้าสู่ระบบด้วย LINE"}
      </button>
      <p className="mt-2 text-center text-xs text-ink-soft">ไม่ต้องจำรหัสผ่าน</p>
      {error && <p className="mt-2 text-center text-sm text-clay">{error}</p>}
    </div>
  );
}

/** โลโก้ LINE แบบเรียบ — วาดเองด้วย path เดียว ไม่ต้องโหลดไฟล์ภาพ */
function LineGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2C6.48 2 2 5.7 2 10.26c0 4.09 3.55 7.51 8.35 8.16.33.07.77.22.88.5.1.26.07.66.03.92l-.14.85c-.04.25-.2.99.87.54 1.07-.45 5.76-3.39 7.86-5.81C21.3 13.79 22 12.1 22 10.26 22 5.7 17.52 2 12 2ZM8.28 12.9H6.29a.53.53 0 0 1-.53-.53V8.4c0-.29.24-.53.53-.53s.53.24.53.53v3.44h1.46c.29 0 .53.24.53.53s-.24.53-.53.53Zm2.08-.53a.53.53 0 0 1-1.05 0V8.4a.53.53 0 0 1 1.05 0v3.97Zm4.78 0a.53.53 0 0 1-.95.32l-2.04-2.77v2.45a.53.53 0 0 1-1.05 0V8.4a.53.53 0 0 1 .95-.32l2.04 2.78V8.4a.53.53 0 0 1 1.05 0v3.97Zm3.2-2.51c.29 0 .53.24.53.53s-.24.52-.53.52h-1.46v.93h1.46c.29 0 .53.24.53.53s-.24.53-.53.53h-1.99a.53.53 0 0 1-.52-.53V8.4c0-.29.23-.53.52-.53h1.99c.29 0 .53.24.53.53s-.24.53-.53.53h-1.46v.93h1.46Z" />
    </svg>
  );
}

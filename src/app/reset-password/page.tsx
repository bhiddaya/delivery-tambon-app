"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input, Card } from "@/components/ui";
import { AuthFrame } from "@/components/AuthFrame";

/**
 * ปลายทางของลิงก์ "ตั้งรหัสผ่านใหม่" ที่ส่งไปทางอีเมล
 *
 * ลิงก์จาก Supabase พาผู้ใช้มาที่นี่พร้อม `?code=...` แล้ว browser client
 * (detectSessionInUrl) จะแลกเป็น session ให้เองเบื้องหลัง เราจึงไม่แลกเอง
 * — แลกซ้ำจะพังเพราะโค้ดใช้ได้ครั้งเดียว — แต่รอฟังผลผ่าน onAuthStateChange
 * และเช็ค getSession ควบคู่ไป เผื่อจังหวะที่การแลกเสร็จก่อนเราจะ subscribe ทัน
 *
 * session ที่ได้จากลิงก์นี้เป็น session เต็ม ผู้ใช้ล็อกอินอยู่แล้วตั้งแต่เปิดหน้า
 * ถ้าปิดหน้าไปเฉย ๆ โดยไม่ตั้งรหัสใหม่ ก็ยังใช้งานต่อได้ตามปกติ
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState<"checking" | "ok" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let settled = false;

    // ลิงก์หมดอายุหรือถูกใช้ไปแล้ว Supabase ส่งกลับมาเป็น error ใน hash
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const query = new URLSearchParams(window.location.search);
    const errDesc = hash.get("error_description") ?? query.get("error_description");
    if (errDesc) {
      // อ่าน window ตอน render ไม่ได้ (หน้านี้ prerender เป็น static) จึงต้อง
      // ตั้งค่าที่นี่ ครั้งเดียวตอน mount — ไม่ใช่ cascading render ที่กฎนี้กันอยู่
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot check of the URL on mount
      setReady("invalid");
      return;
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session && !settled) {
        settled = true;
        setReady("ok");
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session && !settled) {
        settled = true;
        setReady("ok");
      }
    });

    // ให้เวลาการแลกโค้ดทำงานสักครู่ก่อนตัดสินว่าลิงก์ใช้ไม่ได้
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        setReady("invalid");
      }
    }, 4000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร");
      return;
    }
    if (password !== confirm) {
      setError("รหัสผ่านสองช่องไม่ตรงกัน");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    setDone(true);
    setTimeout(() => {
      router.push("/");
      router.refresh();
    }, 1500);
  }

  return (
    <AuthFrame>
      <div className="text-center mb-6">
        <h1 className="font-display text-3xl text-indigo">ตั้งรหัสผ่านใหม่</h1>
      </div>

      <Card>
        {ready === "checking" && <p className="text-ink-soft text-sm">กำลังตรวจสอบลิงก์...</p>}

        {ready === "invalid" && (
          <>
            <p className="font-head font-semibold mb-2">ลิงก์นี้ใช้ไม่ได้แล้ว</p>
            <p className="text-ink-soft text-sm mb-4">
              ลิงก์ตั้งรหัสใหม่ใช้ได้ครั้งเดียวและมีอายุจำกัด ถ้ากดช้าไปหรือกดซ้ำ
              ให้ขอลิงก์ใหม่อีกครั้ง
            </p>
            <Link href="/forgot-password">
              <Button className="w-full">ขอลิงก์ใหม่</Button>
            </Link>
          </>
        )}

        {ready === "ok" &&
          (done ? (
            <>
              <p className="font-head font-semibold mb-1">เปลี่ยนรหัสผ่านแล้ว</p>
              <p className="text-ink-soft text-sm">กำลังพาเข้าสู่ระบบ...</p>
            </>
          ) : (
            <form onSubmit={handleSubmit}>
              <Field label="รหัสผ่านใหม่">
                <Input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="อย่างน้อย 8 ตัวอักษร"
                />
              </Field>
              <Field label="พิมพ์รหัสผ่านใหม่อีกครั้ง">
                <Input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                />
              </Field>
              {error && <p className="text-clay text-sm mb-3">{error}</p>}
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "กำลังบันทึก..." : "บันทึกรหัสผ่านใหม่"}
              </Button>
            </form>
          ))}
      </Card>
    </AuthFrame>
  );
}

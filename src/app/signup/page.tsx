"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { resolveIdentifier, formatPhoneLocal } from "@/lib/identifier";
import { Button, Field, Input, Card } from "@/components/ui";
import { AuthFrame } from "@/components/AuthFrame";

export default function SignupPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // ใช้ช่องเดียวกับหน้าเข้าสู่ระบบ เพื่อให้ "สมัครด้วยอะไร ก็เข้าด้วยอันนั้น"
    // ไม่ต้องจำว่าตอนสมัครกรอกอะไรไว้ตรงไหน
    const id = resolveIdentifier(identifier);
    if (id.kind === "invalid") {
      setError("กรุณากรอกเบอร์โทร (เช่น 0812345678) หรืออีเมลให้ถูกต้อง");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email: id.authEmail,
      password,
      // เก็บเบอร์ไว้กับบัญชี เพื่อเติมให้อัตโนมัติในหน้าถัดไป
      options: id.kind === "phone" ? { data: { phone: id.phone } } : undefined,
    });
    setLoading(false);

    if (error) {
      setError(
        /already registered|already exists/i.test(error.message)
          ? id.kind === "phone"
            ? "เบอร์นี้สมัครไว้แล้ว ลองเข้าสู่ระบบแทน"
            : "อีเมลนี้สมัครไว้แล้ว ลองเข้าสู่ระบบแทน"
          : error.message
      );
      return;
    }

    if (data.session) {
      router.push("/onboarding");
      router.refresh();
      return;
    }

    // ไม่มี session แปลว่า Supabase ตั้งให้ต้องยืนยันก่อน
    setNotice(
      id.kind === "phone"
        ? "สมัครแล้ว แต่ระบบยังตั้งค่าให้ต้องยืนยันก่อนเข้าใช้งาน กรุณาแจ้งผู้ดูแลระบบ"
        : "สมัครสำเร็จ! กรุณาตรวจสอบอีเมลเพื่อยืนยันตัวตน จากนั้นกลับมาเข้าสู่ระบบ"
    );
  }

  const preview = resolveIdentifier(identifier);

  return (
    <AuthFrame>
      <div className="text-center mb-6">
        <h1 className="font-display text-3xl text-indigo">บวรไทย ตำบลบุ่งไหม</h1>
        <p className="text-ink-soft text-sm mt-1">สมัครสมาชิกเพื่อเริ่มใช้งาน</p>
      </div>
      <Card>
        {notice ? (
          <div className="text-center">
            <p className="text-ink text-sm mb-4">{notice}</p>
            <Link href="/login">
              <Button className="w-full">ไปหน้าเข้าสู่ระบบ</Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <Field label="เบอร์โทร หรือ อีเมล">
              <Input
                type="text"
                required
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="0812345678"
              />
            </Field>

            {/* บอกให้เห็นทันทีว่าระบบเข้าใจสิ่งที่พิมพ์ว่าอะไร กันพิมพ์ผิดแล้วรู้ตอนหลัง */}
            {identifier.trim() !== "" && (
              <p className="text-xs -mt-2 mb-3 text-ink-soft">
                {preview.kind === "phone"
                  ? `จะสมัครด้วยเบอร์ ${formatPhoneLocal(preview.phone)}`
                  : preview.kind === "email"
                    ? `จะสมัครด้วยอีเมล ${preview.authEmail}`
                    : "ยังอ่านไม่ออกว่าเป็นเบอร์หรืออีเมล"}
              </p>
            )}

            <Field label="รหัสผ่าน (อย่างน้อย 6 ตัวอักษร)">
              <Input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </Field>
            {error && <p className="text-clay text-sm mb-3">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "กำลังสมัคร..." : "สมัครสมาชิก"}
            </Button>
            <p className="text-xs text-ink-soft mt-3">
              ไม่มีอีเมลก็สมัครได้ ใช้เบอร์โทรอย่างเดียวพอ
              <br />
              ขั้นตอนถัดไปคุณจะเลือกได้ว่าจะเป็นลูกค้า ไรเดอร์ หรือร้านค้า
            </p>
          </form>
        )}
      </Card>
      <p className="text-center text-sm text-ink-soft mt-4">
        มีบัญชีแล้ว?{" "}
        <Link href="/login" className="text-indigo font-semibold">
          เข้าสู่ระบบ
        </Link>
      </p>
    </AuthFrame>
  );
}

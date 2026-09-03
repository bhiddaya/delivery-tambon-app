"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input, Card } from "@/components/ui";
import { AuthFrame } from "@/components/AuthFrame";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data.session) {
      router.push("/onboarding");
      router.refresh();
    } else {
      setNotice(
        "สมัครสำเร็จ! กรุณาตรวจสอบอีเมลเพื่อยืนยันตัวตน จากนั้นกลับมาเข้าสู่ระบบ"
      );
    }
  }

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
            <Field label="อีเมล">
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </Field>
            <Field label="รหัสผ่าน (อย่างน้อย 6 ตัวอักษร)">
              <Input
                type="password"
                required
                minLength={6}
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

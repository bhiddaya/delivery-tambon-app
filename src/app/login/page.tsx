"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { resolveIdentifier } from "@/lib/identifier";
import { Button, Field, Input, Card } from "@/components/ui";
import { AuthFrame } from "@/components/AuthFrame";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // ตัดสินจากสิ่งที่ผู้ใช้พิมพ์ว่าเป็นเบอร์หรืออีเมล แล้วแปลงเป็นอีเมลที่ auth ใช้
    const id = resolveIdentifier(identifier);
    if (id.kind === "invalid") {
      setError("กรุณากรอกเบอร์โทร (เช่น 0812345678) หรืออีเมลให้ถูกต้อง");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: id.authEmail,
      password,
    });
    setLoading(false);

    if (error) {
      const wrongCredentials = /invalid login/i.test(error.message);
      setError(
        wrongCredentials
          ? id.kind === "phone"
            ? "เบอร์โทรหรือรหัสผ่านไม่ถูกต้อง"
            : "อีเมลหรือรหัสผ่านไม่ถูกต้อง"
          : error.message
      );
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <AuthFrame>
      <div className="text-center mb-6">
        <h1 className="font-display text-3xl text-indigo">บวรไทย ตำบลบุ่งไหม</h1>
        <p className="text-ink-soft text-sm mt-1">เข้าสู่ระบบเพื่อสั่ง/รับงานในตำบลของคุณ</p>
      </div>
      <Card>
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
          <Field label="รหัสผ่าน">
            <Input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </Field>
          {error && <p className="text-clay text-sm mb-3">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </Button>
          <p className="text-xs text-ink-soft mt-3">
            ใช้อันเดียวกับตอนสมัคร — ถ้าสมัครด้วยเบอร์ ให้กรอกเบอร์
          </p>
        </form>
      </Card>
      <p className="text-center text-sm text-ink-soft mt-4">
        ยังไม่มีบัญชี?{" "}
        <Link href="/signup" className="text-indigo font-semibold">
          สมัครสมาชิก
        </Link>
      </p>
    </AuthFrame>
  );
}

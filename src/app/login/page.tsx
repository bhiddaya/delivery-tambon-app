"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button, Field, Input, Card } from "@/components/ui";
import { AuthFrame } from "@/components/AuthFrame";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(
        error.message.includes("Invalid login")
          ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง"
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
          <Field label="อีเมล">
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </Field>
          <Field label="รหัสผ่าน">
            <Input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </Field>
          {error && <p className="text-clay text-sm mb-3">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </Button>
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

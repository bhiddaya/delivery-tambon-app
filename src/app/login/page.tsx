"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { resolveIdentifier } from "@/lib/identifier";
import { Button, Field, Input, Card } from "@/components/ui";
import { AuthFrame } from "@/components/AuthFrame";
import { TambonHeading } from "@/components/TambonHeading";
import LineLoginButton from "@/components/LineLoginButton";
import { nextParam } from "@/lib/next-path";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const next = nextParam();

    // เคยเข้าสู่ระบบไว้แล้ว ก็ไปต่อทันที ไม่ต้องกรอกอีก
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (data.user) router.replace(next ?? "/");
      });
  }, [router]);

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

    router.push(nextParam() ?? "/");
    router.refresh();
  }

  return (
    <AuthFrame>
      <div className="text-center mb-6">
        <TambonHeading />
        <p className="text-ink-soft text-sm mt-1">เข้าสู่ระบบเพื่อสั่ง/รับงานในตำบลของคุณ</p>
      </div>

      {/* ลูกค้า: กดปุ่ม LINE ครั้งเดียวก็เข้าได้เลย ไม่ต้องมีรหัสผ่าน */}
      <Card>
        <p className="font-head font-semibold text-sm">ลูกค้า</p>
        <p className="text-ink-soft text-xs mt-0.5">กดปุ่มด้านล่างครั้งเดียว เข้าได้เลย</p>
        <LineLoginButton />
      </Card>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="font-head text-xs text-ink-soft">ตัวแทน ร้านค้า ไรเดอร์ หรือผู้ดูแล</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      {/* หน้าหลังบ้าน (ตัวแทน ร้านค้า ไรเดอร์ ผู้ดูแล): เข้าด้วยเบอร์หรืออีเมลกับรหัสผ่านเท่านั้น */}
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
          <div className="mt-3 flex items-baseline justify-between gap-3">
            <p className="text-xs text-ink-soft">
              ใช้อันเดียวกับตอนสมัคร — ถ้าสมัครด้วยเบอร์ ให้กรอกเบอร์
            </p>
            <Link href="/forgot-password" className="shrink-0 text-xs font-semibold text-indigo">
              ลืมรหัสผ่าน?
            </Link>
          </div>
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

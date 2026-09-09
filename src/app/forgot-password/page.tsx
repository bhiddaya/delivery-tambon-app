"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { resolveIdentifier, formatPhoneLocal } from "@/lib/identifier";
import { Button, Field, Input, Card } from "@/components/ui";
import { AuthFrame } from "@/components/AuthFrame";

/**
 * "ลืมรหัสผ่าน" — แยกทางตามว่าผู้ใช้สมัครด้วยอีเมลจริงหรือด้วยเบอร์
 *
 * คนที่สมัครด้วยเบอร์ได้อีเมลแฝง `<เบอร์>@phone.invalid` ซึ่งเป็นโดเมนที่
 * สงวนไว้ว่าไม่มีอยู่จริง (RFC 2606) — ส่งเมลไปไม่มีวันถึง และเราก็ไม่มี
 * ผู้ให้บริการ SMS ให้ส่ง OTP ด้วย (ดูเหตุผลใน lib/identifier.ts)
 *
 * เพราะฉะนั้นสำหรับคนกลุ่มนี้ "ส่งลิงก์รีเซ็ต" คือคำโกหก หน้านี้จึงบอกตรง ๆ
 * ว่าส่งไม่ได้ แล้วชี้ทางที่ใช้ได้จริงสองทางแทน — ซึ่งดีกว่าปุ่มที่กดแล้ว
 * ขึ้นว่า "ส่งแล้ว" ทั้งที่ไม่มีอะไรถูกส่ง แล้วปล่อยให้เขานั่งรอ SMS ทั้งวัน
 */
export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [phoneUser, setPhoneUser] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSentTo(null);
    setPhoneUser(null);

    const id = resolveIdentifier(identifier);
    if (id.kind === "invalid") {
      setError("กรุณากรอกเบอร์โทร (เช่น 0812345678) หรืออีเมลให้ถูกต้อง");
      return;
    }

    if (id.kind === "phone") {
      setPhoneUser(formatPhoneLocal(id.phone));
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(id.authEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    // ไม่บอกว่าอีเมลนี้มีบัญชีอยู่จริงหรือไม่ — บอกไปเท่ากับให้คนภายนอก
    // ไล่เดาว่าใครเป็นสมาชิกบ้าง Supabase เองก็ตอบสำเร็จทั้งสองกรณีอยู่แล้ว
    setSentTo(id.authEmail);
  }

  return (
    <AuthFrame>
      <div className="text-center mb-6">
        <h1 className="font-display text-3xl text-indigo">ลืมรหัสผ่าน</h1>
        <p className="text-ink-soft text-sm mt-1">กรอกสิ่งที่ใช้ตอนสมัคร แล้วเราจะดูให้ว่าทำอะไรได้บ้าง</p>
      </div>

      <Card>
        {sentTo ? (
          <>
            <p className="font-head font-semibold mb-2">ส่งลิงก์ไปที่อีเมลแล้ว</p>
            <p className="text-ink-soft text-sm">
              ถ้ามีบัญชีที่ใช้ <span className="font-semibold text-ink">{sentTo}</span> อยู่จริง
              จะมีอีเมลพร้อมลิงก์ตั้งรหัสใหม่ส่งไปถึง ลิงก์มีอายุจำกัด ถ้าไม่เจอลองดูในกล่องสแปม
            </p>
          </>
        ) : phoneUser ? (
          <>
            <p className="font-head font-semibold mb-2">เบอร์ {phoneUser} — ส่งลิงก์ไม่ได้</p>
            <p className="text-ink-soft text-sm mb-3">
              บัญชีที่สมัครด้วยเบอร์ไม่มีอีเมลให้ส่งถึง และระบบยังไม่มีบริการส่ง SMS
              พูดตรง ๆ คือเราส่งรหัสไปให้คุณทางเบอร์นี้ไม่ได้ แต่ยังมีสองทางที่ใช้ได้จริง
            </p>
            <ol className="text-sm space-y-3 list-decimal list-inside marker:font-head marker:font-semibold marker:text-indigo">
              <li>
                <span className="font-head font-semibold">ถ้าเคยผูกบัญชี LINE ไว้</span> — กลับไปหน้า
                เข้าสู่ระบบแล้วกดปุ่ม LINE เข้าได้เลยโดยไม่ต้องใช้รหัสผ่าน เข้าไปแล้วตั้งรหัสใหม่ได้
                ที่หน้า &ldquo;บัญชีของฉัน&rdquo;
              </li>
              <li>
                <span className="font-head font-semibold">ถ้ายังไม่ได้ผูก LINE</span> — ติดต่อตัวแทนตำบล
                ให้ตั้งรหัสชั่วคราวให้ ตัวแทนจะบอกรหัสให้ทางโทรศัพท์ แล้วคุณค่อยเปลี่ยนเองทีหลัง
              </li>
            </ol>
            <Button
              variant="ghost"
              className="w-full mt-4"
              onClick={() => {
                setPhoneUser(null);
                setIdentifier("");
              }}
            >
              กรอกใหม่
            </Button>
          </>
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
            {error && <p className="text-clay text-sm mb-3">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "กำลังส่ง..." : "ต่อไป"}
            </Button>
          </form>
        )}
      </Card>

      <p className="text-center text-sm text-ink-soft mt-4">
        <Link href="/login" className="text-indigo font-semibold">
          กลับไปหน้าเข้าสู่ระบบ
        </Link>
      </p>
    </AuthFrame>
  );
}

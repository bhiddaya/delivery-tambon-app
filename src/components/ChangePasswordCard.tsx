"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Field, Input } from "@/components/ui";

/**
 * ตั้ง/เปลี่ยนรหัสผ่านจากหน้าบัญชี
 *
 * สำคัญกับคนที่สมัครด้วยเบอร์เป็นพิเศษ เพราะเป็นทางเดียวที่เขาตั้งรหัสใหม่เองได้
 * — ส่งลิงก์ทางอีเมลไปไม่ถึง (อีเมลแฝง @phone.invalid) และไม่มี SMS
 * ทางที่ใช้ได้คือเข้าด้วยปุ่ม LINE แล้วมาตั้งรหัสที่นี่ ซึ่งหน้า /forgot-password
 * ชี้มาที่การ์ดนี้โดยตรง
 *
 * ไม่ถามรหัสเดิม เพราะคนที่เข้ามาถึงตรงนี้ได้คือคนที่ถือ session อยู่แล้ว
 * และคนกลุ่มเป้าหมายหลักของช่องนี้คือคนที่ "จำรหัสเดิมไม่ได้" พอดี
 */
export default function ChangePasswordCard() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

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

    setPassword("");
    setConfirm("");
    setDone(true);
    setOpen(false);
  }

  return (
    <Card className="mt-4">
      <p className="font-head font-semibold mb-1">รหัสผ่าน</p>

      {done && !open && (
        <p className="text-sm text-ink-soft mb-3">
          เปลี่ยนรหัสผ่านเรียบร้อยแล้ว ครั้งต่อไปให้ใช้รหัสใหม่ในการเข้าสู่ระบบ
        </p>
      )}

      {!open ? (
        <>
          {!done && (
            <p className="text-ink-soft text-sm mb-3">
              ตั้งรหัสใหม่ได้ที่นี่ ใช้คู่กับเบอร์โทรหรืออีเมลตอนเข้าสู่ระบบ
            </p>
          )}
          <Button variant="ghost" className="w-full" onClick={() => setOpen(true)}>
            {done ? "เปลี่ยนอีกครั้ง" : "ตั้งรหัสผ่านใหม่"}
          </Button>
        </>
      ) : (
        <form onSubmit={handleSubmit} className="mt-3">
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
          <Field label="พิมพ์อีกครั้ง">
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
          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? "กำลังบันทึก..." : "บันทึก"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setOpen(false);
                setError(null);
                setPassword("");
                setConfirm("");
              }}
            >
              ยกเลิก
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

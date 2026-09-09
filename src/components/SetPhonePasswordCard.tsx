"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Field, Input } from "@/components/ui";
import { normalizePhone, phoneToAuthEmail, formatPhoneLocal } from "@/lib/identifier";

/**
 * ตั้งเบอร์ + รหัสผ่านให้บัญชีที่เกิดจากการกดปุ่ม LINE
 *
 * ทำไมต้องมี: บัญชีที่สร้างจาก LINE มีอีเมลแฝงเป็น `<LINE id>@line.invalid`
 * ซึ่งเจ้าตัวไม่รู้และพิมพ์ไม่ได้ จึงไม่มีชื่อบัญชีให้ใช้เข้าระบบด้วยรหัสผ่าน
 * และตามนโยบายของโครงการ หน้าหลังบ้าน (รับงาน ราคาสินค้า เงิน) ต้องเข้าด้วย
 * รหัสผ่านเท่านั้น ไรเดอร์และร้านค้าที่เข้ามาทาง LINE จึงติดอยู่นอกหน้าตัวเอง
 *
 * การ์ดนี้เปลี่ยนอีเมลแฝงจาก `@line.invalid` เป็น `<เบอร์>@phone.invalid`
 * แล้วตั้งรหัสผ่านให้ในคราวเดียว หลังจากนั้นเขาเข้าได้ทั้งสองทาง
 *
 * ⚠️ เงื่อนไขสำคัญ: ต้องมี `line_user_id` ในโปรไฟล์ก่อน
 * เพราะการค้นหาบัญชีตอนกดปุ่ม LINE จะหาจาก line_user_id ก่อน แล้วค่อยหาจาก
 * อีเมลแฝง ถ้าเปลี่ยนอีเมลทั้งที่ยังไม่มี line_user_id ครั้งต่อไปที่กดปุ่ม LINE
 * ระบบจะหาบัญชีเดิมไม่เจอ แล้วสร้างบัญชีใหม่ให้ — กลายเป็นสองบัญชีของคนเดียว
 */
export default function SetPhonePasswordCard({
  lineUserId,
  highlight,
}: {
  lineUserId: string | null;
  highlight: boolean;
}) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const normalized = normalizePhone(phone);
    if (!normalized) {
      setError("กรุณากรอกเบอร์โทรให้ถูกต้อง เช่น 0812345678");
      return;
    }
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
    const authEmail = phoneToAuthEmail(normalized);

    const { data, error: updErr } = await supabase.auth.updateUser({
      email: authEmail,
      password,
    });

    if (updErr) {
      setSaving(false);
      setError(
        /already|exists|registered/i.test(updErr.message)
          ? "เบอร์นี้มีคนใช้แล้ว ถ้าเป็นเบอร์ของคุณเอง แปลว่าคุณมีอีกบัญชีอยู่ กรุณาแจ้งตัวแทนตำบล"
          : updErr.message
      );
      return;
    }

    // ถ้าอีเมลยังไม่เปลี่ยน แปลว่า Supabase ตั้งให้ต้องยืนยันอีเมลก่อน
    // ซึ่งกับอีเมลแฝงที่ส่งจริงไม่ได้ = ค้างถาวร ต้องบอกให้รู้ ไม่ใช่ขึ้นว่าสำเร็จ
    if (data.user?.email !== authEmail) {
      setSaving(false);
      setError(
        "ตั้งรหัสผ่านแล้ว แต่ระบบยังไม่เปลี่ยนชื่อบัญชีเป็นเบอร์ของคุณ " +
          "กรุณาแจ้งผู้ดูแลระบบให้ปิดการยืนยันอีเมล แล้วลองใหม่"
      );
      return;
    }

    // เก็บเบอร์ไว้ในโปรไฟล์ด้วย เพื่อให้ตัวแทนตำบลค้นเจอ และแสดงในหน้าบัญชี
    await supabase.from("profiles").update({ phone: normalized }).eq("id", data.user.id);

    setSaving(false);
    setDone(formatPhoneLocal(normalized));
    router.refresh();
  }

  if (done) {
    return (
      <Card className="mt-4 border-indigo">
        <p className="font-head font-semibold mb-1">ตั้งเบอร์และรหัสผ่านแล้ว</p>
        <p className="text-ink-soft text-sm">
          ครั้งต่อไปเข้าหน้ารับงาน/หน้าร้านของคุณ ให้เข้าสู่ระบบด้วยเบอร์{" "}
          <span className="font-semibold text-ink tabular-nums">{done}</span> กับรหัสผ่านที่เพิ่งตั้ง
          ส่วนปุ่ม LINE ยังใช้ได้เหมือนเดิมสำหรับดูหน้าบ้าน
        </p>
      </Card>
    );
  }

  // ยังไม่ได้ผูก LINE = เปลี่ยนอีเมลตอนนี้จะทำให้กดปุ่ม LINE แล้วได้บัญชีใหม่
  if (!lineUserId) {
    return (
      <Card className="mt-4">
        <p className="font-head font-semibold mb-1">ตั้งเบอร์และรหัสผ่าน</p>
        <p className="text-ink-soft text-sm">
          ยังตั้งไม่ได้ตอนนี้ — ระบบต้องผูกบัญชี LINE ของคุณให้เรียบร้อยก่อน
          กรุณาออกจากระบบแล้วกดปุ่ม LINE เข้าใหม่อีกครั้ง แล้วกลับมาที่หน้านี้
        </p>
      </Card>
    );
  }

  return (
    <Card className={`mt-4 ${highlight ? "border-marigold" : ""}`}>
      <p className="font-head font-semibold mb-1">ตั้งเบอร์และรหัสผ่าน</p>
      <p className="text-ink-soft text-sm mb-3">
        {highlight
          ? "หน้ารับงาน/หน้าร้านของคุณต้องเข้าด้วยเบอร์และรหัสผ่าน ไม่ใช่ปุ่ม LINE — ตั้งที่นี่ครั้งเดียว แล้วใช้ได้ตลอด"
          : "ตั้งไว้เพื่อเข้าหน้ารับงาน/หน้าร้านของตัวเอง ปุ่ม LINE ยังใช้ได้เหมือนเดิม"}
      </p>

      <form onSubmit={handleSubmit}>
        <Field label="เบอร์โทรของคุณ">
          <Input
            type="tel"
            required
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0812345678"
          />
        </Field>
        <Field label="ตั้งรหัสผ่าน">
          <Input
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="อย่างน้อย 8 ตัวอักษร"
          />
        </Field>
        <Field label="พิมพ์รหัสผ่านอีกครั้ง">
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
          {saving ? "กำลังบันทึก..." : "บันทึก"}
        </Button>
      </form>
    </Card>
  );
}

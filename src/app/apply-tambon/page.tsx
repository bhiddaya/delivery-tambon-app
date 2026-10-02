"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Field, Input, Textarea } from "@/components/ui";
import { AuthFrame } from "@/components/AuthFrame";

/**
 * ฟอร์มขอเปิดตำบลใหม่ — ยื่นได้โดยไม่ต้องมีบัญชี (คนจากตำบลที่ยังไม่เปิดสมัครสมาชิกไม่ได้)
 *
 * เขียนลง tambon_applications ด้วยสิทธิ์เดิม: policy tambon_applications_submit ให้ anon insert ได้
 * เมื่อยินยอม PDPA และสถานะเริ่มที่ pending เท่านั้น anon อ่านตารางนี้ไม่ได้ จึง insert แบบไม่ขอแถวคืน
 * ส่วนกลาง (superadmin) อนุมัติผ่าน approve_tambon_application() — ดู
 * supabase/migrations/20260904_tambon_onboarding_and_profiles.sql
 */
export default function ApplyTambonPage() {
  const [form, setForm] = useState({
    tambon_name: "",
    district: "",
    province: "",
    applicant_name: "",
    applicant_phone: "",
    applicant_line: "",
    merchant_count: "",
    driver_count: "",
    note: "",
  });
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!consent) {
      setError("กรุณายินยอมให้เก็บข้อมูลเพื่อติดต่อกลับก่อนส่ง");
      return;
    }
    const phone = form.applicant_phone.replace(/\D/g, "");
    if (phone.length < 9 || phone.length > 10) {
      setError("กรุณากรอกเบอร์โทรให้ถูกต้อง (เช่น 0812345678)");
      return;
    }
    const count = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.floor(Number(v)) || 0));

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from("tambon_applications").insert({
      tambon_name: form.tambon_name.trim(),
      district: form.district.trim(),
      province: form.province.trim(),
      applicant_name: form.applicant_name.trim(),
      applicant_phone: phone,
      applicant_line: form.applicant_line.trim() || null,
      merchant_count: count(form.merchant_count),
      driver_count: count(form.driver_count),
      details: form.note.trim() ? { note: form.note.trim() } : {},
      pdpa_consent: true,
      status: "pending",
    });
    setLoading(false);

    if (error) {
      setError(
        error.code === "23505"
          ? "ตำบลนี้มีใบขอเปิดที่รอพิจารณาอยู่แล้ว ส่วนกลางจะติดต่อกลับ"
          : "ส่งไม่สำเร็จ กรุณาลองใหม่อีกครั้ง หรือติดต่อส่วนกลาง"
      );
      return;
    }
    setDone(true);
  }

  return (
    <AuthFrame maxWidth="max-w-md">
      <div className="text-center mb-6">
        <h1 className="font-display text-3xl text-indigo">ขอเปิดตำบลใหม่</h1>
        <p className="text-ink-soft text-sm mt-1">บวรไทย · ส่งของ สั่งอาหาร ในตำบลของคุณ</p>
      </div>
      <Card>
        {done ? (
          <div className="text-center">
            <p className="text-ink text-sm mb-2">ส่งใบขอเปิดตำบลเรียบร้อยแล้ว</p>
            <p className="text-ink-soft text-sm mb-4">
              ส่วนกลางจะตรวจสอบและติดต่อกลับทางเบอร์โทรที่ให้ไว้
            </p>
            <Link href="/">
              <Button className="w-full">กลับหน้าแรก</Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <Field label="ชื่อตำบล">
              <Input required value={form.tambon_name} onChange={set("tambon_name")} placeholder="เช่น บุ่งไหม" />
            </Field>
            <Field label="อำเภอ">
              <Input required value={form.district} onChange={set("district")} />
            </Field>
            <Field label="จังหวัด">
              <Input required value={form.province} onChange={set("province")} />
            </Field>
            <Field label="ชื่อผู้ยื่น (ตัวแทนตำบล)">
              <Input required value={form.applicant_name} onChange={set("applicant_name")} />
            </Field>
            <Field label="เบอร์โทรติดต่อ">
              <Input
                required
                inputMode="tel"
                autoComplete="tel"
                value={form.applicant_phone}
                onChange={set("applicant_phone")}
                placeholder="0812345678"
              />
            </Field>
            <Field label="LINE ID (ถ้ามี)">
              <Input value={form.applicant_line} onChange={set("applicant_line")} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="ร้านที่พร้อมเข้าร่วม (ประมาณ)">
                <Input type="number" min={0} inputMode="numeric" value={form.merchant_count} onChange={set("merchant_count")} />
              </Field>
              <Field label="ไรเดอร์ที่พร้อม (ประมาณ)">
                <Input type="number" min={0} inputMode="numeric" value={form.driver_count} onChange={set("driver_count")} />
              </Field>
            </div>
            <Field label="รายละเอียดเพิ่มเติม">
              <Textarea rows={3} value={form.note} onChange={set("note")} />
            </Field>
            <label className="flex items-start gap-2 text-sm text-ink mb-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                ยินยอมให้บวรไทยเก็บชื่อและเบอร์โทรนี้ เพื่อพิจารณาและติดต่อกลับเรื่องการเปิดตำบลเท่านั้น
              </span>
            </label>
            {error && <p className="text-clay text-sm mb-3">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "กำลังส่ง..." : "ส่งใบขอเปิดตำบล"}
            </Button>
          </form>
        )}
      </Card>
    </AuthFrame>
  );
}

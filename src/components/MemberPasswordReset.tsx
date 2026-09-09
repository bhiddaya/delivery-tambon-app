"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Field, Input } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/domain";
import { formatPhoneLocal, normalizePhone } from "@/lib/identifier";
import type { Tables } from "@/lib/types";

/**
 * ตัวแทนตำบลตั้งรหัสชั่วคราวให้สมาชิกที่ลืมรหัสและยังไม่ได้ผูก LINE
 *
 * ค้นหาได้เฉพาะคนที่ RLS ยอมให้เห็นอยู่แล้ว — ตัวแทนตำบลจะเจอเฉพาะคนใน
 * ตำบลตัวเอง ไม่ต้องกรอง tambon_id ที่นี่ ปล่อยให้ฐานข้อมูลเป็นคนตัดสิน
 *
 * รหัสที่ได้แสดงครั้งเดียวแล้วหายไป ไม่ถูกเก็บที่ไหน ถ้าตัวแทนพลาดไม่ได้จด
 * ก็แค่กดใหม่ ซึ่งปลอดภัยกว่าการเก็บรหัสไว้ให้เปิดดูย้อนหลังได้
 */
export default function MemberPasswordReset() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Tables<"profiles">[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ id: string; name: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIssued(null);

    const term = query.trim();
    if (term.length < 3) {
      setError("พิมพ์อย่างน้อย 3 ตัวอักษร (ชื่อ หรือ เบอร์โทร)");
      return;
    }

    // ถ้าพิมพ์เป็นเบอร์ ให้ค้นด้วยรูปแบบมาตรฐานที่เก็บจริงในฐานข้อมูล
    // ไม่งั้นคนพิมพ์ 081-234-5678 จะหาไม่เจอทั้งที่มีอยู่
    const asPhone = normalizePhone(term);
    const pattern = asPhone ? `%${asPhone}%` : `%${term}%`;

    setSearching(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .or(`full_name.ilike.${pattern},phone.ilike.${pattern}`)
      .limit(20);
    setSearching(false);

    if (error) {
      setError(error.message);
      return;
    }
    setResults(data ?? []);
  }

  async function reset(profile: Tables<"profiles">) {
    setError(null);
    setIssued(null);
    setBusyId(profile.id);

    const res = await fetch("/api/admin/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: profile.id }),
    });
    setBusyId(null);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(
        body?.error === "use_account_page"
          ? "นี่คือบัญชีของคุณเอง ให้ไปตั้งรหัสใหม่ที่หน้า “บัญชีของฉัน”"
          : "ตั้งรหัสใหม่ไม่สำเร็จ ลองอีกครั้ง หรือแจ้งส่วนกลางถ้ายังไม่ได้"
      );
      return;
    }

    const { password } = await res.json();
    setIssued({ id: profile.id, name: profile.full_name, password });
  }

  return (
    <Card className="mb-4">
      <p className="font-head font-semibold mb-1">ตั้งรหัสชั่วคราวให้สมาชิก</p>
      <p className="text-ink-soft text-sm mb-3">
        ใช้กับคนที่ลืมรหัสและสมัครด้วยเบอร์ — ระบบส่งลิงก์ทางอีเมลไปหาเขาไม่ได้
        ถ้าเขาผูกบัญชี LINE ไว้แล้ว ให้เขากดปุ่ม LINE เข้าเองดีกว่า ไม่ต้องใช้ช่องนี้
      </p>

      <form onSubmit={search}>
        <Field label="ค้นหาด้วยชื่อ หรือ เบอร์โทร">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="สมชาย หรือ 0812345678"
          />
        </Field>
        <Button type="submit" variant="ghost" className="w-full" disabled={searching}>
          {searching ? "กำลังค้นหา..." : "ค้นหา"}
        </Button>
      </form>

      {error && <p className="text-clay text-sm mt-3">{error}</p>}

      {issued && (
        <div className="mt-4 rounded-xl border border-marigold bg-surface-2 p-3">
          <p className="font-head font-semibold text-sm mb-1">รหัสชั่วคราวของ {issued.name}</p>
          <p className="font-mono text-xl tracking-widest tabular-nums my-2 select-all">
            {issued.password}
          </p>
          <p className="text-ink-soft text-xs">
            บอกรหัสนี้ให้เจ้าตัวทางโทรศัพท์ แล้วบอกให้เขาเข้าระบบและเปลี่ยนรหัสเองทันที
            ที่หน้า &ldquo;บัญชีของฉัน&rdquo; — รหัสนี้แสดงครั้งเดียว ปิดหน้าไปแล้วดูย้อนหลังไม่ได้
          </p>
        </div>
      )}

      {results !== null && (
        <div className="mt-4">
          {results.length === 0 ? (
            <p className="text-ink-soft text-sm">ไม่พบสมาชิกที่ตรงกับที่ค้นหา</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {results.map((p) => {
                const phone = p.phone ? normalizePhone(p.phone) : null;
                return (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
                  >
                    <div className="min-w-0">
                      <p className="font-head font-semibold text-sm truncate">{p.full_name}</p>
                      <p className="text-ink-soft text-xs tabular-nums">
                        {ROLE_LABEL[p.role]}
                        {phone ? ` · ${formatPhoneLocal(phone)}` : ""}
                        {p.line_user_id ? " · ผูก LINE แล้ว" : ""}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      className="shrink-0"
                      onClick={() => reset(p)}
                      disabled={busyId === p.id}
                    >
                      {busyId === p.id ? "กำลังตั้ง..." : "ตั้งรหัสใหม่"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

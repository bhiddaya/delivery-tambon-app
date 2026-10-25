"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { optionalEmail } from "@/lib/identifier";
import { Button, Card, Field, Input } from "@/components/ui";

/** อีเมลติดต่อ (ไม่บังคับ) — แก้ได้เฉพาะแถวของตัวเอง (RLS profiles_update_scoped) */
export function ContactEmailCard({ profileId, initial }: { profileId: string; initial: string | null }) {
  const [value, setValue] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    const email = optionalEmail(value);
    if (email === false) {
      setMsg("รูปแบบอีเมลไม่ถูกต้อง (เว้นว่างได้)");
      return;
    }
    setBusy(true);
    setMsg(null);
    const { data, error } = await createClient()
      .from("profiles")
      .update({ contact_email: email })
      .eq("id", profileId)
      .select("id");
    setBusy(false);
    setMsg(error || !data?.length ? `บันทึกไม่สำเร็จ${error ? `: ${error.message}` : ""}` : "บันทึกแล้ว");
  }

  return (
    <Card className="mb-4">
      <Field label="อีเมลติดต่อ (ไม่บังคับ)">
        <Input type="email" autoComplete="email" value={value} onChange={(e) => setValue(e.target.value)} />
      </Field>
      {msg && <p className="text-sm text-ink mb-2">{msg}</p>}
      <Button onClick={save} disabled={busy}>
        {busy ? "กำลังบันทึก..." : "บันทึกอีเมล"}
      </Button>
    </Card>
  );
}

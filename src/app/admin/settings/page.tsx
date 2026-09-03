"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, Field, Input, PageHeading } from "@/components/ui";
import type { Tables } from "@/lib/types";

export default function AdminSettingsPage() {
  const [tambons, setTambons] = useState<Tables<"tambons">[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase.from("tambons").select("*").order("created_at");
    setTambons(data ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
  }, []);

  function updateField(id: string, field: "name" | "district" | "province", value: string) {
    setTambons((prev) => prev.map((t) => (t.id === id ? { ...t, [field]: value } : t)));
  }

  async function saveTambon(t: Tables<"tambons">) {
    setBusy(true);
    setSaved(false);
    const supabase = createClient();
    await supabase
      .from("tambons")
      .update({ name: t.name, district: t.district, province: t.province })
      .eq("id", t.id);
    setBusy(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div>
      <PageHeading title="ตั้งค่าตำบล" subtitle="แก้ไขชื่อตำบล/อำเภอ/จังหวัดที่ใช้แสดงในระบบ" />
      {tambons.map((t) => (
        <Card key={t.id} className="mb-4">
          <Field label="ชื่อตำบล">
            <Input value={t.name} onChange={(e) => updateField(t.id, "name", e.target.value)} />
          </Field>
          <Field label="อำเภอ">
            <Input value={t.district ?? ""} onChange={(e) => updateField(t.id, "district", e.target.value)} />
          </Field>
          <Field label="จังหวัด">
            <Input value={t.province ?? ""} onChange={(e) => updateField(t.id, "province", e.target.value)} />
          </Field>
          <Button onClick={() => saveTambon(t)} disabled={busy}>
            {saved ? "บันทึกแล้ว ✓" : "บันทึก"}
          </Button>
        </Card>
      ))}
    </div>
  );
}

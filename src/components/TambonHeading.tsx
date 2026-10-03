"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { readChosenTambonSlug, tambonDisplayName } from "@/lib/tambon-choice";

/**
 * หัวข้อหน้าสมัคร/เข้าสู่ระบบ: ชื่อหลัก "บวรไทย" ชื่อเดียว ชื่อตำบลเป็นบรรทัดย่อย
 * (อาจารย์สั่ง 3 ต.ค. 69 — เดิมชื่อตำบลต่อท้ายจนตัดบรรทัดซ้อนกัน)
 * ตำบลมาจากหน้า /t/[slug] ที่ผู้ใช้กดมา ถ้าไม่ได้มาจากหน้าตำบล ไม่แสดงบรรทัดตำบล
 */
export function TambonHeading() {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const slug = readChosenTambonSlug();
    if (!slug) return;
    createClient()
      .from("tambons")
      .select("name")
      .eq("slug", slug)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.name) setLabel(tambonDisplayName(data.name));
      });
  }, []);

  return (
    <div>
      <h1 className="font-display text-3xl text-indigo">บวรไทย</h1>
      {label && <p className="font-head font-semibold text-indigo text-base mt-1">{label}</p>}
    </div>
  );
}

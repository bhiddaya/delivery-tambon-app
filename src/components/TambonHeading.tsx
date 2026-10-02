"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { readChosenTambonSlug, tambonDisplayName } from "@/lib/tambon-choice";

/**
 * หัวข้อ "บวรไทย ตำบล…" ของหน้าสมัคร/เข้าสู่ระบบ — ใช้ชื่อตำบลที่ผู้ใช้กดมาจากหน้า /t/[slug]
 * ถ้าไม่ได้มาจากหน้าตำบล ใช้ชื่อเดิม (ตำบลบุ่งไหม) เหมือนก่อน
 */
export function TambonHeading({ fallback = "ตำบลบุ่งไหม" }: { fallback?: string }) {
  const [label, setLabel] = useState(fallback);

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

  return <h1 className="font-display text-3xl text-indigo">บวรไทย {label}</h1>;
}

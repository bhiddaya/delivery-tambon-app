"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { tambonDisplayName } from "@/lib/tambon-choice";
import type { Tables } from "@/lib/types";

export type Tambon = Tables<"tambons">;

/**
 * ตำบลที่แอดมินเลือกดู — เก็บใน ?t=<slug> ของหน้า เพื่อให้ส่งลิงก์ตรงไปตำบลนั้นได้
 * (เช่น /admin?t=nawa-min) ค่าว่าง = ทุกตำบลที่บัญชีนี้มีสิทธิ์เห็น
 * อ่าน/เขียนผ่าน window.location ตรง ๆ ไม่ใช้ useSearchParams เพื่อไม่ต้องห่อ Suspense
 */
export function useAdminTambon() {
  const [tambons, setTambons] = useState<Tambon[]>([]);
  const [slug, setSlugState] = useState<string>("");

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("t") ?? "";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read ?t= once on mount
    setSlugState(fromUrl);
    createClient()
      .from("tambons")
      .select("*")
      .order("created_at")
      .then(({ data }) => setTambons(data ?? []));
  }, []);

  function setSlug(next: string) {
    setSlugState(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("t", next);
    else url.searchParams.delete("t");
    window.history.replaceState(null, "", url.toString());
  }

  const selected = tambons.find((t) => t.slug === slug) ?? null;
  return { tambons, slug, setSlug, selected };
}

export function tambonName(t: Pick<Tambon, "name"> | null | undefined): string {
  return t ? tambonDisplayName(t.name) : "-";
}

export function AdminTambonPicker({
  tambons,
  slug,
  onChange,
}: {
  tambons: Tambon[];
  slug: string;
  onChange: (slug: string) => void;
}) {
  return (
    <label className="block mb-4">
      <span className="block font-head font-semibold text-[11px] uppercase tracking-wide text-ink-soft mb-1.5">
        ดูตำบล
      </span>
      <select
        value={slug}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-ink outline-none focus:border-indigo"
      >
        <option value="">ทุกตำบล</option>
        {tambons.map((t) => (
          <option key={t.id} value={t.slug ?? ""} disabled={!t.slug}>
            {tambonName(t)}
            {t.district ? ` · ${t.district}` : ""}
            {t.is_active ? "" : " (ยังไม่เปิดบริการ)"}
          </option>
        ))}
      </select>
    </label>
  );
}

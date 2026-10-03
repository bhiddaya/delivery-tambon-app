"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session-context";
import { tambonDisplayName } from "@/lib/tambon-choice";
import type { Tables } from "@/lib/types";

export type Tambon = Tables<"tambons">;

/** เกินจำนวนนี้แสดงช่องค้นหาแทนการเลื่อนหาในรายการยาว (ประเทศไทยมีกว่า 7,000 ตำบล) */
const SEARCH_THRESHOLD = 12;
/** แสดงผลค้นหาไม่เกินเท่านี้ — พิมพ์เพิ่มเพื่อแคบลง */
const MAX_RESULTS = 50;

/**
 * ตำบลที่บัญชีนี้ดูแล: ส่วนกลาง = ทุกตำบล, ตัวแทน = ตำบลใน admin_scopes, admin = ตำบลของตัวเอง
 * (ตาราง tambons อ่านได้ทุกคน จึงต้องกรองเองไม่ให้ตัวแทนเห็นรายชื่อตำบลอื่นทั้งประเทศ)
 */
export function useManagedTambons() {
  const { profile } = useSession();
  const [tambons, setTambons] = useState<Tambon[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      let ids: string[] | null = null;
      if (profile.role !== "superadmin") {
        const { data: scopes } = await supabase.from("admin_scopes").select("tambon_id").eq("profile_id", profile.id);
        const set = new Set((scopes ?? []).map((s) => s.tambon_id).filter(Boolean) as string[]);
        if (profile.tambon_id && profile.role === "admin") set.add(profile.tambon_id);
        ids = [...set];
      }
      let q = supabase.from("tambons").select("*").order("province").order("district").order("name");
      if (ids) q = q.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      const { data } = await q;
      if (!cancelled) setTambons(data ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile.id, profile.role, profile.tambon_id]);

  return tambons;
}

/**
 * ตำบลที่แอดมินเลือกดู — เก็บใน ?t=<slug> ของหน้า เพื่อให้ส่งลิงก์ตรงไปตำบลนั้นได้
 * (เช่น /admin?t=nawa-min) ค่าว่าง = ทุกตำบลที่บัญชีนี้ดูแล · ดูแลตำบลเดียว = เลือกให้อัตโนมัติ
 * อ่าน/เขียนผ่าน window.location ตรง ๆ ไม่ใช้ useSearchParams เพื่อไม่ต้องห่อ Suspense
 */
export function useAdminTambon() {
  const managed = useManagedTambons();
  const tambons = useMemo(() => managed ?? [], [managed]);
  const [slug, setSlugState] = useState<string>("");

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("t") ?? "";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read ?t= once on mount
    setSlugState(fromUrl);
  }, []);

  function setSlug(next: string) {
    setSlugState(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("t", next);
    else url.searchParams.delete("t");
    window.history.replaceState(null, "", url.toString());
  }

  const selected =
    tambons.find((t) => t.slug === slug) ?? (tambons.length === 1 ? tambons[0] : null);
  return { tambons, slug: selected?.slug ?? slug, setSlug, selected };
}

export function tambonName(t: Pick<Tambon, "name"> | null | undefined): string {
  return t ? tambonDisplayName(t.name) : "-";
}

function place(t: Tambon): string {
  return [t.district, t.province].filter(Boolean).join(" · ");
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
  const [query, setQuery] = useState("");
  const selected = tambons.find((t) => t.slug === slug) ?? null;

  // ดูแลตำบลเดียว: แสดงชื่อเฉย ๆ ไม่ต้องเลือก
  if (tambons.length === 1) {
    const t = tambons[0];
    return (
      <div className="mb-4 rounded-lg border border-border bg-surface px-3 py-2.5">
        <span className="block font-head font-semibold text-[11px] uppercase tracking-wide text-ink-soft">ตำบลที่ดูแล</span>
        <span className="text-ink">
          {tambonName(t)}
          {place(t) ? <span className="text-ink-soft text-sm"> · {place(t)}</span> : null}
          {t.is_active ? "" : <span className="text-ink-soft text-sm"> (ยังไม่เปิดบริการ)</span>}
        </span>
      </div>
    );
  }

  if (tambons.length > SEARCH_THRESHOLD) {
    const q = query.trim().toLowerCase();
    const results = q
      ? tambons
          .filter((t) => [t.name, t.district, t.province, t.slug].some((x) => (x ?? "").toLowerCase().includes(q)))
          .slice(0, MAX_RESULTS)
      : [];
    return (
      <div className="mb-4">
        <span className="block font-head font-semibold text-[11px] uppercase tracking-wide text-ink-soft mb-1.5">
          ดูตำบล ({tambons.length.toLocaleString("th-TH")} ตำบลที่ดูแล)
        </span>
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 mb-2">
          <span className="text-ink text-sm truncate">
            {selected ? `${tambonName(selected)} · ${place(selected)}` : "ทุกตำบลที่ดูแล"}
          </span>
          {selected && (
            <button onClick={() => onChange("")} className="text-indigo text-xs font-semibold flex-none">
              ดูทุกตำบล
            </button>
          )}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ค้นหาชื่อตำบล อำเภอ หรือจังหวัด"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-ink outline-none focus:border-indigo"
        />
        {q && (
          <ul className="mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-surface divide-y divide-border">
            {results.map((t) => (
              <li key={t.id}>
                <button
                  disabled={!t.slug}
                  onClick={() => {
                    onChange(t.slug ?? "");
                    setQuery("");
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-ink disabled:opacity-40"
                >
                  {tambonName(t)} <span className="text-ink-soft">· {place(t)}</span>
                  {t.is_active ? "" : <span className="text-ink-soft"> (ยังไม่เปิดบริการ)</span>}
                </button>
              </li>
            ))}
            {results.length === 0 && <li className="px-3 py-2 text-sm text-ink-soft">ไม่พบตำบล</li>}
            {results.length === MAX_RESULTS && (
              <li className="px-3 py-2 text-xs text-ink-soft">แสดง {MAX_RESULTS} รายการแรก พิมพ์เพิ่มเพื่อแคบลง</li>
            )}
          </ul>
        )}
      </div>
    );
  }

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
        <option value="">ทุกตำบลที่ดูแล</option>
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

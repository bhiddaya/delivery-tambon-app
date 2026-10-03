"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/session-context";
import type { OrderRow } from "@/lib/domain";
import type { Tables } from "@/lib/types";
import type { DriverInfo, MerchantInfo } from "@/lib/tambon-admin";

/**
 * ข้อมูลหลังบ้านของตำบลที่ผู้ใช้ดูแล (ตัวแทน = ตำบลที่ได้รับแต่งตั้ง, ส่วนกลาง = ทุกตำบล)
 * RLS บางตารางให้เห็นข้ามตำบลได้ (เช่น ร้านที่เปิดอยู่ หรือคนที่เคยร่วมออเดอร์) จึงกรองด้วยตำบลที่ดูแลซ้ำอีกชั้น
 * selectedId = ตำบลที่เลือกใน AdminTambonPicker (null = ทุกตำบลที่ดูแล)
 */
export function useTambonAdminData(selectedId: string | null) {
  const { profile } = useSession();
  const [scope, setScope] = useState<string[] | "all" | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [settlements, setSettlements] = useState<Tables<"settlements">[]>([]);
  const [merchantRows, setMerchantRows] = useState<Tables<"merchants">[]>([]);
  const [driverRows, setDriverRows] = useState<Tables<"drivers">[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Tables<"profiles">>>({});
  const [menuCounts, setMenuCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    const supabase = createClient();
    let allowed: string[] | "all";
    if (profile.role === "superadmin") {
      allowed = "all";
    } else {
      const { data: scopes } = await supabase.from("admin_scopes").select("tambon_id").eq("profile_id", profile.id);
      const ids = new Set((scopes ?? []).map((s) => s.tambon_id).filter(Boolean) as string[]);
      if (profile.role === "admin" && profile.tambon_id) ids.add(profile.tambon_id);
      allowed = [...ids];
    }
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const [{ data: o }, { data: s }, { data: m }, { data: d }, { data: p }, { data: mi }] = await Promise.all([
      supabase.from("orders").select("*").gte("created_at", since.toISOString()).order("created_at", { ascending: false }),
      supabase.from("settlements").select("*").is("paid_out_at", null),
      supabase.from("merchants").select("*").order("name"),
      supabase.from("drivers").select("*"),
      supabase.from("profiles").select("*"),
      supabase.from("menu_items").select("merchant_id").eq("is_hidden", false),
    ]);
    const counts: Record<string, number> = {};
    (mi ?? []).forEach((x) => (counts[x.merchant_id] = (counts[x.merchant_id] ?? 0) + 1));
    const map: Record<string, Tables<"profiles">> = {};
    (p ?? []).forEach((x) => (map[x.id] = x));
    setScope(allowed);
    setOrders(o ?? []);
    setSettlements(s ?? []);
    setMerchantRows(m ?? []);
    setDriverRows(d ?? []);
    setProfiles(map);
    setMenuCounts(counts);
    setNow(Date.now());
    setLoading(false);
  }, [profile.id, profile.role, profile.tambon_id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
    const supabase = createClient();
    const channel = supabase
      .channel("tambon-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const inScope = useCallback(
    (tambonId: string | null | undefined) => {
      if (!tambonId || scope === null) return false;
      if (selectedId) return tambonId === selectedId && (scope === "all" || scope.includes(tambonId));
      return scope === "all" || scope.includes(tambonId);
    },
    [scope, selectedId]
  );

  return useMemo(() => {
    const merchants: MerchantInfo[] = merchantRows
      .filter((m) => inScope(m.tambon_id))
      .map((m) => ({ merchant: m, profile: profiles[m.profile_id], menuCount: menuCounts[m.id] ?? 0 }));
    const drivers: DriverInfo[] = Object.values(profiles)
      .filter((p) => p.role === "driver" && inScope(p.tambon_id))
      .map((p) => ({ profile: p, driver: driverRows.find((d) => d.profile_id === p.id) }))
      .sort((a, b) => a.profile.full_name.localeCompare(b.profile.full_name, "th"));
    return {
      loading,
      now,
      reload: load,
      orders: orders.filter((o) => inScope(o.tambon_id)),
      settlements: settlements.filter((s) => inScope(s.tambon_id)),
      merchants,
      drivers,
      profiles,
      merchantById: Object.fromEntries(merchantRows.map((m) => [m.id, m])) as Record<string, Tables<"merchants">>,
    };
  }, [loading, now, load, orders, settlements, merchantRows, driverRows, profiles, menuCounts, inScope]);
}

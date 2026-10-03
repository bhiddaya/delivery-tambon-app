"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui";
import { ROLE_LABEL, dateStr } from "@/lib/domain";
import type { Tables } from "@/lib/types";

type Profile = Tables<"profiles">;
type Scope = Tables<"admin_scopes">;

/**
 * ตัวแทนตำบล (ส่วนกลางเท่านั้น) — แต่งตั้ง/ถอดผ่าน tambon_admin_grant / tambon_admin_revoke
 * ตัวแทนยังเป็นร้าน/ไรเดอร์/ลูกค้าได้ตามเดิม (ใช้ admin_scopes ไม่เปลี่ยนบทบาท)
 * ฐานข้อมูลบันทึกทุกครั้งใน admin_actions และปฏิเสธถ้าผู้กดไม่ใช่ส่วนกลาง
 */
export function TambonAgentsCard({ tambonId, tambonLabel }: { tambonId: string; tambonLabel: string }) {
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [people, setPeople] = useState<Record<string, Profile>>({});
  const [candidates, setCandidates] = useState<Profile[]>([]);
  const [pick, setPick] = useState("");
  const [confirm, setConfirm] = useState<{ kind: "grant" | "revoke"; profileId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data: s }, { data: p }] = await Promise.all([
      supabase.from("admin_scopes").select("*").eq("tambon_id", tambonId),
      supabase
        .from("profiles")
        .select("*")
        .eq("tambon_id", tambonId)
        .eq("is_test", false)
        .neq("role", "superadmin")
        .order("full_name"),
    ]);
    const scopeRows = s ?? [];
    const map: Record<string, Profile> = {};
    (p ?? []).forEach((x) => (map[x.id] = x));
    const missing = scopeRows.map((r) => r.profile_id).filter((id) => !map[id]);
    if (missing.length) {
      const { data: extra } = await supabase.from("profiles").select("*").in("id", missing);
      (extra ?? []).forEach((x) => (map[x.id] = x));
    }
    setScopes(scopeRows);
    setPeople(map);
    setCandidates((p ?? []).filter((x) => !scopeRows.some((r) => r.profile_id === x.id)));
  }, [tambonId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
  }, [load]);

  async function run() {
    if (!confirm) return;
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } =
      confirm.kind === "grant"
        ? await supabase.rpc("tambon_admin_grant", {
            p_profile_id: confirm.profileId,
            p_tambon_id: tambonId,
            p_note: "แต่งตั้งจากหน้าตั้งค่า",
          })
        : await supabase.rpc("tambon_admin_revoke", {
            p_profile_id: confirm.profileId,
            p_tambon_id: tambonId,
            p_note: "ถอดจากหน้าตั้งค่า",
          });
    setBusy(false);
    const name = people[confirm.profileId]?.full_name ?? "ผู้ใช้";
    if (error) {
      setMsg(`ไม่สำเร็จ: ${error.message}`);
    } else {
      setMsg(confirm.kind === "grant" ? `แต่งตั้ง ${name} เป็นตัวแทน${tambonLabel}แล้ว` : `ถอด ${name} ออกจากตัวแทนแล้ว`);
      setPick("");
    }
    setConfirm(null);
    load();
  }

  const confirmName = confirm ? people[confirm.profileId]?.full_name ?? "ผู้ใช้" : "";

  return (
    <div className="rounded-xl border border-border p-3 mb-3">
      <div className="font-head font-semibold text-sm mb-1">ตัวแทน{tambonLabel} (ส่วนกลางแต่งตั้ง)</div>
      <p className="text-ink-soft text-xs mb-2">
        ตัวแทนเห็นและจัดการเฉพาะตำบลนี้: อนุมัติร้าน/ไรเดอร์ ตั้งค่าส่งและพร้อมเพย์ โอนเงินในหน้าบัญชีตำบล ·
        เปิด/ปิดบริการและเงินค้ำประกันยังเป็นของส่วนกลาง · ตัวแทนต้องเข้าสู่ระบบด้วยรหัสผ่าน
      </p>

      {scopes.length === 0 ? (
        <p className="text-sm text-ink mb-2">ยังไม่มีตัวแทน</p>
      ) : (
        <ul className="mb-2 divide-y divide-border">
          {scopes.map((s) => {
            const p = people[s.profile_id];
            return (
              <li key={s.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                <span>
                  {p?.full_name ?? "ไม่ทราบชื่อ"}
                  <span className="text-ink-soft text-xs">
                    {" "}
                    · {p ? ROLE_LABEL[p.role] : "-"} · ตั้งเมื่อ {dateStr(s.created_at)}
                  </span>
                </span>
                <button
                  type="button"
                  className="text-xs text-clay font-semibold"
                  disabled={busy}
                  onClick={() => setConfirm({ kind: "revoke", profileId: s.profile_id })}
                >
                  ถอด
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex gap-2 items-center">
        <select
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          className="flex-1 min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
        >
          <option value="">เลือกคนในตำบลนี้…</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name ?? "ไม่มีชื่อ"} · {ROLE_LABEL[c.role]}
              {c.approved ? "" : " (ยังไม่อนุมัติ)"}
            </option>
          ))}
        </select>
        <Button
          variant="ghost"
          disabled={!pick || busy}
          onClick={() => setConfirm({ kind: "grant", profileId: pick })}
        >
          แต่งตั้ง
        </Button>
      </div>
      {candidates.length === 0 && (
        <p className="text-ink-soft text-xs mt-1">ยังไม่มีผู้ใช้ในตำบลนี้ ให้คนที่จะเป็นตัวแทนสมัครจากหน้าตำบลก่อน</p>
      )}

      {confirm && (
        <div className="rounded-xl border border-indigo p-3 mt-2">
          <p className="text-sm text-ink mb-2">
            {confirm.kind === "grant"
              ? `แต่งตั้ง ${confirmName} เป็นตัวแทน${tambonLabel}? คนนี้จะเห็นข้อมูลร้าน ไรเดอร์ ลูกค้า ออเดอร์ และเงินของตำบลนี้`
              : `ถอด ${confirmName} ออกจากตัวแทน${tambonLabel}?`}
          </p>
          <div className="flex gap-2">
            <Button onClick={run} disabled={busy}>
              {busy ? "กำลังบันทึก..." : confirm.kind === "grant" ? "ยืนยันแต่งตั้ง" : "ยืนยันถอด"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(null)} disabled={busy}>
              ยกเลิก
            </Button>
          </div>
        </div>
      )}
      {msg && <p className="text-sm text-ink mt-2">{msg}</p>}
    </div>
  );
}

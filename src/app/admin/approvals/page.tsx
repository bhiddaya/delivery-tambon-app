"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, EmptyState, PageHeading } from "@/components/ui";
import { ROLE_LABEL, VEHICLE_LABEL } from "@/lib/domain";
import type { Tables } from "@/lib/types";
import { TambonApplications } from "./TambonApplications";
import { AdminTambonPicker, tambonName, useAdminTambon } from "@/components/AdminTambonPicker";

type PendingDriver = { profile: Tables<"profiles">; driver: Tables<"drivers"> };
type PendingMerchant = { profile: Tables<"profiles">; merchant: Tables<"merchants"> };

export default function ApprovalsPage() {
  const [pendingDrivers, setPendingDrivers] = useState<PendingDriver[]>([]);
  const [pendingMerchants, setPendingMerchants] = useState<PendingMerchant[]>([]);
  const [busy, setBusy] = useState(false);
  const { tambons, slug, setSlug, selected } = useAdminTambon();
  const tambonOf = (id: string | null) => tambonName(tambons.find((t) => t.id === id));
  const inTambon = (id: string | null) => !selected || id === selected.id;
  const shownDrivers = pendingDrivers.filter(({ profile }) => inTambon(profile.tambon_id));
  const shownMerchants = pendingMerchants.filter(({ profile, merchant }) => inTambon(merchant.tambon_id ?? profile.tambon_id));

  async function load() {
    const supabase = createClient();
    // คนที่ถูกระงับ (suspended_at) ไม่ใช่ผู้สมัครใหม่ — คืนสิทธิ์ที่หน้า ร้าน/ไรเดอร์
    const { data: profiles } = await supabase
      .from("profiles")
      .select("*")
      .eq("approved", false)
      .is("suspended_at", null);
    const driverProfiles = (profiles ?? []).filter((p) => p.role === "driver");
    const merchantProfiles = (profiles ?? []).filter((p) => p.role === "merchant");

    if (driverProfiles.length) {
      const { data: driverRows } = await supabase
        .from("drivers")
        .select("*")
        .in("profile_id", driverProfiles.map((p) => p.id));
      setPendingDrivers(
        driverProfiles
          .map((profile) => {
            const driver = (driverRows ?? []).find((d) => d.profile_id === profile.id);
            return driver ? { profile, driver } : null;
          })
          .filter(Boolean) as PendingDriver[]
      );
    } else {
      setPendingDrivers([]);
    }

    if (merchantProfiles.length) {
      const { data: merchantRows } = await supabase
        .from("merchants")
        .select("*")
        .in("profile_id", merchantProfiles.map((p) => p.id));
      setPendingMerchants(
        merchantProfiles
          .map((profile) => {
            const merchant = (merchantRows ?? []).find((m) => m.profile_id === profile.id);
            return merchant ? { profile, merchant } : null;
          })
          .filter(Boolean) as PendingMerchant[]
      );
    } else {
      setPendingMerchants([]);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load on mount
    load();
  }, []);

  async function approve(profileId: string) {
    setBusy(true);
    const supabase = createClient();
    await supabase.from("profiles").update({ approved: true }).eq("id", profileId);
    setBusy(false);
    load();
  }

  return (
    <div>
      <PageHeading title="รออนุมัติ" subtitle="ไรเดอร์และร้านค้าที่สมัครใหม่ ต้องอนุมัติก่อนจึงจะรับงาน/ขายของได้" />
      <AdminTambonPicker tambons={tambons} slug={slug} onChange={setSlug} />

      <h2 className="font-head font-semibold text-sm mb-2">{ROLE_LABEL.driver} ({shownDrivers.length})</h2>
      {shownDrivers.length === 0 ? (
        <EmptyState>ไม่มีไรเดอร์รออนุมัติ</EmptyState>
      ) : (
        <div className="flex flex-col gap-2 mb-6">
          {shownDrivers.map(({ profile, driver }) => (
            <Card key={profile.id} className="flex items-center justify-between">
              <div>
                <div className="font-head font-semibold text-sm">{profile.full_name}</div>
                <div className="text-ink-soft text-xs">
                  {tambonOf(profile.tambon_id)} · {VEHICLE_LABEL[driver.vehicle_type]} · {profile.phone}
                </div>
              </div>
              <Button onClick={() => approve(profile.id)} disabled={busy}>
                อนุมัติ
              </Button>
            </Card>
          ))}
        </div>
      )}

      <h2 className="font-head font-semibold text-sm mb-2">{ROLE_LABEL.merchant} ({shownMerchants.length})</h2>
      {shownMerchants.length === 0 ? (
        <EmptyState>ไม่มีร้านค้ารออนุมัติ</EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {shownMerchants.map(({ profile, merchant }) => (
            <Card key={profile.id} className="flex items-center justify-between">
              <div>
                <div className="font-head font-semibold text-sm">{merchant.name}</div>
                <div className="text-ink-soft text-xs">
                  {tambonOf(merchant.tambon_id ?? profile.tambon_id)} · {merchant.category} · เจ้าของ: {profile.full_name} ·{" "}
                  {profile.phone}
                </div>
              </div>
              <Button onClick={() => approve(profile.id)} disabled={busy}>
                อนุมัติ
              </Button>
            </Card>
          ))}
        </div>
      )}

      <TambonApplications />
    </div>
  );
}

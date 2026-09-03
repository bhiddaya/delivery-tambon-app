"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button, Card, EmptyState, PageHeading } from "@/components/ui";
import { ROLE_LABEL, VEHICLE_LABEL } from "@/lib/domain";
import type { Tables } from "@/lib/types";

type PendingDriver = { profile: Tables<"profiles">; driver: Tables<"drivers"> };
type PendingMerchant = { profile: Tables<"profiles">; merchant: Tables<"merchants"> };

export default function ApprovalsPage() {
  const [pendingDrivers, setPendingDrivers] = useState<PendingDriver[]>([]);
  const [pendingMerchants, setPendingMerchants] = useState<PendingMerchant[]>([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    const supabase = createClient();
    const { data: profiles } = await supabase.from("profiles").select("*").eq("approved", false);
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

      <h2 className="font-head font-semibold text-sm mb-2">{ROLE_LABEL.driver} ({pendingDrivers.length})</h2>
      {pendingDrivers.length === 0 ? (
        <EmptyState>ไม่มีไรเดอร์รออนุมัติ</EmptyState>
      ) : (
        <div className="flex flex-col gap-2 mb-6">
          {pendingDrivers.map(({ profile, driver }) => (
            <Card key={profile.id} className="flex items-center justify-between">
              <div>
                <div className="font-head font-semibold text-sm">{profile.full_name}</div>
                <div className="text-ink-soft text-xs">
                  {VEHICLE_LABEL[driver.vehicle_type]} · {profile.phone}
                </div>
              </div>
              <Button onClick={() => approve(profile.id)} disabled={busy}>
                อนุมัติ
              </Button>
            </Card>
          ))}
        </div>
      )}

      <h2 className="font-head font-semibold text-sm mb-2">{ROLE_LABEL.merchant} ({pendingMerchants.length})</h2>
      {pendingMerchants.length === 0 ? (
        <EmptyState>ไม่มีร้านค้ารออนุมัติ</EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {pendingMerchants.map(({ profile, merchant }) => (
            <Card key={profile.id} className="flex items-center justify-between">
              <div>
                <div className="font-head font-semibold text-sm">{merchant.name}</div>
                <div className="text-ink-soft text-xs">
                  {merchant.category} · เจ้าของ: {profile.full_name} · {profile.phone}
                </div>
              </div>
              <Button onClick={() => approve(profile.id)} disabled={busy}>
                อนุมัติ
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

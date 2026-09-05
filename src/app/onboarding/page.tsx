"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { phoneFromAuthEmail, formatPhoneLocal } from "@/lib/identifier";
import { Button, Card, Field, Input } from "@/components/ui";
import { AuthFrame } from "@/components/AuthFrame";
import { ROLE_LABEL, VEHICLE_LABEL, type UserRole, type VehicleType } from "@/lib/domain";
import type { Tables } from "@/lib/types";

const ROLE_OPTIONS: UserRole[] = ["customer", "driver", "merchant"];
const VEHICLE_OPTIONS: VehicleType[] = ["motorcycle", "pickup", "trike", "tractor", "bicycle"];

export default function OnboardingPage() {
  const router = useRouter();
  const [tambons, setTambons] = useState<Tables<"tambons">[]>([]);
  const [role, setRole] = useState<UserRole>("customer");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [tambonId, setTambonId] = useState("");
  const [promptpay, setPromptpay] = useState("");
  const [vehicle, setVehicle] = useState<VehicleType>("motorcycle");
  const [shopName, setShopName] = useState("");
  const [shopCategory, setShopCategory] = useState("");
  const [shopAddress, setShopAddress] = useState("");
  const [lineUserId, setLineUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    supabase
      .from("tambons")
      .select("*")
      .order("created_at")
      .then(({ data }) => {
        setTambons(data ?? []);
        if (data && data.length) setTambonId(data[0].id);
      });

    // เติมสิ่งที่รู้อยู่แล้วให้ล่วงหน้า ผู้ใช้จะได้พิมพ์น้อยที่สุด
    supabase.auth.getUser().then(({ data: { user } }) => {
      const meta = user?.user_metadata ?? {};

      // สมัครด้วยเบอร์ — เอาเบอร์เดิมมาใส่ ไม่ต้องพิมพ์ซ้ำ
      const fromSignup =
        (meta.phone as string | undefined) ?? phoneFromAuthEmail(user?.email);
      if (fromSignup) setPhone(formatPhoneLocal(fromSignup));

      // เข้าด้วย LINE — ใช้ชื่อที่แสดงใน LINE เป็นชื่อเริ่มต้น (แก้ได้)
      // เบอร์โทรยังต้องกรอกเอง เพราะ LINE ไม่ได้ให้เบอร์มา และไรเดอร์/ร้าน
      // ต้องมีเบอร์ไว้ให้ลูกค้าติดต่อ
      const lineName = meta.line_display_name as string | undefined;
      if (lineName) setFullName((current) => current || lineName);

      const metaLineUserId = meta.line_user_id as string | undefined;
      if (metaLineUserId) setLineUserId(metaLineUserId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      setLoading(false);
      return;
    }

    const { error: profileErr } = await supabase.from("profiles").insert({
      id: user.id,
      role,
      full_name: fullName,
      phone,
      tambon_id: tambonId || null,
      promptpay_id: promptpay || null,
      // ผูกบัญชี LINE ไว้ตั้งแต่แถวแรก ครั้งหน้าจะกดปุ่ม LINE เข้าบัญชีนี้ได้เลย
      line_user_id: lineUserId,
    });
    if (profileErr) {
      setError(profileErr.message);
      setLoading(false);
      return;
    }

    if (role === "driver") {
      const { error: driverErr } = await supabase.from("drivers").insert({
        profile_id: user.id,
        vehicle_type: vehicle,
      });
      if (driverErr) {
        setError(driverErr.message);
        setLoading(false);
        return;
      }
    }

    if (role === "merchant") {
      const { error: merchantErr } = await supabase.from("merchants").insert({
        profile_id: user.id,
        tambon_id: tambonId,
        name: shopName,
        category: shopCategory,
        address: shopAddress,
      });
      if (merchantErr) {
        setError(merchantErr.message);
        setLoading(false);
        return;
      }
    }

    router.push(`/${role}`);
    router.refresh();
  }

  return (
    <AuthFrame maxWidth="max-w-md">
      <div className="text-center mb-6">
        <h1 className="font-display text-3xl text-indigo">บวรไทย ตำบลบุ่งไหม</h1>
        <p className="text-ink-soft text-sm mt-1">บอกเราหน่อยว่าคุณจะใช้งานแบบไหน</p>
      </div>
      <Card>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {ROLE_OPTIONS.map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setRole(r)}
                  className={`rounded-xl border py-2.5 text-sm font-head font-semibold transition ${
                    role === r
                      ? "bg-indigo text-white border-indigo"
                      : "bg-surface text-ink border-border"
                  }`}
                >
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>

            <Field label="ชื่อ-นามสกุล">
              <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </Field>
            <Field label="เบอร์โทร">
              <Input required value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="ตำบล">
              <select
                required
                value={tambonId}
                onChange={(e) => setTambonId(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-ink outline-none focus:border-indigo"
              >
                {tambons.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.district ? `· ${t.district}` : ""}
                  </option>
                ))}
              </select>
            </Field>

            {role === "driver" && (
              <Field label="ประเภทพาหนะ">
                <select
                  value={vehicle}
                  onChange={(e) => setVehicle(e.target.value as VehicleType)}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-ink outline-none focus:border-indigo"
                >
                  {VEHICLE_OPTIONS.map((v) => (
                    <option key={v} value={v}>
                      {VEHICLE_LABEL[v]}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {role === "merchant" && (
              <>
                <Field label="ชื่อร้าน">
                  <Input required value={shopName} onChange={(e) => setShopName(e.target.value)} />
                </Field>
                <Field label="ประเภทร้าน">
                  <Input
                    required
                    placeholder="เช่น อาหารตามสั่ง, ของชำ, เครื่องดื่ม"
                    value={shopCategory}
                    onChange={(e) => setShopCategory(e.target.value)}
                  />
                </Field>
                <Field label="ที่อยู่ร้าน">
                  <Input required value={shopAddress} onChange={(e) => setShopAddress(e.target.value)} />
                </Field>
              </>
            )}

            {(role === "driver" || role === "merchant") && (
              <Field label="เลขพร้อมเพย์ (รับเงิน — ไม่ใส่ก็ได้ ใส่ทีหลังได้)">
                <Input
                  value={promptpay}
                  onChange={(e) => setPromptpay(e.target.value)}
                  placeholder="เบอร์โทร หรือ เลขบัตรประชาชน"
                />
              </Field>
            )}

            {(role === "driver" || role === "merchant") && (
              <p className="text-xs text-ink-soft mb-3">
                บัญชี{ROLE_LABEL[role]}ต้องรอแอดมินอนุมัติก่อนจึงจะรับงาน/ขายของได้
              </p>
            )}

            {error && <p className="text-clay text-sm mb-3">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "กำลังบันทึก..." : "เริ่มใช้งาน"}
            </Button>
          </form>
        </Card>
    </AuthFrame>
  );
}

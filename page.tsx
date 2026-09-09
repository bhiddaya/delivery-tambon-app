"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useSession } from "@/lib/session-context";
import { Card, PageHeading } from "@/components/ui";
import LinkLineCard from "@/components/LinkLineCard";
import ChangePasswordCard from "@/components/ChangePasswordCard";
import SetPhonePasswordCard from "@/components/SetPhonePasswordCard";
import { ROLE_LABEL } from "@/lib/domain";
import { formatPhoneLocal, isPhoneAuthEmail, normalizePhone } from "@/lib/identifier";

/** โดเมนอีเมลแฝงของบัญชีที่เกิดจากปุ่ม LINE — ต้องตรงกับ ALIAS_DOMAIN ใน Edge Function */
const LINE_ALIAS_DOMAIN = "@line.invalid";

export default function AccountPage() {
  return (
    // useSearchParams ต้องอยู่ใน Suspense เสมอ ไม่งั้น build จะไม่ผ่าน
    <Suspense fallback={null}>
      <AccountView />
    </Suspense>
  );
}

function AccountView() {
  const { profile, email } = useSession();
  const searchParams = useSearchParams();

  // มาจาก guard ของหน้าหลังบ้าน แปลว่าเข้ามาด้วยปุ่ม LINE แล้วเปิดหน้านั้นไม่ได้
  const needsPassword = searchParams.get("need") === "password";

  // บัญชีที่เกิดจากปุ่ม LINE ยังไม่มีชื่อบัญชีที่เจ้าตัวพิมพ์ได้ จึงเข้าหลังบ้านไม่ได้
  const lineOnlyAccount = Boolean(email?.endsWith(LINE_ALIAS_DOMAIN));
  const needsBackOffice = profile.role !== "customer";

  // อีเมลแฝงของผู้ที่สมัครด้วยเบอร์ไม่ใช่อีเมลจริง อย่าเอาไปโชว์ให้สับสน
  const realEmail = isPhoneAuthEmail(email) ? null : email;
  const normalized = profile.phone ? normalizePhone(profile.phone) : null;

  return (
    <div>
      <PageHeading title="บัญชีของฉัน" />

      <Card className="mb-4">
        <dl className="text-sm">
          <div className="flex justify-between py-1.5">
            <dt className="text-ink-soft">ชื่อ</dt>
            <dd className="font-head font-semibold">{profile.full_name}</dd>
          </div>
          <div className="flex justify-between py-1.5 border-t border-border">
            <dt className="text-ink-soft">บทบาท</dt>
            <dd className="font-head font-semibold">{ROLE_LABEL[profile.role]}</dd>
          </div>
          <div className="flex justify-between py-1.5 border-t border-border">
            <dt className="text-ink-soft">เบอร์โทร</dt>
            <dd className="tabular-nums">
              {normalized ? formatPhoneLocal(normalized) : profile.phone || "—"}
            </dd>
          </div>
          {realEmail && (
            <div className="flex justify-between py-1.5 border-t border-border">
              <dt className="text-ink-soft">อีเมล</dt>
              <dd className="truncate max-w-[60%]">{realEmail}</dd>
            </div>
          )}
          <div className="flex justify-between py-1.5 border-t border-border">
            <dt className="text-ink-soft">สถานะ</dt>
            <dd className="font-head font-semibold">
              {profile.approved ? "อนุมัติแล้ว" : "รอตัวแทนตำบลอนุมัติ"}
            </dd>
          </div>
        </dl>
      </Card>

      {needsPassword && (
        <Card className="mb-4 border-marigold">
          <p className="font-head font-semibold mb-1">หน้านั้นต้องเข้าด้วยรหัสผ่าน</p>
          <p className="text-ink-soft text-sm">
            หน้ารับงาน หน้าร้าน และหน้าตัวแทนตำบล มีทั้งเงินและราคาสินค้าอยู่ จึงเปิดให้เฉพาะ
            คนที่เข้าสู่ระบบด้วยเบอร์โทรหรืออีเมลพร้อมรหัสผ่าน — ปุ่ม LINE ใช้ดูหน้าบ้านได้ตามปกติ
          </p>
        </Card>
      )}

      <LinkLineCard linked={Boolean(profile.line_user_id)} />

      {lineOnlyAccount && needsBackOffice ? (
        <SetPhonePasswordCard
          lineUserId={profile.line_user_id}
          highlight={needsPassword}
        />
      ) : (
        <ChangePasswordCard />
      )}
    </div>
  );
}

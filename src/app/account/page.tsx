"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { useSession } from "@/lib/session-context";
import { Card, PageHeading } from "@/components/ui";
import LinkLineCard from "@/components/LinkLineCard";
import PaymentQrCard from "@/components/PaymentQrCard";
import { PromptPayCard } from "@/components/PromptPayCard";
import { AgentLinkCard } from "@/components/AgentLinkCard";
import { ContactEmailCard } from "@/components/ContactEmailCard";
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

  // รองรับลิงก์คำแนะนำเก่า ก่อนเปิดให้ LINE เข้าหน้าทำงานตามสิทธิ์
  const needsPassword = searchParams.get("need") === "password";

  // บัญชี LINE ตั้งเบอร์/รหัสผ่านเพิ่มเป็นทางเข้าสำรองได้
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
              <dt className="text-ink-soft">อีเมลเข้าสู่ระบบ</dt>
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

      <ContactEmailCard profileId={profile.id} initial={profile.contact_email} />

      {profile.role !== "admin" && profile.role !== "superadmin" && <AgentLinkCard profileId={profile.id} />}

      {(profile.role === "driver" || profile.role === "merchant") && (
        <><PromptPayCard profileId={profile.id} initial={profile.promptpay_id} /><PaymentQrCard profile={profile} /></>
      )}

      {needsPassword && (
        <Card className="mb-4 border-marigold">
          <p className="font-head font-semibold mb-1">เข้าหน้าทำงานผ่าน LINE ได้แล้ว</p>
          <p className="text-ink-soft text-sm">
            ใช้บัญชี LINE ที่ผูกไว้เพื่อเปิดหน้าตามสิทธิ์ของคุณ หรือใช้เบอร์โทรและรหัสผ่านเป็นทางเข้าสำรอง
          </p>
          <Link href="/liff/entry" className="mt-3 inline-block text-indigo underline">เปิดหน้าของฉันผ่าน LINE</Link>
        </Card>
      )}

      <LinkLineCard linked={Boolean(profile.line_user_id)} />

      {lineOnlyAccount && needsBackOffice ? (
        <SetPhonePasswordCard
          lineUserId={profile.line_user_id}
          highlight={false}
        />
      ) : (
        <ChangePasswordCard />
      )}
    </div>
  );
}

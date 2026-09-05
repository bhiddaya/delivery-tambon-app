"use client";

import { useSession } from "@/lib/session-context";
import { Card, PageHeading } from "@/components/ui";
import LinkLineCard from "@/components/LinkLineCard";
import { ROLE_LABEL } from "@/lib/domain";
import { formatPhoneLocal, isPhoneAuthEmail, normalizePhone } from "@/lib/identifier";

export default function AccountPage() {
  const { profile, email } = useSession();

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

      <LinkLineCard linked={Boolean(profile.line_user_id)} />
    </div>
  );
}

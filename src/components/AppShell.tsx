"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/domain";
import {
  BikeIcon,
  CheckBadgeIcon,
  GridIcon,
  HomeIcon,
  ListIcon,
  LogOutIcon,
  ReceiptIcon,
  SettingsIcon,
  StoreIcon,
} from "@/components/icons";

type NavIcon = ComponentType<SVGProps<SVGSVGElement>>;
type NavLink = { href: string; label: string; icon: NavIcon };

const NAV: Record<UserRole, NavLink[]> = {
  customer: [
    { href: "/customer", label: "หน้าแรก", icon: HomeIcon },
    { href: "/customer/orders", label: "ออเดอร์ของฉัน", icon: ListIcon },
  ],
  driver: [{ href: "/driver", label: "งานในตำบล", icon: BikeIcon }],
  merchant: [
    { href: "/merchant", label: "ร้านของฉัน", icon: StoreIcon },
    { href: "/merchant/orders", label: "ออเดอร์เข้าร้าน", icon: ReceiptIcon },
  ],
  admin: [
    { href: "/admin", label: "แดชบอร์ด", icon: GridIcon },
    { href: "/admin/approvals", label: "อนุมัติ", icon: CheckBadgeIcon },
    { href: "/admin/settings", label: "ตั้งค่า", icon: SettingsIcon },
  ],
};

/**
 * โครงแอปหลัก — ออกแบบใหม่ให้เป็น "กรอบมือถือ" ความกว้างคงที่
 * (ไม่เกิน ~440px) ทั้งบนเว็บเดสก์ท็อปและมือถือ พร้อมแถบนำทางล่างแบบแอป
 * บนจอกว้าง (เดสก์ท็อป) จะเห็นเป็นกรอบลอยกลางจอคล้ายมือถือ
 * บนมือถือ/PWA ที่ติดตั้งแล้ว จะเต็มความกว้างจอพอดี
 */
export default function AppShell({ role, children }: { role: UserRole; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const links = NAV[role];
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-dvh bg-paper sm:bg-surface-2">
      <div className="mx-auto flex h-dvh w-full max-w-[440px] flex-col overflow-hidden bg-paper sm:my-6 sm:h-[min(880px,calc(100dvh-3rem))] sm:rounded-[2rem] sm:border sm:border-border sm:shadow-2xl">
        <header
          className="flex flex-none items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
        >
          <Link
            href={`/${role}`}
            className="min-w-0 flex-1 truncate font-display text-base text-indigo"
          >
            บวรไทย ตำบลบุ่งไหม
          </Link>
          <button
            onClick={signOut}
            disabled={signingOut}
            aria-label="ออกจากระบบ"
            title="ออกจากระบบ"
            className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full border border-border text-ink-soft transition hover:border-clay hover:text-clay disabled:opacity-40"
          >
            <LogOutIcon className="h-4 w-4" />
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</main>

        <nav
          className="flex flex-none border-t border-border bg-surface"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {links.map((l) => {
            const active = pathname === l.href;
            const Icon = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2"
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-xl transition ${
                    active ? "bg-indigo-tint text-indigo" : "text-ink-soft"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span
                  className={`font-head text-[10px] font-semibold ${
                    active ? "text-indigo" : "text-ink-soft"
                  }`}
                >
                  {l.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth-guard";
import { SessionProvider } from "@/lib/session-context";
import FinanceInstall from "@/components/FinanceInstall";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "การเงินตำบล — บวรไทย",
  manifest: "/finance.webmanifest",
  appleWebApp: { capable: true, title: "การเงินตำบล", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};
export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("admin", "/finance");
  return <SessionProvider value={session}><main className="mx-auto min-h-screen max-w-3xl px-4 py-6 pb-24">
    <header className="mb-5 flex items-center justify-between gap-3"><Link href="/finance" className="font-head text-lg font-semibold">บวรไทย · การเงินตำบล</Link><Link href="/account" className="text-sm text-indigo">บัญชีของฉัน</Link></header>
    <FinanceInstall />{children}
    <nav aria-label="เมนูการเงิน" className="fixed inset-x-0 bottom-0 z-40 flex justify-center gap-8 border-t border-border bg-surface p-4"><Link href="/finance" className="text-sm font-semibold text-indigo">ตรวจเงิน / โอนออก</Link><Link href="/admin" className="text-sm text-ink-soft">งานตำบล</Link></nav>
  </main></SessionProvider>;
}

import { requireRole } from "@/lib/auth-guard";
import { SessionProvider } from "@/lib/session-context";
import AppShell from "@/components/AppShell";

export default async function MerchantLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("merchant");
  return (
    <SessionProvider value={session}>
      <AppShell role="merchant">{children}</AppShell>
    </SessionProvider>
  );
}

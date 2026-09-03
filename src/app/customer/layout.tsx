import { requireRole } from "@/lib/auth-guard";
import { SessionProvider } from "@/lib/session-context";
import AppShell from "@/components/AppShell";

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("customer");
  return (
    <SessionProvider value={session}>
      <AppShell role="customer">{children}</AppShell>
    </SessionProvider>
  );
}

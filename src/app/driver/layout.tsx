import { requireRole } from "@/lib/auth-guard";
import { SessionProvider } from "@/lib/session-context";
import AppShell from "@/components/AppShell";

export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("driver");
  return (
    <SessionProvider value={session}>
      <AppShell role="driver">{children}</AppShell>
    </SessionProvider>
  );
}

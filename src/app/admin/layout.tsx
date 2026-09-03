import { requireRole } from "@/lib/auth-guard";
import { SessionProvider } from "@/lib/session-context";
import AppShell from "@/components/AppShell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireRole("admin");
  return (
    <SessionProvider value={session}>
      <AppShell role="admin">{children}</AppShell>
    </SessionProvider>
  );
}

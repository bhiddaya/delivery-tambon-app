import { requireSession } from "@/lib/auth-guard";
import { SessionProvider } from "@/lib/session-context";
import AppShell from "@/components/AppShell";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  return (
    <SessionProvider value={session}>
      <AppShell role={session.profile.role}>{children}</AppShell>
    </SessionProvider>
  );
}

import LineRoleEntry from "@/components/LineRoleEntry";
import { lineEntryRole } from "@/lib/line-entry";

export default async function LineEntryPage({ searchParams }: {
  searchParams: Promise<{ role?: string | string[] }>;
}) {
  return <LineRoleEntry requested={lineEntryRole((await searchParams).role)} />;
}

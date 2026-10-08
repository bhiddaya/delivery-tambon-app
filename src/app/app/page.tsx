import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth-guard";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { homePathFor } from "@/lib/domain";

export default async function AppEntry() {
  if (!isSupabaseConfigured()) redirect("/delivery");
  const { profile } = await requireSession();
  // Destination layouts enforce each role's existing password and scope checks.
  redirect(homePathFor(profile.role));
}

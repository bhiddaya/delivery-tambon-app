import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { homePathFor } from "@/lib/domain";

export default async function Home() {
  if (!isSupabaseConfigured()) redirect("/delivery");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/delivery");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) redirect("/onboarding");

  redirect(homePathFor(profile.role));
}

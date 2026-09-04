import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import SetupRequired from "@/components/SetupRequired";
import { homePathFor } from "@/lib/domain";

export default async function Home() {
  // ยังไม่ได้ตั้งค่า — บอกให้ชัดว่าต้องทำอะไร แทนที่จะโยน error เป็นจอขาว
  if (!isSupabaseConfigured()) return <SetupRequired />;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) redirect("/onboarding");

  redirect(homePathFor(profile.role));
}

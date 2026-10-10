import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { homePathFor } from "@/lib/domain";
import { safeNextPath } from "@/lib/next-path";

export default async function Home({ searchParams }: { searchParams: Promise<{ "liff.state"?: string | string[] }> }) {
  // LINE เปิดลิงก์ LIFF แบบมีเส้นทาง (liff.line.me/<id>/liff) เป็นหน้าแรกของเว็บ + ?liff.state=<เส้นทางจริง>
  // ต้องพาไปเส้นทางนั้นก่อนอย่างอื่น ไม่งั้นโดนเด้งไป /delivery แล้วพารามิเตอร์หาย ผู้ใช้ไปไม่ถึงหน้าที่ตั้งใจ
  const state = (await searchParams)["liff.state"];
  const liffTarget = typeof state === "string" ? safeNextPath(state) : null;
  if (liffTarget) redirect(liffTarget);

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

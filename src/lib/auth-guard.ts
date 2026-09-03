import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/domain";
import type { Tables } from "@/lib/types";

/**
 * ตรวจสอบว่าผู้ใช้ล็อกอินแล้ว มีโปรไฟล์ และบทบาทตรงกับที่หน้านี้ต้องการ
 * ถ้าไม่ผ่านเงื่อนไข จะ redirect ไปหน้าที่เหมาะสมให้อัตโนมัติ
 */
export async function requireRole(role: UserRole): Promise<{
  userId: string;
  email: string | null;
  profile: Tables<"profiles">;
}> {
  // ยังไม่ได้ตั้งค่า — ส่งกลับหน้าแรกที่อธิบายวิธีแก้ไว้แล้ว
  if (!isSupabaseConfigured()) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) redirect("/onboarding");
  if (profile.role !== role) redirect(`/${profile.role}`);

  return { userId: user.id, email: user.email ?? null, profile };
}

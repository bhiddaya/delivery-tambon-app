import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { homePathFor, type UserRole } from "@/lib/domain";
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

  // ส่วนกลางดูแลทุกตำบล จึงผ่านด่านของตัวแทนตำบลได้ด้วย
  // (ไม่ใช่ผ่านทุกด่าน — ส่วนกลางไม่ควรสวมเป็นลูกค้า ไรเดอร์ หรือร้านค้า)
  //
  // ระวัง: นี่คุมแค่ "เข้าหน้าไหนได้" เท่านั้น สิทธิ์เห็นข้อมูลข้ามตำบลจริง ๆ
  // ยังคุมด้วย RLS ที่ฐานข้อมูล ผ่านฟังก์ชัน is_superadmin()
  const allowed = profile.role === role || (profile.role === "superadmin" && role === "admin");
  if (!allowed) redirect(homePathFor(profile.role));

  return { userId: user.id, email: user.email ?? null, profile };
}

/**
 * เหมือน requireRole แต่ไม่สนว่าบทบาทไหน — ขอแค่ล็อกอินและมีโปรไฟล์แล้ว
 *
 * ใช้กับหน้าที่ทุกบทบาทเข้าได้เหมือนกัน เช่นหน้าบัญชีของฉัน
 * แยกออกมาแทนที่จะให้ requireRole รับ array เพราะเจตนาต่างกันชัดเจน:
 * อันนั้นคือ "หน้านี้ของบทบาทนี้" อันนี้คือ "หน้านี้ของทุกคน"
 */
export async function requireSession(): Promise<{
  userId: string;
  email: string | null;
  profile: Tables<"profiles">;
}> {
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

  return { userId: user.id, email: user.email ?? null, profile };
}

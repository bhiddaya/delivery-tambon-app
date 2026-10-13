import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { homePathFor, type UserRole } from "@/lib/domain";
import type { Tables } from "@/lib/types";

/**
 * บทบาทที่มี "หลังบ้าน" ของตัวเอง — เงิน ราคาสินค้า การรับงาน การอนุมัติคน
 *
 * เจ้าของอนุมัติ 14 ต.ค. 2569: ใช้ LINE ที่ยืนยันตัวตนแล้วเข้าบัญชีเดิมได้
 * สิทธิ์ดู/แก้ไขยังตรวจบทบาท การแต่งตั้ง และ RLS เดิม ไม่เชื่อ LINE ID จาก URL
 */
const BACK_OFFICE_ROLES: UserRole[] = ["driver", "merchant", "admin", "superadmin"];

/** บทบาทที่ส่วนกลางเปิดดูแทนได้ — ตั้ง cookie ที่ /view-as */
export const VIEW_AS_COOKIE = "view_as";
const VIEW_AS_ROLES: UserRole[] = ["merchant", "driver", "customer"];

/**
 * ตรวจสอบว่าผู้ใช้ล็อกอินแล้ว มีโปรไฟล์ และบทบาทตรงกับที่หน้านี้ต้องการ
 * ถ้าไม่ผ่านเงื่อนไข จะ redirect ไปหน้าที่เหมาะสมให้อัตโนมัติ
 */
export async function requireRole(role: UserRole, nextPath?: string): Promise<{
  userId: string;
  email: string | null;
  profile: Tables<"profiles">;
  viewAs?: boolean;
}> {
  // ยังไม่ได้ตั้งค่า — ส่งกลับหน้าแรกที่อธิบายวิธีแก้ไว้แล้ว
  if (!isSupabaseConfigured()) redirect("/");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(nextPath ? `/login?next=${encodeURIComponent(nextPath)}` : "/login");

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
  //
  // ยกเว้นโหมด "ดูแทน" (13 ต.ค. 2569): ส่วนกลางเลือกคนจากหน้า ร้านและไรเดอร์ → cookie view_as
  // แล้วเปิดหน้าของบทบาทนั้นด้วยโปรไฟล์ของเขา AppShell ปิดทุกปุ่ม (อ่านอย่างเดียว)
  // ข้อมูลที่เห็นยังคุมด้วย RLS ของส่วนกลางเอง ไม่ได้สวมสิทธิ์ของคนนั้น
  let viewAs: Tables<"profiles"> | null = null;
  if (profile.role === "superadmin" && VIEW_AS_ROLES.includes(role)) {
    const id = (await cookies()).get(VIEW_AS_COOKIE)?.value;
    const { data } = id ? await supabase.from("profiles").select("*").eq("id", id).maybeSingle() : { data: null };
    if (data?.role === role) viewAs = data;
  }
  let allowed = profile.role === role || (profile.role === "superadmin" && role === "admin") || viewAs !== null;
  // ตัวแทนตำบลที่ส่วนกลางแต่งตั้ง (admin_scopes) ยังมีบทบาทเดิม เช่นร้านค้า — ให้เข้าหลังบ้านตัวแทนได้
  // ข้อมูลที่เห็นยังคุมด้วย RLS (can_admin_tambon) เฉพาะตำบลที่ได้รับแต่งตั้ง
  if (!allowed && role === "admin") {
    const { count } = await supabase
      .from("admin_scopes")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", profile.id);
    allowed = (count ?? 0) > 0;
  }
  if (!allowed) redirect(homePathFor(profile.role));

  // Password หรือ LINE ที่ server ยืนยันแล้ว และ session ต้องยังไม่ถูกเพิกถอน
  if (BACK_OFFICE_ROLES.includes(role)) {
    const { data: validSession, error } = await supabase.rpc("backoffice_session_valid");
    if (error || validSession !== true) redirect("/login");
  }

  if (viewAs) return { userId: viewAs.id, email: null, profile: viewAs, viewAs: true };
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

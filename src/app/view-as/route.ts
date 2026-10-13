import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { homePathFor } from "@/lib/domain";
import { VIEW_AS_COOKIE } from "@/lib/auth-guard";

/**
 * โหมด "ดูแทน" ของส่วนกลาง (อ่านอย่างเดียว)
 * /view-as?id=<profile> → ตั้ง cookie แล้วเปิดหน้าแรกของบทบาทคนนั้น · /view-as เฉย ๆ → ออกจากโหมด
 * cookie ใช้ได้เฉพาะบัญชี superadmin (requireRole ตรวจซ้ำทุกหน้า) ตรงนี้ตรวจไว้กันตั้งค้างเปล่า ๆ
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const back = (path: string) => NextResponse.redirect(new URL(path, req.url));
  if (!id) {
    const res = back("/admin/people");
    res.cookies.delete(VIEW_AS_COOKIE);
    return res;
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return back("/login");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (me?.role !== "superadmin") return back("/app");
  const { data: target } = await supabase.from("profiles").select("role").eq("id", id).maybeSingle();
  if (!target || !["merchant", "driver", "customer"].includes(target.role)) return back("/admin/people");
  const res = back(homePathFor(target.role));
  res.cookies.set(VIEW_AS_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 2 });
  return res;
}

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { homePathFor } from "@/lib/domain";
import { VIEW_AS_COOKIE } from "@/lib/auth-guard";

/**
 * โหมด "ดูแทน" ของส่วนกลาง (อ่านอย่างเดียว)
 * /view-as?id=<profile> → ตั้ง cookie แล้วเปิดหน้าแรกของบทบาทคนนั้น · /view-as เฉย ๆ → ออกจากโหมด
 * /view-as?demo=merchant|driver → ปุ่มเมนู LINE ของเจ้าของ: เปิดร้าน/ไรเดอร์จริงที่ดูล่าสุด (จำไว้ 2 ชม.) ถ้ายังไม่เคยดู → ไปหน้ารายชื่อให้เลือก
 * ไม่ใช้บัญชีทดสอบ เจ้าของต้องการเห็นข้อมูลจริงเหมือนที่ร้านค้า/ไรเดอร์เห็น
 * cookie ใช้ได้เฉพาะบัญชี superadmin (requireRole ตรวจซ้ำทุกหน้า) ตรงนี้ตรวจไว้กันตั้งค้างเปล่า ๆ
 */
export async function GET(req: NextRequest) {
  let id = req.nextUrl.searchParams.get("id");
  const demo = req.nextUrl.searchParams.get("demo");
  const back = (path: string) => NextResponse.redirect(new URL(path, req.url));
  if (!id && !demo) {
    const res = back("/admin/people");
    res.cookies.delete(VIEW_AS_COOKIE);
    return res;
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return back("/login");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (me?.role !== "superadmin") return back("/app");
  if (!id) {
    if (demo !== "merchant" && demo !== "driver") return back("/admin/people");
    const list = demo === "driver" ? "/admin/people?tab=riders" : "/admin/people";
    const last = req.cookies.get(VIEW_AS_COOKIE)?.value;
    if (!last) return back(list);
    const { data: prev } = await supabase.from("profiles").select("id, role, is_test").eq("id", last).maybeSingle();
    if (!prev || prev.role !== demo || prev.is_test) return back(list);
    id = prev.id;
  }
  const { data: target } = await supabase.from("profiles").select("role").eq("id", id).maybeSingle();
  if (!target || !["merchant", "driver", "customer"].includes(target.role)) return back("/admin/people");
  const res = back(homePathFor(target.role));
  res.cookies.set(VIEW_AS_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 2 });
  return res;
}

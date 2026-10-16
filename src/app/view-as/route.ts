import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { homePathFor } from "@/lib/domain";
import { VIEW_AS_COOKIE } from "@/lib/auth-guard";

/**
 * โหมด "ดูแทน" ของส่วนกลาง (อ่านอย่างเดียว)
 * /view-as?id=<profile> → ตั้ง cookie แล้วเปิดหน้าแรกของบทบาทคนนั้น · /view-as เฉย ๆ → ออกจากโหมด
 * /view-as?demo=merchant|driver → ปุ่มเมนู LINE ของเจ้าของ: เปิดร้าน/ไรเดอร์จริงที่ดูล่าสุด (จำไว้ 2 ชม.) ถ้ายังไม่เคยดู → เลือกร้านจริงที่มีออเดอร์จริงล่าสุดให้เลย
 * ไม่ใช้บัญชีทดสอบ เจ้าของต้องการเห็นข้อมูลจริงเหมือนที่ร้านค้า/ไรเดอร์เห็น
 * cookie ใช้ได้เฉพาะบัญชี superadmin (requireRole ตรวจซ้ำทุกหน้า) ตรงนี้ตรวจไว้กันตั้งค้างเปล่า ๆ
 */
type Db = Awaited<ReturnType<typeof createClient>>;

/** ร้าน/ไรเดอร์จริง (ไม่ใช่ทดสอบ อนุมัติแล้ว ไม่ถูกพัก) — ร้านเลือกที่มีออเดอร์จริงล่าสุด ถ้าไม่มีก็ร้านแรก */
async function pickRealProfile(db: Db, role: "merchant" | "driver"): Promise<string | null> {
  const real = () => db.from("profiles").select("id").eq("role", role).eq("is_test", false).eq("approved", true).is("suspended_at", null);
  if (role === "merchant") {
    const { data: shops } = await db.from("merchants").select("id, profile_id").eq("is_test", false);
    const profileOf = new Map((shops ?? []).map((s) => [s.id, s.profile_id]));
    if (!profileOf.size) return null;
    const { data: ok } = await real().in("id", [...profileOf.values()]);
    const okIds = new Set((ok ?? []).map((p) => p.id));
    const { data: recent } = await db.from("orders").select("merchant_id").eq("is_test", false)
      .in("merchant_id", [...profileOf.keys()]).order("created_at", { ascending: false }).limit(30);
    const active = (recent ?? []).map((o) => profileOf.get(o.merchant_id as string)).find((p) => p && okIds.has(p));
    return active ?? [...okIds][0] ?? null;
  }
  const { data } = await real().order("created_at").limit(1);
  return data?.[0]?.id ?? null;
}

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
    if (last) {
      const { data: prev } = await supabase.from("profiles").select("id, role, is_test").eq("id", last).maybeSingle();
      if (prev && prev.role === demo && !prev.is_test) id = prev.id;
    }
    if (!id) id = await pickRealProfile(supabase, demo);
    if (!id) return back(list); // ยังไม่มีร้าน/ไรเดอร์จริงเลย → ให้เลือกเองจากรายชื่อ
  }
  const { data: target } = await supabase.from("profiles").select("role").eq("id", id).maybeSingle();
  if (!target || !["merchant", "driver", "customer"].includes(target.role)) return back("/admin/people");
  const res = back(homePathFor(target.role));
  res.cookies.set(VIEW_AS_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 * 60 * 2 });
  return res;
}

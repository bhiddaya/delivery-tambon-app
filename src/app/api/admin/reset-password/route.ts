import { NextResponse } from "next/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * ตัวแทนตำบลตั้ง "รหัสชั่วคราว" ให้ผู้ใช้ในตำบลของตัวเอง
 *
 * ทำไมต้องมี: คนส่วนใหญ่ในตำบลสมัครด้วยเบอร์ ซึ่งได้อีเมลแฝง @phone.invalid
 * ที่ส่งเมลไปไม่ถึง และเราไม่มีบริการ SMS ส่ง OTP ถ้าไม่มีทางนี้ ไรเดอร์ที่
 * ลืมรหัสและยังไม่ได้ผูก LINE จะถูกล็อกออกจากบัญชีตัวเองถาวร
 *
 * ด่านความปลอดภัยสามชั้น:
 *   1. ต้องมี session จริง (อ่านจาก cookie ฝั่งเซิร์ฟเวอร์ ไม่เชื่อ body)
 *   2. can_admin_profile() ที่ฐานข้อมูลเป็นคนตัดสินว่าคุมคนนี้ได้ไหม —
 *      ใช้ตัวเดียวกับที่ RLS ใช้ ไม่เขียนตรรกะสิทธิ์ซ้ำที่นี่ เพราะกฎสองชุด
 *      ที่ต้องตรงกันตลอดไปคือกฎที่จะไม่ตรงกันสักวัน
 *   3. บันทึกลง admin_actions ทุกครั้ง — ตารางนั้นไม่มี policy ให้เขียน/ลบ
 *      ผู้ดูแลจึงลบร่องรอยตัวเองไม่ได้
 *
 * รหัสถูก "สุ่มโดยเซิร์ฟเวอร์" ไม่ใช่ให้ผู้ดูแลพิมพ์เอง ด้วยเหตุผลเดียว:
 * ผู้ดูแลที่ตั้งรหัสเองมักตั้งซ้ำกับที่ตัวเองใช้ หรือตั้งง่ายจนเดาได้
 * และคืนกลับไปให้อ่านครั้งเดียว ไม่เก็บลงฐานข้อมูล
 */

export const runtime = "nodejs";

/**
 * รหัสชั่วคราวที่ "อ่านออกเสียงทางโทรศัพท์ได้"
 *
 * ตัวแทนตำบลต้องบอกรหัสนี้ให้ผู้ใช้ฟังทางโทรศัพท์ ตัวอักษรที่ฟังแล้วสับสน
 * จึงถูกตัดทิ้งทั้งหมด — 0/O, 1/l/I, 5/S, 8/B — เพราะรหัสที่บอกกันไม่รู้เรื่อง
 * แปลว่าต้องโทรซ้ำ และคนจะเลิกใช้ระบบเอาดื้อ ๆ
 */
function makeTempPassword(): string {
  const alphabet = "abcdefghjkmnpqrtuvwxyz34679";
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  // 12 ตัวจาก 27 ตัวอักษร ≈ 57 บิต เดาสุ่มไม่ไหวในอายุการใช้งานไม่กี่นาทีของมัน
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  let profileId: string;
  try {
    const body = await request.json();
    profileId = String(body?.profileId ?? "");
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  if (!/^[0-9a-f-]{36}$/i.test(profileId)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // ห้ามใช้ช่องนี้กับตัวเอง — ถ้าล็อกอินอยู่แล้วให้ไปตั้งรหัสที่หน้าบัญชี
  // (กันกรณีบัญชีถูกยืมมือถือไปกดแล้วได้รหัสใหม่ที่เจ้าของไม่รู้)
  if (profileId === user.id) {
    return NextResponse.json({ error: "use_account_page" }, { status: 400 });
  }

  const { data: allowed, error: checkError } = await supabase.rpc("can_admin_profile", {
    p: profileId,
  });

  if (checkError) {
    return NextResponse.json({ error: "check_failed" }, { status: 500 });
  }

  // ตอบ 404 ไม่ใช่ 403 — ผู้ดูแลตำบลอื่นไม่ควรรู้ด้วยซ้ำว่า id นี้มีตัวตน
  if (!allowed) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const password = makeTempPassword();
  const admin = supabaseAdmin();

  const { error: updateError } = await admin.auth.admin.updateUserById(profileId, { password });
  if (updateError) {
    return NextResponse.json({ error: "reset_failed" }, { status: 500 });
  }

  // บันทึกหลังเปลี่ยนสำเร็จเท่านั้น จะได้ไม่มีบันทึกของสิ่งที่ไม่ได้เกิดขึ้น
  // ถ้าบันทึกล้มเหลว ยังถือว่าสำเร็จ — รหัสถูกเปลี่ยนไปแล้วจริง การบอกผู้ดูแล
  // ว่า "ล้มเหลว" ทั้งที่รหัสเปลี่ยนไปแล้วจะทำให้ผู้ใช้เข้าไม่ได้โดยไม่มีใครรู้
  const { error: logError } = await admin.from("admin_actions").insert({
    actor_id: user.id,
    target_id: profileId,
    action: "reset_password",
  });
  if (logError) {
    console.error("admin_actions insert failed after password reset", logError);
  }

  return NextResponse.json({ password });
}
